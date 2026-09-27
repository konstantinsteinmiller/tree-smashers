import { ref } from 'vue'
import { modelImgPath, SPINNER_MODEL_IDS, getSelectedSkin } from '@/use/useModels.ts'
import useSpinnerConfig from '@/use/useSpinnerConfig.ts'
import useSpinnerCampaign, { type ArenaType } from '@/use/useSpinnerCampaign.ts'
import { prependBaseUrl } from '@/utils/function.ts'
import type { TopPartId } from '@/types/spinner'
import { FLAME_BURN_SRC } from '@/use/borderFx'
import { isIntroLikely, INTRO_SKIN_IDS } from '@/use/introGate'

// Shared state so it can be accessed by both the loader and the progress component
const loadingProgress = ref(0)
const areAllAssetsLoaded = ref(false)

// THIS IS THE KEY: A persistent memory reference
//
// `audio` holds HTMLAudioElements (used for streamed background music where
// we don't want the whole file decoded into memory).
//
// `audioBuffers` holds decoded PCM data for short SFX — a single shared
// AudioBuffer per file that we replay by spawning a fresh
// `AudioBufferSourceNode` on every `playSound()` call. This is the only
// way to get true "decode once, play many" semantics in the browser:
// HTMLAudioElement.cloneNode() copies the element but NOT the decoded
// audio, so each clone re-fetches (from disk cache at best) and
// re-decodes on the main thread. Web Audio skips both.
export const resourceCache = {
  images: new Map<string, HTMLImageElement>(),
  audio: new Map<string, HTMLAudioElement>(),
  audioBuffers: new Map<string, AudioBuffer>()
}

// ─── Shared AudioContext ───────────────────────────────────────────────────
//
// Browsers cap the number of AudioContexts per page (typically 6), so we
// create one on demand and reuse it everywhere. Also: autoplay policy keeps
// new contexts in a `suspended` state until a user gesture — we arm a
// one-shot click/touch listener to resume it on first interaction.

let sharedAudioCtx: AudioContext | null = null
let resumeListenerArmed = false

export const getAudioContext = (): AudioContext | null => {
  if (sharedAudioCtx) return sharedAudioCtx
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    sharedAudioCtx = new Ctor() as AudioContext
  } catch {
    return null
  }
  armResumeOnGesture()
  return sharedAudioCtx
}

const armResumeOnGesture = (): void => {
  if (resumeListenerArmed) return
  resumeListenerArmed = true
  const resume = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume()
    }
  }
  // `pointerdown` covers mouse + touch + pen; keydown handles keyboard-only
  // users. `{ once: true }` so we don't leak listeners past the first
  // gesture.
  window.addEventListener('pointerdown', resume, { once: true })
  window.addEventListener('keydown', resume, { once: true })
}

/**
 * Synchronous image lookup that guarantees a single `HTMLImageElement`
 * per `src`. If the image is already in the cache (preloaded or
 * previously demand-loaded) the cached instance is returned immediately.
 * Otherwise a new Image is created, stored in the cache, and returned —
 * so all *subsequent* callers share the decoded bitmap and the browser
 * doesn't re-fetch or re-decode.
 *
 * Call sites can use the return value with `ctx.drawImage` right away;
 * if the image isn't loaded yet the usual `.complete && .naturalWidth`
 * gate handles it (same as the existing render paths).
 */
export const getCachedImage = (src: string): HTMLImageElement => {
  const existing = resourceCache.images.get(src)
  if (existing) return existing
  const img = new Image()
  img.src = src
  resourceCache.images.set(src, img)
  return img
}

/**
 * Decode a remote audio file into an AudioBuffer and cache it. Returns
 * `null` if Web Audio isn't available or decode fails — callers should
 * then fall back to HTMLAudio. Safe to call multiple times; concurrent
 * calls share the same in-flight decode.
 */
const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>()
export const loadAudioBuffer = async (src: string): Promise<AudioBuffer | null> => {
  const cached = resourceCache.audioBuffers.get(src)
  if (cached) return cached
  const existing = pendingDecodes.get(src)
  if (existing) return existing

  const ctx = getAudioContext()
  if (!ctx) return null

  const promise = (async () => {
    try {
      const res = await fetch(src)
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      resourceCache.audioBuffers.set(src, buffer)
      return buffer
    } catch (e) {
      console.warn(`[assets] decodeAudioData failed for ${src}`, e)
      return null
    } finally {
      pendingDecodes.delete(src)
    }
  })()
  pendingDecodes.set(src, promise)
  return promise
}

// ─── Preload tiers ─────────────────────────────────────────────────────────
//
// Three layers of preload with distinct urgency:
//
//  1. STATIC_IMAGES + critical skins — splash-blocking. These paint the
//     very first UI frame (logo, HUD icons, parchment ribbon, tiled bg)
//     and the skins visible in the opening stage. Kept small and cheap
//     so the FLogoProgress overlay can exit as fast as possible.
//
//  2. SFX + VFX spritesheets — deferred. Fired after the splash-blocking
//     preload resolves, fire-and-forget. SFX go first because they
//     decode quickly and early combat wants them in memory; VFX go last
//     (explosion_2080x160 ≈ 300KB and big-spark_1280x256 ≈ 200KB dwarf
//     the UI icons and would otherwise pad the splash by ~200–500ms on
//     slower connections). By the time the player reaches the arena
//     these are almost always in cache; the few that aren't decode on
//     first use and are then cached in resourceCache forever.
//
//  3. preloadRemainingSkins — every skin not needed for the current
//     stage. Triggered from SpinnerArena on mount, fire-and-forget.
const STATIC_IMAGES = [
  'images/logo/logo_256x256.webp',
  'images/icons/difficulty-icon_128x128.webp',
  'images/icons/settings-icon_128x128.webp',
  'images/icons/sound-icon_128x128.webp',
  'images/icons/team_128x128.webp',
  'images/icons/gears_128x128.webp',
  'images/icons/movie_128x96.webp',
  'images/icons/chest_128x128.webp',
  'images/icons/trophy_128x128.webp',
  'images/bg/parchment-ribbon_553x188.webp',
  'images/bg/bg-tile_400x400.webp'
]

const VFX_ASSETS = [
  'images/vfx/big-spark_1280x256.webp',
  'images/vfx/dark-smoke_1280x128.webp',
  'images/vfx/earth-rip-decal_138x138.webp',
  'images/vfx/explosion_2080x160.webp'
]

// VFX only one arena type ever draws. The deferred tier adds the set for the
// CURRENT stage's arena; useSpinnerGame.initGame warms it again for an arena
// reached any other way (next stage, daily challenge, PvP, cheats).
const ARENA_VFX_ASSETS: Partial<Record<ArenaType, string[]>> = {
  lava: [FLAME_BURN_SRC]
}

const currentArenaVfx = (): string[] => {
  try {
    const arena = useSpinnerCampaign().currentStage.value?.arenaType
    return (arena && ARENA_VFX_ASSETS[arena]) || []
  } catch {
    return []
  }
}

const SOUND_ASSETS = [
  'audio/sfx/clash-1.ogg',
  'audio/sfx/clash-2.ogg',
  'audio/sfx/clash-3.ogg',
  'audio/sfx/clash-4.ogg',
  'audio/sfx/clash-5.ogg',
  'audio/sfx/celebration-1.ogg',
  'audio/sfx/celebration-2.ogg',
  'audio/sfx/happy.ogg',
  'audio/sfx/level-up.ogg',
  'audio/sfx/win.ogg',
  'audio/sfx/lose.ogg',
  'audio/sfx/reward-continue.ogg'
]

// Kept for reference — music is streamed on demand from SpinnerArena, not preloaded.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MUSIC_ASSETS = [
  'audio/music/battle-1.ogg',
  'audio/music/battle-2.ogg',
  'audio/music/battle-3.ogg',
]

/**
 * Skin IDs the player will see IMMEDIATELY on first paint:
 *   • both player-team slots (resolved via getSelectedSkin — falls back to the
 *     default catalog skin when no selection has been persisted yet, which
 *     covers the very first load).
 *   • every enemy in the current campaign stage (stored on each StageBladeConfig).
 *
 * Everything else (the other ~40 skins in the config modal catalog, future
 * stages the player hasn't unlocked yet) is deferred to `preloadRemainingSkins`
 * which runs in the background once the arena is interactive.
 */
const getCriticalSkinIds = (): Set<string> => {
  const ids = new Set<string>()
  try {
    const { playerTeam } = useSpinnerConfig()
    playerTeam.value.forEach((cfg, slotIndex) => {
      // modelId override wins; otherwise resolve the player's chosen skin for
      // this top part. getSelectedSkin always returns a valid id (default on
      // first load).
      const id = cfg.modelId ?? getSelectedSkin(cfg.topPartId as TopPartId, slotIndex)
      if (id) ids.add(id)
    })
  } catch (e) {
    console.warn('[assets] player team resolve failed, using no player skins', e)
  }
  try {
    const { currentStage } = useSpinnerCampaign()
    const stage = currentStage.value
    if (stage?.enemyTeam) {
      for (const enemy of stage.enemyTeam) {
        if (enemy.modelId) ids.add(enemy.modelId)
      }
    }
  } catch (e) {
    console.warn('[assets] stage resolve failed, using no stage skins', e)
  }
  return ids
}

/**
 * First-launch intro cutscene: its three skins (boss + the two Lv. 30 blues).
 * Requested the moment the splash-critical tier resolves — first in line, ahead
 * of the SFX/VFX tier — and never awaited by the splash. Measured on the
 * production build: putting them IN the splash tier added ~200 ms to the loader
 * (request queueing on an HTTP/1.1 origin, not bytes — they are ~30 KB
 * together). The cutscene waits for their decode (capped) before its clock
 * starts, behind its own fade-from-black, so nothing is ever drawn without
 * them. Only for a probable first-timer. (The explosion sheet it also uses is
 * in the deferred VFX tier, needed ~4 s in.)
 */
const preloadIntroSkins = (): void => {
  try {
    if (!isIntroLikely((k) => localStorage.getItem(k))) return
  } catch {
    return // storage blocked — the intro gate will say 'skip' too
  }
  for (const id of INTRO_SKIN_IDS) {
    const src = modelImgPath(id)
    if (resourceCache.images.has(src)) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    resourceCache.images.set(src, img)
  }
}

type AssetEntry = { src: string; type: 'image' | 'audio' }

const loadAsset = (
  { src, type }: AssetEntry,
  onLoaded?: () => void
): Promise<unknown> => {
  if (type === 'image' && resourceCache.images.has(src)) {
    onLoaded?.()
    return Promise.resolve()
  }
  if (type === 'audio' && resourceCache.audioBuffers.has(src)) {
    onLoaded?.()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    if (type === 'image') {
      const img = new Image()
      img.onload = () => {
        resourceCache.images.set(src, img)
        onLoaded?.()
        resolve(img)
      }
      img.onerror = () => {
        console.error('Preload fail:', src)
        onLoaded?.()
        resolve(null)
      }
      img.src = src
    } else {
      // SFX preload path — decode into an AudioBuffer so every playSound
      // call spawns a zero-cost source node instead of re-decoding. If
      // Web Audio is unavailable (very old browsers, private modes that
      // block AudioContext), fall back to caching an HTMLAudioElement so
      // playSound still has something to clone from.
      loadAudioBuffer(src).then((buffer) => {
        if (buffer) {
          onLoaded?.()
          resolve(buffer)
          return
        }
        const audio = new Audio()
        audio.oncanplaythrough = () => {
          resourceCache.audio.set(src, audio)
          onLoaded?.()
          resolve(audio)
        }
        audio.onerror = () => {
          onLoaded?.()
          resolve(null)
        }
        audio.src = src
        audio.load()
      })
    }
  })
}

const runInChunks = async (assets: AssetEntry[], chunkSize: number, onLoaded?: () => void) => {
  for (let i = 0; i < assets.length; i += chunkSize) {
    const chunk = assets.slice(i, i + chunkSize)
    await Promise.all(chunk.map(a => loadAsset(a, onLoaded)))
  }
}

// Tracks in-flight background skin preload so repeat triggers noop and the
// config modal can await it if opened early.
let remainingSkinsPromise: Promise<void> | null = null

// Same idea for the SFX + VFX tier — callers that really need to know
// when every effect is in memory (e.g. a test suite) can await this.
let deferredAssetsPromise: Promise<void> | null = null

export default () => {
  const preloadAssets = async () => {
    if (areAllAssetsLoaded.value) return

    const criticalSkinIds = getCriticalSkinIds()
    const criticalSkinPaths = [...criticalSkinIds].map(id => modelImgPath(id))

    // Splash-critical tier only: UI chrome + the skins rendered on first
    // paint. SFX and VFX spritesheets are kicked off as a background
    // chain below so the loader can hit 100% as soon as the player can
    // actually see something.
    const criticalAssets: AssetEntry[] = [
      ...STATIC_IMAGES.map(src => ({ src: prependBaseUrl(src), type: 'image' as const })),
      ...criticalSkinPaths.map(src => ({ src, type: 'image' as const }))
    ]

    let loadedCount = 0
    const totalCount = criticalAssets.length
    const onOne = () => {
      loadedCount++
      loadingProgress.value = Math.floor((loadedCount / totalCount) * 100)
    }

    try {
      await runInChunks(criticalAssets, 10, onOne)
      // The intro's skins go out the instant the splash-critical tier is in —
      // first in line, ahead of SFX/VFX, but never in the splash's way.
      preloadIntroSkins()
      areAllAssetsLoaded.value = true
      loadingProgress.value = 100
    } catch (error) {
      console.error('Preload failed:', error)
      loadingProgress.value = 100
    }

    // Fire-and-forget. Not awaited so the splash can exit the moment
    // the critical tier is done.
    void preloadDeferredAssets()
  }

  /**
   * Background loader for SFX then VFX. SFX first because short OGGs
   * decode in a few ms and the player can generate combat sounds seconds
   * after the splash is gone; VFX second because the spritesheets are
   * hundreds of KB each and the game tolerates a single stutter on first
   * spawn before they land in resourceCache. Idempotent — repeat calls
   * share the same in-flight promise.
   */
  const preloadDeferredAssets = (): Promise<void> => {
    if (deferredAssetsPromise) return deferredAssetsPromise

    const sfx: AssetEntry[] = SOUND_ASSETS
      .map(src => prependBaseUrl(src))
      .filter(src => !resourceCache.audioBuffers.has(src))
      .map(src => ({ src, type: 'audio' as const }))

    const vfx: AssetEntry[] = [...VFX_ASSETS, ...currentArenaVfx()]
      .map(src => prependBaseUrl(src))
      .filter(src => !resourceCache.images.has(src))
      .map(src => ({ src, type: 'image' as const }))

    // Smaller chunks than the critical loader — we're competing with
    // arena render work once the player is interactive, so we keep the
    // bandwidth footprint modest.
    deferredAssetsPromise = (async () => {
      try {
        await runInChunks(sfx, 4)
        await runInChunks(vfx, 4)
      } catch (e) {
        console.error('Deferred asset preload failed:', e)
      }
    })()
    return deferredAssetsPromise
  }

  /**
   * Prefetch a specific set of skins by modelId. Used to warm the cache
   * for the NEXT campaign stage's enemies while the player is on the
   * reward screen — typically ~3 s of idle wall-time, plenty for 2-4
   * decodes. Skips ids already in the cache; returns a promise that
   * resolves once every missing skin has decoded so callers can chain on
   * it if they want, but the intended use is fire-and-forget.
   */
  const preloadSkinsByIds = (ids: string[]): Promise<void> => {
    const entries: AssetEntry[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      const src = modelImgPath(id)
      if (seen.has(src) || resourceCache.images.has(src)) continue
      seen.add(src)
      entries.push({ src, type: 'image' as const })
    }
    if (entries.length === 0) return Promise.resolve()
    return runInChunks(entries, 4).catch((e) => {
      console.error('Targeted skin preload failed:', e)
    }) as Promise<void>
  }

  /**
   * Fire-and-forget background loader for every skin NOT in the critical set.
   * Safe to call multiple times — concurrent calls share the same in-flight
   * promise. Callers (e.g. the skin config modal) can `await` the returned
   * promise if they need to be sure everything's cached before rendering a
   * gallery.
   */
  const preloadRemainingSkins = (): Promise<void> => {
    if (remainingSkinsPromise) return remainingSkinsPromise

    const remaining: AssetEntry[] = SPINNER_MODEL_IDS
      .map(id => modelImgPath(id))
      .filter(src => !resourceCache.images.has(src))
      .map(src => ({ src, type: 'image' as const }))

    if (remaining.length === 0) {
      remainingSkinsPromise = Promise.resolve()
      return remainingSkinsPromise
    }

    // Smaller chunks than the critical preloader so we don't starve the main
    // thread / network while the player is already interacting with the arena.
    remainingSkinsPromise = runInChunks(remaining, 4).catch((e) => {
      console.error('Background skin preload failed:', e)
    }) as Promise<void>
    return remainingSkinsPromise
  }

  return {
    loadingProgress,
    areAllAssetsLoaded,
    preloadAssets,
    preloadDeferredAssets,
    preloadRemainingSkins,
    preloadSkinsByIds,
    resourceCache // Export this if you want to debug memory usage
  }
}

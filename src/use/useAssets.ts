import { ref } from 'vue'
import { movieIconPath } from '@/use/badgeIconArt'
import useSpinnerCampaign, { type ArenaType } from '@/use/useSpinnerCampaign.ts'
import { prependBaseUrl } from '@/utils/function.ts'
import { FLAME_BURN_SRC } from '@/use/borderFx'
import { armSkillSfx } from '@/skills/skillsGate'
import { BALLOON_HP_BUILD } from '@/use/balloonHpFlag'
import { BALLOON_POP_SFX, VS_INTRO_SFX, newSlotOn, sfxPath } from '@/audio/audioVersions'
import { isIntroLikely } from '@/use/introGate'
import { warmIntroCutscene } from '@/use/introCutsceneLoader'
import { hudUiIconPreloads } from '@/use/uiIconArt'
import { preloadBackdropArt } from '@/use/arenaBackdrop'
import { preloadFloorArt } from '@/use/arenaFloorArt'
import { borderKeyFor, preloadBorderArt } from '@/use/arenaBorderArt'
import { floorKeyFor, themeFor } from '@/use/arenaThemes'
import { layoutForStage } from '@/use/arenaTerrain'

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
//     very first UI frame (logo, HUD icons, tiled bg)
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
// The HUD core buttons' icons are painted UI icons (UiIcon → images/ui-icons/,
// drawn SVG fallback): their sprites join this tier at the size this display's
// srcset will pick (hudUiIconPreloads). The old images/icons team / chest /
// trophy webps are no longer shown, so they are no longer preloaded.
const STATIC_IMAGES = [
  movieIconPath(),
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
// reached any other way (next stage, PvP, cheats).
const ARENA_VFX_ASSETS: Partial<Record<ArenaType, string[]>> = {
  lava: [FLAME_BURN_SRC]
}

// The current stage's arena art (backdrop tile + prop atlas, floor, border) is
// the first thing the player sees behind the menu, so the splash waits for it
// like the rest of the critical tier — capped, so a stalled file never holds
// the game; whatever lands later still re-bakes the static layer.
const ARENA_ART_WAIT_MS = 4000

const currentArenaArtJobs = (): Promise<void>[] => {
  try {
    const stage = useSpinnerCampaign().currentStage.value
    if (!stage) return []
    const arenaType = stage.arenaType ?? 'default'
    const layout = layoutForStage(stage.id)
    const theme = themeFor(arenaType, layout)
    return [
      preloadBackdropArt(theme),
      preloadFloorArt(floorKeyFor(theme, layout)),
      preloadBorderArt(borderKeyFor(arenaType, theme))
    ]
  } catch {
    return []
  }
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
  'audio/sfx/reward-continue.ogg',
  // #UX3: only balloon builds burst HP balloons (VITE_APP_BALOON_HP_BAR).
  ...(BALLOON_HP_BUILD && newSlotOn('balloon-pop') ? [sfxPath(BALLOON_POP_SFX)] : []),
  // The VS intro before every battle (whoosh, card thumps, the VS slam).
  ...(newSlotOn('vs-intro') ? VS_INTRO_SFX.map(n => sfxPath(n)) : [])
]

// Skill SFX (skills-feature.md §8.3) are deferred AND gated: their file list
// lives in `skills/skillSfx.ts`, armed from the deferred tier below through
// the skills gate (`armSkillSfx`), so a skills-off build names none of them.

// Boss-trait SFX (bosses-100-feature.md §7.3, BW4) — deferred and GATED like
// the skill set: their file list lives in `bosses/bossTraitSfx.ts` (reached
// only through the bosses gate's engine port), requested once when a match
// whose roster carries a boss trait is prepared. A bosses100-off build names
// none of them; a player below stage 110 downloads none.

/** Decode a gated SFX list into the Web Audio cache (idempotent). */
export const preloadSfxList = (list: readonly string[]): Promise<unknown> =>
  Promise.all(list.map(src => loadAudioBuffer(prependBaseUrl(src))))

// Kept for reference — music is streamed on demand from SpinnerArena, not preloaded.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MUSIC_ASSETS = [
  'audio/music/battle-1.ogg',
  'audio/music/battle-2.ogg',
  'audio/music/battle-3.ogg',
]

/**
 * First-launch intro cutscene (#Intro1): its chunk and every painted file it
 * draws (team trees, thorns, tree-hit FX, the meadow backdrop / props / floor,
 * the five smasher sheets, the intro paintings) — introCutsceneLoader.ts.
 * Requested the moment the splash-critical tier resolves — first in line, ahead
 * of the SFX/VFX tier — and never awaited by the splash (putting files IN the
 * splash tier cost the loader ~200 ms of request queueing). The cutscene waits
 * (capped) for the arena art before its clock starts, under the fading splash.
 * Only for a probable first-timer (isIntroLikely).
 */
const preloadIntroSkins = (): void => {
  let likely = false
  try {
    likely = isIntroLikely(k => window.localStorage.getItem(k))
  } catch { /* storage blocked: the gate fails closed anyway */
  }
  if (likely) warmIntroCutscene()
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

    // Splash-critical tier only: UI chrome (smasher art is drawn by the rig,
    // no files). SFX and VFX spritesheets are kicked off as a background
    // chain below so the loader can hit 100% as soon as the player can
    // actually see something.
    const criticalAssets: AssetEntry[] = [
      ...[...STATIC_IMAGES, ...hudUiIconPreloads(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)]
        .map(src => ({ src: prependBaseUrl(src), type: 'image' as const })),
    ]

    const arenaJobs = currentArenaArtJobs()
    let loadedCount = 0
    const totalCount = criticalAssets.length + arenaJobs.length
    const onOne = () => {
      loadedCount++
      loadingProgress.value = Math.floor((loadedCount / totalCount) * 100)
    }
    const arenaArt = Promise.race([
      Promise.all(arenaJobs.map(j => j.then(onOne))),
      new Promise(resolve => setTimeout(resolve, ARENA_ART_WAIT_MS))
    ])

    try {
      await Promise.all([runInChunks(criticalAssets, 10, onOne), arenaArt])
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
        // Skill SFX: armed here (after the core SFX), loaded only when owned.
        // A no-op on a skills-off build (skills gate).
        armSkillSfx()
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
  const preloadSkinsByIds = (_ids: string[]): Promise<void> => Promise.resolve()

  /**
   * Fire-and-forget background loader for every skin NOT in the critical set.
   * Safe to call multiple times — concurrent calls share the same in-flight
   * promise. Callers (e.g. the skin config modal) can `await` the returned
   * promise if they need to be sure everything's cached before rendering a
   * gallery.
   */
  const preloadRemainingSkins = (): Promise<void> => {
    remainingSkinsPromise ??= Promise.resolve()
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

// ─── CrazyGames SDK integration ────────────────────────────────────────────
//
// Encapsulates everything the rest of the app needs to talk to the
// CrazyGames SDK loaded via a <script> tag in index.html:
//
//   1. init() — probes `window.CrazyGames.SDK`, calls SDK.init(), and flips
//      `isSdkActive` to true iff the SDK reports a real CrazyGames environment
//      ('crazygames' for live iframe, 'local' for local dev tooling) AND the
//      build-time `isCrazyWeb` flag is set (VITE_APP_CRAZY_WEB=true).
//
//   2. Gameplay lifecycle — `startGameplay()` / `stopGameplay()` wrap the
//      SDK's `game.gameplayStart()` / `gameplayStop()` hooks, which let
//      CrazyGames know when the player is actually in a match (vs menus).
//
//   3. `showRewardedAd()` — a Promise-based wrapper around the SDK's
//      `ad.requestAd('rewarded', …)` callback API. Resolves `true` only when
//      the video played all the way through, so callers can safely grant the
//      reward on success and be silent on failure.
//
// Persistence of player progress is handled separately by
// `@/utils/save/CrazyGamesStrategy`, wired into `SaveManager` at boot. This
// module exposes `createCrazyGamesSaveStrategy()` so the bootstrap can pick
// that strategy without reaching into SDK internals itself.
//
// Outside of a CrazyGames build the module is inert: `isSdkActive` stays
// false and `showRewardedAd()` resolves false.

import { ref } from 'vue'
import { isCrazyWeb } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { CrazyGamesStrategy } from '@/utils/save/CrazyGamesStrategy'
import type { SaveStrategy } from '@/utils/save/types'

// The CrazyGames SDK is loaded globally via a script tag in index.html.
// We interact with it entirely through `window.CrazyGames.SDK`, so the
// types are intentionally loose — we only touch the members we need.
declare global {
  interface Window {
    CrazyGames?: {
      SDK?: any
    }
  }
}

/** Reactive: true when the SDK finished init AND we're in a crazy-web build. */
export const isSdkActive = ref(false)

/**
 * Last known mute state reported by the CrazyGames SDK. `null` until we've
 * either read `sdk.game.muteAudio` at init time or received an event from
 * `sdk.game.addMuteListener`. Components can mirror this into their own
 * volume settings to keep the platform-level mute toggle in sync.
 */
export const isSdkMuted = ref<boolean | null>(null)

/**
 * CrazyGames-side display name for the current player, when available.
 * Falls back to `null` for anonymous sessions or non-crazy builds — callers
 * should default to a generic label like "You".
 */
export const crazyPlayerName = ref<string | null>(null)

/**
 * Reactive: true while a real CrazyGames ACCOUNT is signed in on this session.
 *
 * Distinct from `crazyPlayerName !== null` in the one direction that matters:
 * the name is REMEMBERED across sessions by `usePlayerIdentity` (so an offline
 * session doesn't relabel the player's row), while this is the live answer to
 * "is there an account behind the game right now". Gating a leaderboard on the
 * remembered name would let a signed-out guest keep posting under the account's
 * handle, which is the exact mixing CG QA rejected the build for.
 *
 * Stays `false` on every non-CG build and in any CG environment where user
 * accounts aren't available at all — see `leaderboardAuthorized` in
 * `useLiveLeaderboard`, which treats "no account concept" and "signed out"
 * differently.
 */
export const isCrazyLoggedIn = ref(false)

/**
 * Whether this environment can offer accounts AT ALL (`sdk.user
 * .isUserAccountAvailable`). False on an embed where CG has disabled the user
 * module, in which case nobody can ever sign in and an account-gated feature
 * has to hide rather than sit there waiting for a login that cannot happen.
 */
export const crazyAccountsAvailable = ref(false)

/**
 * Reactive: true once we've detected that the player's browser is blocking
 * CrazyGames ad requests (uBlock, AdGuard, Brave Shields, etc.). Two
 * sources feed this:
 *   1. `sdk.ad.hasAdblock()` — explicit method exposed by CG SDK v3,
 *      probed at init time. Fast path.
 *   2. `adError({ code: 'adblocker' })` — reported by the SDK at show
 *      time. Catches blockers that activated AFTER init (e.g. user
 *      enabled the extension while the game was running).
 * Wired into `AdProvider.isAdsBlocked` via `CrazyGamesProvider`.
 */
export const isCrazyAdsBlocked = ref(false)

/**
 * The raw language tag from `sdk.user.systemInfo.locale` (e.g. `pt-BR`,
 * `zh-TW`, `en`). `null` when the SDK didn't expose one. Kept WHOLE — the
 * region decides between our `pt-BR` / `pt-PT` and `zh` / `zh-TW` files —
 * and normalised to an internal code by `toShippedLocale` in `main.ts`.
 */
export const crazyLocale = ref<string | null>(null)

// Internal handles — captured during init() and reused by the rest of the
// module. Keeping them here (rather than re-reading window.CrazyGames.SDK on
// every call) makes the intent explicit and lets us no-op cleanly when the
// script tag never loaded.
let sdk: any = null
let initialized = false
let gameplayActive = false

const getSdk = (): any => (typeof window !== 'undefined' ? window.CrazyGames?.SDK ?? null : null)

const isActiveEnv = (s: any): boolean => {
  if (!s) return false
  const env = s.environment
  // 'crazygames' — running inside an iframe on crazygames.com
  // 'local'      — local dev via `crazygames-sdk` CLI tool
  // 'disabled'   — plain localhost, no SDK tooling
  return (env === 'crazygames' || env === 'local') && isCrazyWeb
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialize the SDK. Safe to call multiple times — subsequent calls are
 * no-ops. Persistence hydration happens separately via
 * `CrazyGamesStrategy` wired into `SaveManager` — this function now only
 * handles SDK init, profile capture, and mute listeners.
 */
export const initCrazyGames = async (): Promise<void> => {
  if (initialized) return
  initialized = true

  const candidate = getSdk()
  if (!candidate) {
    // Script tag didn't load (blocked, offline, or plain non-CG build).
    return
  }

  try {
    await candidate.init?.()
  } catch (e) {
    console.warn('[crazygames] SDK init failed', e)
    return
  }

  if (!isActiveEnv(candidate)) {
    // Non-crazy-web build, or running in a 'disabled' environment.
    return
  }

  sdk = candidate
  isSdkActive.value = true

  await captureSdkProfile()
  registerMuteListener()
  registerAuthListener()
  probeAdBlocker()
}

/**
 * Build the save strategy backed by the CrazyGames `data` module. The
 * strategy pulls the SDK lazily through `getSdk()` so it can be
 * constructed before `initCrazyGames()` has resolved — actual data calls
 * happen during `hydrate()` which `SaveManager` awaits after SDK init.
 *
 * Returns a strategy that no-ops when the SDK isn't available, so the
 * game never blocks on a missing script tag.
 */
export const createCrazyGamesSaveStrategy = (): SaveStrategy =>
  new CrazyGamesStrategy(() => {
    const data = sdk?.data
    if (!data || typeof data.getItem !== 'function') return null
    return data
  })

// ─── Profile / settings capture ───────────────────────────────────────────

/**
 * Fold one `user` object (or `null`) from the SDK into the reactive auth state.
 *
 * Shared by the initial `getUser()` read and by the auth listener, so a sign-in
 * that happens mid-session lands in exactly the same state a sign-in that
 * happened before boot would have.
 *
 * On sign-OUT the display name is cleared as well. Leaving it would strand the
 * account's handle on a now-anonymous session, and `usePlayerIdentity` would
 * happily keep labelling rows with it.
 */
const adoptCrazyUser = (u: unknown): void => {
  const name = typeof (u as { username?: unknown })?.username === 'string'
    ? (u as { username: string }).username.trim()
    : ''
  isCrazyLoggedIn.value = !!u
  crazyPlayerName.value = name || null
}

/**
 * Subscribe to sign-in / sign-out while the game is running.
 *
 * CG's account prompt is part of the PORTAL chrome, not the game — a player can
 * sign in from the surrounding page at any moment without the iframe reloading.
 * Without this listener the game would hold whatever auth state happened to be
 * true at boot forever, and a player who signed in mid-session would keep
 * seeing the leaderboard hidden until they reloaded.
 */
const registerAuthListener = (): void => {
  const add = sdk?.user?.addAuthListener
  if (typeof add !== 'function') return
  try {
    add.call(sdk.user, (u: unknown) => {
      adoptCrazyUser(u)
    })
  } catch (e) {
    console.warn('[crazygames] addAuthListener failed', e)
  }
}

/**
 * Best-effort read of mute state, player identity, and locale from the SDK.
 * All branches are wrapped in try/catch so a single missing field doesn't
 * abort the rest — the SDK surface differs slightly between builds.
 */
const captureSdkProfile = async (): Promise<void> => {
  // Initial mute state. Per the CG SDK v3 docs, the canonical read path is
  // the property `sdk.game.settings.muteAudio` ("please disable the game
  // audio if this is true"). We also defensively check `sdk.game.muteAudio`
  // and an `isMuted()` method in case the SDK surface drifts between
  // builds, but the `settings.muteAudio` path is the documented one.
  try {
    let m: unknown = sdk?.game?.settings?.muteAudio
    if (typeof m !== 'boolean') m = sdk?.game?.muteAudio
    if (typeof m !== 'boolean' && typeof sdk?.game?.isMuted === 'function') {
      m = sdk.game.isMuted()
    }
    if (typeof m === 'boolean') isSdkMuted.value = m
  } catch (e) {
    console.warn('[crazygames] read settings.muteAudio failed', e)
  }

  // Whether accounts exist in this environment at all. A property on the SDK,
  // not a call — read defensively because older shims don't define it, and an
  // undefined there must read as "no accounts" rather than crash the profile
  // capture and take the locale read down with it.
  try {
    crazyAccountsAvailable.value = sdk?.user?.isUserAccountAvailable === true
  } catch (e) {
    console.warn('[crazygames] isUserAccountAvailable read failed', e)
  }

  // Player display name. `sdk.user.getUser()` resolves to `null` for
  // anonymous sessions, so we only fill the ref when a real username comes
  // back — but `isCrazyLoggedIn` is set either way, because "signed out" is a
  // state the leaderboard gate has to be able to see.
  try {
    const u = await sdk?.user?.getUser?.()
    adoptCrazyUser(u)
  } catch (e) {
    console.warn('[crazygames] getUser failed', e)
  }

  // Locale. Newer SDK builds expose `systemInfo` as a property; older ones
  // expose a `getSystemInfo()` async accessor. We try the property first and
  // fall back to the method. The tag is stored whole (`pt-BR`, not `pt`);
  // `main.ts` maps it onto a shipped locale.
  try {
    let info: any = sdk?.user?.systemInfo
    if (!info && typeof sdk?.user?.getSystemInfo === 'function') {
      info = await sdk.user.getSystemInfo()
    }
    const raw =
      info?.locale ??
      info?.userLocale ??
      info?.language ??
      null
    if (typeof raw === 'string' && raw.trim().length >= 2) {
      crazyLocale.value = raw.trim()
    }
  } catch (e) {
    console.warn('[crazygames] systemInfo locale read failed', e)
  }
}

// ─── Gameplay lifecycle ───────────────────────────────────────────────────

/**
 * Signal a "happy moment" to the CrazyGames SDK. CrazyGames uses these
 * events to pick the best times to highlight the game and to calibrate
 * player-sentiment analytics, so we fire it when the player just landed
 * a clearly positive reward (roulette win, boss drop, etc.). No-op when
 * the SDK isn't active.
 */
export const triggerHappytime = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.happytime?.()
  } catch (e) {
    console.warn('[crazygames] happytime failed', e)
  }
}

/**
 * Notify CrazyGames that the game is in a loading phase — the SDK uses
 * this to drive its own loading indicator AND to mark the start of the
 * "loaded bytes" measurement that QA tooling reads. The SDK auto-enters
 * `loading` on `init()`, so the explicit call is only needed for
 * mid-game loading events (e.g. fetching a new arena chunk). Idempotent.
 */
export const startLoading = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.loadingStart?.()
  } catch (e) {
    console.warn('[crazygames] loadingStart failed', e)
  }
}

/**
 * Notify CrazyGames that the game has finished loading and the player
 * can interact. This is the canonical signal CG QA's tooling listens
 * for to record the cold-launch download size — every byte transferred
 * before this event counts toward the "load size" metric, every byte
 * after counts as on-demand. Call once when the splash screen resolves.
 * Idempotent.
 */
export const stopLoading = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.loadingStop?.()
  } catch (e) {
    console.warn('[crazygames] loadingStop failed', e)
  }
}

/**
 * Notify CrazyGames that interactive gameplay is starting. Idempotent.
 * Call when the player enters the arena / begins a match.
 */
export const startGameplay = (): void => {
  if (!sdk || gameplayActive) return
  try {
    sdk.game?.gameplayStart?.()
    gameplayActive = true
  } catch (e) {
    console.warn('[crazygames] gameplayStart failed', e)
  }
}

/**
 * Notify CrazyGames that gameplay has ended. Idempotent.
 * Call when leaving the arena, opening a blocking menu, or mid-ad.
 */
export const stopGameplay = (): void => {
  if (!sdk || !gameplayActive) return
  try {
    sdk.game?.gameplayStop?.()
    gameplayActive = false
  } catch (e) {
    console.warn('[crazygames] gameplayStop failed', e)
  }
}

// ─── Mute sync ────────────────────────────────────────────────────────────

type MuteCallback = (muted: boolean) => void
const muteListeners = new Set<MuteCallback>()

/**
 * Wire up the CrazyGames → game side of the mute bridge. Called once at
 * init, after captureSdkProfile has read the initial state.
 *
 * Per the CG SDK v3 docs, the supported way to react to mute changes is
 * `sdk.game.addSettingsChangeListener(listener)`, where `listener` is
 * called with the *full settings object* (not just a boolean) every time
 * any game setting changes — we extract `muteAudio` from that object.
 *
 * We keep a defensive `addMuteListener` branch for older shims, but the
 * settings-change path is the documented one and the only one that
 * actually fires in the live SDK. The previous code here relied solely
 * on `addMuteListener`, which never fires on the real v3 surface — that
 * is why the platform mute button didn't reach the game.
 */
const registerMuteListener = (): void => {
  if (!sdk?.game) return

  const handleMuteChange = (muted: boolean) => {
    if (isSdkMuted.value === muted) return
    isSdkMuted.value = muted
    muteListeners.forEach(cb => {
      try {
        cb(muted)
      } catch (e) {
        console.warn('[crazygames] mute callback threw', e)
      }
    })
  }

  if (typeof sdk.game.addSettingsChangeListener === 'function') {
    try {
      sdk.game.addSettingsChangeListener((newSettings: any) => {
        const m = newSettings?.muteAudio
        if (typeof m === 'boolean') handleMuteChange(m)
      })
    } catch (e) {
      console.warn('[crazygames] addSettingsChangeListener failed', e)
    }
  } else if (typeof sdk.game.addMuteListener === 'function') {
    // Legacy / shim fallback.
    try {
      sdk.game.addMuteListener((muted: boolean) => handleMuteChange(!!muted))
    } catch (e) {
      console.warn('[crazygames] addMuteListener failed', e)
    }
  }
}

/**
 * Subscribe to CrazyGames-side mute toggles. The listener fires whenever
 * the platform chrome (or another part of the page) flips the mute state,
 * letting components mirror it into their own audio settings.
 *
 * New subscribers are IMMEDIATELY replayed the current SDK mute state
 * (when known), so a single hook covers both the initial sync and future
 * toggles — no separate "apply once" watcher needed.
 *
 * Returns an unsubscribe function. When the SDK isn't active, the callback
 * is never invoked and the unsubscribe is a no-op.
 */
export const onCrazyMuteChange = (cb: MuteCallback): (() => void) => {
  muteListeners.add(cb)
  if (isSdkMuted.value !== null) {
    try {
      cb(isSdkMuted.value)
    } catch (e) {
      console.warn('[crazygames] mute replay callback threw', e)
    }
  }
  return () => muteListeners.delete(cb)
}

/**
 * Record an in-game mute toggle so any code reading `isSdkMuted` sees the
 * new value. NOTE: the CrazyGames SDK v3 has no public setter for the
 * platform-level mute — that toggle is owned by the CG chrome and only
 * flows one-way (platform → game) through the settings-change listener.
 * The previous property-assignment attempts (`sdk.game.muteAudio = muted`)
 * were silently failing on the real SDK, which is why the in-game mute
 * button never moved the platform UI. We now just update our local ref so
 * internal consumers stay coherent. Safe to call when the SDK is inactive.
 */
export const setCrazyMuted = (muted: boolean): void => {
  isSdkMuted.value = muted
}

// Backwards-compat alias — `addCrazyMuteListener` was the old name used by
// `useCrazyMuteSync`. It's just `onCrazyMuteChange` under a different
// spelling so existing call sites keep compiling; prefer the new name in
// new code.
export const addCrazyMuteListener = onCrazyMuteChange

// ─── Ad-blocker detection ─────────────────────────────────────────────────

/**
 * Probe the SDK's `ad.hasAdblock()` method at init time. The method may
 * be sync (boolean) or async (Promise<boolean>) depending on SDK build —
 * normalize to async. Failure to call (method missing on older shims) is
 * NOT treated as "blocked" — we'd rather under-report than misfire the
 * modal at users without blockers.
 */
const probeAdBlocker = (): void => {
  const fn = sdk?.ad?.hasAdblock
  if (typeof fn !== 'function') return
  try {
    const result = fn.call(sdk.ad)
    Promise.resolve(result).then(
      (v) => {
        if (typeof v === 'boolean') isCrazyAdsBlocked.value = v
      },
      (e) => console.warn('[crazygames] hasAdblock rejected', e)
    )
  } catch (e) {
    console.warn('[crazygames] hasAdblock threw', e)
  }
}

/** Map an SDK adError to whether it indicates an ad-blocker. CG v3 uses
 *  `error.code === 'adblocker'`; older shims may stuff the same info into
 *  `message`. We check both to be robust across SDK builds. */
const isAdBlockerError = (err: any): boolean => {
  const code = String(err?.code ?? '').toLowerCase()
  if (code === 'adblocker' || code === 'adblock') return true
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  return msg.includes('adblock') || msg.includes('blocked by client')
}

/** True when the SDK's adError represents an expected, non-actionable
 *  outcome rather than a real failure. CG QA flagged
 *  `[crazygames] midgame ad error d` (where `d` was an `adCooldown`
 *  error) as console noise — the SDK rate-limits midgame ads and tells
 *  us politely; we should not surface that as a warning. Add other
 *  benign codes here as the SDK surfaces them. */
const isBenignAdError = (err: any): boolean => {
  const code = String(err?.code ?? '').toLowerCase()
  return code === 'adcooldown' || code === 'adnotfound'
}

// ─── Rewarded video ads ───────────────────────────────────────────────────

/**
 * Shows a rewarded video ad via the CrazyGames SDK. Resolves `true` iff the
 * ad played all the way through — callers should only grant the reward on
 * a `true` result.
 *
 * Always resolves `false` (and is a no-op) when the SDK is not active, so
 * callers can use it unconditionally without guard checks.
 */
export const showRewardedAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve(false)
      return
    }

    // CrazyGames recommends pausing gameplay while an ad plays so that
    // sounds + timers don't run behind the video. We only resume on
    // success/error paths if gameplay was actually active before the ad —
    // rewarded ads can be triggered from menus (RouletteWheel respin,
    // AdRewardButton, DailyRewards, BattlePass), in which case calling
    // gameplayStart() afterwards would falsely tell CG the player is in
    // a match while they're still on a menu.
    let wasGameplayActive = false
    const resumeAfterAd = () => {
      if (wasGameplayActive) startGameplay()
    }

    try {
      sdk.ad?.requestAd?.('rewarded', {
        adStarted: () => {
          wasGameplayActive = gameplayActive
          stopGameplay()
        },
        adFinished: () => {
          resumeAfterAd()
          resolve(true)
        },
        adError: (err: unknown) => {
          if (!isBenignAdError(err)) console.warn('[crazygames] rewarded ad error', err)
          if (isAdBlockerError(err)) isCrazyAdsBlocked.value = true
          resumeAfterAd()
          resolve(false)
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd threw', e)
      if (isAdBlockerError(e)) isCrazyAdsBlocked.value = true
      resumeAfterAd()
      resolve(false)
    }
  })
}

// ─── Midgame interstitial ads ─────────────────────────────────────────────

/**
 * Shows a midgame (interstitial) video ad via the CrazyGames SDK. Unlike
 * rewarded ads there is no reward to grant, so the promise simply resolves
 * once the SDK signals the ad has finished or errored — callers can `await`
 * it to know when it's safe to resume the next match.
 *
 * No-op (and resolves immediately) when the SDK is not active.
 */
export const showMidgameAd = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve()
      return
    }

    // Pause gameplay while the ad plays so sounds and timers don't run
    // behind the video. Only resume if gameplay was active before the ad —
    // a midgame ad fired outside an active match (defensive call, future
    // placement) shouldn't falsely flip the SDK into "in match" state.
    let wasGameplayActive = false
    const resumeAfterAd = () => {
      if (wasGameplayActive) startGameplay()
    }

    try {
      sdk.ad?.requestAd?.('midgame', {
        adStarted: () => {
          wasGameplayActive = gameplayActive
          stopGameplay()
        },
        adFinished: () => {
          resumeAfterAd()
          resolve()
        },
        adError: (err: unknown) => {
          if (!isBenignAdError(err)) console.warn('[crazygames] midgame ad error', err)
          if (isAdBlockerError(err)) isCrazyAdsBlocked.value = true
          resumeAfterAd()
          resolve()
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd midgame threw', e)
      if (isAdBlockerError(e)) isCrazyAdsBlocked.value = true
      resumeAfterAd()
      resolve()
    }
  })
}

// ─── Leaderboard score submission (low-level primitive) ────────────────────
//
// CrazyGames leaderboards (https://docs.crazygames.com/sdk/leaderboards-client)
// expect each score to be AES-GCM encrypted client-side before being handed
// to `SDK.user.submitScore({ encryptedScore, score })`. CG decrypts the score
// server-side with the SAME key and validates it — that's the key you shared
// with your CG contact to provision the leaderboard config. It lives in
// `VITE_APP_CRAZY_GAMES_LEADERBOARD_KEY` (a 32-byte, base64-encoded key) and
// is inlined at build time.
//
// This module only knows how to submit ONE already-decided score. The policy
// that decides WHICH scores to submit — tracking the last-submitted value and
// ramping +1 at a time so a manipulated save can't teleport up the board —
// lives in `useLeaderboard` next to the rest of the player-progress state.

/**
 * ─── OFF UNTIL CRAZYGAMES CONFIRMS THE LEADERBOARD ──────────────────────────
 *
 * CG leaderboards are an INVITE-ONLY feature. A build that calls
 * `SDK.user.submitScore` without being provisioned for one still logs the call,
 * and QA reads that in the console as a game shipping an unapproved feature —
 * which is what this build was sent back for:
 *
 *   "the CrazyGames Leaderboard is currently an invite-only feature, so please
 *    reach out to dom@crazygames.com for leaderboard confirmation. In the
 *    meantime, until we get that confirmation for the CrazyGames leaderboard,
 *    please remove it for now."
 *
 * So the whole submission path is switched off here rather than deleted: the
 * encryption helper, the +1 anti-cheat ramp in `useLeaderboard` and the ramp's
 * cloud-synced pointer are all still correct and still tested, and turning the
 * feature back on once dom@crazygames.com confirms is this one line.
 *
 * FLIP THIS ONLY ALONGSIDE a provisioned `VITE_APP_CRAZY_GAMES_LEADERBOARD_KEY`
 * — the key and the invite are issued together, and one without the other is
 * the same rejected state in a different disguise.
 */
// Annotated `boolean` rather than left to infer the literal `false`: without it
// TypeScript narrows the constant and marks the entire rest of `submitCgScore`
// as unreachable, so the code this switch exists to PRESERVE stops being
// type-checked at all.
const CG_LEADERBOARD_SUBMIT_ENABLED: boolean = false

const LEADERBOARD_ENCRYPTION_KEY = import.meta.env.VITE_APP_CRAZY_GAMES_LEADERBOARD_KEY as string | undefined

/**
 * Encrypt a numeric score exactly as the CG leaderboards-client spec
 * requires: random 12-byte IV, AES-GCM, then `base64(iv ++ ciphertext)`.
 * Verbatim port of the helper from the CrazyGames docs.
 */
const encryptScore = async (score: number, encryptionKey: string): Promise<string> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const algorithm = { name: 'AES-GCM', iv }
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0))
  const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, algorithm, false, ['encrypt'])
  const dataBuffer = new TextEncoder().encode(score.toString())
  const encryptedBuffer = await window.crypto.subtle.encrypt(algorithm, cryptoKey, dataBuffer)
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encryptedBuffer), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/**
 * Submit a single score to the CrazyGames leaderboard. Encrypts the value and
 * hands it to `SDK.user.submitScore`.
 *
 * Fully inert outside a live CG build: returns `false` (without touching the
 * SDK) when the SDK isn't active, the `submitScore` method is missing (older
 * shims), the leaderboard key isn't configured, the score isn't a positive
 * finite number, or the SDK call throws. Resolves `true` only when the submit
 * was handed to the SDK without error — the ramp in `useLeaderboard` uses that
 * boolean to decide whether to advance its persisted "last submitted" pointer,
 * so a failed/no-op submit is retried later instead of being skipped. Per the
 * CG docs the response is "always successful" (validation is server-side), so
 * `true` means "accepted by the SDK", not "ranked". The `isDebug`-gated traces
 * let you cross-check calls against the CG developer-portal logs.
 */
export const submitCgScore = async (score: number): Promise<boolean> => {
  // Invite-only feature, not confirmed for this game yet. Returns `false` like
  // every other "didn't submit" branch, so the ramp in `useLeaderboard` leaves
  // its pointer alone and the backlog is still there to drain on the day CG
  // switches the leaderboard on. Silent on purpose — the console line QA
  // objected to was the whole finding.
  if (!CG_LEADERBOARD_SUBMIT_ENABLED) return false
  if (!sdk || !isSdkActive.value) {
    if (isDebug.value) console.info('[cg-leaderboard] skip — SDK inactive', { score })
    return false
  }
  const submit = sdk.user?.submitScore
  if (typeof submit !== 'function') {
    if (isDebug.value) console.warn('[cg-leaderboard] skip — SDK.user.submitScore unavailable')
    return false
  }
  if (!LEADERBOARD_ENCRYPTION_KEY) {
    if (isDebug.value) console.warn('[cg-leaderboard] skip — VITE_APP_CRAZY_GAMES_LEADERBOARD_KEY not set')
    return false
  }
  if (!Number.isFinite(score) || score < 1) {
    if (isDebug.value) console.warn('[cg-leaderboard] skip — invalid score', { score })
    return false
  }

  try {
    const encryptedScore = await encryptScore(score, LEADERBOARD_ENCRYPTION_KEY)
    if (isDebug.value) console.info('[cg-leaderboard] submitting score', { score })
    await Promise.resolve(submit.call(sdk.user, { encryptedScore, score }))
    if (isDebug.value) console.info('[cg-leaderboard] submit OK', { score })
    return true
  } catch (e) {
    if (isDebug.value) console.warn('[cg-leaderboard] submit failed', { score }, e)
    return false
  }
}

// ─── Default export (composable-style convenience) ───────────────────────

const useCrazyGames = () => ({
  isSdkActive,
  isSdkMuted,
  crazyPlayerName,
  crazyLocale,
  initCrazyGames,
  createCrazyGamesSaveStrategy,
  startGameplay,
  stopGameplay,
  startLoading,
  stopLoading,
  showRewardedAd,
  showMidgameAd,
  submitCgScore,
  addCrazyMuteListener,
  onCrazyMuteChange,
  setCrazyMuted,
  triggerHappytime
})

export default useCrazyGames

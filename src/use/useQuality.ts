import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

/**
 * Adaptive render-quality tier.
 *
 * The arena's frame cost is dominated by canvas *rasterisation*, not by JS —
 * on a weak GPU (or a device where Chrome falls back to a software canvas)
 * the same scene that holds 60 fps on a desktop can sit under 20. Rather than
 * ship the reduced look to everyone, the renderer keeps the full-fidelity path
 * and this module decides, from measured frame times on the actual device,
 * whether to switch that device to the cheaper one.
 *
 * ─── Storage ──────────────────────────────────────────────────────────────
 * The preference is deliberately NOT stored under a `smashers_` or `ca_` prefix.
 * `SaveMergePolicy.PAYLOAD_PREFIXES` is exactly `['smashers_', 'ca_']`, so both
 * are cloud-save payload — and a quality verdict is a property of THIS DEVICE.
 * Syncing the phone's "low" onto the same player's desktop would permanently
 * downgrade a machine that never had a problem.
 */

export type QualityTier = 'high' | 'low'
export type QualityPreference = 'auto' | QualityTier

// NOT `ca_` / `smashers_`-prefixed: SaveMergePolicy's PAYLOAD_PREFIXES treats
// BOTH of those as cloud-save payload, so either one would have synced this
// device's verdict onto every other device the player owns.
const QUALITY_PREF_KEY = 'treesmashers_quality_pref'
const QUALITY_VERDICT_KEY = 'treesmashers_quality_verdict'

// ─── Tuning ─────────────────────────────────────────────────────────────────

/**
 * Sampling window length, in WALL-CLOCK MILLISECONDS rather than a frame count.
 *
 * This matters more than it looks. A frame-counted window takes longer to fill
 * the slower the device is — 60 frames is 1s at 60 fps but 8s at 7 fps — so a
 * frame-counted detector reacts slowest on exactly the devices that need it
 * fastest. Measured: with a 60-frame window a 7 fps device needed ~30s of play
 * to reach a verdict and a 3 fps device never reached one at all.
 */
const WINDOW_MS = 1500
/** A window still needs enough frames for its mean to mean anything. */
const MIN_WINDOW_FRAMES = 6
/** Below this measured fps the device is judged unable to hold the full look. */
const LOW_FPS = 25
/** Above this it is judged able to go back up. Deliberately far above LOW_FPS
 *  so a device sitting near the threshold cannot oscillate between tiers. */
const RECOVER_FPS = 48
/** Consecutive bad windows required before downgrading (~4.5s of real
 *  trouble), so one unlucky stretch — a GC pause, a texture upload, a
 *  backgrounded tab coming back — cannot demote a capable device. */
const BAD_WINDOWS_TO_DOWNGRADE = 3
/** Consecutive good windows required before upgrading again (~12s). */
const GOOD_WINDOWS_TO_UPGRADE = 8
/** After this many downgrades in one session the tier latches low. A device
 *  that keeps failing is not going to start passing; flapping is worse for the
 *  player than simply staying on the cheaper look. */
const MAX_DOWNGRADES_PER_SESSION = 2
/** A gap this long is not a frame rate — tab switch, ad break, modal, first
 *  paint after a stall. It aborts the window instead of counting. Set well
 *  above the slowest frame a struggling-but-playing device produces (a 3 fps
 *  device is at ~350ms) so real misery is measured rather than discarded. */
const STALL_FRAME_MS = 1000
/** Play discarded after monitoring starts, so JIT warm-up, first texture
 *  uploads and the match intro do not decide the tier. */
const WARMUP_MS = 1500

// ─── State ──────────────────────────────────────────────────────────────────

const readPreference = (): QualityPreference => {
  try {
    const raw = localStorage.getItem(QUALITY_PREF_KEY)
    if (raw === 'auto' || raw === 'high' || raw === 'low') return raw
  } catch { /* private mode / storage disabled */
  }
  return 'auto'
}

const readVerdict = (): QualityTier => {
  try {
    return localStorage.getItem(QUALITY_VERDICT_KEY) === 'low' ? 'low' : 'high'
  } catch { /* private mode / storage disabled */
  }
  return 'high'
}

/** `?quality=low|high|auto` forces the tier for one page load WITHOUT writing
 *  it to storage. QA needs to see the low tier on a machine that would never
 *  auto-downgrade into it, and the perf harness needs to A/B the two tiers on
 *  one build — but neither may leave a sticky preference behind on the
 *  device afterwards. */
const readUrlOverride = (): QualityPreference | null => {
  try {
    const q = new URLSearchParams(location.search).get('quality')
    if (q === 'auto' || q === 'high' || q === 'low') return q
  } catch { /* no location (SSR / worker) */
  }
  return null
}

const urlOverride = readUrlOverride()

export const qualityPreference: Ref<QualityPreference> = ref(urlOverride ?? readPreference())

/** What auto-detection last concluded on THIS device. Seeded from the previous
 *  session so a known-slow phone starts on the cheap path instead of playing
 *  the first ~6 seconds badly before the detector catches up. */
const autoVerdict: Ref<QualityTier> = ref(readVerdict())

export const qualityTier: ComputedRef<QualityTier> = computed(() =>
  qualityPreference.value === 'auto' ? autoVerdict.value : qualityPreference.value
)

export const isLowQuality: ComputedRef<boolean> = computed(() => qualityTier.value === 'low')

/**
 * Plain-object mirror of the tier for the render hot path.
 *
 * The draw code consults this many times per frame; reading a Vue ref there
 * would pay proxy + dependency-tracking cost on every access, inside the exact
 * loop we are trying to make cheaper. Kept in sync by the watcher below.
 */
export const FX = { low: qualityTier.value === 'low' }

watch(qualityTier, (tier) => {
  FX.low = tier === 'low'
}, { immediate: true })

export const setQualityPreference = (pref: QualityPreference) => {
  qualityPreference.value = pref
  try {
    localStorage.setItem(QUALITY_PREF_KEY, pref)
  } catch { /* private mode / storage disabled */
  }
  // Switching back to auto re-opens the question rather than inheriting the
  // stale verdict from whenever detection last ran.
  if (pref === 'auto') resetQualitySampling()
}

// ─── Detection ──────────────────────────────────────────────────────────────

let monitoring = false
let warmupLeft = WARMUP_MS
let frameCount = 0
let windowMs = 0
let badWindows = 0
let goodWindows = 0
let downgradesThisSession = 0
let lastFrameAt = 0

/** Most recent measured window, exposed for the debug HUD / QA. */
export const lastMeasuredFps: Ref<number> = ref(0)

const resetWindow = () => {
  frameCount = 0
  windowMs = 0
}

export const resetQualitySampling = () => {
  warmupLeft = WARMUP_MS
  badWindows = 0
  goodWindows = 0
  lastFrameAt = 0
  resetWindow()
}

/**
 * Enable or disable sampling. Only frames drawn during actual gameplay should
 * decide the tier — menu, reward and shop screens have a completely different
 * (much cheaper) frame cost and would wash out the measurement.
 */
export const setQualityMonitoring = (active: boolean) => {
  if (monitoring === active) return
  monitoring = active
  if (active) resetQualitySampling()
}

const applyVerdict = (tier: QualityTier) => {
  if (autoVerdict.value === tier) return
  autoVerdict.value = tier
  try {
    localStorage.setItem(QUALITY_VERDICT_KEY, tier)
  } catch { /* private mode / storage disabled */
  }
}

/**
 * Called once per painted frame from the arena's render loop. Zero-allocation
 * and branch-cheap: it runs inside the loop it is measuring.
 */
export const noteRenderFrame = (now: number) => {
  if (!monitoring) return
  const prev = lastFrameAt
  lastFrameAt = now
  if (prev === 0) return

  const dt = now - prev
  // A stall is not a frame rate. Drop the partial window rather than let one
  // 800ms gap read as 1 fps and demote the device.
  if (dt > STALL_FRAME_MS) {
    resetWindow()
    return
  }
  if (warmupLeft > 0) {
    warmupLeft -= dt
    return
  }

  windowMs += dt
  frameCount++
  if (windowMs < WINDOW_MS || frameCount < MIN_WINDOW_FRAMES) return

  const fps = 1000 / (windowMs / frameCount)
  lastMeasuredFps.value = Math.round(fps)
  resetWindow()

  // Only the auto path moves the tier; an explicit player choice is final.
  if (qualityPreference.value !== 'auto') return

  if (autoVerdict.value === 'high') {
    goodWindows = 0
    badWindows = fps < LOW_FPS ? badWindows + 1 : 0
    if (badWindows >= BAD_WINDOWS_TO_DOWNGRADE) {
      badWindows = 0
      downgradesThisSession++
      applyVerdict('low')
    }
    return
  }

  // Already low: only climb back out if the device is comfortably fast AND we
  // have not already bounced between tiers twice this session.
  badWindows = 0
  if (downgradesThisSession >= MAX_DOWNGRADES_PER_SESSION) return
  goodWindows = fps > RECOVER_FPS ? goodWindows + 1 : 0
  if (goodWindows >= GOOD_WINDOWS_TO_UPGRADE) {
    goodWindows = 0
    applyVerdict('high')
  }
}

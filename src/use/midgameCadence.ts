// ─── Midgame interstitial cadence ───────────────────────────────────────────
//
// Midgame interstitials fire BEFORE the next battle's meteor-shower intro
// (see `beginBattle` in SpinnerArena.vue), never between a battle and its
// result screen. `battlesSinceAd` counts completed battle attempts since the
// last ad break; the reward-continue / surrender handlers bump it.
//
// First-ad fast-path: a fresh user starts at 1, so after their first battle
// the counter hits 2 and the first interstitial fires before battle 2. After
// that the threshold is 3 (every 3 battles, ghost or campaign).
//
// A COMPLETED rewarded ad is an ad break too. `useAds.showRewardedAd()` — the
// one seam every rewarded placement goes through — calls
// `noteRewardedAdCompleted()` when (and only when) the reward was earned, so a
// player who just watched a full video never gets an interstitial slammed in
// front of the very next battle. A skipped, declined, throttled or unfilled
// rewarded ad played nothing and leaves the cadence alone. This only ever
// LOWERS the interstitial rate: CrazyGames rate-limits midgame ads itself
// (`adCooldown`), so skipping one request is within its rules. POKI builds
// are the exception: Poki wants a `commercialBreak` request at every natural
// break and lets its SDK decide, so there a rewarded ad leaves the cadence
// untouched. For a new player a completed rewarded ad also CONSUMES the
// first-interstitial fast-path (it was their first ad break), so the next
// interstitial waits the regular 3 battles (Poki excepted). The interstitial
// still only ever fires before a battle, never before a result screen.
//
// Shared module state (not per-component) so the rewarded seam and the view
// use one counter. Every read goes to storage — NOT a value cached at module
// load: `useAds` (and so this module) is imported by `main.ts` BEFORE the
// SaveManager hydrates, and `ca_*` keys are cloud payload, so a load-time
// snapshot would read the pre-hydration default. The in-memory values only
// back up a storage that throws.

export const AD_BATTLES_KEY = 'ca_battles_since_ad'
export const AD_FIRST_KEY = 'ca_first_midgame_ad_shown'

let memBattles = 1
let memFirst = false

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const store = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (null shim, private mode) — in-memory only.
  }
}

/** Battle attempts since the last ad break (fresh player: 1). */
export const battlesSinceAd = (): number => {
  const raw = read(AD_BATTLES_KEY)
  if (raw === null) return memBattles
  return parseInt(raw, 10) || 0
}

/** Has the first-ever interstitial (the fast-path at 2) been consumed? */
export const firstMidgameAdShown = (): boolean => {
  const raw = read(AD_FIRST_KEY)
  return raw === null ? memFirst : raw === '1'
}

const setBattles = (n: number): void => {
  memBattles = n
  store(AD_BATTLES_KEY, String(n))
}

export const resetAdCounter = (): void => setBattles(0)

export const incrementAdCounter = (): void => setBattles(battlesSinceAd() + 1)

export const markFirstMidgameAdShown = (): void => {
  memFirst = true
  store(AD_FIRST_KEY, '1')
}

/** Threshold: 2 before the first interstitial ever, 3 after. */
export const midgameAdThreshold = (): number => (firstMidgameAdShown() ? 3 : 2)

/** Is an interstitial due before the next battle? (Readiness is the caller's.) */
export const isMidgameAdDue = (): boolean => battlesSinceAd() >= midgameAdThreshold()

/** A rewarded ad played to completion (reward earned) — count it as the ad
 *  break, so the between-battles interstitial starts counting from zero. */
export const noteRewardedAdCompleted = (): void => {
  // POKI excluded: Poki asks for a `commercialBreak` at every natural break
  // and its SDK decides whether one really plays (it runs its own frequency
  // cap, rewarded breaks included). Resetting here would silently drop
  // requests Poki wants to see, so the cadence carries on untouched. Build-
  // time literal (not a runtime flag) so every other build folds this away.
  if (import.meta.env.VITE_APP_POKI === 'true') return
  resetAdCounter()
  // A new player's first ad break was this rewarded video: it satisfies the
  // early first-interstitial slot (the fast-path before battle 2), so the
  // regular every-3 cadence applies from here on.
  markFirstMidgameAdShown()
}

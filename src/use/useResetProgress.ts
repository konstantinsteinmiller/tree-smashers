// ─── Full-progress reset ────────────────────────────────────────────────────
//
// Several players asked for a way to start over from stage 1 — usually
// because they feel they mis-spent coins on the wrong upgrades and want a
// clean slate. This wipes every gameplay-progress key the game persists
// (campaign stage, coins, diamonds, upgrade unlocks, daily challenge, daily
// login rewards, battle pass, leaderboard, PvP stats, chest timers, tips,
// counters, …) while PRESERVING:
//   • settings — sound / music volume, language, difficulty, quality
//   • purchases — owned blade skins + owned background skins, and the
//     equipped loadout / selections tied to them
//
// It is a KEEP-LIST sweep over the persisted keys rather than an explicit
// delete-list: any future progress key is wiped automatically without
// having to be registered here, and only the small, stable set of
// settings/purchase keys below is protected. This mirrors keys.ts's stance
// that these literal strings are a load-bearing contract with the player.
//
// ── Two things this used to get wrong ──────────────────────────────────────
//
// 1. It enumerated `localStorage.length` / `localStorage.key(i)`. Those are
//    pass-through on the SaveManager's storage Proxy, so on a CLOUD-ONLY
//    build (`persistToRaw: false` — CrazyGames) they walk a raw store that
//    BlobStorage deliberately scrubbed at construction. The walk found zero
//    keys, removed nothing, and so never called the patched `removeItem`
//    that forwards deletions to the strategy: the cloud blob kept the whole
//    save and the next hydrate restored it. `SaveManager.savedKeys()` is
//    the enumeration that sees the in-memory payload, and we union it with
//    the raw walk so mirrored builds (and a manager-less boot) still work.
//
// 2. It finished with `window.location.reload()` to get the composables to
//    re-read their keys. A reload on a portal build is a full SDK re-init
//    (and on CG a second cloud hydrate that races the flush we just
//    issued). Instead we bump `saveDataVersion` — the same signal a
//    successful cloud re-hydrate raises — and every composable that holds
//    localStorage-backed refs re-reads in place, so the wipe is visible on
//    the menu the instant the dialog closes.
//
// Removals go through the SaveManager-patched `localStorage.removeItem`, so
// on cloud-save builds (CrazyGames / Playgama) each deletion is forwarded to
// the strategy and mirrored into the cloud blob. We flush afterwards so the
// deletions leave the device rather than sitting in the strategy's debounce.

import { refreshSaveBackedState } from '@/use/useSaveStatus'
import { requestStageReinit } from '@/use/useSpinnerCampaign'
import { requestIntroReplay } from '@/use/useIntroCutscene'
import { INTRO_SEEN_KEY } from '@/use/introGate'
import { DAILY_SPEED_GIFT_KEY, SPEED_GIFT_KEY } from '@/use/speedGiftGate'

/** Keys that must SURVIVE a progress reset (settings + purchased content). */
const KEEP_KEYS = new Set<string>([
  // Settings
  'spinner_user_sound_volume',
  'spinner_user_music_volume',
  'spinner_user_language',
  'spinner_user_difficulty',
  // Purchased content + equipped loadout / selections
  'spinner_owned_skins',
  'spinner_selected_skins',
  'spinner_skin_picker_opened',
  'spinner_skin_ad_progress',
  'spinner_player_team',
  'spinner_bg_skins_owned',
  'spinner_bg_skin_selected',
  // Anti-farm gates, not progress. Same rationale as
  // `useRewardedThrottle`'s `__save_internal__` key: a player must not be
  // able to buy back a rewarded-ad cooldown by resetting, and the reset is
  // now instant (no reload), which would make that a one-tap loop.
  'spinner_ad_button_ready_at',
  // The first-time free 2x gift (see speedGiftGate.ts): a reset must not
  // hand out a second ad-free boost. Same for today's daily free boost.
  SPEED_GIFT_KEY,
  DAILY_SPEED_GIFT_KEY
])

/**
 * Payload prefixes the sweep owns. Deliberately NOT `SaveMergePolicy`'s
 * full list: `ca_*` is ad pacing (`ca_battles_since_ad`,
 * `ca_first_midgame_ad_shown`), which is a portal-facing frequency cap
 * rather than player progress and must not be re-armed by a reset.
 */
const RESET_PREFIX = 'spinner_'

/**
 * Every key the reset should delete — the union of what the SaveManager
 * holds in memory (the only surface that has anything on a cloud-only
 * build) and what is sitting in raw localStorage (mirrored builds, plus
 * the case where no manager was installed at all).
 */
const collectProgressKeys = (): string[] => {
  const found = new Set<string>()

  const sm = (window as unknown as {
    __saveManager?: { savedKeys?: () => string[] }
  }).__saveManager
  try {
    for (const key of sm?.savedKeys?.() ?? []) found.add(key)
  } catch (e) {
    console.warn('[reset] savedKeys() threw', e)
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) found.add(key)
  }

  return [...found].filter(k => k.startsWith(RESET_PREFIX) && !KEEP_KEYS.has(k))
}

/**
 * Wipe all gameplay progress. Preserves settings + purchases (see
 * KEEP_KEYS). Takes effect immediately — no reload — and resolves once the
 * cloud flush has been attempted.
 */
export const resetAllProgress = async (): Promise<void> => {
  try {
    // Collected first, then removed, so mutating the store mid-iteration
    // can't skip keys (removeItem shifts the raw index order).
    for (const key of collectProgressKeys()) localStorage.removeItem(key)
    // The first-launch intro's seen-flag is a `spinner_` key, so the sweep
    // above already took it — named here so that contract is explicit and a
    // future KEEP-list edit cannot quietly strand it.
    localStorage.removeItem(INTRO_SEEN_KEY)

    // Re-read BEFORE the awaited flush: the player sees stage 1 / 0 coins /
    // no upgrades the moment the dialog closes, rather than after a cloud
    // round-trip they have no reason to wait on.
    refreshSaveBackedState()
    requestStageReinit()

    // Push the deletions to the cloud blob (no-op on local-only builds).
    // Best-effort — a failed/slow flush must not surface as a failed reset,
    // the local wipe has already happened.
    const sm = (window as unknown as { __saveManager?: { flush?: () => Promise<void> } }).__saveManager
    await sm?.flush?.().catch(() => {
    })

    // A reset is "start over" — exactly what the intro stages. Replay it now
    // (the reset no longer reloads the page, so "next launch" could be never).
    // After the flush, so it starts as the confirm dialog closes rather than
    // underneath it.
    requestIntroReplay()
  } catch (e) {
    console.warn('[reset] progress reset failed', e)
  }
}

export default resetAllProgress

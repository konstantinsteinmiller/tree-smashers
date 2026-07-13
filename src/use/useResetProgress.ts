// ─── Full-progress reset ────────────────────────────────────────────────────
//
// Several players asked for a way to start over from stage 1 — usually
// because they feel they mis-spent coins on the wrong upgrades and want a
// clean slate. This wipes every gameplay-progress key the game persists
// (campaign stage, coins, diamonds, upgrade unlocks, daily challenge, battle
// pass, leaderboard, PvP stats, chest timers, tips, counters, …) while
// PRESERVING:
//   • settings — sound / music volume, language, difficulty
//   • purchases — owned blade skins + owned background skins, and the
//     equipped loadout / selections tied to them
//
// It is a KEEP-LIST sweep over the `spinner_`-prefixed keys rather than an
// explicit delete-list: any future progress key is wiped automatically
// without having to be registered here, and only the small, stable set of
// settings/purchase keys below is protected. This mirrors keys.ts's stance
// that these literal strings are a load-bearing contract with the player.
//
// Removals go through the SaveManager-patched `localStorage.removeItem`, so
// on cloud-save builds (CrazyGames / Playgama) each deletion is forwarded to
// the strategy and mirrored into the cloud blob. We await a flush before
// reloading so the next boot's hydrate can't resurrect the deleted keys from
// the cloud. The reload lets every composable re-read fresh defaults from
// localStorage instead of us having to reset each in-memory ref by hand.

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
  'spinner_player_team',
  'spinner_bg_skins_owned',
  'spinner_bg_skin_selected'
])

/**
 * Wipe all gameplay progress and reload. Preserves settings + purchases
 * (see KEEP_KEYS). Resolves right before the reload is triggered; callers
 * generally don't need to await it, but doing so guarantees the cloud flush
 * has been requested before navigation.
 */
export const resetAllProgress = async (): Promise<void> => {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith('spinner_') && !KEEP_KEYS.has(key)) toRemove.push(key)
    }
    // Collected first, then removed, so mutating the store mid-iteration
    // can't skip keys (removeItem shifts the index order).
    for (const key of toRemove) localStorage.removeItem(key)

    // Push the deletions to the cloud blob before reloading (no-op on
    // local-only builds). Best-effort — a failed/slow flush must not block
    // the reset, so we don't let it throw past here.
    const sm = (window as unknown as { __saveManager?: { flush?: () => Promise<void> } }).__saveManager
    if (sm?.flush) {
      await sm.flush().catch(() => {
      })
    }
  } catch (e) {
    console.warn('[reset] progress reset failed', e)
  } finally {
    window.location.reload()
  }
}

export default resetAllProgress

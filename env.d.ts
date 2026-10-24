/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' enables the skill system (opt-in; rollout CrazyGames first). */
  readonly VITE_APP_FEATURE_SKILLS?: string
  readonly VITE_APP_FEATURE_BOSSES100?: string
  /** 'true' enables the league / simulated PvP (opt-in; read only by src/league/leagueGate.ts). */
  readonly VITE_APP_FEATURE_LEAGUE?: string
  /** Campaign stage that unlocks the league (positive integer, default 13; dev 1). */
  readonly VITE_APP_LEAGUE_UNLOCK_STAGE?: string
  /** 'true' on child-directed builds (Tauri, GameDistribution): league offline-only. */
  readonly VITE_APP_KIDS?: string
  /** #UX100: 'false' turns the active-playtime interstitial pacing off (battle-count cadence instead). */
  readonly VITE_APP_PLAYTIME_INTERSTITIALS?: string
  /** #UX100: 'false' turns the 20-tap coin-badge interstitial chord off. */
  readonly VITE_APP_COIN_CHORD_INTERSTITIAL?: string
  /** #UX3: 'false' keeps the HP gauge on smashers instead of the balloons (owner's spelling). */
  readonly VITE_APP_BALOON_HP_BAR?: string
  readonly VITE_LEADERBOARD_URL?: string
  /** Wavedash build only: name of the Wavedash leaderboard the score is mirrored
   *  to (src/platforms/wavedash/wavedashLeaderboard.ts). Empty = off. */
  readonly VITE_WAVEDASH_LEADERBOARD_NAME?: string
}

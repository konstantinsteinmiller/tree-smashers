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
  readonly VITE_LEADERBOARD_URL?: string
}

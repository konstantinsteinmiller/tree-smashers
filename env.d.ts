/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' enables the skill system (opt-in; rollout CrazyGames first). */
  readonly VITE_APP_FEATURE_SKILLS?: string
  readonly VITE_APP_FEATURE_BOSSES100?: string
}

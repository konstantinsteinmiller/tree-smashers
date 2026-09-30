// ─── playgamaPlugin no-op stub (non-Playgama builds only) ───────────────────
//
// Replaces `@/utils/playgamaPlugin` on every build without
// `VITE_APP_PLAYGAMA=true` via `resolve.alias` in `vite.config.ts` — the same
// mechanism, and the same reason, as `pokiPlugin.stub.ts`.
//
// WHY THIS EXISTS: `App.vue` and `useGameplayLifecycle.ts` STATICALLY import
// the plugin (their calls sit behind env-literal `if`s, and a dynamic `'@/…'`
// literal in an obfuscated file would be at the mercy of the `stringArray`
// rewrite). The calls fold away, but the module does not: an obfuscated module
// can never be tree-shaken (its string-array bootstrap is a top-level side
// effect). So every non-Playgama build shipped ~5 KB of dead Bridge wrapper —
// its message names in the string array, and in a shared chunk Rollup named
// after it (`playgamaPlugin-*.js` on CrazyGames, `pokiPlugin.stub-*.js` before
// that), mislabelling crash reports for the sound / asset / i18n code in it.
//
// Must match the real module's FULL export surface — every name imported
// anywhere (a missing one fails the build, not the player). Values mirror the
// real module's idle defaults: never muted, never paused, never active.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Bridge } from '@/utils/playgamaBridgeLoader'

type MusicControls = { pauseMusic: () => void; continueMusic: () => void }

export const isPlaygamaSdkActive: Ref<boolean> = ref(false)
export const isPlaygamaAdsBlocked: Ref<boolean> = ref(false)
export const isPlaygamaAdShowing: Ref<boolean> = ref(false)
export const playgamaLocale: Ref<string | null> = ref(null)
export const playgamaDetectedId: Ref<string | null> = ref(null)
export const isPlaygamaAudioEnabled: Ref<boolean> = ref(true)
export const isPlaygamaPaused: Ref<boolean> = ref(false)

export const getPlaygamaBridge = (): Bridge | null => null
export const normalizePlaygamaLanguage = (_raw: string): string | null => null
export const playgamaLocaleReady: Promise<void> = Promise.resolve()
export const registerPlaygamaMusicControls = (_controls: MusicControls): void => {
}
export const playgamaPlugin = (): Promise<void> => Promise.resolve()
export const playgamaLoadingStart = (): void => {
}
export const playgamaGameLoadingStop = (): void => {
}
export const playgamaGameplayStart = (): void => {
}
export const playgamaGameplayStop = (): void => {
}
export const playgamaSetLoadingProgress = (_percent: number): void => {
}
export const showInterstitialPG = (): Promise<void> => Promise.resolve()
export const showRewardedPG = (): Promise<boolean> => Promise.resolve(false)

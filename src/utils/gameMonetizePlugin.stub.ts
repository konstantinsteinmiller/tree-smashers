// ─── gameMonetizePlugin no-op stub (non-GameMonetize builds only) ───────────
//
// Replaces `@/utils/gameMonetizePlugin` on every other build via
// `resolve.alias` in `vite.config.ts`. Same mechanism and the same reason as
// `pokiPlugin.stub.ts`: `GameMonetizeProvider` and `App.vue` import the real
// module statically, it hardcodes the SDK URL, and the obfuscator's
// `stringArray` pass hoists string literals before the env comparison folds —
// so without the swap another ad network's host would sit in every bundle,
// including the Poki build, which may carry no ad SDK but its own.
//
// Must match the real module's full export surface. No GameMonetize URL
// literal anywhere in this file.

import { ref } from 'vue'
import type { Ref } from 'vue'

export const isGmSdkActive: Ref<boolean> = ref(false)
export const isGmAdShowing: Ref<boolean> = ref(false)
export const isGmAdsBlocked: Ref<boolean> = ref(false)

export const gameMonetizePlugin = async (): Promise<void> => {
}
export const showRewardedAdGM = async (): Promise<boolean> => false
export const showMidgameAdGM = async (): Promise<void> => {
}

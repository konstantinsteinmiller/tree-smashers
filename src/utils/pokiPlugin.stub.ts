// ─── pokiPlugin no-op stub (non-Poki builds only) ───────────────────────────
//
// Replaces `@/utils/pokiPlugin` on non-Poki builds via `resolve.alias` in
// `vite.config.ts`. Same mechanism, and the same reason, as
// `gamepixPlugin.stub.ts`.
//
// WHY THIS EXISTS: `useGameplayLifecycle.ts` and `App.vue` STATICALLY import
// `pokiGameplayStart` / `pokiGameplayStop` (a static import is the right call
// there — that file is not in the obfuscator's exclude list, and a dynamic
// `'@/…'` literal would be at the mercy of the `stringArray` rewrite). But the
// real module hardcodes the PokiSDK URL
// (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js`), and an env-literal `if`
// is NOT enough to keep it out of other bundles: the obfuscator's `stringArray`
// pass hoists string literals into its indirection table BEFORE esbuild folds
// `import.meta.env.VITE_APP_POKI === 'true'` to `false`, so the URL survives
// dead-code elimination. Confirmed empirically — `game-cdn.poki.com` turned up
// in the CrazyGames entry chunk before this stub existed. That is exactly the
// class of string Yandex's moderator rejects as "Service storage URL detected".
//
// Aliasing keeps the URL out of the bundle AND leaves a valid module for the
// static importers to resolve — no chunk deletion, no dangling reference, no
// 404 (the failure mode that broke GameScene when chunk-stripping was tried).
//
// Must match the real module's FULL export surface — every name imported
// anywhere, including the `platforms/poki` barrel re-exports. No Poki URL
// literal anywhere in this file.

import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'

export type PokiDeviceCategory = 'desktop' | 'mobile' | 'tablet'
export type PokiRewardedSize = 'small' | 'medium' | 'large'

export const isPokiSdkActive: Ref<boolean> = ref(false)
export const isPokiAdsBlocked: ComputedRef<boolean> = computed(() => false)
export const pokiLocale: Ref<string | null> = ref(null)
export const pokiDeviceCategory: Ref<PokiDeviceCategory | null> = ref(null)
export const isPokiAdShowing: Ref<boolean> = ref(false)

export const pokiPlugin = async (): Promise<void> => {
}
export const readPokiLanguage = (): string | null => null
export const pokiGameLoadingFinished = (): void => {
}
export const pokiGameplayStart = (): void => {
}
export const pokiGameplayStop = (): void => {
}
export const pokiNoteUserInteraction = (): void => {
}
export const pokiHasUserInteracted = (): boolean => false
export const __resetPokiGameplayBracketForTests = (): void => {
}

export const showMidgameAdPoki = async (_onImpression?: () => void): Promise<void> => {
}
export const showRewardedAdPoki = async (
  _size?: PokiRewardedSize,
  _onImpression?: () => void
): Promise<boolean> => false

export const syncPokiAdVolume = (_volume: number): void => {
}
export const pokiMeasure = (_category: string, _what: string, _action: string): void => {
}
export const pokiCaptureError = (_err: unknown): void => {
}
export const pokiMovePill = (_topPercent: number, _topPx: number): void => {
}

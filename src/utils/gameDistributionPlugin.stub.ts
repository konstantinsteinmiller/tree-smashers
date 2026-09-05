// ─── gameDistributionPlugin no-op stub (Poki builds only) ───────────────────
//
// Aliased over `@/utils/gameDistributionPlugin` by `vite.config.ts` when
// `VITE_APP_POKI === 'true'`, and on no other build.
//
// WHY, and why only Poki: the GD plugin is reached exclusively through
// `await import('@/utils/gameDistributionPlugin')` inside
// `import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'` branches, so it is
// dead code everywhere else — but Rollup still emits the chunk, because the
// syntactic dynamic import survives the dead branch. That chunk carries
// `https://html5.api.gamedistribution.com/main.min.js`.
//
// A never-fetched 5.6 KB chunk is harmless on most portals. On Poki it is a
// stated violation: "No third-party ads. Only the PokiSDK may serve
// advertising. Strip every other ad SDK from the Poki build." A competitor's
// ad-SDK host string sitting in the shipped bundle is exactly what a reviewer
// greps for, and it is not worth arguing that the code path is unreachable.
//
// Scoped to Poki deliberately rather than to "every non-GD build": the wider
// change would alter the GD-adjacent code path on six other targets to fix a
// problem only Poki has. If another portal ever adds the same rule, widen the
// condition rather than reaching for a different mechanism.
//
// Must mirror every export the dynamic-import call sites destructure:
// `resolveSaveStrategy` takes `createGameDistributionSaveStrategy`, `main.ts`
// takes `gameDistributionPlugin`, and `GameDistributionProvider` reaches for
// `gameDistributionPlugin`, `showRewardedAdGD`, `showMidgameAdGD`,
// `isGdSdkActive` and `isGdAdsBlocked`. No GD URL literal anywhere in here.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SaveStrategy } from '@/utils/save/types'

export const isGdSdkActive: Ref<boolean> = ref(false)
export const isGdAdsBlocked: Ref<boolean> = ref(false)

export const gameDistributionPlugin = (): void => {
}
export const createGameDistributionSaveStrategy = (): SaveStrategy | null => null
export const showRewardedAdGD = async (): Promise<boolean> => false
export const showMidgameAdGD = async (): Promise<void> => {
}
export const preloadRewardedGD = (): void => {
}
export const gdDebug = ref<Record<string, unknown>>({})

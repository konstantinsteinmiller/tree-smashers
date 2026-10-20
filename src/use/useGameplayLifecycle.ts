// ─── Gameplay-bracket fan-out ───────────────────────────────────────────────
//
// One place that answers "is the player actually playing right now?" for every
// portal that wants to know. Before this existed, `SpinnerArena.vue` watched
// `isGameplayActive` and called `startGameplay()` / `stopGameplay()` imported
// straight from `@/use/useCrazyGames` — so CrazyGames got the signal and nobody
// else did, including Playgama, whose `playgamaGameplayStart/Stop` were written
// and then never called.
//
// Adding a portal is now one arm here rather than an edit in the arena view and
// in six modal components.
//
// ─── Why this file is not allowed to grow a Poki-shaped condition ───────────
//
// Poki forbids a `gameplayStart()` that no player asked for: the bracket may
// only open off a real interaction, and tree-smashers boots straight into a live
// battle, so `isGameplayActive` goes true during mount. The fix for that lives
// INSIDE `pokiPlugin` (it holds the start behind a trusted-gesture gate and
// releases it on the first real pointer/key event), not here — because this
// fan-out is shared with portals that have no such rule and would be made wrong
// by it.
//
// So: feed this the honest gameplay edge and let each plugin decide what its
// platform is allowed to hear.
//
// The Poki import is STATIC on purpose. A dynamic `import('@/…')` in a file that
// is not on the obfuscator's exclude list gets its specifier mangled by the
// `stringArray` transform and fails to resolve at runtime (we have lost hours to
// exactly that). The `resolve.alias` stub swap in `vite.config.ts` is what keeps
// the real module — and the PokiSDK URL inside it — out of every other build.

// Both portal imports are STATIC for the same reason. A dynamic `import('@/…')`
// here would have its specifier mangled by the obfuscator's `stringArray` pass
// (this file is not on the exclude list) and fail to resolve at runtime.
// `playgamaPlugin` is already statically imported by `App.vue`, so it adds
// nothing new to any graph; `pokiPlugin` is kept out of other builds by the
// `resolve.alias` stub swap in `vite.config.ts`.
import { startGameplay as startCrazyGameplay, stopGameplay as stopCrazyGameplay } from '@/use/useCrazyGames'
import { playgamaGameplayStart, playgamaGameplayStop } from '@/utils/playgamaPlugin'
import { pokiGameplayStart, pokiGameplayStop } from '@/utils/pokiPlugin'

/**
 * Publish the current gameplay state to every active portal.
 *
 * Safe to call on every change of a reactive computed: each arm is idempotent,
 * and the Poki arm is additionally rate-guarded against the SDK's bad-event
 * counter (a `gameplayStart` within 50 ms of a `gameplayStop` is penalised, and
 * ten of those silently disable ads for the session).
 */
export const syncGameplayLifecycle = (live: boolean): void => {
  if (live) startCrazyGameplay()
  else stopCrazyGameplay()

  // Playgama's Bridge takes the same bracket as `gameplay_started` /
  // `gameplay_stopped` platform messages. Both wrappers no-op when the SDK is
  // inactive, so the env gate is about bundle size, not correctness.
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
    if (live) playgamaGameplayStart()
    else playgamaGameplayStop()
  }

  if (import.meta.env.VITE_APP_POKI === 'true') {
    if (live) pokiGameplayStart()
    else pokiGameplayStop()
  }
}

/**
 * Defensive close, for teardown paths that are not a state transition — e.g.
 * the arena unmounting mid-battle because the player navigated away.
 */
export const stopGameplayLifecycle = (): void => syncGameplayLifecycle(false)

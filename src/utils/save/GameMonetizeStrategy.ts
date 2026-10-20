import type { HydrateState, LocalStorageAccessor, SaveStrategy } from './types'

// ─── GameMonetize save strategy ─────────────────────────────────────────────
//
// GameMonetize's HTML5 SDK is purely an advertising SDK: it has no cloud-save
// or player-data API. Saves are therefore local-only — the state lives in the
// browser's localStorage and follows the device, not an account.
//
// Its own class rather than `LocalStorageStrategy` for the same reason as
// `PokiStrategy`: `SaveManager.strategyName` reports `gamemonetize`, so the
// right strategy can be confirmed from the browser console, and if the SDK
// ever grows a save API this is the single seam.
//
// `hydrateState` is hardcoded `success-with-data`: there is no remote that
// could be in a failed state, so SaveManager's flush guard never engages and
// no background retries are scheduled.

export class GameMonetizeStrategy implements SaveStrategy {
  readonly name = 'gamemonetize'
  readonly hydrateState: HydrateState = 'success-with-data'

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // noop — the browser already populated localStorage.
  }

  onLocalSet(_key: string, _value: string): void {
    // noop — no remote backend.
  }

  onLocalRemove(_key: string): void {
    // noop — no remote backend.
  }
}

// ─── Game pause gate ───────────────────────────────────────────────────────
//
// Playgama certification: "The game continues running when a system overlay is
// opened. Subscribe to the SDK pause event and stop the game loop."
//
// This module is deliberately TINY and dependency-free. `App.vue` needs to
// publish the platform pause signal, and `useSpinnerGame.ts` (~5k lines, and
// the bulk of the lazily-loaded SpinnerArena chunk) needs to consume it. If
// App.vue imported the setter straight from `useSpinnerGame`, Rollup would
// hoist that whole module into the eager App chunk and the game would stop
// being lazily loaded. A shared leaf module keeps both sides cheap.
//
// The signal is platform-agnostic on purpose — any portal's pause event, plus
// the ad overlays, can feed it.

import { ref } from 'vue'

/** True while the platform has the game suspended (overlay, ad, tab hidden). */
export const isGamePaused = ref(false)

/**
 * Loops register a callback that re-evaluates whether they should be running.
 * Returns an unregister function — call it when the owning view unmounts.
 */
const syncers = new Set<() => void>()

export const registerPauseSyncer = (sync: () => void): (() => void) => {
  syncers.add(sync)
  return () => {
    syncers.delete(sync)
  }
}

// Two independent inputs. The platform's pause is one boolean owned by whoever
// relays the portal signal (`App.vue`); a hold is a named, game-side reason to
// stay paused (the forced-dark-mode notice). They are tracked apart so a
// platform RESUME can never release a hold, and releasing a hold can never
// resume a game the platform still has suspended.
let platformPaused = false
const holds = new Set<string>()

const publish = (): void => {
  const paused = platformPaused || holds.size > 0
  if (paused === isGamePaused.value) return
  isGamePaused.value = paused
  for (const sync of [...syncers]) {
    try {
      sync()
    } catch (e) {
      console.warn('[pause] syncer threw — dropping it', e)
      syncers.delete(sync)
    }
  }
}

/**
 * Suspend / resume every registered loop. Idempotent, so overlapping pause
 * sources (platform pause + visibility change arriving together) can't fight.
 */
export const setGamePaused = (paused: boolean): void => {
  platformPaused = paused
  publish()
}

/** Hold the game paused for `source` until it lets go. Idempotent per source. */
export const setPauseHold = (source: string, held: boolean): void => {
  if (held) holds.add(source)
  else holds.delete(source)
  publish()
}

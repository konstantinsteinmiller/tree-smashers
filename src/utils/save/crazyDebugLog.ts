// ─── CrazyGames QA-verification debug logging ─────────────────────────────
//
// TEMPORARY instrumentation added to verify with the CrazyGames QA team
// that the game actually goes through `sdk.data.*` (and not the
// LocalStorageStrategy fallback) on the live portal.
//
// Every log line carries the `[cg-debug]` prefix so QA can filter the
// DevTools console with that single string.
//
// HOW TO REMOVE WHEN QA IS HAPPY:
//   1. Delete this file.
//   2. Run `git grep "cgDebug"` and remove the import + every call site.
//   3. Run `git grep "\[cg-debug\]"` to catch any stragglers (string-only
//      log lines that don't go through `cgDebug()`).
//   4. `pnpm type-check` will surface anything missed.
//
// Logs are gated on `isCrazyWeb` so non-CrazyGames builds stay silent.
// (No reason to spam the console on Glitch / Wavedash / itch.)

import { isCrazyWeb } from '@/use/useUser'

const PREFIX = '[cg-debug]'

/** QA-only console log. No-op on non-crazy builds so we don't pollute
 *  other platforms' DevTools. */
export const cgDebug = (...args: unknown[]): void => {
  if (!isCrazyWeb) return
  // eslint-disable-next-line no-console
  console.info(PREFIX, ...args)
}

/** Same as cgDebug but at warn level — for unexpected-but-recoverable
 *  states (e.g. SDK absent on a build that expected it). */
export const cgDebugWarn = (...args: unknown[]): void => {
  if (!isCrazyWeb) return
  console.warn(PREFIX, ...args)
}

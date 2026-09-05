// ─── Boot diagnostics ───────────────────────────────────────────────────────
//
// Portal QA reports arrive as a screenshot of the console and a sentence like
// "the game does not start". Everything below exists so that screenshot is
// enough to answer "which build, in what environment, and how far did it get?"
// without a round-trip.
//
// The specific failure that motivated this: the 2026-09 YouTube Playables
// submission rendered a black screen while every MUST/SHOULD check in the test
// suite passed and the console was completely clean. The cause was a router
// location that matched nothing (Playables appends `#debug&origin=…` to the
// game URL, and a hash history reads that fragment as the route path) —
// vue-router's "No match found" warning is compiled out of production builds,
// so there was literally nothing to see. `snapshotBootState()` reports the
// resolved route, so that class of failure can never be invisible again.
//
// Rules this module lives by:
//   • NO platform-SDK imports. It is reachable from every build's entry graph,
//     so a single `import '@/utils/<x>Plugin'` here would drag that portal's
//     SDK into every other portal's bundle (see the note at the top of
//     `src/platforms/index.ts`). Platform-specific values are read
//     defensively off `window`, published by whichever plugin is actually
//     running.
//   • Everything is wrapped in try/catch. A diagnostic that throws during boot
//     would cause the very outage it is meant to explain.

import type { Router } from 'vue-router'
import { version } from '@/use/useUser'

/** Platform id the Playgama Bridge auto-detected (`youtube`, `playgama`, …).
 *  Published by `playgamaPlugin` on a Playgama build; absent everywhere else. */
declare global {
  interface Window {
    __playgamaPlatformId?: string | null
    __storageShim?: { localStorage: string | null; sessionStorage: string | null }
    __saveManager?: { strategyName?: string }
    __chaosDebug?: () => Record<string, unknown>
  }
}

const readEnvFlags = (): Record<string, string> => {
  const out: Record<string, string> = {}
  try {
    const env = import.meta.env as Record<string, unknown>
    for (const key of Object.keys(env)) {
      if (!key.startsWith('VITE_APP_')) continue
      if (env[key] !== 'true') continue
      out[key.replace('VITE_APP_', '')] = 'true'
    }
  } catch { /* ignore */
  }
  return out
}

/**
 * A full picture of the runtime, safe to call at any time.
 *
 * Exposed as `window.__chaosDebug()` so QA (ours or a portal's) can paste one
 * expression into the console and hand back everything at once.
 */
export const snapshotBootState = (router?: Router): Record<string, unknown> => {
  const snap: Record<string, unknown> = {}
  try {
    snap.version = version
  } catch {
    snap.version = 'unknown'
  }

  try {
    snap.flags = readEnvFlags()
    snap.base = import.meta.env.BASE_URL
  } catch { /* ignore */
  }

  try {
    snap.href = window.location.href
    // The host-appended fragment is the thing that broke Playables. Report it
    // verbatim and separately — it is easy to miss inside a long href.
    snap.hash = window.location.hash
    snap.search = window.location.search
    snap.referrer = document.referrer
    snap.ancestorOrigins = Array.from(window.location.ancestorOrigins ?? [])
    snap.framed = window.top !== window.self
  } catch { /* cross-origin `window.top` access can throw */
  }

  try {
    const route = router?.currentRoute?.value
    snap.route = route
      ? { fullPath: route.fullPath, name: route.name ?? null, matched: route.matched.length }
      : null
  } catch { /* ignore */
  }

  try {
    // `null` here means the shim did NOT engage, i.e. native storage works.
    snap.storageShim = window.__storageShim ?? null
    snap.saveStrategy = window.__saveManager?.strategyName ?? null
  } catch { /* ignore */
  }

  try {
    snap.playgamaPlatformId = window.__playgamaPlatformId ?? null
  } catch { /* ignore */
  }

  try {
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    // Length rather than the policy itself — the full string is ~2 KB and
    // would bury every other field in the console.
    snap.cspMeta = csp ? `present (${(csp.getAttribute('content') ?? '').length} chars)` : 'absent'
  } catch { /* ignore */
  }

  try {
    snap.viewport = `${window.innerWidth}x${window.innerHeight}`
  } catch { /* ignore */
  }

  return snap
}

let installed = false

/**
 * Print the boot banner and arm the global error taps.
 *
 * Call once, as early in `bootstrap()` as the router is available. Safe to
 * call again — repeat calls are ignored.
 */
export const installBootDiagnostics = (router?: Router): void => {
  if (installed) return
  installed = true

  try {
    window.__chaosDebug = () => snapshotBootState(router)
  } catch { /* ignore */
  }

  // Window-level taps. Vue's own `app.config.errorHandler` never sees a
  // rejection thrown out of a boot `await` (the app does not exist yet), and a
  // swallowed boot rejection looks exactly like the router failure did: a
  // splash that finishes over nothing. These two lines make it loud.
  try {
    window.addEventListener('error', (e) => {
      console.error('[diag] uncaught error', e.error ?? e.message, snapshotBootState(router))
    })
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[diag] unhandled rejection', e.reason, snapshotBootState(router))
    })
  } catch { /* ignore */
  }

  try {
    console.info('[diag] boot', snapshotBootState(router))
  } catch { /* ignore */
  }
}

/**
 * Log the state once the first playable frame is up.
 *
 * The boot banner is printed before the router has resolved anything, so on
 * its own it cannot tell "the view rendered" from "the view rendered nothing".
 * This second line, fired from the same `areAllAssetsLoaded` edge that sends
 * the portal's `game_ready`, is the one that answers it — `route.matched` is
 * the field to read.
 */
export const logFirstFrameState = (router?: Router): void => {
  try {
    console.info('[diag] first playable frame', snapshotBootState(router))
  } catch { /* ignore */
  }
}

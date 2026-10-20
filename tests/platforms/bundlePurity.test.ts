// @vitest-environment node
//
// ─── Bundle-purity tests ───────────────────────────────────────────────────
//
// Builds the CrazyGames target and grep-asserts that platform-foreign
// modules don't end up in the chunks the player downloads.
//
// Why this test exists: the platform refactor (commit 82f1d6e, 2026-04-28)
// regressed the CG initial-load size from ~0.7MB to ~1.6MB because the
// resolvers (`resolveSaveStrategy`, `resolveAdProvider`) were rewritten
// to branch on a runtime `flags` parameter instead of `import.meta.env.*`
// literals — Rollup couldn't tree-shake any platform plugin from any
// build's bundle. Heavy modules that leaked into the CG bundle:
//   • `gameDistributionPlugin.ts` (~500 LOC + GD SDK loader)
//   • `glitchPlugin.ts` (Glitch.fun licensing/heartbeat)
//   • the native ads provider → `@tauri-apps/api/core` (Tauri shim)
//   • `peerjs` (~150KB obfuscated, transitively via `usePVP.ts`)
//
// CG QA flagged the bloat on 2026-04-30. The fix:
//   1. Resolvers gate on `import.meta.env.VITE_APP_*` literals so Rollup
//      can dead-code-eliminate unused platform branches.
//   2. Heavy plugin imports inside providers became dynamic-imports so
//      tree-shaking can remove them.
//   3. PeerJS load became a build-time-gated dynamic import.
//
// This test asserts those guards stay in place. It uses an unobfuscated
// build because string-array obfuscation makes the markers unfindable.
// The build is cheap (<10s with Vite's cache).

import { describe, it, expect, beforeAll } from 'vitest'
import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
// Out-of-tree dist so the test build doesn't stomp the developer's
// `pnpm build:crazy-web` artefact.
const OUT_DIR = path.resolve(PROJECT_ROOT, 'dist-purity-cg')

let chunkContents = new Map<string, string>()

beforeAll(async () => {
  // Drop any prior artefact so we measure a fresh build.
  fs.rmSync(OUT_DIR, { recursive: true, force: true })

  // Build in a CHILD PROCESS, not via Vite's JS API.
  //
  // `loadEnv` lets `process.env` VITE_* values override `.env.<mode>.local`,
  // and Vitest runs every test file in one process: the moment another suite
  // calls `vi.stubEnv('VITE_APP_PLAYGAMA', 'true')`, an in-process
  // `build({ mode: 'crazy-web' })` here inherits it and produces a CrazyGames
  // bundle that genuinely contains the Playgama plugin. This test then failed
  // in a full run and passed standalone — a false alarm that looks exactly
  // like the real regression it exists to catch.
  //
  // The child gets the same clean environment `pnpm build:crazy-web` does,
  // with every platform flag explicitly cleared so nothing inherited from the
  // developer's shell can hijack the build either.
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('VITE_')) delete cleanEnv[key]
  }
  // Vitest exports NODE_ENV=test, and a child that inherits it makes Vite
  // build in NON-production mode (e.g. @vitejs/plugin-vue stops inlining
  // templates) — not the bytes that ship. `pnpm build:<mode>` has no
  // NODE_ENV; neither does this build (same scrub as
  // scripts/feature-flag-audit.mjs `buildVariant`).
  delete cleanEnv.NODE_ENV
  cleanEnv.VITE_ENABLE_OBFUSCATION = 'false' // string-marker greps need readable output

  await new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      [
        path.resolve(PROJECT_ROOT, 'node_modules/vite/bin/vite.js'),
        'build',
        '--mode', 'crazy-web',
        '--outDir', OUT_DIR,
        '--logLevel', 'error'
      ],
      { cwd: PROJECT_ROOT, env: cleanEnv },
      (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}
${stderr}`)) : resolve())
    )
  })

  const assetsDir = path.join(OUT_DIR, 'assets')
  for (const f of fs.readdirSync(assetsDir)) {
    if (!f.endsWith('.js')) continue
    chunkContents.set(f, fs.readFileSync(path.join(assetsDir, f), 'utf8'))
  }
}, 120_000)

// Find every chunk that the CrazyGames build's user actually downloads
// before reaching the gameplay screen. That's:
//   • the entry chunk   (index-*.js)
//   • the App chunk     (App-*.js, the route-shell)
//   • the SpinnerArena route chunk (the gameplay view + its statically
//     imported composables)
// Lazy chunks (locale loaders, vConsole, glitchPlugin) are loaded on
// demand and excluded — leaking platform code into THOSE is not a
// regression because they only fetch when the relevant code path runs.
const isHotPathChunk = (name: string): boolean =>
  /^(index|App|SpinnerArena)-[A-Za-z0-9_-]+\.js$/.test(name)

const findInHotPath = (pattern: RegExp): { chunk: string; matches: number }[] => {
  const out: { chunk: string; matches: number }[] = []
  for (const [name, content] of chunkContents) {
    if (!isHotPathChunk(name)) continue
    const matches = content.match(pattern)?.length ?? 0
    if (matches > 0) out.push({ chunk: name, matches })
  }
  return out
}

describe('CrazyGames build — bundle purity', () => {
  it('builds at all (sanity check)', () => {
    expect(chunkContents.size).toBeGreaterThan(0)
    const hot = [...chunkContents.keys()].filter(isHotPathChunk)
    expect(hot.length, `hot-path chunks found: ${hot.join(', ')}`).toBeGreaterThan(0)
  })

  // ── Marker selection rationale ─────────────────────────────────────────
  // Patterns target unique IDENTIFIERS that only appear when the actual
  // SDK / library code is bundled (function names, runtime globals, SDK
  // URLs). Plain platform-NAME strings ("gamedistribution.com",
  // "glitch.fun", "wavedash.com") are EXPECTED in the hot path because
  // App.vue and the CSP-checking code legitimately compare hostnames
  // against them; matching on those would produce false positives.

  it('does NOT bundle GameDistribution SDK code in any hot-path chunk', () => {
    // SDK-only identifiers — present in the entry chunk only when the
    // actual `gameDistributionPlugin.ts` body is inlined (vs. a lazy
    // dynamic-import call that just references its filename).
    //   - `html5.api.gamedistribution` — SDK script URL
    //   - `GD_OPTIONS`                — SDK config global
    //   - `gdsdk`                     — SDK accessor global
    //   - `SDK_REWARDED_WATCH_COMPLETE` — SDK event name
    const leaks = findInHotPath(/html5\.api\.gamedistribution|\bGD_OPTIONS\b|\bgdsdk\b|SDK_REWARDED_WATCH_COMPLETE/)
    expect(leaks, `GameDistribution SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle Glitch.fun SDK code in any hot-path chunk', () => {
    // GlitchStrategy class definition + glitch-internal endpoints.
    // (Plain `"glitch.fun"` string is allowed — used as a hostname
    // literal in CSP/host-detection code. `glitchLicenseStatus` is also
    // allowed: it's a 5-line `ref()` shared with App.vue's capability
    // gate; the actual API calls live in a lazy chunk.)
    const leaks = findInHotPath(/GlitchStrategy\b|GLITCH_LICENSE_API|aegis-bridge|glitch-heartbeat-token/)
    expect(leaks, `Glitch SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle @tauri-apps / native-ads code in any hot-path chunk', () => {
    // Tauri runtime globals appear ONLY when `@tauri-apps/api/core` is
    // bundled. The package writes/reads these on the global window.
    // (Plain `"@tauri-apps/api"` strings appear in error messages we
    // wrote and are OK.)
    // `plugin:levelplay|` / `plugin:admob|` are the invoke-name prefixes the
    // native ad providers build their commands from; either appears in a web
    // bundle only if that provider survived tree-shaking.
    const leaks = findInHotPath(/__TAURI_INTERNALS__|__TAURI_INVOKE_KEY__|__TAURI_TO_IPC_KEY__|plugin:admob\||plugin:levelplay\|/)
    expect(leaks, `Tauri/native-ads code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle PeerJS / WebRTC plumbing in any hot-path chunk', () => {
    // PeerJS itself ships WebRTC constructor names and the iceServers
    // config helper. ~150KB obfuscated when bundled; should ONLY be
    // loaded via a build-time-gated dynamic import in `usePVP.ts`.
    // (Plain `"peerjs"` string is a debug label in usePVP.ts and
    // expected to remain.)
    const leaks = findInHotPath(/RTCPeerConnection|RTCDataChannel|RTCSessionDescription|RTCIceCandidate/)
    expect(leaks, `PeerJS leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT ship the PvP module at all (stubbed on a PvP-disabled build)', () => {
    // Stronger than the hot-path check above, and about our OWN code rather
    // than the PeerJS library: `usePVP.ts` and the lobby modal are statically
    // imported by the arena, so before the `resolve.alias` stubs they shipped
    // in full on every portal build — the WhatsApp invite link and the
    // STUN / TURN relay hosts included. Every chunk, not just the hot path.
    const leaks = [...chunkContents.entries()]
      .filter(([, content]) => /wa\.me\/|relay\.metered\.ca|stun\.l\.google\.com/.test(content))
      .map(([name]) => name)
    expect(leaks, `PvP module code shipped in: ${leaks.join(', ')}`).toEqual([])
  })

  it('does NOT emit a vConsole chunk on a web (non-native) build', () => {
    // vConsole is gated to `VITE_APP_NATIVE === 'true'` (or an explicit
    // `VITE_APP_INCLUDE_VCONSOLE=true` opt-in) in `main.ts`. On a CG
    // build the dynamic-import call is dead code, so no `vconsole.min`
    // chunk should be emitted at all.
    const allChunks = [...chunkContents.keys()]
    const vconsoleChunks = allChunks.filter((n) => /vconsole/i.test(n))
    expect(
      vconsoleChunks,
      `vConsole chunks emitted on a web build: ${vconsoleChunks.join(', ')}`
    ).toEqual([])
  })

  it('does NOT bundle Playgama Bridge code in any hot-path chunk', () => {
    // PlaygamaProvider / PlaygamaStrategy / playgamaPlugin should
    // tree-shake on non-Playgama builds because the resolver arms gate
    // on the `VITE_APP_PLAYGAMA` literal. We grep for the strategy
    // class name + the bridge CDN URL + the play-time lifecycle event
    // strings — none of those appear anywhere in the project except
    // inside the Playgama plugin / strategy. (Plain `"playgama"` and
    // `"playgama.com"` ARE expected in the hot path — capabilities /
    // CSP code legitimately reference them as hostname/text literals.)
    const leaks = findInHotPath(/PlaygamaStrategy\b|bridge\.playgama\.com|playgama-bridge|PLAYGAMA_BRIDGE|in_game_loading_started\b/)
    expect(leaks, `Playgama plugin code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT emit an @playgama/bridge chunk at all on a non-Playgama build', () => {
    // Since the v1 → v2 migration the Bridge is an npm dependency (~286 KB)
    // rather than a CDN <script>, so a leak is far more expensive than it used
    // to be. `playgamaBridgeLoader.ts` gates the dynamic import behind an
    // `import.meta.env` literal TERNARY — a plain `if (isPlaygama) await
    // import(...)` is NOT enough, because Rollup still emits the chunk when
    // the syntactic dynamic import survives. This asserts the chunk is absent
    // entirely, not merely unreferenced.
    const bridgeChunks = [...chunkContents.keys()].filter(n => /playgama-bridge/.test(n))
    expect(
      bridgeChunks,
      `@playgama/bridge chunk emitted on a CrazyGames build: ${bridgeChunks.join(', ')}`
    ).toEqual([])

    // Marker check too, in case a future chunk rename hides the package inside
    // someone else's chunk. These strings are unique to the Bridge package:
    // two of its PLATFORM_ID values and the DOM id of its YouTube subscribe
    // overlay.
    const inlined = [...chunkContents.entries()].filter(
      ([, content]) => /jio_games|microsoft_store|bridge-youtube-subscribe/.test(content)
    ).map(([name]) => name)
    expect(inlined, `@playgama/bridge inlined into: ${inlined.join(', ')}`).toEqual([])
  })

  it('ships the Playgama wrapper STUB, not the wrapper, on a non-Playgama build', () => {
    // `App.vue` / `useGameplayLifecycle` import `@/utils/playgamaPlugin`
    // statically. Their calls fold, but the obfuscated module could not be
    // tree-shaken, so ~5 KB of dead wrapper shipped in a shared chunk Rollup
    // NAMED after it. vite.config.ts now aliases it to playgamaPlugin.stub.ts.
    // Nor under the stub's name (vite.config.ts `chunkFileNames`): Rollup
    // picks the stub as the shared chunk's namesake just the same.
    const named = [...chunkContents.keys()].filter(n => /^playgamaPlugin|\.stub-/.test(n))
    expect(named, `chunk named after the Playgama wrapper: ${named.join(', ')}`).toEqual([])
    const messages = [...chunkContents.entries()]
      .filter(([, c]) => /in_game_loading_stopped|visibility_state_changed|interstitial_state_changed/.test(c))
      .map(([n]) => n)
    expect(messages, `Playgama wrapper code in: ${messages.join(', ')}`).toEqual([])
  })

  it('the Playgama stub exports every name the real wrapper does', () => {
    const exportsOf = (f: string) => [...fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8')
      .matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map(m => m[1]).sort()
    expect(exportsOf('src/utils/playgamaPlugin.stub.ts')).toEqual(exportsOf('src/utils/playgamaPlugin.ts'))
  })

  it('does NOT contain the PokiSDK URL ANYWHERE — not just the hot path', () => {
    // Stronger than the other checks on purpose. Poki is kept out by a
    // `resolve.alias` STUB SWAP in vite.config.ts, not by tree-shaking, because
    // the obfuscator's `stringArray` pass hoists string literals into its
    // indirection table BEFORE esbuild folds `import.meta.env.VITE_APP_POKI` to
    // `false` — so an env-gated `if` alone leaves the SDK URL in the bundle.
    // `resolveAdProvider` statically imports every provider and
    // `useGameplayLifecycle` statically imports the bracket functions, so both
    // Poki modules are in every build's graph regardless of flags.
    //
    // A foreign portal's host string in a shipped bundle is also exactly what
    // strict moderators reject ("service storage URL detected"), so assert on
    // EVERY chunk rather than only the ones the player downloads first.
    const leaks = [...chunkContents.entries()]
      .filter(([, content]) => /game-cdn\.poki\.com|PokiSDK/.test(content))
      .map(([name]) => name)
    expect(
      leaks,
      `Poki SDK identifiers leaked into the CrazyGames build: ${leaks.join(', ')}`
    ).toEqual([])
  })

  it('does NOT contain the GameMonetize SDK host ANYWHERE', () => {
    // Same mechanism as Poki above: `resolveAdProvider` and `App.vue` import
    // the GameMonetize provider / plugin statically, so a `resolve.alias` stub
    // swap is what keeps another ad network's SDK URL out of this bundle.
    //
    // Matched on the SDK's host and its event / options names. The bare
    // "gamemonetize.com" is NOT a leak: `capabilities.ts` carries one portal
    // domain per platform for the "only available on …" copy.
    const leaks = [...chunkContents.entries()]
      .filter(([, content]) => /api\.gamemonetize|SDK_GAME_PAUSE|SDK_OPTIONS/.test(content))
      .map(([name]) => name)
    expect(
      leaks,
      `GameMonetize SDK code leaked into the CrazyGames build: ${leaks.join(', ')}`
    ).toEqual([])
  })

  it('the GameMonetize stubs export every name the real modules do', () => {
    const exportsOf = (f: string) => [...fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8')
      .matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map(m => m[1]).sort()
    expect(exportsOf('src/utils/gameMonetizePlugin.stub.ts')).toEqual(exportsOf('src/utils/gameMonetizePlugin.ts'))
    expect(exportsOf('src/use/ads/GameMonetizeProvider.stub.ts')).toEqual(exportsOf('src/use/ads/GameMonetizeProvider.ts'))
  })

  it('does NOT ship the real-money diamond shop (stubbed out of every build)', () => {
    const leaks = [...chunkContents.entries()]
      .filter(([, content]) => /\$1\.29|\$9\.99/.test(content))
      .map(([name]) => name)
    expect(leaks, `IAP price strings shipped in: ${leaks.join(', ')}`).toEqual([])
  })

  it('does NOT bundle Wavedash SDK code in any hot-path chunk', () => {
    // `@wvdsh/sdk-js` is the Wavedash NPM package; the runtime relies on
    // `window.WavedashJS` injected by Wavedash's iframe wrapper, so
    // neither of these literals should appear in a CrazyGames build.
    // (Plain `"wavedash"` string is a build-flag label and OK.)
    const leaks = findInHotPath(/@wvdsh\/sdk-js|wvdsh\b|WavedashSDK\b/)
    expect(leaks, `Wavedash SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does include the CrazyGames Strategy + provider markers (positive control)', () => {
    // Sanity check that we DIDN'T accidentally tree-shake the platform
    // we DO want — catches a future "fixed everything to Noop" regression.
    const cgStrategy = findInHotPath(/CrazyGamesStrategy|crazyGames|sdk\.crazygames\.com/)
    expect(cgStrategy.length, 'CrazyGames provider/strategy missing from hot-path bundle!').toBeGreaterThan(0)
  })
})

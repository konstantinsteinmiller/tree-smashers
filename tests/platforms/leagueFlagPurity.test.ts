// @vitest-environment node
//
// ─── League flag: bundle purity, OFF and ON ───────────────────────────────
//
// VITE_APP_FEATURE_LEAGUE=false must remove the league from the SHIPPED bytes.
// This builds the CrazyGames target twice through
// `scripts/feature-flag-audit.mjs` — each in a forked child with a scrubbed
// env (see the rationale in that script and in bundlePurity.test.ts):
//
//   • OFF, OBFUSCATED — exactly what a league-off build ships. Obfuscated on
//     purpose (league plan F1): folding in obfuscated consumers only holds
//     because 'true'/'false' are reserved strings. Zero League chunks, zero
//     league markers (keys, routes, component names, bridge members, the
//     season epoch) outside the per-locale chunks, zero league public files.
//   • ON, unobfuscated twin — builds, and the hot path (index / App /
//     SpinnerArena) carries no league component, route or pool key. Once the
//     league's lazy modules land (LG1/LG2/LG5b) the ON build must also emit
//     them as their own chunks with live markers — those checks switch on by
//     themselves when the files exist, so "zero" above stays falsifiable.
//
// Same audit, by hand: node scripts/feature-flag-audit.mjs --flag league

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — plain .mjs script, no types
import { FLAGS, buildVariant, scanBuild } from '../../scripts/feature-flag-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'node_modules/.cache/league-flag-purity')

interface Scan {
  jsBytes: number
  hotBytes: number
  chunks: { file: string; bytes: number }[]
  featureChunks: { file: string; bytes: number }[]
  featurePublic: string[]
  hits: { file: string; marker: string; count: number }[]
}

let off: Scan
let on: Scan

/** The league's lazy modules exist (LG2 state / LG5b hub) → ON must ship them. */
const LEAGUE_LANDED = ['src/league/useLeague.ts', 'src/league/ui/LeagueHub.vue']
  .some(f => existsSync(path.join(ROOT, f)))

beforeAll(async () => {
  const offDir = path.join(OUT, 'off-obfuscated')
  const onDir = path.join(OUT, 'on-twin')
  await buildVariant({ mode: 'crazy-web', outDir: offDir, env: { VITE_APP_FEATURE_LEAGUE: 'false' } })
  await buildVariant({
    mode: 'crazy-web',
    outDir: onDir,
    env: { VITE_APP_FEATURE_LEAGUE: 'true', VITE_ENABLE_OBFUSCATION: 'false' }
  })
  off = scanBuild(offDir, FLAGS.league)
  on = scanBuild(onDir, FLAGS.league)
}, 900_000)

describe('league OFF — obfuscated CrazyGames build', () => {
  it('built', () => {
    expect(off.chunks.length).toBeGreaterThan(0)
  })

  it('emits no League chunk', () => {
    expect(off.featureChunks).toEqual([])
  })

  it('carries no league marker outside the per-locale chunks', () => {
    expect(off.hits).toEqual([])
  })

  it('ships no league public file', () => {
    expect(off.featurePublic).toEqual([])
  })
})

describe('league ON — unobfuscated twin', () => {
  it('built', () => {
    expect(on.chunks.length).toBeGreaterThan(0)
  })

  it('keeps league components, routes and the pool key out of the hot path', () => {
    const hot = on.hits.filter(h => /^(index|App|SpinnerArena)-/.test(path.basename(h.file)))
    expect(hot.filter(h => /^League|^\/league\/$|^chaosarena_league_pool$|^data-league$/.test(h.marker))).toEqual([])
  })

  it.skipIf(!LEAGUE_LANDED)('emits the lazy league chunks with live markers', () => {
    expect(on.featureChunks.length).toBeGreaterThan(0)
    expect(on.hits.length).toBeGreaterThan(0)
  })

  // LG5b: every UI handle is its own lazy chunk — none of them rides the hot
  // path. Switches on once the arena mounts the handles (LG6); until then
  // Rollup rightly drops the unused handles and emits no UI chunk at all.
  const UI_MOUNTED = existsSync(path.join(ROOT, 'src/league/ui/LeagueHub.vue'))
    && readFileSync(path.join(ROOT, 'src/views/SpinnerArena.vue'), 'utf8').includes('LeagueHubUi')
  it.skipIf(!UI_MOUNTED)('emits the league UI as lazy chunks', () => {
    const stems = on.featureChunks.map(c => path.basename(c.file))
    for (const name of ['LeagueHudButton', 'LeagueHub', 'LeagueResultPanel', 'LeagueUnlockPopup', 'LeagueSeasonRewardModal']) {
      expect(stems.some(s => s.startsWith(`${name}-`)), name).toBe(true)
    }
  })
})

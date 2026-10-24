// @vitest-environment node
//
// ─── Bosses100 flag: bundle purity, OFF and ON ────────────────────────────
//
// VITE_APP_FEATURE_BOSSES100=false must remove the stage-101+ boss feature
// from the SHIPPED bytes (batch 4, user decision A). This builds the
// CrazyGames target twice through `scripts/feature-flag-audit.mjs` — each in a
// forked child with a scrubbed env (no inherited VITE_* and no NODE_ENV, see
// that script and tests/platforms/bundlePurity.test.ts):
//
//   • OFF, OBFUSCATED — exactly what a bosses100-off build ships (the
//     obfuscator used to string-array the 'true'/'false' of a flag comparison
//     at random, Q1, so only the obfuscated build proves folding). Zero
//     feature chunks, zero markers (encounter ids, boss SFX names, component
//     names, trait event kinds / state fields) outside the per-locale chunks,
//     zero boss SFX / crest files.
//   • ON, unobfuscated twin — the same markers DO appear (the list is live,
//     so "zero" above means something) and the trait code sits in lazy chunks.
//
// Same audit, by hand: node scripts/feature-flag-audit.mjs --flag bosses100

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — plain .mjs script, no types
import { FLAGS, buildVariant, scanBuild } from '../../scripts/feature-flag-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Per-process build dir: two concurrent runs (two sessions / agents) must not
// rm each other's build mid-scan. Removed again after the suite.
const OUT = path.join(ROOT, 'node_modules/.cache', `bosses100-flag-purity-${process.pid}`)
afterAll(() => rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))

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

beforeAll(async () => {
  const offDir = path.join(OUT, 'off-obfuscated')
  const onDir = path.join(OUT, 'on-twin')
  await buildVariant({ mode: 'crazy-web', outDir: offDir, env: { VITE_APP_FEATURE_BOSSES100: 'false' } })
  await buildVariant({
    mode: 'crazy-web',
    outDir: onDir,
    env: { VITE_APP_FEATURE_BOSSES100: 'true', VITE_ENABLE_OBFUSCATION: 'false' }
  })
  off = scanBuild(offDir, FLAGS.bosses100)
  on = scanBuild(onDir, FLAGS.bosses100)
}, 900_000)

describe('bosses100 OFF — obfuscated CrazyGames build', () => {
  it('built', () => {
    expect(off.chunks.length).toBeGreaterThan(0)
  })

  it('emits no feature chunk', () => {
    expect(off.featureChunks).toEqual([])
  })

  it('carries no feature marker outside the per-locale chunks', () => {
    expect(off.hits).toEqual([])
  })

  it('ships no boss SFX and no boss crest', () => {
    expect(off.featurePublic).toEqual([])
  })
})

describe('bosses100 ON — unobfuscated twin (the markers are live)', () => {
  it('emits the lazy feature chunks', () => {
    const names = on.featureChunks.map(c => path.basename(c.file).replace(/-[A-Za-z0-9_-]{6,}\.js$/, ''))
    for (const n of ['bossTraitEngine', 'bossArenaUi', 'BossIntroCard', 'BossTrophyCard']) {
      expect(names, n).toContain(n)
    }
  })

  it('finds the encounter ids, SFX names, component names and trait fields', () => {
    const markers = new Set(on.hits.map(h => h.marker))
    for (const m of ['cinder_tyrant', 'elemental_court', 'boss-ember-pulse', 'BossIntroCard', 'freeze_crack', 'nextNovaAt']) {
      expect(markers, m).toContain(m)
    }
    expect(on.featurePublic.length).toBe(4 + 3 + 3) // + the 3 toy-box boss badges (painted-boss-*, tools/badge-icons)
  })

  it('keeps the trait rules, VFX and SFX out of the hot path', () => {
    const hot = on.hits.filter(h => /^(index|App|SpinnerArena)-/.test(path.basename(h.file)))
    // The encounter TABLE is sync data (the campaign's stage lookup), the
    // crest paths feed the peek badge and the engine's trait glue names its
    // event kinds, so those may sit in the hot path; the trait RULES (their
    // state fields) and the boss SFX may not — they live in the lazy port.
    expect(hot.filter(h => /^(boss-(ember|freeze|crack|chill)|nextNovaAt|chillExp|lastChillAt)/.test(h.marker))).toEqual([])
  })
})

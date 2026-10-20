// @vitest-environment node
//
// ─── Skills: lazy skill chunks in the shipped build ───────────────────────
//
// Skills are mandatory since the Tree Smashers reskin: every smasher carries
// its own per-blade skills, so the smasher catalog (main chunk) names the
// skill ids on every build and a "skills-off" build is no longer a product
// (the old OFF purity half was retired with it). What still matters is the
// split: this builds the CrazyGames target (unobfuscated, so the markers are
// readable — see the rationale in scripts/feature-flag-audit.mjs and
// bundlePurity.test.ts) and checks that the skill runtime, engine, SFX and
// UI sit in lazy chunks, the marker list is live, and the hot path carries
// no skill SFX / runtime code.
//
// Same audit, by hand: node scripts/feature-flag-audit.mjs --flag skills

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — plain .mjs script, no types
import { FLAGS, buildVariant, scanBuild } from '../../scripts/feature-flag-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Per-process build dir: two concurrent runs (two sessions / agents) must not
// rm each other's build mid-scan. Removed again after the suite.
const OUT = path.join(ROOT, 'node_modules/.cache', `skills-flag-purity-${process.pid}`)
afterAll(() => rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))

interface Scan {
  jsBytes: number
  hotBytes: number
  chunks: { file: string; bytes: number }[]
  featureChunks: { file: string; bytes: number }[]
  featurePublic: string[]
  hits: { file: string; marker: string; count: number }[]
}

let on: Scan

beforeAll(async () => {
  const onDir = path.join(OUT, 'on-twin')
  await buildVariant({
    mode: 'crazy-web',
    outDir: onDir,
    env: { VITE_APP_FEATURE_SKILLS: 'true', VITE_ENABLE_OBFUSCATION: 'false' }
  })
  on = scanBuild(onDir, FLAGS.skills)
}, 900_000)

describe('skills ON — unobfuscated CrazyGames build (the markers are live)', () => {
  it('emits the lazy skill chunks', () => {
    const names = on.featureChunks.map(c => path.basename(c.file).replace(/-[A-Za-z0-9_-]{6,}\.js$/, ''))
    for (const n of ['arenaSkills', 'skillEngine', 'skillSfx', 'smasherSkillText', 'SkillIcon']) {
      expect(names, n).toContain(n)
    }
  })

  it('finds the storage keys, SFX names and skill ids', () => {
    const markers = new Set(on.hits.map(h => h.marker))
    for (const m of ['skill-shield', 'homing_rockets', 'smasherSkillDescParams']) {
      expect(markers, m).toContain(m)
    }
    // skill-shield/-rocket/-zap/-drumroll + skill-crit/-whoosh/-boost (roadmap #4)
    expect(on.featurePublic.length).toBe(7)
  })

  it('keeps the skill runtime, VFX, catalog and UI out of the hot path', () => {
    const hot = on.hits.filter(h => /^(index|App|SpinnerArena)-/.test(path.basename(h.file)))
    // The gate's dynamic-import specifiers name the lazy chunks (index); the
    // storage keys and ids live in the tiny boundary modules. No SFX name and
    // no skill-runtime code may sit there.
    expect(hot.filter(h => /^skill-/.test(h.marker))).toEqual([])
  })
})

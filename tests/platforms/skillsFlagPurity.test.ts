// @vitest-environment node
//
// ─── Skills flag: bundle purity, OFF and ON ───────────────────────────────
//
// VITE_APP_FEATURE_SKILLS=false must remove the skill system from the SHIPPED
// bytes (batch 3, group D). This builds the CrazyGames target twice through
// `scripts/feature-flag-audit.mjs` — each in a forked child with a scrubbed
// env (see the rationale in that script and in bundlePurity.test.ts):
//
//   • OFF, OBFUSCATED — exactly what a skills-off build ships. Obfuscated on
//     purpose: the obfuscator used to string-array the 'true'/'false' of the
//     flag comparison at random (Q1), so an unobfuscated twin folded while
//     the shipped build did not. Zero skill chunks, zero skill markers (keys,
//     SFX names, component names, skill ids) outside the per-locale chunks,
//     zero skill SFX files.
//   • ON, unobfuscated twin — the same markers DO appear (so the marker list
//     is not stale and "zero" above means something), skill code sits in lazy
//     chunks, and the hot path carries none of it.
//
// Same audit, by hand: node scripts/feature-flag-audit.mjs --flag skills

import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — plain .mjs script, no types
import { FLAGS, buildVariant, scanBuild } from '../../scripts/feature-flag-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'node_modules/.cache/skills-flag-purity')

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
  await buildVariant({ mode: 'crazy-web', outDir: offDir, env: { VITE_APP_FEATURE_SKILLS: 'false' } })
  await buildVariant({
    mode: 'crazy-web',
    outDir: onDir,
    env: { VITE_APP_FEATURE_SKILLS: 'true', VITE_ENABLE_OBFUSCATION: 'false' }
  })
  off = scanBuild(offDir, FLAGS.skills)
  on = scanBuild(onDir, FLAGS.skills)
}, 900_000)

describe('skills OFF — obfuscated CrazyGames build', () => {
  it('built', () => {
    expect(off.chunks.length).toBeGreaterThan(0)
  })

  it('emits no skill chunk', () => {
    expect(off.featureChunks).toEqual([])
  })

  it('carries no skill marker outside the per-locale chunks', () => {
    expect(off.hits).toEqual([])
  })

  it('ships no skill SFX file', () => {
    expect(off.featurePublic).toEqual([])
  })
})

describe('skills ON — unobfuscated twin (the markers are live)', () => {
  it('emits the lazy skill chunks', () => {
    const names = on.featureChunks.map(c => path.basename(c.file).replace(/-[A-Za-z0-9_-]{6,}\.js$/, ''))
    for (const n of ['useSkills', 'arenaSkills', 'skillEngine', 'skillSfx', 'SkillsIntroScreen', 'SkillPickerModal', 'TeamSkillsSection']) {
      expect(names, n).toContain(n)
    }
  })

  it('finds the storage keys, SFX names and skill ids', () => {
    const markers = new Set(on.hits.map(h => h.marker))
    for (const m of ['spinner_skills', 'skill-shield', 'skill-drumroll', 'homing_rockets', 'SkillPickerModal']) {
      expect(markers, m).toContain(m)
    }
    expect(on.featurePublic.length).toBe(4)
  })

  it('keeps the skill runtime, VFX, catalog and UI out of the hot path', () => {
    const hot = on.hits.filter(h => /^(index|App|SpinnerArena)-/.test(path.basename(h.file)))
    // The gate's dynamic-import specifiers name the lazy chunks (index); the
    // storage keys and ids live in the tiny boundary modules. No SFX name and
    // no skill-runtime code may sit there.
    expect(hot.filter(h => /^skill-/.test(h.marker))).toEqual([])
  })
})

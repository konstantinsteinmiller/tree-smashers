// ─── Skills flag boundary: static guards ────────────────────────────────────
//
// The skills-off build is only skill-free because of a handful of structural
// rules (src/skills/skillsGate.ts header). A single stray import breaks it
// silently — the game still works, it just ships the skill system again — so
// the rules are pinned here at source level, and the shipped bytes are
// checked by tests/platforms/skillsFlagPurity.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  B_LUCKY,
  B_MIRROR,
  B_MOMENTUM,
  B_PHASE,
  B_ROCKETS,
  B_SALVO,
  B_SHELL,
  B_STATIC,
  B_WARD,
  B_WIND
} from '@/use/skills/skillCore'
import { SKILL_BIT } from '@/data/skillCatalog'

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/')
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n)
    return statSync(f).isDirectory() ? walk(f) : /\.(ts|vue|mts)$/.test(n) ? [f] : []
  })
const FILES = walk(SRC).map(f => ({ file: rel(f), text: read(f) }))

/** The skill system: only ever reached through the gate. */
const SKILL_MODULE = [
  /^src\/use\/useSkills\.ts$/,
  /^src\/use\/skills\/(?!skillCore\.ts$)[^/]+\.ts$/,
  /^src\/data\/skillCatalog\.ts$/,
  /^src\/data\/uiGlyphs\.ts$/,
  /^src\/use\/skillRevealGate\.ts$/,
  /^src\/use\/skillText\.ts$/,
  /^src\/components\/(atoms|molecules|organisms)\/(Skills?[A-Z][A-Za-z]*|PvpVsPreview|PvpReadySkills|TeamSkillsSection)\.vue$/
]
const isSkillModule = (file: string) => SKILL_MODULE.some(re => re.test(file))
const isDevOnly = (file: string) => file.startsWith('src/dev/')
const GATE = 'src/skills/skillsGate.ts'

/** '@/x/y' → 'src/x/y.<ext>' (the file that exists), else null. */
const resolveSpec = (spec: string): string | null => {
  if (!spec.startsWith('@/')) return null
  const base = 'src/' + spec.slice(2)
  for (const cand of [base, `${base}.ts`, `${base}.vue`]) if (FILES.some(f => f.file === cand)) return cand
  return null
}

interface Imp {
  spec: string;
  typeOnly: boolean;
  dynamic: boolean
}

const importsOf = (text: string): Imp[] => {
  const out: Imp[] = []
  // Strip comments so documentation mentioning a module is not an import.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  for (const m of code.matchAll(/\bimport\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[2]!, typeOnly: !!m[1], dynamic: false })
  }
  for (const m of code.matchAll(/\bexport\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[2]!, typeOnly: !!m[1], dynamic: false })
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    // `typeof import('x')` in a type position is not a runtime import.
    const before = code.slice(Math.max(0, m.index! - 8), m.index!)
    out.push({ spec: m[1]!, typeOnly: /typeof\s*$/.test(before), dynamic: true })
  }
  return out
}

describe('rule 1 — only the gate reads VITE_APP_FEATURE_SKILLS', () => {
  it('no other source file reads the literal', () => {
    const readers = FILES
      .filter(f => /import\.meta\.env\.VITE_APP_FEATURE_SKILLS\b/.test(f.text))
      .map(f => f.file)
    expect(readers).toEqual([GATE])
  })

  it('the gate derives SKILLS_BUILD from the literal, and every lazy import sits behind it', () => {
    const gate = FILES.find(f => f.file === GATE)!.text
    expect(gate).toMatch(/export const SKILLS_BUILD: boolean = import\.meta\.env\.VITE_APP_FEATURE_SKILLS === 'true'/)
    // Split into top-level statements; any statement with a runtime import()
    // must also mention SKILLS_BUILD (a ternary / if on the literal).
    const statements = gate.split(/\n(?=export |const |let )/)
    const unguarded = statements.filter(s => /\bimport\(/.test(s.replace(/typeof import\(/g, '')) && !/SKILLS_BUILD/.test(s))
    expect(unguarded).toEqual([])
  })

  it('useUser no longer exports a skills flag of its own', () => {
    const useUser = FILES.find(f => f.file === 'src/use/useUser.ts')!.text
    expect(useUser).not.toMatch(/export const isSkillsEnabled/)
  })
})

describe('rule 2 — the skill system is reached only through the gate', () => {
  it('no runtime import of a skill module from shared code', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (isSkillModule(f.file) || isDevOnly(f.file) || f.file === GATE) continue
      for (const imp of importsOf(f.text)) {
        const target = resolveSpec(imp.spec)
        if (target && isSkillModule(target) && !imp.typeOnly) bad.push(`${f.file} → ${imp.spec}${imp.dynamic ? ' (dynamic)' : ''}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('no dynamic import of a skill module anywhere but the gate (skill modules included)', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (f.file === GATE || isDevOnly(f.file)) continue
      for (const imp of importsOf(f.text)) {
        const target = resolveSpec(imp.spec)
        if (imp.dynamic && !imp.typeOnly && target && isSkillModule(target)) bad.push(`${f.file} → ${imp.spec}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('rule 3 — the boundary modules import nothing obfuscated', () => {
  it('src/skills/* imports only vue, other boundary modules, or types', () => {
    const bad: string[] = []
    for (const f of FILES.filter(x => x.file.startsWith('src/skills/'))) {
      for (const imp of importsOf(f.text)) {
        if (imp.typeOnly || imp.dynamic) continue
        if (imp.spec === 'vue' || imp.spec.startsWith('@/skills/')) continue
        bad.push(`${f.file} → ${imp.spec}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('the string-free skill core (ships on every build)', () => {
  const core = FILES.find(f => f.file === 'src/use/skills/skillCore.ts')!.text
  const code = core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('names no skill id and imports only types', () => {
    expect(code).not.toMatch(/phase_step|guard_shell|second_wind|lucky_edge|homing_rockets|opening_salvo|hazard_ward|static_charge|mirror_plate/)
    for (const imp of importsOf(core)) expect(imp.typeOnly, imp.spec).toBe(true)
  })

  it('its numeric bits are the catalog\'s SKILL_BIT', () => {
    expect([B_PHASE, B_SHELL, B_WIND, B_LUCKY, B_ROCKETS, B_SALVO, B_MOMENTUM, B_WARD, B_STATIC, B_MIRROR]).toEqual([
      SKILL_BIT.phase_step, SKILL_BIT.guard_shell, SKILL_BIT.second_wind, SKILL_BIT.lucky_edge,
      SKILL_BIT.homing_rockets, SKILL_BIT.opening_salvo, SKILL_BIT.momentum, SKILL_BIT.hazard_ward,
      SKILL_BIT.static_charge, SKILL_BIT.mirror_plate
    ])
  })
})

describe('engine: every skill-only path is behind the literal', () => {
  const engine = FILES.find(f => f.file === 'src/use/useSpinnerGame.ts')!.text

  it('skill state is only ever created through the installed port', () => {
    expect(engine).toMatch(/skillPort = SKILLS_BUILD \? port : null/)
    expect(engine).toMatch(/const ownSkills = SKILLS_BUILD && equipSide\(/)
    expect(engine).toMatch(/const otherSkills = SKILLS_BUILD && equipSide\(/)
    expect(engine).toMatch(/if \(skillPort === null \|\| !loadout \|\| loadout\.length === 0\) return false/)
  })

  it('the HP-loss, collision, contact, salvo, rocket and render hooks fold on SKILLS_BUILD', () => {
    expect(engine.match(/if \(!SKILLS_BUILD \|\| \w+\.skills === undefined\) \{/g)?.length).toBe(4)
    expect(engine).toMatch(/const skilledPair = SKILLS_BUILD && \(/)
    expect(engine).toMatch(/if \(SKILLS_BUILD\) fireOpeningSalvo\(\)/)
    expect(engine).toMatch(/if \(SKILLS_BUILD && simActive && rocketsInFlight > 0\) tickRockets\(\)/)
    expect(engine).toMatch(/if \(SKILLS_BUILD && v\.skills !== undefined\) \{/)
    // Nothing calls a skill runtime / VFX function except through the port.
    const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const fn of ['createBladeSkills', 'outgoingSkillMul', 'incomingSkill', 'onEnemyContact', 'teamSalvoPct',
      'salvoDamage', 'createSkillVfx', 'resetSkillVfx', 'tickSkillVfx', 'skillVfxEvent', 'renderSkillLayer',
      'renderBladeSkillFx', 'skillBladeAlpha', 'drawSkillGlyph']) {
      const bare = code.match(new RegExp(`(?<![.\\w])${fn}\\(`, 'g')) ?? []
      expect(bare, fn).toEqual([])
    }
  })
})

describe('build config', () => {
  const config = read(path.join(ROOT, 'vite.config.ts'))

  it('reserves "true" / "false" (Q1) and the skill ids from the string array', () => {
    expect(config).toMatch(/reservedStrings: \[\s*'\^true\$', '\^false\$'/)
    expect(config).toMatch(/'\^\(phase_step\|guard_shell\|second_wind\|lucky_edge\|homing_rockets\|opening_salvo\|momentum\|hazard_ward\|static_charge\|mirror_plate\)\$'/)
  })

  it('names every skill-port member in bracket form and reserves it (else the name outlives the folded call)', () => {
    const engine = read(path.join(ROOT, 'src/use/useSpinnerGame.ts'))
    const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // A dotted access becomes an obfuscator-made literal `reservedStrings`
    // cannot protect — only the bracket form's original literal is reserved.
    expect(code.match(/\bskillPort(?:!|\?)?\.[A-Za-z_]/g) ?? []).toEqual([])
    const members = new Set<string>()
    for (const m of code.matchAll(/\bskillPort(?:!|\?\.)?\['([A-Za-z_]+)'\]/g)) members.add(m[1]!)
    expect(members.size).toBeGreaterThan(10)
    const line = config.split('\n').find(l => l.includes('\'^(createBladeSkills|'))!
    const reserved = new RegExp(line.trim().replace(/^'|',?$/g, ''))
    const missing = [...members].filter(n => !reserved.test(n))
    expect(missing).toEqual([])
  })

  it('never obfuscates the flag boundary', () => {
    expect(config).toContain('/src[\\\\/]skills[\\\\/]/')
  })

  it('asserts the flag is exactly "true" or "false"', () => {
    expect(config).toMatch(/for \(const flag of \['VITE_APP_FEATURE_SKILLS'/)
    expect(config).toMatch(/v !== 'true' && v !== 'false'\) \{\s*throw new Error/)
  })

  // The .env files are git-ignored (secrets), so this only runs where they
  // exist; a build without the base value fails the vite.config assertion.
  it('the base .env ships skills off; dev and CrazyGames opt in', () => {
    const env = (f: string) => {
      try {
        return read(path.join(ROOT, f))
      } catch {
        return null
      }
    }
    for (const [file, value] of [['.env', 'false'], ['.env.development', 'true'], ['.env.crazy-web.local', 'true']]) {
      const text = env(file!)
      if (text !== null) expect(text, file).toMatch(new RegExp(`^VITE_APP_FEATURE_SKILLS=${value}$`, 'm'))
    }
  })
})

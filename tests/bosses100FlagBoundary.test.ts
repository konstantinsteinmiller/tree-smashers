// ─── Bosses100 flag boundary: static guards ─────────────────────────────────
//
// The bosses100-off build is only free of the stage-101+ boss feature because
// of a handful of structural rules (src/bosses/bosses100Gate.ts header) — the
// same ones the skills gate follows. A single stray import breaks it silently
// (the game still works, it just ships the feature again), so the rules are
// pinned here at source level; the shipped bytes are checked by
// tests/platforms/bosses100FlagPurity.test.ts and the runtime by
// tests/bosses100FlagOff.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

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
const src = (file: string) => FILES.find(f => f.file === file)!.text
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const GATE = 'src/bosses/bosses100Gate.ts'

/** The feature: only ever reached through the gate. */
const FEATURE_MODULE = [
  /^src\/use\/bosses\/[^/]+\.ts$/,
  /^src\/components\/atoms\/(BossIntroCard|BossTraitGlyph|BossTrophyCard)\.vue$/,
  /^src\/components\/organisms\/BossLabModal\.vue$/
]
const isFeatureModule = (file: string) => FEATURE_MODULE.some(re => re.test(file))
/** Pure, unobfuscated data shared code may import statically (gate header). */
const BOUNDARY_DATA = ['src/data/bossEncounters.ts', 'src/data/bossArt.ts']
const isDevOnly = (file: string) => file.startsWith('src/dev/')

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
  const code = stripComments(text)
  for (const m of code.matchAll(/\bimport\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    // `import { type A, type B } from` is type-only too.
    const clause = m[0]
    const onlyTypes = /\{([^}]*)\}/.exec(clause)?.[1]?.split(',').map(s => s.trim()).filter(Boolean).every(s => s.startsWith('type ')) ?? false
    out.push({ spec: m[2]!, typeOnly: !!m[1] || (onlyTypes && !/^import\s+\w+\s*,/.test(clause)), dynamic: false })
  }
  for (const m of code.matchAll(/\bexport\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[2]!, typeOnly: !!m[1], dynamic: false })
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const before = code.slice(Math.max(0, m.index! - 8), m.index!)
    out.push({ spec: m[1]!, typeOnly: /typeof\s*$/.test(before), dynamic: true })
  }
  return out
}

describe('rule 1 — only the gate reads VITE_APP_FEATURE_BOSSES100', () => {
  it('no other source file reads the literal', () => {
    const readers = FILES.filter(f => /import\.meta\.env\.VITE_APP_FEATURE_BOSSES100\b/.test(f.text)).map(f => f.file)
    expect(readers).toEqual([GATE])
  })

  it('the gate derives BOSSES100_BUILD from the literal, and every lazy import sits behind it', () => {
    const gate = src(GATE)
    expect(gate).toMatch(/export const BOSSES100_BUILD: boolean = import\.meta\.env\.VITE_APP_FEATURE_BOSSES100 === 'true'/)
    const statements = gate.split(/\n(?=export |const |let )/)
    const unguarded = statements.filter(s => /\bimport\(/.test(s.replace(/typeof import\(/g, '')) && !/BOSSES100_BUILD/.test(s))
    expect(unguarded).toEqual([])
    // The Boss Lab stays DEV-only on top of the flag.
    expect(gate).toMatch(/export const BossLabUi = import\.meta\.env\.DEV && BOSSES100_BUILD/)
  })
})

describe('rule 2 — the feature is reached only through the gate', () => {
  it('no runtime import of a feature module from shared code', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (isFeatureModule(f.file) || isDevOnly(f.file) || f.file === GATE) continue
      for (const imp of importsOf(f.text)) {
        const target = resolveSpec(imp.spec)
        if (target && isFeatureModule(target) && !imp.typeOnly) bad.push(`${f.file} → ${imp.spec}${imp.dynamic ? ' (dynamic)' : ''}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('no dynamic import of a feature module anywhere but the gate', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (f.file === GATE || isDevOnly(f.file)) continue
      for (const imp of importsOf(f.text)) {
        const target = resolveSpec(imp.spec)
        if (imp.dynamic && !imp.typeOnly && target && isFeatureModule(target)) bad.push(`${f.file} → ${imp.spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('shared code that imports the boundary data at runtime also reads BOSSES100_BUILD', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (isFeatureModule(f.file) || isDevOnly(f.file) || BOUNDARY_DATA.includes(f.file)) continue
      const runtime = importsOf(f.text).some(imp => !imp.typeOnly && BOUNDARY_DATA.includes(resolveSpec(imp.spec) ?? ''))
      if (runtime && !/\bBOSSES100_BUILD\b/.test(stripComments(f.text))) bad.push(f.file)
    }
    expect(bad).toEqual([])
  })
})

describe('rule 3 — the boundary modules pull in nothing obfuscated', () => {
  it('src/bosses/* imports only vue, other boundary modules, or types', () => {
    const bad: string[] = []
    for (const f of FILES.filter(x => x.file.startsWith('src/bosses/'))) {
      for (const imp of importsOf(f.text)) {
        if (imp.typeOnly || imp.dynamic) continue
        if (imp.spec === 'vue' || imp.spec.startsWith('@/bosses/')) continue
        bad.push(`${f.file} → ${imp.spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the boundary data imports only types (bossArt: plus the shared URL helper)', () => {
    const bad: string[] = []
    for (const file of BOUNDARY_DATA) {
      for (const imp of importsOf(src(file))) {
        if (imp.typeOnly) continue
        if (file === 'src/data/bossArt.ts' && (imp.spec === '@/utils/function' || imp.spec === '@/use/badgeIconArt')) continue // the shared URL helper + the painted-badge path helper
        bad.push(`${file} → ${imp.spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the encounter table is side-effect free at module scope (tree-shakes when unused)', () => {
    // Every top-level call that builds a value is annotated pure (raw text:
    // the annotation IS a comment).
    const raw = src('src/data/bossEncounters.ts')
    const unannotated = [...raw.matchAll(/^(?:export )?const \w+[^=\n]*= (?!\/\* @__PURE__ \*\/)(Object\.freeze|new Map)\b/gm)].map(m => m[0])
    expect(unannotated).toEqual([])
    expect(raw.match(/\/\* @__PURE__ \*\//g)?.length).toBeGreaterThanOrEqual(6) // 7 before LG7 moved the league mapping out
  })
})

describe('campaign, peek, shop and arena: every runtime use folds on BOSSES100_BUILD', () => {
  it('the campaign fields an encounter only on a bosses100 build', () => {
    expect(src('src/use/useSpinnerCampaign.ts')).toMatch(/const encounter = BOSSES100_BUILD && cycle > 0 \? encounterForSlot\(layoutSlot\(id\)\) : null/)
  })

  it('the peek names an encounter only on a bosses100 build', () => {
    expect(src('src/use/bossPeek.ts')).toMatch(/\.\.\.\(BOSSES100_BUILD && boss\.bossEncounterId/)
  })

  it('the skin shop hides unowned trophy cards on an off build', () => {
    const modal = src('src/components/organisms/SmasherTeamModal.vue')
    // 2026-10-23: the picker lists the default, the smasher's own skin and the trophies (all of them on a flagged build, owned ones otherwise)
    expect(modal).toMatch(/const trophies = BOSSES100_BUILD \? all\.filter\(id => isEarnOnlySkin\(id\)\) : all\.filter\(id => isEarnOnlySkin\(id\) && isSkinOwned\(topId, id\)\)/)
    expect(modal).toContain('v-for="modelId in pickerSkins"')
    expect(modal).toMatch(/const n = BOSSES100_BUILD \? trophySkinFirstStage\(modelId\) : null/)
  })

  it('the arena renders boss surfaces only through gate handles and grants only through the lazy glue', () => {
    const arena = src('src/views/SpinnerArena.vue')
    for (const ui of ['BossIntroCardUi', 'BossTraitGlyphUi', 'BossTrophyCardUi', 'BossLabUi']) {
      expect(arena, ui).toMatch(new RegExp(`:is="${ui}"`))
    }
    expect(arena).not.toMatch(/^\s*(BossIntroCard|BossTraitGlyph|BossTrophyCard)[.(]/m)
    expect(arena).toMatch(/\(BOSSES100_BUILD && bossUi\.value \? bossUi\.value\.grantBossTrophies\(input, grant\) : \[\]\)/)
    expect(arena).toMatch(/const bossesReady: Promise<void> = BOSSES100_BUILD\n\s+\? Promise\.all\(\[loadBossArenaUi\(\), loadBossTraitEngine\(\)\]\)/)
    expect(arena).toMatch(/if \(BOSSES100_BUILD && !bossesLoaded\) \{\n\s+await bossesReady/)
    expect(src('src/components/atoms/BossPeekBadge.vue')).toMatch(/:is="BossTraitGlyphUi"/)
  })
})

describe('engine: every trait path is behind the literal and the port', () => {
  const engine = src('src/use/useSpinnerGame.ts')
  const code = stripComments(engine)

  it('trait rules and VFX come only through the installed port', () => {
    expect(engine).toMatch(/bossPort = BOSSES100_BUILD \? port : null/)
    for (const imp of importsOf(engine)) {
      const target = resolveSpec(imp.spec)
      if (target?.startsWith('src/use/bosses/')) expect(imp.typeOnly, imp.spec).toBe(true)
    }
    for (const fn of ['applyEmberBurn', 'beginTeamTurnTraits', 'bossClockHashPart', 'createBossClock', 'createTraitContactResult',
      'createTraitHudRow', 'emberVictimMask', 'endTeamTurnTraits', 'hasBossTraits', 'hasLivingEmberCarrier', 'chillSpeedMul',
      'initTraitVictim', 'isFrostLockedFor', 'novaCharge', 'onTraitContact', 'resetBossClock', 'tickBossClock', 'traitHashPart',
      'writeTraitHud', 'bossTraitVfxEvent', 'createBossTraitVfx', 'prepareBossTraitVfx', 'renderBossAura', 'renderBossTraitLayer',
      'renderChillOverlay', 'renderEmberCharge', 'renderIceShell', 'resetBossTraitVfx', 'tickBossTraitVfx', 'drawBossTraitGlyph',
      'isBossTraitGlyph', 'requestBossTraitSfx', 'playBossSfx']) {
      const bare = code.match(new RegExp(`(?<![.\\w])${fn}\\(`, 'g')) ?? []
      expect(bare, fn).toEqual([])
    }
    // The preallocated event objects come from the port (no kind literal here).
    expect(code).not.toMatch(/kind: 'nova'|kind: 'freeze_crack'/)
  })

  it('every trait hook folds on BOSSES100_BUILD', () => {
    expect(engine).toMatch(/if \(BOSSES100_BUILD && bossPort !== null\) \{\n\s+const bp = bossPort\n/)
    expect(engine.match(/if \(!BOSSES100_BUILD \|\| !traitsActive \|\| bossPort === null\) return/g)?.length).toBe(2)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive && bossPort!\['tickBossClock'\]\(/)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive\) bossPort!\['tickBossTraitVfx'\]\(/)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive\) publishTraitHud\(\)/)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive && a\.owner !== b\.owner/)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive\) renderTraitLayer\(ctx\)/)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && traitsActive\) e \+= /)
    expect(engine).toMatch(/if \(BOSSES100_BUILD && blade\.chillN && bossPort !== null\) spd \*= bossPort\['chillSpeedMul'\]\(blade\)/)
    // No trait condition that skips the literal — except the one INSIDE the
    // guarded initGame block above (`if (BOSSES100_BUILD && bossPort !== null)`).
    expect(code.match(/(?<!&& )\btraitsActive\) /g) ?? []).toHaveLength(1)
    const inner = engine.indexOf('      if (traitsActive) {')
    expect(engine.lastIndexOf('if (BOSSES100_BUILD && bossPort !== null) {', inner)).toBeGreaterThan(inner - 400)
  })

  it('boss SFX names live only in the feature module', () => {
    const offenders = FILES
      .filter(f => !isFeatureModule(f.file) && !isDevOnly(f.file))
      .filter(f => /audio\/sfx\/boss-/.test(stripComments(f.text)))
      .map(f => f.file)
    expect(offenders).toEqual([])
  })
})

describe('build config', () => {
  const config = read(path.join(ROOT, 'vite.config.ts'))

  it('asserts the flag is exactly "true" or "false"', () => {
    expect(config).toMatch(/for \(const flag of \['VITE_APP_FEATURE_SKILLS', 'VITE_APP_FEATURE_BOSSES100'/)
  })

  it('never obfuscates the boundary (gate dir + the two data modules)', () => {
    expect(config).toContain('/src[\\\\/]bosses[\\\\/]/')
    expect(config).toContain('/data[\\\\/]boss(Encounters|Art)\\.ts$/')
  })

  it('reserves the trait / event-kind literals of the folded engine glue', () => {
    expect(config).toMatch(/'\^\(nova\|burn\|frost_touch\|freeze\|freeze_crack\|thaw\|chill\|chill_fade\|ember\|frost\|snowflake\)\$'/)
  })

  it('names every trait-port member in bracket form and reserves it (else the name outlives the folded call)', () => {
    const engine = read(path.join(ROOT, 'src/use/useSpinnerGame.ts'))
    const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // A dotted access becomes an obfuscator-made literal `reservedStrings`
    // cannot protect — only the bracket form's original literal is reserved.
    expect(code.match(/\b(?:bossPort!?|bossPort\?|bp)\.[A-Za-z_]/g) ?? []).toEqual([])
    const members = new Set<string>()
    for (const m of code.matchAll(/\b(?:bossPort!?|bossPort\?\.|bp)\['([A-Za-z_]+)'\](?:\['([A-Z_]+)'\])?/g)) {
      members.add(m[1]!)
      if (m[2]) members.add(m[2])
    }
    expect(members.size).toBeGreaterThan(20)
    const line = config.split('\n').find(l => l.includes('\'^(BOSS_TRAIT_TUNING|'))!
    const reserved = new RegExp(line.trim().replace(/^'|',?$/g, ''))
    const missing = [...members].filter(n => !reserved.test(n))
    expect(missing).toEqual([])
  })

  it('strips the boss SFX from a bosses100-off build', () => {
    expect(config).toMatch(/if \(!bosses100Build\) \{\n\s+plugins\.push\(\{\n\s+name: 'strip-boss-trait-sfx'/)
  })

  it('the base .env ships the feature off; dev and CrazyGames opt in', () => {
    const env = (f: string) => {
      try {
        return read(path.join(ROOT, f))
      } catch {
        return null
      }
    }
    for (const [file, value] of [['.env', 'false'], ['.env.development', 'true'], ['.env.crazy-web.local', 'true']]) {
      const text = env(file!)
      if (text !== null) expect(text, file).toMatch(new RegExp(`^VITE_APP_FEATURE_BOSSES100=${value}$`, 'm'))
    }
  })
})

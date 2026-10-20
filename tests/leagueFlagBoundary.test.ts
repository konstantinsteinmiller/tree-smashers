// ─── League flag boundary: static guards ────────────────────────────────────
//
// The league-off build is only league-free because of a handful of structural
// rules (src/league/leagueGate.ts header) — the same ones the skills and
// bosses100 gates follow. A single stray import breaks it silently (the game
// still works, it just ships the league again), so the rules are pinned here
// at source level; the shipped bytes are checked by
// tests/platforms/leagueFlagPurity.test.ts and the gate's runtime answers by
// tests/leagueGate.test.ts.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const GATE = 'src/league/leagueGate.ts'
const LEAGUE_DIR = 'src/league/'
const isLeague = (file: string) => file.startsWith(LEAGUE_DIR)
const isDevOnly = (file: string) => file.startsWith('src/dev/')

/** League modules the Cloudflare Worker bundles too (plan F5). Listed by name
 *  so a file that joins the list later is checked from the day it exists,
 *  plus whatever the worker actually imports from src/. */
const WORKER_SHARED_NAMES = ['src/league/leagueMath.ts', 'src/league/leagueNpc.ts']

/** '@/x/y' → 'src/x/y.<ext>' (the file that exists), else null. */
const resolveSpec = (spec: string, from?: string): string | null => {
  let base: string
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.') && from) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))
  else return null
  for (const cand of [base, `${base}.ts`, `${base}.vue`, `${base}/index.ts`]) if (FILES.some(f => f.file === cand)) return cand
  return null
}

interface Imp { spec: string; typeOnly: boolean; dynamic: boolean }
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
  for (const m of code.matchAll(/\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
    // `typeof import('x')` in a type position is not a runtime import.
    const before = code.slice(Math.max(0, m.index! - 8), m.index!)
    out.push({ spec: m[1]!, typeOnly: /typeof\s*$/.test(before), dynamic: true })
  }
  return out
}

describe('rule 1 — only the gate reads the league env literals', () => {
  for (const name of ['VITE_APP_FEATURE_LEAGUE', 'VITE_APP_LEAGUE_UNLOCK_STAGE', 'VITE_APP_KIDS']) {
    it(`no other source file reads import.meta.env.${name}`, () => {
      const readers = FILES.filter(f => new RegExp(`import\\.meta\\.env\\.${name}\\b`).test(f.text)).map(f => f.file)
      expect(readers).toEqual([GATE])
    })
  }

  it('the gate derives LEAGUE_BUILD / LEAGUE_KIDS from the literals, and every lazy import sits behind LEAGUE_BUILD', () => {
    const gate = src(GATE)
    expect(gate).toMatch(/export const LEAGUE_BUILD: boolean = import\.meta\.env\.VITE_APP_FEATURE_LEAGUE === 'true'/)
    expect(gate).toMatch(/export const LEAGUE_KIDS: boolean = import\.meta\.env\.VITE_APP_KIDS === 'true'/)
    expect(gate).toMatch(/export const LEAGUE_ONLINE: boolean = LEAGUE_BUILD && LEADERBOARD_LIVE && !LEAGUE_KIDS/)
    // Any top-level statement with a runtime import() must also mention
    // LEAGUE_BUILD (a ternary / if on the literal).
    const statements = stripComments(gate).split(/\n(?=export |const |let )/)
    const unguarded = statements.filter(s => /\bimport\(/.test(s.replace(/typeof import\(/g, '')) && !/LEAGUE_BUILD/.test(s))
    expect(unguarded).toEqual([])
  })

  it('the mount gate checks the build flag first', () => {
    expect(src(GATE)).toMatch(/export const leagueMountAllowed = \(stage: number\): boolean => \{\n\s+if \(!LEAGUE_BUILD\) return false/)
  })
})

describe('rule 2 — no import() in src/league except the gate', () => {
  it('only the gate has runtime dynamic imports', () => {
    const bad: string[] = []
    for (const f of FILES.filter(x => isLeague(x.file) && x.file !== GATE)) {
      for (const imp of importsOf(f.text)) if (imp.dynamic && !imp.typeOnly) bad.push(`${f.file} → ${imp.spec}`)
    }
    expect(bad).toEqual([])
  })
})

describe('rule 3 — the league is reached only through the gate', () => {
  it('no runtime import of a src/league module from outside, except the gate', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (isLeague(f.file) || isDevOnly(f.file)) continue
      for (const imp of importsOf(f.text)) {
        const target = resolveSpec(imp.spec, f.file)
        if (target && isLeague(target) && target !== GATE && !imp.typeOnly) {
          bad.push(`${f.file} → ${imp.spec}${imp.dynamic ? ' (dynamic)' : ''}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('nothing outside src/league dynamically imports the gate (it is a static boundary)', () => {
    const bad: string[] = []
    for (const f of FILES) {
      if (isLeague(f.file)) continue
      for (const imp of importsOf(f.text)) {
        if (imp.dynamic && !imp.typeOnly && resolveSpec(imp.spec, f.file) === GATE) bad.push(f.file)
      }
    }
    expect(bad).toEqual([])
  })

  it('the gate statically imports only vue, src/league modules and the leaderboard account gate', () => {
    // The account gate (`leaderboardAuthorized`) lives in useLiveLeaderboard,
    // which is statically in every build's entry graph already — importing it
    // here adds nothing to a league-off bundle. `vue` (defineAsyncComponent for
    // the UI handles) is in every entry graph too.
    const allowed = new Set(['@/use/useLiveLeaderboard', 'vue'])
    const bad: string[] = []
    for (const imp of importsOf(src(GATE))) {
      if (imp.typeOnly || imp.dynamic) continue
      if (imp.spec.startsWith('@/league/') || allowed.has(imp.spec)) continue
      bad.push(imp.spec)
    }
    expect(bad).toEqual([])
  })

  it('the storage keys module imports nothing (a pure string boundary)', () => {
    expect(importsOf(src('src/league/leagueKeys.ts'))).toEqual([])
  })

  it('no shared code names the league storage keys directly', () => {
    const offenders = FILES
      .filter(f => !isLeague(f.file) && !isDevOnly(f.file))
      .filter(f => /['"`](smashers_league|treesmashers_league_pool)['"`]/.test(stripComments(f.text)))
      .map(f => f.file)
    expect(offenders).toEqual([])
  })
})

describe('rule 4 — worker-shared league modules are pure (F5)', () => {
  /** Worker-shared files: the named ones that exist, plus every src/ file the
   *  worker imports — each followed through its relative imports. */
  const workerShared = (): string[] => {
    const roots = new Set(WORKER_SHARED_NAMES.filter(f => FILES.some(x => x.file === f)))
    const workerSrc = path.join(ROOT, 'worker/src')
    if (existsSync(workerSrc)) {
      for (const wf of walk(workerSrc)) {
        const from = rel(wf)
        for (const imp of importsOf(read(wf))) {
          if (!imp.spec.startsWith('.')) continue
          const target = resolveSpec(imp.spec, from)
          if (target?.startsWith('src/')) roots.add(target)
        }
      }
    }
    const seen = new Set<string>()
    const queue = [...roots]
    while (queue.length) {
      const f = queue.pop()!
      if (seen.has(f)) continue
      seen.add(f)
      for (const imp of importsOf(src(f))) {
        const target = imp.spec.startsWith('.') ? resolveSpec(imp.spec, f) : null
        if (target) queue.push(target)
      }
    }
    return [...seen].sort()
  }

  it('use relative imports only and never read import.meta.env', () => {
    const bad: string[] = []
    const shared = workerShared()
    // leagueMath (LG0) exists from batch 1 on, and pulls in use/leagueTiers.
    expect(shared).toContain('src/league/leagueMath.ts')
    for (const f of shared) {
      const code = stripComments(src(f))
      if (/import\.meta\.env/.test(code)) bad.push(`${f}: import.meta.env`)
      for (const imp of importsOf(src(f))) {
        if (imp.typeOnly) continue
        if (!imp.spec.startsWith('.')) bad.push(`${f} → ${imp.spec}`)
      }
      if (/['"]@\//.test(code)) bad.push(`${f}: '@/' specifier`)
    }
    expect(bad).toEqual([])
  })
})

describe('rule 5 — consumers call the arena bridge in bracket form, names reserved', () => {
  const config = read(path.join(ROOT, 'vite.config.ts'))
  const line = config.split('\n').find(l => l.includes("'^(createLeagueBattle|"))!

  it('the bridge members are reserved strings', () => {
    expect(line).toBeDefined()
  })

  it('no dotted bridge call outside src/league, and every bracket member is reserved', () => {
    const reserved = new RegExp(line.trim().replace(/^'|',?$/g, ''))
    const dotted: string[] = []
    const missing: string[] = []
    for (const f of FILES.filter(x => !isLeague(x.file) && !isDevOnly(x.file))) {
      const code = stripComments(f.text)
      for (const m of code.matchAll(/\bleagueBridge(?:\.value)?(?:!|\?)?\.(?!value\b)([A-Za-z_]+)/g)) dotted.push(`${f.file}: ${m[0]}`)
      for (const m of code.matchAll(/\bleagueBridge(?:\.value)?(?:!|\?\.)?\['([A-Za-z_]+)'\]/g)) {
        if (!reserved.test(m[1]!)) missing.push(`${f.file}: ${m[1]}`)
      }
    }
    expect(dotted).toEqual([])
    expect(missing).toEqual([])
  })
})

describe('build config', () => {
  const config = read(path.join(ROOT, 'vite.config.ts'))

  it('never obfuscates src/league (gate included)', () => {
    expect(config).toContain('/src[\\\\/]league[\\\\/]/')
    const re = /src[\\/]league[\\/]/
    expect(re.test('C:\\repo\\src\\league\\leagueGate.ts')).toBe(true)
    expect(re.test('/repo/src/league/leagueGate.ts')).toBe(true)
  })

  it('keeps "true" / "false" out of the string array (F1)', () => {
    expect(config).toMatch(/reservedStrings: \[\s*'\^true\$', '\^false\$'/)
  })

  it('asserts the league flag and the kids flag are exactly "true" or "false", and the unlock stage a positive integer', () => {
    expect(config).toMatch(/for \(const flag of \[[^\]]*'VITE_APP_FEATURE_LEAGUE'[^\]]*\]\)/)
    expect(config).toMatch(/for \(const flag of \[[^\]]*'VITE_APP_KIDS'[^\]]*\]\)/)
    expect(config).toMatch(/VITE_APP_LEAGUE_UNLOCK_STAGE must be a positive integer/)
  })

  it('pins the obfuscator seed (reproducible builds, O-S)', () => {
    expect(config).toMatch(/\n\s+seed: 0x[0-9a-f]+,/)
  })

  it('registers the virtual:league-pool stub', () => {
    expect(config).toMatch(/const LEAGUE_POOL_VIRTUAL_ID = 'virtual:league-pool'/)
    expect(config).toMatch(/plugins\.push\(leaguePoolPlugin\(leagueBuild\)\)/)
  })

  // The .env files are git-ignored, so this only runs where they exist.
  it('the base .env ships the league off at stage 13 and not kids; dev unlocks at 13 too; Tauri + GD are kids', () => {
    const env = (f: string) => { try { return read(path.join(ROOT, f)) } catch { return null } }
    const expected: [string, string, string][] = [
      ['.env', 'VITE_APP_FEATURE_LEAGUE', 'false'],
      ['.env', 'VITE_APP_LEAGUE_UNLOCK_STAGE', '13'],
      ['.env', 'VITE_APP_KIDS', 'false'],
      ['.env.development', 'VITE_APP_FEATURE_LEAGUE', 'true'],
      ['.env.development', 'VITE_APP_LEAGUE_UNLOCK_STAGE', '13'],
      ['.env.tauri', 'VITE_APP_KIDS', 'true'],
      ['.env.game-distribution.local', 'VITE_APP_KIDS', 'true']
    ]
    for (const [file, key, value] of expected) {
      const text = env(file)
      if (text !== null) expect(text, `${file} ${key}`).toMatch(new RegExp(`^${key}=${value}$`, 'm'))
    }
  })
})

describe('LG6 — SpinnerArena reaches the league only through gate handles and bracket calls', () => {
  const ARENA = 'src/views/SpinnerArena.vue'
  const text = () => src(ARENA)
  const code = () => stripComments(text()).replace(/^\s*\/\/-.*$/gm, '')

  /** The only runtime names the arena may take from the gate. */
  const ALLOWED = new Set([
    'LeagueHudButtonUi', 'LeagueHubUi', 'LeagueResultPanelUi', 'LeagueUnlockPopupUi', 'LeagueSeasonRewardModalUi',
    'LEAGUE_BUILD', 'loadLeague', 'loadLeagueBridge', 'leagueMountAllowed'
  ])

  it('imports only the gate at runtime (other league modules type-only), and only the allowed names', () => {
    const bad: string[] = []
    for (const imp of importsOf(text())) {
      const target = resolveSpec(imp.spec, ARENA)
      if (!target || !isLeague(target)) continue
      if (target !== GATE && !imp.typeOnly) bad.push(`runtime import of ${imp.spec}`)
    }
    for (const m of stripComments(text()).matchAll(/\bimport\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@\/league\/leagueGate['"]/g)) {
      if (m[1]) continue
      for (const raw of m[2]!.split(',').map(x => x.trim()).filter(Boolean)) {
        if (raw.startsWith('type ')) continue
        const name = raw.split(/\s+as\s+/)[0]!.trim()
        if (!ALLOWED.has(name)) bad.push(`gate name ${name}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('renders every league handle behind a v-if on the handle itself', () => {
    const tpl = text().slice(text().indexOf('<template lang="pug">'))
    for (const h of ['LeagueHudButtonUi', 'LeagueHubUi', 'LeagueResultPanelUi', 'LeagueUnlockPopupUi', 'LeagueSeasonRewardModalUi']) {
      const uses = [...tpl.matchAll(new RegExp(`:is="${h}"`, 'g'))]
      expect(uses.length, h).toBeGreaterThan(0)
      // The HUD button sits inside a wrapper whose v-if names the handle.
      expect(tpl, h).toMatch(new RegExp(`v-if="${h} &&`))
    }
  })

  it('calls every bridge member in bracket form, each reserved, and every league branch sits behind LEAGUE_BUILD', () => {
    const c = code()
    expect(c).not.toMatch(/\bleagueBridge(?:\.value)?\??\.(?!value\b)[A-Za-z_]/)
    const members = [...c.matchAll(/\bleagueBridge\.value\?\.\['([A-Za-z_]+)'\]/g)].map(m => m[1])
    expect(new Set(members)).toEqual(new Set(['createLeagueBattle', 'finishLeagueBattle', 'loadLeagueDeck', 'fetchLeagueTop', 'measureLeague', 'previewSeasonReward']))
    // The two loaders and the finish call are reached only on a league build.
    expect(c).toMatch(/if \(!LEAGUE_BUILD\) return\s+void Promise\.all\(\[loadLeague\(\), loadLeagueBridge\(\)\]\)/)
    expect(c).toMatch(/if \(LEAGUE_BUILD && leagueSession\.value\) \{\s+const fin = leagueBridge\.value\?\.\['finishLeagueBattle'\]/)
  })

  it('names no league marker string (keys, routes, data-league, the measure pair)', () => {
    const c = code()
    expect(c).not.toMatch(/['"`](smashers_league|treesmashers_league_pool)/)
    // Route strings (the '@/league/…' import specifiers aside).
    expect(c.replace(/['"]@\/league\/[^'"]+['"]/g, '')).not.toMatch(/\/league\//)
    expect(c).not.toMatch(/data-league/)
    expect(c).not.toMatch(/['"]league['"],\s*['"][a-z_]+['"]/)
  })
})

// ─── Feature-flag bundle audit ────────────────────────────────────────────
//
// Proves that a build-time feature flag (`VITE_APP_FEATURE_<X>`) really
// removes its feature from the SHIPPED bytes, not just from the screen.
//
//   node scripts/feature-flag-audit.mjs --flag skills
//   node scripts/feature-flag-audit.mjs --flag skills --mode crazy-web --state off
//   node scripts/feature-flag-audit.mjs --flag league --mode poki --json
//   node scripts/feature-flag-audit.mjs --flag skills --reuse     (re-scan, no build)
//   node scripts/feature-flag-audit.mjs --flag bosses100
//
// For every requested flag state (off / on) it builds the platform TWICE, each
// in a forked child process (see "Why forked" below):
//
//   • obfuscated — exactly what ships (the mode's own VITE_ENABLE_OBFUSCATION)
//   • twin       — the same build with the obfuscator off
//
// and scans every emitted file for the flag's markers: storage keys, asset
// file names, component / chunk names and ids that only exist in the feature's
// code. Both builds matter. The obfuscator's string array keeps plain strings
// greppable, but it also used to stop `import.meta.env` comparisons from
// folding at random (league plan F1 / batch-3 Q1), so a clean twin proves
// nothing about the shipped build — only the obfuscated build does. The twin
// is what makes a hit readable (which module, which line).
//
// Expectations (exit code 1 when violated):
//   off → zero marker hits outside the allowed residue, zero feature chunks,
//         zero feature public files;
//   on  → at least one feature chunk AND at least one marker hit (so a marker
//         list that silently stopped matching anything cannot pass "off").
//
// Allowed residue: translation strings in the lazy per-locale chunks (the
// locale files are shared by every build; accepted as O9 in the league plan).
//
// Why forked: Vite's `loadEnv` lets process.env VITE_* override the .env
// files. Building in-process from a test runner inherits whatever another
// suite stubbed; a child with a scrubbed env is exactly `pnpm build:<mode>`.
//
// Adding a flag: add an entry to FLAGS below. Keep markers SPECIFIC — a word
// that also appears in shared code (e.g. "momentum") makes "off" unfalsifiable.

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @typedef {{ env: string, markers: (string|RegExp)[], chunks: RegExp[], publicFiles: RegExp[] }} FlagDef */

/** @type {Record<string, FlagDef>} */
export const FLAGS = {
  skills: {
    env: 'VITE_APP_FEATURE_SKILLS',
    markers: [
      // storage keys (src/skills/skillKeys.ts)
      'smashers_skills', 'smashers_skill_loadout', 'smashers_skill_ui',
      // synthesised SFX (src/use/skills/skillSfx.ts)
      'skill-shield', 'skill-rocket', 'skill-zap', 'skill-drumroll',
      // component names (Vue keeps `__name` in production)
      'SkillPickerModal', 'SkillRevealOverlay', 'SkillsIntroScreen', 'SkillHudIcon',
      'SkillDropChip', 'SkillSlotTile', 'SkillIntroDemo', 'SkillTopUpButton', 'SkillIcon',
      'PvpVsPreview', 'TeamSkillsSection', 'PvpReadySkills',
      // skill ids (catalog, runtime, engine glue); "momentum" is too generic
      'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets',
      'opening_salvo', 'hazard_ward', 'static_charge', 'mirror_plate',
      // skill-port members the engine calls (a dotted call left them in the
      // obfuscated string array after the call folded — final check, batch 4)
      'createBladeSkills', 'outgoingSkillMul', 'incomingSkill', 'onEnemyContact', 'teamSalvoPct', 'salvoDamage',
      'createSkillVfx', 'resetSkillVfx', 'tickSkillVfx', 'skillVfxEvent', 'renderSkillLayer', 'renderBladeSkillFx',
      'skillBladeAlpha', 'drawSkillGlyph',
      // pokiMeasure category + dev globals
      /['"]skills['"],\s*['"](?:intro|reveal)['"]/, '__skillVfx',
      // per-smasher skill text (use/skills/smasherSkillText.ts, read by the team modal)
      'smasherSkillDescParams'
    ],
    // Chunk stems (file name minus hash). `skillCore` is deliberately absent:
    // it is the string-free HP-loss core the engine and the boss traits use
    // on every build (allowed residue, reported by size in the hot path).
    chunks: [
      /^Skills?[A-Z]/, /^PvpVsPreview$/, /^PvpReadySkills$/, /^TeamSkillsSection$/, /^useSkills$/,
      /^skill(Runtime|Vfx|Sfx|Engine|Text|RevealGate|Catalog|LoadoutSanitizer)$/, /^smasherSkillText$/, /^arenaSkills$/, /^ghostSkills$/
    ],
    publicFiles: [/(^|\/)audio\/sfx\/skill-[^/]+$/]
  },
  bosses100: {
    env: 'VITE_APP_FEATURE_BOSSES100',
    markers: [
      // encounter ids (data/bossEncounters.ts); the `stages.boss_*` names in
      // the per-locale chunks are the allowed residue
      'cinder_tyrant', 'glacier_warden', 'frostbite_yeti', 'twin_pyres', 'blizzard_choir',
      'shattering_glacier', 'frostfire_pact', 'magma_titan', 'blizzard_twins', 'elemental_court',
      // synthesised SFX (use/bosses/bossTraitSfx.ts) and the crest files (data/bossArt.ts)
      'boss-ember-pulse', 'boss-freeze', 'boss-crack', 'boss-chill', 'boss-badges/',
      // component names (Vue keeps `__name` in production) + their DOM hooks
      'BossIntroCard', 'BossTraitGlyph', 'BossTrophyCard', 'BossLabModal', 'data-boss-intro', 'data-boss-trophy',
      // trait event kinds + state fields only the trait rules write
      'frost_touch', 'freeze_crack', 'chill_fade', 'nextNovaAt', 'chillExp', 'lastChillAt'
    ],
    chunks: [
      /^Boss(IntroCard|TraitGlyph|TrophyCard|LabModal)$/,
      /^boss(TraitEngine|Traits|TraitVfx|TraitSfx|ArenaUi|Lab|Encounters|Art)$/
    ],
    publicFiles: [/(^|\/)audio\/sfx\/boss-[^/]+$/, /(^|\/)images\/boss-badges\//]
  },
  league: {
    env: 'VITE_APP_FEATURE_LEAGUE',
    markers: [
      // storage keys (src/league/leagueKeys.ts) + the Worker routes (LG3/LG4)
      'smashers_league', 'treesmashers_league_pool', '/league/',
      // component names (Vue keeps `__name` in production) + their DOM hook
      'LeagueHub', 'LeagueHudButton', 'LeagueResultPanel', 'LeagueUnlockPopup', 'LeagueLpBar',
      'LeagueDeltaChip', 'LeagueOpponentCard', 'LeagueSeasonRewardModal', 'LeagueRankBadge', 'LeagueTierIcon',
      'data-league',
      // arena-bridge members (reserved strings; SpinnerArena calls them in
      // bracket form behind LEAGUE_BUILD — LG6)
      'createLeagueBattle', 'finishLeagueBattle',
      // leagueMath: minified exports lose their names, so match what survives
      // — the season epoch expression (LEAGUE_EPOCH_MS) and the names in
      // unminified property form, should a module keep them
      'Date.UTC(2026,9,5)', 'LEAGUE_EPOCH_MS', 'PROMOTION_SHIELDS', 'SERVER_DAILY_CAP',
      // NPC opponent ids (LG1: `npc:<band>:<seed>`) and the pokiMeasure category
      /[`'"]npc:/, /['"]league['"],\s*['"][a-z_]+['"]/
    ],
    // Chunk stems. `leagueGate` / `leagueKeys` are the boundary modules every
    // build imports (unobfuscated, folded); if Rollup ever splits them into a
    // chunk of their own that is not the feature shipping.
    chunks: [/^League/, /^league(?!Gate$|Keys$)/, /^useLeague/],
    publicFiles: [/(^|\/)images\/league[-/]/, /(^|\/)audio\/sfx\/league-[^/]+$/]
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const parseArgs = (argv) => {
  const a = {
    flag: null,
    mode: 'crazy-web',
    states: ['off', 'on'],
    twin: true,
    reuse: false,
    json: false,
    keep: true,
    out: null
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = () => argv[++i]
    if (k === '--flag') a.flag = v()
    else if (k === '--mode' || k === '--platform') a.mode = v()
    else if (k === '--state') a.states = v() === 'both' ? ['off', 'on'] : [argv[i]]
    else if (k === '--no-twin') a.twin = false
    else if (k === '--reuse') a.reuse = true
    else if (k === '--json') a.json = true
    else if (k === '--out') a.out = v()
    else if (k === '--help' || k === '-h') a.help = true
    else throw new Error(`unknown argument ${k}`)
  }
  return a
}

// ─── Build ──────────────────────────────────────────────────────────────────

/** Build `mode` into `outDir` in a scrubbed child process. */
export function buildVariant({ mode, outDir, env: extra }) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('VITE_')) delete env[k]
  // A test runner exports NODE_ENV=test, and Vite then builds in
  // NON-production mode (e.g. @vitejs/plugin-vue stops inlining templates, so
  // every <script setup> binding name ends up in the bundle as a string) —
  // not the bytes that ship. `pnpm build:<mode>` has no NODE_ENV.
  delete env.NODE_ENV
  Object.assign(env, extra)
  fs.rmSync(outDir, { recursive: true, force: true })
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', mode, '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 },
      (err, _out, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve())
    )
  })
}

// ─── Scan ───────────────────────────────────────────────────────────────────

const LOCALES = new Set(
  fs.readdirSync(path.join(ROOT, 'src/i18n/locales'))
    .filter(f => f.endsWith('.ts'))
    .map(f => f.replace(/\.ts$/, ''))
)
/** Lazy per-locale chunk (`de-AbC123.js`) — the allowed i18n residue. */
const isLocaleChunk = (base) => {
  for (const loc of LOCALES) {
    if (base.startsWith(`${loc}-`) && /^[A-Za-z0-9_-]{6,}\.js$/.test(base.slice(loc.length + 1))) return true
  }
  return false
}

const walk = (dir, rel = '') => {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r))
    else out.push(r)
  }
  return out
}

const countMatches = (text, m) => {
  if (typeof m === 'string') {
    let n = 0
    for (let i = text.indexOf(m); i !== -1; i = text.indexOf(m, i + m.length)) n++
    return n
  }
  const re = new RegExp(m.source, m.flags.includes('g') ? m.flags : m.flags + 'g')
  return (text.match(re) || []).length
}

/** Scan one build directory for a flag's footprint. */
export function scanBuild(dir, def) {
  const files = walk(dir)
  const chunks = []
  const hits = []
  const featureChunks = []
  const featurePublic = files.filter(f => def.publicFiles.some(re => re.test(f)))
  let jsBytes = 0
  let hotBytes = 0
  for (const rel of files) {
    const base = path.basename(rel)
    const isJs = rel.endsWith('.js')
    const isText = isJs || rel.endsWith('.css') || rel.endsWith('.html')
    if (!isText) continue
    const text = fs.readFileSync(path.join(dir, rel), 'utf8')
    const bytes = Buffer.byteLength(text)
    if (isJs) {
      jsBytes += bytes
      chunks.push({ file: rel, bytes })
      if (/^(index|App|SpinnerArena)-/.test(base)) hotBytes += bytes
      const stem = base.replace(/-[A-Za-z0-9_-]{6,}\.js$/, '')
      if (def.chunks.some(re => re.test(stem))) featureChunks.push({ file: rel, bytes })
    }
    if (isJs && isLocaleChunk(base)) continue // allowed residue
    for (const m of def.markers) {
      const n = countMatches(text, m)
      if (n > 0) hits.push({ file: rel, marker: String(m), count: n })
    }
  }
  chunks.sort((a, b) => b.bytes - a.bytes)
  return { files: files.length, jsBytes, hotBytes, chunks, featureChunks, featurePublic, hits }
}

const verdict = (state, r) => {
  const problems = []
  if (state === 'off') {
    if (r.hits.length) problems.push(`${r.hits.length} marker hit(s)`)
    if (r.featureChunks.length) problems.push(`${r.featureChunks.length} feature chunk(s)`)
    if (r.featurePublic.length) problems.push(`${r.featurePublic.length} feature public file(s)`)
  } else {
    if (!r.featureChunks.length) problems.push('no feature chunk (flag on but feature absent?)')
    if (!r.hits.length) problems.push('no marker hit (marker list stale?)')
  }
  return problems
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function audit({
                              flag,
                              mode = 'crazy-web',
                              states = ['off', 'on'],
                              twin = true,
                              reuse = false,
                              out = null
                            }) {
  const def = FLAGS[flag]
  if (!def) throw new Error(`unknown flag "${flag}" (known: ${Object.keys(FLAGS).join(', ')})`)
  const baseOut = out ?? path.join(ROOT, 'node_modules/.cache/feature-flag-audit')
  const variants = []
  for (const state of states) {
    for (const kind of twin ? ['obfuscated', 'twin'] : ['obfuscated']) {
      const outDir = path.join(baseOut, `${flag}-${mode}-${state}-${kind}`)
      const env = { [def.env]: state === 'on' ? 'true' : 'false' }
      if (kind === 'twin') env.VITE_ENABLE_OBFUSCATION = 'false'
      variants.push({ state, kind, outDir, env })
    }
  }
  const results = []
  for (const v of variants) {
    const t0 = Date.now()
    if (!reuse || !fs.existsSync(v.outDir)) await buildVariant({ mode, outDir: v.outDir, env: v.env })
    const r = scanBuild(v.outDir, def)
    results.push({ ...v, ...r, buildMs: Date.now() - t0, problems: verdict(v.state, r) })
  }
  return { flag, mode, results, ok: results.every(r => r.problems.length === 0) }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function printReport(rep) {
  console.log(`\nfeature-flag audit — flag=${rep.flag} mode=${rep.mode}\n`)
  for (const r of rep.results) {
    const tag = r.problems.length ? `FAIL (${r.problems.join('; ')})` : 'ok'
    console.log(`■ ${r.state.toUpperCase()} / ${r.kind}: ${tag}`)
    console.log(`  ${r.chunks.length} JS chunks, ${kb(r.jsBytes)} JS, hot path (index/App/SpinnerArena) ${kb(r.hotBytes)}  [${r.outDir}]`)
    if (r.featureChunks.length) console.log(`  feature chunks: ${r.featureChunks.map(c => `${c.file} (${kb(c.bytes)})`).join(', ')}`)
    if (r.featurePublic.length) console.log(`  feature public files: ${r.featurePublic.join(', ')}`)
    if (r.hits.length) {
      const byFile = new Map()
      for (const h of r.hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), `${h.marker}×${h.count}`])
      for (const [f, ms] of byFile) console.log(`  hit ${f}: ${ms.join(', ')}`)
    }
  }
  const pairs = ['obfuscated', 'twin'].map(kind => {
    const off = rep.results.find(r => r.state === 'off' && r.kind === kind)
    const on = rep.results.find(r => r.state === 'on' && r.kind === kind)
    return off && on ? `${kind}: on−off JS ${kb(on.jsBytes - off.jsBytes)}, hot path ${kb(on.hotBytes - off.hotBytes)}` : null
  }).filter(Boolean)
  if (pairs.length) console.log(`\nsize delta — ${pairs.join(' | ')}`)
  console.log(`\n${rep.ok ? 'PASS' : 'FAIL'}\n`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.flag) {
    console.log('usage: node scripts/feature-flag-audit.mjs --flag <skills|bosses100|league> [--mode crazy-web] [--state off|on|both] [--no-twin] [--reuse] [--json] [--out dir]')
    process.exit(args.help ? 0 : 2)
  }
  audit(args).then((rep) => {
    if (args.json) console.log(JSON.stringify(rep, (k, v) => (k === 'chunks' ? v.map(c => `${c.file}:${c.bytes}`) : v), 2))
    else printReport(rep)
    process.exit(rep.ok ? 0 : 1)
  }).catch((e) => {
    console.error(e)
    process.exit(2)
  })
}

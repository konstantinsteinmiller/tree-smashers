// Stage-101+ boss scenarios — balance measurements for bosses-100-feature.md.
//
// Adds the three new boss traits to the skills-sim battle replica WITHOUT
// editing engine.mjs: the engine source is read, patched at fixed anchor
// strings (the run aborts if an anchor drifted), written to out/ and imported.
// So every rule of the shipped loop that engine.mjs replicates stays shared,
// and a later change to engine.mjs flows into these numbers automatically.
//
//   ember  — flame nova every EMBER_PERIOD_MS of COMBAT time (the clock only
//            runs while a launched blade is moving), radius EMBER_RADIUS_MUL ×
//            boss radius (+ the victim's radius), EMBER_PCT of the victim's
//            max HP (min 1), hazard kind 'burn' (Hazard Ward `lava` share,
//            Guard Shell, Second Wind apply). One hit per victim per pulse.
//   frost  — any armed contact with an opponent: victim keeps 10 % speed
//            (Hazard Ward shockKeep applies, shares the 250 ms shock gate).
//            Contact while the frost blade is the LAUNCHED blade: the victim
//            is Frozen for its team's next turn (cannot be launched); never
//            frozen for two turns in a row; FROST_NEVER_SKIP (default) never
//            freezes a team's last launchable blade and thaws an all-frozen
//            team at turn start (0 = the whole turn is skipped instead).
//   chill  — any armed contact with an opponent adds a Chill stack
//            (−CHILL_PER_STACK speed each, max CHILL_MAX); each stack lasts
//            until the end of the victim team's CHILL_TURNS-th turn after
//            the touch; the touch also cuts current velocity by one stack.
//   Phase Step: a phased victim (dodge proc / 300 ms window) ignores frost
//   and chill contacts.
//
// Usage (always through the worker budget; full recipes: bosses-100-feature.md
// Appendix A):
//   B="$HOME/.claude/skills/worker-budget/budget.mjs"
//   node "$B" run --want 10 -- node bosses100.mjs --n 400 --noold //     --configs none,counter,guard_shell+second_wind --rubber 1,0.5 --out out/final.json
//   node bosses100.mjs --report out/final.json
// Options: --slots 110,120 (default: the 10 new encounters; any other slot runs
//            its cycle copy only)
//          --configs none,counter,a+b   (L10 loadouts; counter = ENCOUNTERS[slot].counter)
//          --noold | --oldonly          (new encounter / cycle copy of the slot)
//          --shift -4,0,4               (enemy level offsets for new fights)
//          --levelMode econ|lock  --team default|glass|tank|spiky
//          --set EMBER_PCT=0.03,CHILL_TURNS=2   --rubber 1,0.5 (boss HP multiplier)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import os from 'node:os'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const __file = fileURLToPath(import.meta.url)
// Importing this module (e.g. for ENCOUNTERS) must not start a run.
const isEntry = !!process.argv[1] && resolve(process.argv[1]) === __file

// ─── Tuning knobs (bosses-100-feature.md §4, §8.6) ───────────────────────────────
export const DEFAULT_KNOBS = {
  EMBER_PERIOD_MS: 2000,
  EMBER_RADIUS_MUL: 2.2,
  EMBER_PCT: 0.03,
  FROST_KEEP: 0.1,
  FROST_LOCK: 1, // 0 disables the turn lock (drain only)
  FROST_NEVER_SKIP: 1, // 1 = never freeze a team's last launchable blade (no lost turns)
  CHILL_PER_STACK: 0.1,
  CHILL_MAX: 5,
  CHILL_TURNS: 2,
  CHILL_GATE_MS: 250
}

// ─── The ten encounters (cycle-1 levels = what stage 101-200 fields) ──────
// Read from the game's own table (src/data/bossEncounters.ts, BOSS_ENCOUNTER_TABLE)
// exactly like data.mjs reads BASE_STAGES — never re-typed here. The literal is
// evaluated with a copy of the file's b() helper; sim-only fields (display name,
// counter loadout) are keyed by slot below.
const b = (top, bot, tl, bl, modelId, ability, trait, extra = {}) => {
  const c = { topPartId: top, bottomPartId: bot, topLevel: tl, bottomLevel: bl, modelId, isBoss: true, ...extra }
  if (ability !== 'plain') c.bossAbility = ability
  if (trait) c.bossTrait = trait
  return c
}
const loadEncounterTable = () => {
  const src = readFileSync(`${HERE}../../src/data/bossEncounters.ts`, 'utf8')
  const at = src.indexOf('const BOSS_ENCOUNTER_TABLE')
  if (at < 0) throw new Error('BOSS_ENCOUNTER_TABLE not found in src/data/bossEncounters.ts')
  const open = src.indexOf('[', src.indexOf('=', at))
  let depth = 0
  let i = open
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']' && --depth === 0) break
  }
  return new Function('b', `return (${src.slice(open, i + 1)})`)(b)
}
// Sim-only per slot: report name + the fitting L10 counter pair (§8.4).
const SIM_META = {
  110: { name: 'Cinder Tyrant', counter: 'hazard_ward+guard_shell' },
  120: { name: 'Glacier Warden', counter: 'phase_step+static_charge' },
  130: { name: 'Frostbite Yeti', counter: 'phase_step+second_wind' },
  140: { name: 'Twin Pyres', counter: 'hazard_ward+guard_shell' },
  150: { name: 'Blizzard Choir', counter: 'phase_step+second_wind' },
  160: { name: 'Shattering Glacier', counter: 'phase_step+static_charge' },
  170: { name: 'Frostfire Pact', counter: 'guard_shell+second_wind' },
  180: { name: 'Magma Titan', counter: 'hazard_ward+guard_shell' },
  190: { name: 'Blizzard Twins', counter: 'phase_step+second_wind' },
  200: { name: 'Elemental Court', counter: 'guard_shell+second_wind' }
}
export const ENCOUNTERS = Object.fromEntries(loadEncounterTable().map(enc => {
  const meta = SIM_META[enc.slot]
  if (!meta) throw new Error(`bosses100.mjs: no SIM_META for slot ${enc.slot}`)
  return [enc.slot, { name: meta.name, arena: enc.arenaType, counter: meta.counter, team: enc.enemyTeam }]
}))

// ─── Engine patch ──────────────────────────────────────────────────────────
const patchEngine = () => {
  let src = readFileSync(`${HERE}engine.mjs`, 'utf8')
  const rep = (from, to) => {
    const i = src.indexOf(from)
    if (i < 0) throw new Error(`engine.mjs anchor not found:\n${from}`)
    if (src.indexOf(from, i + 1) >= 0) throw new Error(`engine.mjs anchor not unique:\n${from}`)
    src = src.slice(0, i) + to + src.slice(i + from.length)
  }
  const url = (f) => pathToFileURL(`${HERE}${f}`).href
  rep(`from './data.mjs'`, `from '${url('data.mjs')}'`)
  rep(`from './skills.mjs'`, `from '${url('skills.mjs')}'`)
  // knobs are per battle (opts.knobs), defaulting to DEFAULT_KNOBS
  rep(`  const stage = getStageById(opts.stageId)`,
    `  const stage = opts.stage ?? getStageById(opts.stageId)
  const BX = opts.knobs
  let pTurn = 0
  let bossClock = 0
  let nextPulse = BX.EMBER_PERIOD_MS`)
  rep(`    let spd = st.speedMultiplier\n`,
    `    let spd = st.speedMultiplier * (1 - BX.CHILL_PER_STACK * (b.chillN ?? 0))\n`)
  rep(`    const hp = st.maxHp * (isBoss ? 2 : 1)`,
    `    const hp = st.maxHp * (isBoss ? 2 * (opts.bossHpMul ?? 1) : 1)`)
  rep(`      if (kind === 'lava') dmg *= 1 - hp.lava`,
    `      if (kind === 'lava' || kind === 'burn') dmg *= 1 - hp.lava`)
  rep(`      if (kind === 'lava' || kind === 'thunder') m.hazardTaken += dmg`,
    `      if (kind === 'lava' || kind === 'thunder' || kind === 'burn') m.hazardTaken += dmg
      if (kind === 'burn') m.burnTaken += dmg`)
  rep(`    dmgDealt: 0, dmgTaken: 0, hazardTaken: 0,`,
    `    dmgDealt: 0, dmgTaken: 0, hazardTaken: 0, burnTaken: 0, pulses: 0, freezes: 0, skips: 0,
    chillStacks: 0, chillLaunchSum: 0, launchesP: 0, drains: 0, fizzles: 0, thaws: 0,`)
  rep(`        ...parent.config,
        bossAbility: undefined,
        isBoss: false
      }, false)`, `        ...parent.config,
        bossAbility: undefined,
        bossTrait: parent.config.shardTrait,
        isBoss: false
      }, false)`)
  rep(`          ...em.config,
          bossAbility: undefined,
          isBoss: false`, `          ...em.config,
          bossAbility: undefined,
          bossTrait: undefined,
          isBoss: false`)
  // boss-trait contact effects (after damage + reflections, before skills)
  rep(`      // contact-driven skills
      if (isEnemyPair(a, b)) {`, `      if (a.config.bossTrait || b.config.bossTrait) {
        bossContact(a, b, now)
        bossContact(b, a, now)
      }
      // contact-driven skills
      if (isEnemyPair(a, b)) {`)
  rep(`  // resolveCollision (3099-3592)`, `  const isPhased = (v, now) => v.sk && now < v.sk.phasedUntil
  const setChill = (v, n) => {
    if ((v.chillN ?? 0) !== n) {
      v.chillN = n
      v._st = null
    }
  }
  const pruneChill = (v) => {
    if (!v.chillExp) return
    v.chillExp = v.chillExp.filter(x => x >= pTurn)
    setChill(v, v.chillExp.length)
  }
  // src = trait carrier, v = the touched blade
  const bossContact = (src, v, now) => {
    const trait = src.config.bossTrait
    if (!trait || src.hp <= 0 || v.hp <= 0 || src.owner === v.owner) return
    if (v.owner !== 'player') return // only the player side is affected in the campaign
    if (isPhased(v, now)) return
    if (trait === 'frost') {
      if (now - v.lastShockMs >= 250) {
        v.lastShockMs = now
        const hw = skillOf(v, 'hazard_ward')
        const keep = BX.FROST_KEEP + (hw ? (1 - BX.FROST_KEEP) * P('hazard_ward', hw.level).shockKeep : 0)
        v.vx *= keep
        v.vy *= keep
        m.drains++
      }
      if (BX.FROST_LOCK && launchedId === src.id) {
        const next = pTurn + 1
        const others = BX.FROST_NEVER_SKIP
          ? player.filter(x => x !== v && x.hp > 0 && x.frozenForTurn !== next).length
          : 1
        if (others === 0) m.fizzles++
        else if ((v.freezeImmuneTurn ?? -1) < next && v.frozenForTurn !== next) {
          v.frozenForTurn = next
          v.freezeImmuneTurn = next + 1
          m.freezes++
        }
      }
    } else if (trait === 'chill') {
      if (now - (v.lastChillAt ?? -1e9) < BX.CHILL_GATE_MS) return
      v.lastChillAt = now
      v.chillExp = v.chillExp ?? []
      const exp = pTurn + BX.CHILL_TURNS
      if (v.chillExp.length >= BX.CHILL_MAX) {
        let mi = 0
        for (let i = 1; i < v.chillExp.length; i++) if (v.chillExp[i] < v.chillExp[mi]) mi = i
        v.chillExp[mi] = exp
      } else {
        v.chillExp.push(exp)
        v.vx *= 1 - BX.CHILL_PER_STACK
        v.vy *= 1 - BX.CHILL_PER_STACK
      }
      setChill(v, v.chillExp.length)
      m.chillStacks++
    }
  }
  const emberPulse = () => {
    const hitThisPulse = new Set()
    for (const s of npc) {
      if (s.hp <= 0 || s.config.bossTrait !== 'ember') continue
      const r = s.radius * BX.EMBER_RADIUS_MUL
      for (const t of player) {
        if (t.hp <= 0 || hitThisPulse.has(t.id)) continue
        if (hyp(t.x - s.x, t.y - s.y) > r + t.radius) continue
        hitThisPulse.add(t.id)
        loseHp(t, Math.max(1, t.maxHp * BX.EMBER_PCT), 'burn')
      }
      m.pulses++
    }
  }

  // resolveCollision (3099-3592)`)
  rep(`  const playerLaunch = () => {
    const mine = living(player)
    const foes = living(npc)
    if (!mine.length || !foes.length) return false`, `  const playerLaunch = () => {
    pTurn++
    for (const x of player) pruneChill(x)
    const alive = living(player)
    let mine = alive.filter(x => x.frozenForTurn !== pTurn)
    const foes = living(npc)
    if (alive.length && foes.length && !mine.length) {
      if (BX.FROST_NEVER_SKIP) {
        // never a lost turn: a death after the freeze left only frozen
        // blades → they thaw (§4.2 rule 2)
        m.thaws++
        for (const x of alive) x.frozenForTurn = -1
        mine = alive
      } else {
        m.skips++
        return 'skip'
      }
    }
    if (!mine.length || !foes.length) return false`)
  rep(`    launch(blade, Math.cos(ang), Math.sin(ang), (0.85 + 0.15 * rng()) * maxForce)`,
    `    m.launchesP++
    m.chillLaunchSum += blade.chillN ?? 0
    launch(blade, Math.cos(ang), Math.sin(ang), (0.85 + 0.15 * rng()) * maxForce)`)
  rep(`        if (playerLaunch()) {
          phase = 'player_launched'
          turns++
        }`, `        const pl = playerLaunch()
        if (pl === 'skip') {
          phase = 'npc_turn'
          npcThink = 0
          launchedId = null
          turns++
          for (const b of npc) if (b.statSwitchPhase) {
            b.statSwitchPhase = 'attack'
            b._st = null
          }
        } else if (pl) {
          phase = 'player_launched'
          turns++
        }`)
  rep(`    // rockets in flight (skill)`, `    if (phase === 'player_launched' || phase === 'npc_launched') {
      bossClock += TICK_MS
      // same float slack as the game's tickBossClock (CLOCK_EPS_MS, bossTraits.ts):
      // 1000/60 ms ticks summed in floating point land a hair under whole periods
      if (bossClock >= nextPulse - 1e-6) {
        nextPulse += BX.EMBER_PERIOD_MS
        emberPulse()
      }
    }
    // rockets in flight (skill)`)
  rep(`  return { result: result ?? 'timeout', turns, ticks: tick, ...m }`,
    `  return { result: result ?? 'timeout', turns, ticks: tick, combatMs: bossClock, ...m }`)
  mkdirSync(`${HERE}out`, { recursive: true })
  const outFile = `${HERE}out/engine-bosses.gen.mjs`
  writeFileSync(outFile, src)
  return pathToFileURL(outFile).href
}

// ─── Main: build tasks, fan out, aggregate ─────────────────────────────────
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}

const report = (file) => {
  const rows = JSON.parse(readFileSync(file, 'utf8'))
  const pct = (x) => `${Math.round(100 * x)}%`
  const f2 = (x) => x.toFixed(2)
  console.log('| slot | fight | shift | loadout | rubber | lvl | win | turns | TTK | TTD | TTK/TTD | burn share | pulses | freezes | skips | chill@launch |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const n = r.n
    console.log(`| ${r.slot} | ${r.fight} | ${r.shift ?? 0} | ${r.cfg} | ${r.rubber} | ${r.lvl} | ${pct(r.win / n)} | ${f2(r.turns / n)} | ${f2(r.ttk / n)} | ${f2(r.ttd / n)} | ${f2((r.ttk / n) / (r.ttd / n))} | ${pct(r.burnFrac / n)} | ${f2(r.pulses / n)} | ${f2(r.freezes / n)} | ${f2(r.skips / n)} | ${r.launchesP ? f2(r.chillLaunchSum / r.launchesP) : '-'} |`)
  }
}

if (isMainThread && isEntry) {
  if (process.argv.includes('--report')) {
    report(arg('report'))
    process.exit(0)
  }
  const engineUrl = patchEngine()
  const { econLevel } = await import('./econ.mjs')
  const { lockstepLevel } = await import('./data.mjs')
  const N = Number(arg('n', 300))
  const out = arg('out', 'out/b100.json')
  const slots = arg('slots', Object.keys(ENCOUNTERS).join(',')).split(',').map(Number)
  const configs = arg('configs', 'none,guard_shell+second_wind').split(',')
  const levelMode = arg('levelMode', 'econ')
  const team = arg('team', 'default')
  const rubbers = arg('rubber', '1').split(',').map(Number)
  const shifts = arg('shift', '0').split(',').map(Number)
  const withOld = !process.argv.includes('--noold')
  const knobs = { ...DEFAULT_KNOBS }
  for (const kv of (arg('set', '') || '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=')
    if (!(k in knobs)) throw new Error(`unknown knob ${k}`)
    knobs[k] = Number(v)
  }
  const chunk = 50
  const tasks = []
  for (const slot of slots) {
    const lvl = levelMode === 'lock' ? lockstepLevel(slot) : econLevel(slot)
    const fights = ENCOUNTERS[slot] && !process.argv.includes('--oldonly') ? [['new', slot]] : []
    if (withOld || !ENCOUNTERS[slot]) fights.push(['old', slot])
    for (const [fight] of fights) for (const cfg of configs) for (const rubber of rubbers) {
      for (const shift of (fight === 'new' ? shifts : [0])) {
        for (let s0 = 0; s0 < N; s0 += chunk) {
          tasks.push({ slot, fight, cfg, rubber, shift, lvl, team, s0, n: Math.min(chunk, N - s0), knobs, engineUrl })
        }
      }
    }
  }
  const W = Math.min(10, Number(process.env.WORKER_BUDGET_WORKERS) || os.availableParallelism())
  console.log(`tasks ${tasks.length}, workers ${W}, N ${N}, knobs ${JSON.stringify(knobs)}`)
  const agg = new Map()
  const t0 = Date.now()
  await new Promise((resolve) => {
    let next = 0
    let alive = W
    for (let w = 0; w < W; w++) {
      const worker = new Worker(__file, { workerData: { engineUrl } })
      const feed = () => {
        if (next >= tasks.length) {
          worker.terminate()
          if (--alive === 0) resolve()
          return
        }
        worker.postMessage(tasks[next++])
      }
      worker.on('message', (r) => {
        const k = `${r.slot}|${r.fight}|${r.cfg}|${r.rubber}|${r.shift}`
        const a = agg.get(k)
        if (!a) agg.set(k, r)
        else for (const f of Object.keys(r)) if (typeof r[f] === 'number' && !['slot', 'rubber', 'lvl', 'shift'].includes(f)) a[f] += r[f]
        feed()
      })
      worker.on('error', (err) => {
        console.error(err)
        process.exit(1)
      })
      feed()
    }
  })
  const rows = [...agg.values()].sort((a, b) => a.slot - b.slot || a.fight.localeCompare(b.fight) || a.cfg.localeCompare(b.cfg) || b.rubber - a.rubber || a.shift - b.shift)
  writeFileSync(out, JSON.stringify(rows, null, 1))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`)
  report(out)
} else if (!isMainThread) {
  const { runBattle, teamFor } = await import(workerData.engineUrl)
  parentPort.on('message', (t) => {
    const team = teamFor(t.team, t.slot, t.lvl)
    const cfgIds = t.cfg === 'counter' ? (ENCOUNTERS[t.slot]?.counter ?? 'none') : t.cfg
    const skills = cfgIds === 'none' ? [] : cfgIds.split('+')
    const loadouts = team.map(() => skills.map(id => ({ id, level: 10 })))
    const enc = ENCOUNTERS[t.slot]
    const stage = t.fight === 'new'
      ? {
        id: t.slot, name: enc.name, isBoss: true, arenaType: enc.arena,
        enemyTeam: enc.team.map(c => ({ ...c, topLevel: c.topLevel + t.shift, bottomLevel: c.bottomLevel + t.shift }))
      }
      : undefined
    const r = {
      slot: t.slot, fight: t.fight, cfg: t.cfg, rubber: t.rubber, lvl: t.lvl, shift: t.shift,
      n: 0, fizzles: 0, win: 0, turns: 0, ttk: 0, ttd: 0, burnFrac: 0, freezes: 0, skips: 0,
      chillLaunchSum: 0, launchesP: 0, combatMs: 0, pulses: 0
    }
    for (let i = t.s0; i < t.s0 + t.n; i++) {
      const seed = t.slot * 1000003 + i * 7919
      const base = {
        stageId: t.slot, stage, team, loadouts, seed, playerStarts: i % 2 === 0,
        knobs: t.knobs, bossHpMul: t.rubber
      }
      const real = runBattle({ ...base, mode: 'real' })
      const a = runBattle({ ...base, mode: 'playerImmortal' })
      const b = runBattle({ ...base, mode: 'enemyImmortal' })
      r.n++
      if (real.result === 'win') r.win++
      r.turns += real.turns
      r.ttk += a.turns
      r.ttd += b.turns
      // share of all HP the player team lost that came from ember pulses
      r.burnFrac += (real.burnTaken ?? 0) / Math.max(1, real.dmgTaken)
      r.freezes += real.freezes ?? 0
      r.skips += real.skips ?? 0
      r.fizzles += real.fizzles ?? 0
      r.chillLaunchSum += real.chillLaunchSum ?? 0
      r.launchesP += real.launchesP ?? 0
      r.combatMs += real.combatMs ?? 0
      r.pulses += real.pulses ?? 0
    }
    parentPort.postMessage(r)
  })
}

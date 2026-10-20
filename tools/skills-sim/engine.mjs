const hyp = (x, y) => Math.sqrt(x * x + y * y)
// Headless replica of the Tree Smashers battle simulation + the proposed skills.
//
// Every block cites the function in src/use/useSpinnerGame.ts it replicates.
// Rendering, sound, VFX timers and screen shake are dropped; every rule that
// moves HP or velocity is kept. Single-player clock: gameTime = tick * 1000/60
// (the fixed-step accumulator runs updatePhysics at 60 Hz, FIXED_STEP_MS).
// Mirrors the post-WP0 engine: collision pairs in syncKey order, star-top crit
// and child-emitter angle on the match RNG (here: the seeded physics stream `rng`).
import { computeStats, getStageById, lockstepLevel } from './data.mjs'
import { SKILL_PARAMS } from './skills.mjs'

// ── constants (useSpinnerGame.ts:63-137, 1103-1130, 1600-1619) ─────────────
const ARENA_RADIUS = 200
const BLADE_RADIUS = 28 // mobile (non-desktop) value, DEFAULT_BLADE_RADIUS
const BASE_MAX_FORCE = 14
const STOP_THRESHOLD = 0.25
const DAMAGE_SCALE = 1.4
const BOUNCE_DAMPENING = 0.75
const WALL_BOOST_FACTOR = 1.08
const WALL_BOUNCE_DECAY_PER_HIT = 0.12
const WALL_BOUNCE_MIN_EFFECTIVENESS = 0.30
const BOUNCER_RADIUS = 6
const BOUNCER_MIN_R = ARENA_RADIUS * 0.25
const BOUNCER_MAX_R = ARENA_RADIUS * 0.70
const ACCEL_FRAMES = 28
const NPC_THINK_MS = 500
const POWERUP_INTERVAL = [10000, 15000]
const POWERUP_LIFETIME_MS = 10000
const POWERUP_RADIUS = BLADE_RADIUS * 0.42
const POWERUP_BUFF = 1.25
const CONTACT_REARM_MS = 50
const HUG_BREAK_MS = 1000
const HUG_SEPARATION_IMPULSE = 3.5
const CRIT_COOLDOWN_MS = 1500
const SPIKY_CHIP_HP_FRACTION = 0.025
const SPIKY_CHIP_MIN_DAMAGE = 1
const SPIKY_CHIP_COOLDOWN_MS = 150
const SPLIT_CHILD_COUNT = 5
const SPLIT_CHILD_HP_PCT = 0.22 * 0.66
const SPLIT_CHILD_DAMAGE_PCT = 0.35
const SPLIT_CHILD_DEFENSE_PCT = 0.25
const SPLIT_CHILD_WEIGHT_PCT = 0.33
const SPLIT_CHILD_RADIUS_PCT = 0.62
const SPLIT_CHILD_INVULN_MS = 1100
const GHOST_SPLIT_OFFSET = 2.1
const HEALER_RADIUS_MULT = 1.2
const HEALER_CONTACT_HEAL = 2
const HEALER_HEAL_COOLDOWN_MS = 250
const FRIENDLY_FIRE_MUL = 0.25
const THUNDER_RADIUS_MUL = 1.8
const THUNDER_COOLDOWN_MS = 1000
const THUNDER_DAMAGE = 1
const TICK_MS = 1000 / 60

// ── seeded RNG (mulberry32) — two independent streams so skill procs do not
// shift the physics/AI random sequence (common random numbers across configs)
export const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Run one battle.
 * @param opts.stageId      campaign stage
 * @param opts.team         player SpinnerConfig[] (levels filled in)
 * @param opts.loadouts     per player blade: [{id, level}, ...]
 * @param opts.mode         'real' | 'playerImmortal' | 'enemyImmortal'
 * @param opts.seed
 * @param opts.playerStarts boolean (turn-order bias is applied by the caller)
 * @param opts.governor     enable the skill governor (caps) — default true
 * @param opts.maxTurns
 */
export const runBattle = (opts) => {
  const rng = mulberry32(opts.seed)
  const srng = mulberry32(opts.seed ^ 0x9E3779B9) // skill proc stream
  const mode = opts.mode ?? 'real'
  const maxTurns = opts.maxTurns ?? 300
  const stage = getStageById(opts.stageId)
  const arena = stage.arenaType ?? 'default'
  const governor = opts.governor !== false

  let tick = 0
  const gameTime = () => tick * TICK_MS
  let nextId = 0
  let nextGroup = 1

  const player = []
  const npc = []
  const allLive = () => player.concat(npc)
  // Post-WP0 canonical order (useSpinnerGame.ts bladesBySyncKey / childSyncKey):
  // player team 0..n-1, enemy team 100+i, children (parent + 1) * 1000 + ordinal.
  // Collision pairs run in this order, lower key = `a` (anti-draw tie-break and
  // the star-crit draw order follow it). Rebuilt only when a blade spawns.
  const childSpawnSeq = new Map()
  const childSyncKey = (parent) => {
    const n = childSpawnSeq.get(parent.syncKey) ?? 0
    childSpawnSeq.set(parent.syncKey, n + 1)
    return (parent.syncKey + 1) * 1000 + n
  }
  let ordered = []
  const orderedBlades = () => {
    if (ordered.length !== player.length + npc.length) ordered = allLive().sort((p, q) => p.syncKey - q.syncKey)
    return ordered
  }

  // statsFor (useSpinnerGame.ts 1636-1690). The shipped code caches per tick;
  // the result only changes with buffs / stat-switch phase, so the sim caches
  // per blade keyed on exactly those inputs (same values, fewer allocations).
  const statsFor = (b) => {
    if (b._st) return b._st
    const st = b._base ?? (b._base = computeStats(b.config))
    let dmg = st.damageMultiplier
    let def = st.defenseMultiplier
    let spd = st.speedMultiplier
    let weightMul = 1
    if (b.isSplitChild) {
      dmg *= SPLIT_CHILD_DAMAGE_PCT
      def *= SPLIT_CHILD_DEFENSE_PCT
      weightMul = SPLIT_CHILD_WEIGHT_PCT
    }
    if (b.statSwitchPhase === 'attack') dmg = Math.max(dmg, def)
    else if (b.statSwitchPhase === 'defense') def = Math.max(dmg, def)
    if (b.config.modelId === 'diamond') def *= 1.2
    if (b.buffs) {
      if (b.buffs.attack) dmg *= b.buffs.attack
      if (b.buffs.defense) def *= b.buffs.defense
      if (b.buffs.speed) spd *= b.buffs.speed
    }
    const r = {
      ...st,
      damageMultiplier: dmg,
      defenseMultiplier: def,
      speedMultiplier: spd,
      totalWeight: st.totalWeight * weightMul
    }
    b._st = r
    return r
  }

  // createBladeState (1694-1752); difficulty MEDIUM → 1, no first-game boost,
  // no boss rubber-band (measures the un-softened fight)
  const createBlade = (owner, x, y, config, isBoss = false) => {
    const st = computeStats(config)
    const hp = st.maxHp * (isBoss ? 2 : 1)
    let radiusMult = 1
    if (isBoss) radiusMult = config.bossAbility === 'healers' ? HEALER_RADIUS_MULT : 1.6
    return {
      id: nextId++, x, y, vx: 0, vy: 0, ax: 0, ay: 0, accelFramesLeft: 0,
      radius: BLADE_RADIUS * radiusMult, hp, maxHp: hp, wallBounceCount: 0, lastHitTime: 0,
      config, owner, isBoss, lastShockMs: -1e9, syncKey: -1
    }
  }

  const speed = (b) => Math.sqrt(b.vx * b.vx + b.vy * b.vy)
  const living = (arr) => arr.filter(b => b.hp > 0)
  const isInvuln = (b) => b.invulnerableUntil !== undefined && gameTime() < b.invulnerableUntil
  const clampInArena = (x, y, radius, extra = 0) => {
    const allowed = -(radius + extra)
    const d = hyp(x, y)
    const sd = d - ARENA_RADIUS
    if (sd <= allowed || d < 1e-9) return { x, y }
    const k = (d - (sd - allowed)) / d
    return { x: x * k, y: y * k }
  }

  // ── metrics ──────────────────────────────────────────────────────────────
  const m = {
    dmgDealt: 0, dmgTaken: 0, hazardTaken: 0, healed: 0, shieldAbsorbed: 0,
    procs: {}, playerHits: 0, npcHits: 0
  }
  const proc = (k) => {
    m.procs[k] = (m.procs[k] ?? 0) + 1
  }

  // ── skills: runtime state lives on the blade (`b.sk`) ────────────────────
  const skillOf = (b, id) => b.skills?.find(s => s.id === id)
  const P = (id, lvl) => SKILL_PARAMS[id].levels[lvl - 1]

  // Central HP-loss path. In the shipped code HP is decremented in three
  // places (applyBladeDamage, lava wall, thunder aura); the spec routes them
  // all through one helper so shield / second wind see every source.
  const loseHp = (target, dmg, kind) => {
    if (dmg <= 0 || target.hp <= 0) return false
    // Hazard Ward reduces hazard + chip sources
    const hw = skillOf(target, 'hazard_ward')
    if (hw) {
      const hp = P('hazard_ward', hw.level)
      if (kind === 'lava') dmg *= 1 - hp.lava
      else if (kind === 'thunder') dmg *= 1 - hp.thunder
      else if (kind === 'chip') dmg *= 1 - hp.chip
    }
    // Guard Shell absorbs first
    if (target.sk?.shield > 0) {
      const a = Math.min(target.sk.shield, dmg)
      target.sk.shield -= a
      dmg -= a
      if (target.owner === 'player') m.shieldAbsorbed += a
    }
    if (target.owner === 'player') {
      m.dmgTaken += dmg
      if (kind === 'lava' || kind === 'thunder') m.hazardTaken += dmg
    } else if (kind !== 'ff-npc') {
      m.dmgDealt += Math.min(dmg, target.hp)
    }
    target.hp = Math.max(0, target.hp - dmg)
    // Second Wind
    const sw = skillOf(target, 'second_wind')
    if (sw && !target.sk.swUsed && target.hp > 0 && target.hp <= target.maxHp * P('second_wind', sw.level).threshold) {
      const heal = Math.min(target.maxHp - target.hp, target.maxHp * P('second_wind', sw.level).heal)
      target.hp += heal
      target.sk.swUsed = true
      m.healed += heal
      proc('second_wind')
    }
    // Immortal modes
    if (mode === 'playerImmortal' && target.owner === 'player') target.hp = target.maxHp
    if (mode === 'enemyImmortal' && target.owner === 'npc') target.hp = target.maxHp
    return target.hp <= 0
  }

  // applyBladeDamage (1856-1892) — ghost-link mirroring
  const applyBladeDamage = (target, dmg, sourceOwner, kind = 'hit') => {
    let killed = loseHp(target, dmg, target.owner === sourceOwner ? (target.owner === 'npc' ? 'ff-npc' : 'ff') : kind)
    if (target.linkedIds?.length) {
      for (const lid of target.linkedIds) {
        const linked = allLive().find(b => b.id === lid)
        if (!linked || linked.hp <= 0) continue
        if (loseHp(linked, dmg, 'link')) killed = true
      }
    }
    return killed
  }

  // ── setup (initGame 1937-2225) ────────────────────────────────────────────
  const pTeam = opts.team
  pTeam.forEach((cfg, i) => {
    const spreadX = pTeam.length === 1 ? 0 : (i / (pTeam.length - 1) - 0.5) * ARENA_RADIUS * 0.7
    const b = createBlade('player', spreadX, ARENA_RADIUS * 0.4, cfg)
    b.skills = opts.loadouts?.[i] ?? []
    if (opts.playerBuff) b.buffs = { ...opts.playerBuff } // control experiment: plain stat buff
    if (opts.playerHpMul) {
      b.maxHp *= opts.playerHpMul
      b.hp = b.maxHp
    } // calibration: plain max-HP buff
    b.sk = { shield: 0, swUsed: false, dodgeReadyAt: 0, phasedUntil: -1, stacks: 0, rocketCount: 0 }
    const gs = skillOf(b, 'guard_shell')
    if (gs) b.sk.shield = b.maxHp * P('guard_shell', gs.level).shield
    player.push(b)
  })
  const nTeam = stage.enemyTeam.map(c => ({ ...c }))
  const nCount = nTeam.length
  const positions = []
  const maxJitter = BLADE_RADIUS * 0.8
  const j = () => (rng() - 0.5) * maxJitter
  if (nCount === 1) positions.push({ x: j(), y: -ARENA_RADIUS * 0.4 + j() })
  else if (nCount === 2) for (let i = 0; i < 2; i++) positions.push({
    x: (i === 0 ? -1 : 1) * ARENA_RADIUS * 0.4 + j(),
    y: -ARENA_RADIUS * 0.4 + j()
  })
  else if (nCount === 3) {
    const topY = -ARENA_RADIUS * 0.55, botY = -ARENA_RADIUS * 0.2, halfW = ARENA_RADIUS * 0.4
    positions.push({ x: -halfW + j(), y: topY + j() }, { x: halfW + j(), y: topY + j() }, { x: j(), y: botY + j() })
  } else {
    const halfW = ARENA_RADIUS * 0.4, topY = -ARENA_RADIUS * 0.65, botY = -ARENA_RADIUS * 0.15
    const slots = [{ x: -halfW, y: topY }, { x: halfW, y: topY }, { x: -halfW, y: botY }, { x: halfW, y: botY }]
    for (let i = 0; i < nCount; i++) positions.push({ x: slots[i].x + j(), y: slots[i].y + j() })
  }
  for (const p of positions) {
    const c = clampInArena(p.x, p.y, BLADE_RADIUS, BLADE_RADIUS)
    p.x = c.x
    p.y = c.y
  }
  nTeam.forEach((cfg, i) => npc.push(createBlade('npc', positions[i].x, positions[i].y, cfg, !!cfg.isBoss)))
  player.forEach((b, i) => {
    b.syncKey = i
  })
  npc.forEach((b, i) => {
    b.syncKey = 100 + i
  })

  const lead = nTeam.find(c => c.bossAbility)?.bossAbility
  if (lead === 'partners' || lead === 'healers') {
    const gid = nextGroup++
    for (const b of npc) {
      b.groupId = gid
      b.bouncesAllies = true
      if (lead === 'healers') b.healsAllies = true
    }
  } else {
    for (const b of npc) {
      switch (b.config.bossAbility) {
        case 'ghost':
          b.groupId = nextGroup++
          b.ghostPending = true
          break
        case 'split':
          b.groupId = nextGroup++
          b.splitsOnDeath = true
          break
        case 'child-emitter':
          b.isChildEmitter = true
          b.groupId = nextGroup++
          break
        case 'stat-switch':
          b.statSwitchPhase = 'defense'
          break
        case 'life-leech':
          b.isLifeLeech = true
          break
      }
    }
  }
  for (const b of npc) if (b.config.bossAbility === 'thunder') {
    b.isThunder = true
    b.thunderLastHit = new Map()
  }
  for (const b of npc.concat(player)) if (b.config.modelId === 'teleporter') b.isTeleporter = true

  // bouncers (2152-2203)
  const bouncers = []
  const bc = Math.max(0, Math.min(3, (stage.bouncers ?? 0) | 0))
  if (bc > 0) {
    const minSepB = BOUNCER_RADIUS * 2 + 12
    const minSepBlade = BLADE_RADIUS + BOUNCER_RADIUS + 8
    const spawns = allLive().map(b => ({ x: b.x, y: b.y }))
    for (let i = 0; i < bc; i++) {
      let placed = null
      for (let a = 0; a < 40 && !placed; a++) {
        const ang = rng() * Math.PI * 2
        const r = BOUNCER_MIN_R + rng() * (BOUNCER_MAX_R - BOUNCER_MIN_R)
        const { x, y } = clampInArena(Math.cos(ang) * r, Math.sin(ang) * r, BOUNCER_RADIUS, 6)
        let ok = bouncers.every(b => hyp(b.x - x, b.y - y) >= minSepB)
        if (ok) ok = spawns.every(s => hyp(s.x - x, s.y - y) >= minSepBlade)
        if (ok) placed = { x, y, radius: BOUNCER_RADIUS }
      }
      if (!placed) {
        const ang = (i / bc) * Math.PI * 2
        const r = (BOUNCER_MIN_R + BOUNCER_MAX_R) / 2
        placed = { ...clampInArena(Math.cos(ang) * r, Math.sin(ang) * r, BOUNCER_RADIUS, 6), radius: BOUNCER_RADIUS }
      }
      bouncers.push(placed)
    }
  }

  // maps (1093-1130, 1517, 1619)
  const contactTimes = new Map()
  const hugStart = new Map()
  const lastCritAt = new Map()
  const spikyCd = new Map()
  const healerCd = new Map()
  const rockets = [] // { arriveAt, targetId, dmg }

  // powerups (4480-4675), enabled from stage 2 in the campaign
  const powerupsEnabled = opts.stageId >= 2
  let powerupTimer = POWERUP_INTERVAL[0] + rng() * (POWERUP_INTERVAL[1] - POWERUP_INTERVAL[0])
  const powerups = []

  // ── phase machine ─────────────────────────────────────────────────────────
  let phase = opts.playerStarts ? 'player_turn' : 'npc_turn'
  let launchedId = null
  let npcThink = 0
  let playerThink = 0
  let turns = 0
  let result = null

  // Opening Salvo fires ONCE per team when combat begins (meteor_intro →
  // deciding_turn), at the highest level any player blade carries it.
  {
    const lv = Math.max(0, ...player.map(b => skillOf(b, 'opening_salvo')?.level ?? 0))
    if (lv > 0) {
      for (const e of living(npc)) {
        const dmg = Math.max(1, e.maxHp * P('opening_salvo', lv).pct)
        const capped = Math.min(dmg, e.hp - 1) // non-lethal: leaves ≥ 1 HP
        if (capped > 0) applyBladeDamage(e, capped, 'player', 'salvo')
      }
      proc('opening_salvo')
    }
  }

  const spawnGhostTwin = (parent) => {
    const mag = hyp(parent.ax, parent.ay) || 1
    const perpX = -parent.ay / mag, perpY = parent.ax / mag
    const off = parent.radius * GHOST_SPLIT_OFFSET
    const twin = createBlade(parent.owner, parent.x + perpX * off, parent.y + perpY * off, { ...parent.config }, parent.isBoss)
    twin.hp = parent.hp
    twin.maxHp = parent.maxHp
    twin.groupId = parent.groupId
    twin.ax = parent.ax
    twin.ay = parent.ay
    twin.accelFramesLeft = parent.accelFramesLeft
    parent.linkedIds = [...(parent.linkedIds ?? []), twin.id]
    twin.linkedIds = [parent.id]
    parent.ghostPending = false
    const c = clampInArena(twin.x, twin.y, twin.radius)
    twin.x = c.x
    twin.y = c.y
    twin.syncKey = childSyncKey(parent)
    ;(parent.owner === 'npc' ? npc : player).push(twin)
  }

  const spawnSplitChildren = (parent) => {
    const now = gameTime()
    for (let i = 0; i < SPLIT_CHILD_COUNT; i++) {
      const ang = (i / SPLIT_CHILD_COUNT) * Math.PI * 2 + rng() * 0.25
      const dx = Math.cos(ang), dy = Math.sin(ang)
      const cr = BLADE_RADIUS * SPLIT_CHILD_RADIUS_PCT
      const dist = parent.radius + cr * 1.1
      const ch = createBlade(parent.owner, parent.x + dx * dist, parent.y + dy * dist, {
        ...parent.config,
        bossAbility: undefined,
        isBoss: false
      }, false)
      ch.radius = cr
      ch.maxHp = Math.max(1, Math.round(parent.maxHp * SPLIT_CHILD_HP_PCT))
      ch.hp = ch.maxHp
      ch.groupId = parent.groupId ?? nextGroup++
      ch.isSplitChild = true
      ch.invulnerableUntil = now + SPLIT_CHILD_INVULN_MS
      ch.vx = dx * 1.2
      ch.vy = dy * 1.2
      const c = clampInArena(ch.x, ch.y, ch.radius, 4)
      ch.x = c.x
      ch.y = c.y
      ch.syncKey = childSyncKey(parent)
      ;(parent.owner === 'npc' ? npc : player).push(ch)
    }
  }

  const launch = (b, nx, ny, force) => {
    b.vx = 0
    b.vy = 0
    b.ax = (nx * force) / ACCEL_FRAMES
    b.ay = (ny * force) / ACCEL_FRAMES
    b.accelFramesLeft = ACCEL_FRAMES
    b.wallBounceCount = 0
    launchedId = b.id
    if (b.sk) b.sk.stacks = 0 // Momentum resets per launch
    if (b.ghostPending) spawnGhostTwin(b)
  }

  // Player policy — a "typical player": half the time launches the
  // auto-selected (first living) blade, otherwise the blade nearest the
  // target; target = lowest-HP or nearest enemy; ±8° aim error; 85-100% pull.
  const playerLaunch = () => {
    const mine = living(player)
    const foes = living(npc)
    if (!mine.length || !foes.length) return false
    const nearestTo = (b) => foes.reduce((a, f) => hyp(f.x - b.x, f.y - b.y) < hyp(a.x - b.x, a.y - b.y) ? f : a)
    const lowest = foes.reduce((a, f) => f.hp < a.hp ? f : a)
    let blade, target
    if (rng() < 0.5) {
      blade = mine[0]
      target = rng() < 0.5 ? lowest : nearestTo(blade)
    } else {
      target = rng() < 0.5 ? lowest : foes[Math.floor(rng() * foes.length)]
      blade = mine.reduce((a, b) => hyp(target.x - b.x, target.y - b.y) < hyp(target.x - a.x, target.y - a.y) ? b : a)
    }
    let ang = Math.atan2(target.y - blade.y, target.x - blade.x) + (rng() - 0.5) * 2 * (8 * Math.PI / 180)
    const maxForce = BASE_MAX_FORCE * statsFor(blade).speedMultiplier
    launch(blade, Math.cos(ang), Math.sin(ang), (0.85 + 0.15 * rng()) * maxForce)
    return true
  }

  // launchNpc (2550-2646)
  let npcTurnIndex = 0
  const npcLaunch = () => {
    npcTurnIndex++
    const lv = living(npc).filter(b => b.stunnedForTurn !== npcTurnIndex)
    if (!lv.length) {
      proc('stun_skip')
      return false
    }
    const blade = lv[Math.floor(rng() * lv.length)]
    const targets = living(player)
    if (!targets.length) return false
    const target = targets[Math.floor(rng() * targets.length)]
    const dx = target.x - blade.x, dy = target.y - blade.y
    const dist = hyp(dx, dy)
    const maxForce = BASE_MAX_FORCE * statsFor(blade).speedMultiplier
    if (dist < 0.01) {
      const a = rng() * Math.PI * 2
      launch(blade, Math.cos(a), Math.sin(a), maxForce * 0.5)
      return true
    }
    let angle = Math.atan2(dy, dx)
    const allies = lv.filter(b => b.id !== blade.id)
    const blocked = (a) => {
      const c = Math.cos(a), s = Math.sin(a)
      for (const al of allies) {
        const ax = al.x - blade.x, ay = al.y - blade.y
        const proj = ax * c + ay * s
        if (proj < 0) continue
        if (Math.abs(-ax * s + ay * c) < BLADE_RADIUS * 3) return true
      }
      return false
    }
    if (blocked(angle)) {
      let found = false
      for (let off = 0.15; off <= Math.PI * 0.6; off += 0.15) {
        if (!blocked(angle + off)) {
          angle += off
          found = true
          break
        }
        if (!blocked(angle - off)) {
          angle -= off
          found = true
          break
        }
      }
      if (!found) angle += (rng() - 0.5) * (Math.PI / 6)
    } else angle += (rng() - 0.5) * (Math.PI / 6)
    launch(blade, Math.cos(angle), Math.sin(angle), (0.65 + rng() * 0.35) * maxForce)
    return true
  }

  // bounceOffWalls (2942-3039) — circle arena
  const bounceOffWalls = (b) => {
    const d = hyp(b.x, b.y)
    const pen = d - ARENA_RADIUS + b.radius
    if (pen <= 0 || d < 1e-9) return
    const nx = b.x / d, ny = b.y / d
    if (b.isTeleporter) {
      const t = clampInArena(-b.x, -b.y, b.radius, 2)
      b.x = t.x
      b.y = t.y
      return
    }
    b.x -= nx * (pen + 0.5)
    b.y -= ny * (pen + 0.5)
    const dot = b.vx * nx + b.vy * ny
    if (dot <= 0) return
    const cur = speed(b)
    const st = statsFor(b)
    const sr = Math.min(cur / (BASE_MAX_FORCE * st.speedMultiplier), 1)
    const eff = Math.max(WALL_BOUNCE_MIN_EFFECTIVENESS, 1 - Math.max(0, b.wallBounceCount) * WALL_BOUNCE_DECAY_PER_HIT)
    const boost = 1 + (WALL_BOOST_FACTOR - 1) * eff * sr
    b.vx = (b.vx - 2 * dot * nx) * boost
    b.vy = (b.vy - 2 * dot * ny) * boost
    b.wallBounceCount++
    chargeMomentum(b)
    if (b.accelFramesLeft > 0) {
      const aDot = b.ax * nx + b.ay * ny
      if (aDot > 0) {
        b.ax -= 2 * aDot * nx
        b.ay -= 2 * aDot * ny
      }
    }
    if (arena === 'lava') {
      loseHp(b, Math.ceil(b.maxHp * 0.025), 'lava')
    } else if (arena === 'forest') {
      const healed = Math.min(1, b.maxHp - b.hp)
      b.hp = Math.min(b.maxHp, b.hp + 1)
      if (b.owner === 'player') m.healed += healed
    }
  }

  // bounceOffBouncers (3049-3097)
  const bounceOffBouncers = (b) => {
    if (!bouncers.length || b.isTeleporter) return
    for (const bo of bouncers) {
      const dx = b.x - bo.x, dy = b.y - bo.y
      const dist = hyp(dx, dy)
      const minD = b.radius + bo.radius
      if (dist >= minD || dist < 0.01) continue
      const nx = dx / dist, ny = dy / dist
      b.x += nx * (minD - dist)
      b.y += ny * (minD - dist)
      const dot = b.vx * nx + b.vy * ny
      if (dot >= 0) continue
      const st = statsFor(b)
      const sr = Math.min(speed(b) / (BASE_MAX_FORCE * st.speedMultiplier), 1)
      const boost = 1 + (WALL_BOOST_FACTOR - 1) * sr
      b.vx = (b.vx - 2 * dot * nx) * boost
      b.vy = (b.vy - 2 * dot * ny) * boost
      chargeMomentum(b)
    }
  }

  const pairKey = (a, b) => (a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`)
  const isEnemyPair = (a, b) => a.owner !== b.owner

  // Skill hooks on a collision damage roll ------------------------------------
  // outgoing: attacker-side multipliers (Lucky Edge, Momentum)
  const outgoing = (att, def, dmg, isCrit) => {
    if (!att.skills?.length || !isEnemyPair(att, def) || dmg <= 0) return { dmg, skillCrit: false }
    let mul = 1
    let skillCrit = false
    const le = skillOf(att, 'lucky_edge')
    if (le && !isCrit && srng() < P('lucky_edge', le.level).chance) {
      mul *= P('lucky_edge', le.level).mult
      skillCrit = true
      proc('lucky_edge')
    }
    const mo = skillOf(att, 'momentum')
    if (mo && launchedId === att.id) {
      mul *= 1 + P('momentum', mo.level).perStack * att.sk.stacks
      if (att.sk.stacks > 0) proc('momentum')
      att.sk.stacks = Math.min(P('momentum', mo.level).maxStacks, att.sk.stacks + 1)
    }
    if (governor) mul = Math.min(mul, GOV.OUT_MUL_CAP)
    return { dmg: dmg * mul, skillCrit }
  }
  // incoming: defender-side (Phase Step, Mirror Plate). Returns
  // { taken, reflect }
  const incoming = (def, att, dmg) => {
    if (!def.skills?.length || !isEnemyPair(att, def) || dmg <= 0) return { taken: dmg, reflect: 0 }
    const now = gameTime()
    if (now < def.sk.phasedUntil) return { taken: 0, reflect: 0 }
    const ps = skillOf(def, 'phase_step')
    if (ps && now >= def.sk.dodgeReadyAt && srng() < P('phase_step', ps.level).chance) {
      def.sk.dodgeReadyAt = now + P('phase_step', ps.level).cooldownMs
      def.sk.phasedUntil = now + 300
      proc('phase_step')
      return { taken: 0, reflect: 0 }
    }
    const mp = skillOf(def, 'mirror_plate')
    if (mp && srng() < P('mirror_plate', mp.level).chance) {
      const share = P('mirror_plate', mp.level).share
      proc('mirror_plate')
      return { taken: dmg * (1 - share), reflect: dmg * share / Math.max(1, statsFor(att).defenseMultiplier) }
    }
    return { taken: dmg, reflect: 0 }
  }
  // after an armed blade-vs-enemy contact (either direction)
  const chargeMomentum = (b) => {
    if (!b.sk || launchedId !== b.id) return
    const mo = skillOf(b, 'momentum')
    if (mo) b.sk.stacks = Math.min(P('momentum', mo.level).maxStacks, b.sk.stacks + 1)
  }
  // Reference hit: the collision formula at 50% of the attacker's max speed,
  // no crit, same piercer/star defence rules (resolveCollision 3375-3382)
  const refHit = (att, def) => {
    const aSt = statsFor(att), bSt = statsFor(def)
    let defMul = bSt.defenseMultiplier
    if (att.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
    else if (att.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
    // speed factor capped at 1.5 so Speedy builds (speedMultiplier up to ~4) do not
    // inflate the reference hit (v5 tuning, skills-feature.md §4.5)
    const closing = 0.5 * BASE_MAX_FORCE * Math.min(aSt.speedMultiplier, 1.5)
    return closing * aSt.damageMultiplier * aSt.totalWeight / (bSt.totalWeight * defMul) * DAMAGE_SCALE
  }
  const onEnemyContact = (bearer, enemy) => {
    if (!bearer.skills?.length || bearer.hp <= 0) return
    const hr = skillOf(bearer, 'homing_rockets')
    if (hr) {
      bearer.sk.rocketCount++
      const p = P('homing_rockets', hr.level)
      if (bearer.sk.rocketCount >= p.everyN) {
        bearer.sk.rocketCount = 0
        const foes = living(npc).filter(f => !isInvuln(f)).sort((a, b) => a.hp - b.hp).slice(0, p.maxTargets)
        for (const f of foes) rockets.push({
          arriveAt: gameTime() + 400,
          targetId: f.id,
          dmg: p.frac * refHit(bearer, f) / foes.length
        })
        proc('homing_rockets')
      }
    }
    const sc = skillOf(bearer, 'static_charge')
    if (sc && enemy.hp > 0 && launchedId === enemy.id && speed(enemy) > STOP_THRESHOLD) {
      const p = P('static_charge', sc.level)
      const now = gameTime()
      if (now - enemy.lastShockMs >= 250 && srng() < p.chance) {
        enemy.lastShockMs = now
        enemy.vx *= 0.1
        enemy.vy *= 0.1
        if ((enemy.stunImmuneTurn ?? -1) < npcTurnIndex + 1) {
          enemy.stunnedForTurn = npcTurnIndex + 1
          enemy.stunImmuneTurn = npcTurnIndex + 2
        }
        proc('static_charge')
      }
    }
  }

  // resolveCollision (3099-3592)
  const resolveCollision = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y
    const minDist = a.radius + b.radius
    const d2 = dx * dx + dy * dy
    if (d2 >= minDist * minDist) return
    const dist = Math.sqrt(d2)
    if (dist < 0.01) return
    if (isInvuln(a) || isInvuln(b)) return
    const friendlyFire = !!(a.groupId !== undefined && a.groupId === b.groupId && a.isSplitChild && b.isSplitChild)
    if (!friendlyFire && a.groupId !== undefined && a.groupId === b.groupId) {
      const now = gameTime()
      if (a.healsAllies || b.healsAllies) {
        const key = pairKey(a, b)
        if (now - (healerCd.get(key) ?? 0) >= HEALER_HEAL_COOLDOWN_MS) {
          const hA = Math.round(Math.min(HEALER_CONTACT_HEAL, a.maxHp - a.hp))
          const hB = Math.round(Math.min(HEALER_CONTACT_HEAL, b.maxHp - b.hp))
          if (hA > 0) a.hp += hA
          if (hB > 0) b.hp += hB
          healerCd.set(key, now)
        }
      }
      if (a.bouncesAllies && b.bouncesAllies) {
        const nx = dx / dist, ny = dy / dist
        const aDot = a.vx * nx + a.vy * ny, bDot = b.vx * nx + b.vy * ny
        a.vx = (a.vx - aDot * nx + bDot * nx) * BOUNCE_DAMPENING
        a.vy = (a.vy - aDot * ny + bDot * ny) * BOUNCE_DAMPENING
        b.vx = (b.vx - bDot * nx + aDot * nx) * BOUNCE_DAMPENING
        b.vy = (b.vy - bDot * ny + aDot * ny) * BOUNCE_DAMPENING
        const ov = minDist - dist
        a.x -= ov / 2 * nx
        a.y -= ov / 2 * ny
        b.x += ov / 2 * nx
        b.y += ov / 2 * ny
      }
      return
    }
    const now = gameTime()
    a.lastHitTime = now
    b.lastHitTime = now
    const key = pairKey(a, b)
    const armed = now - (contactTimes.get(key) ?? 0) > CONTACT_REARM_MS
    contactTimes.set(key, now)
    if (armed) hugStart.set(key, now)
    else {
      const hs = hugStart.get(key) ?? now
      if (now - hs >= HUG_BREAK_MS) {
        const hnx = dx / dist, hny = dy / dist
        a.vx -= hnx * HUG_SEPARATION_IMPULSE
        a.vy -= hny * HUG_SEPARATION_IMPULSE
        b.vx += hnx * HUG_SEPARATION_IMPULSE
        b.vy += hny * HUG_SEPARATION_IMPULSE
        hugStart.set(key, now)
      }
    }
    const nx = dx / dist, ny = dy / dist
    const aSpeed = speed(a), bSpeed = speed(b)
    const aDot = a.vx * nx + a.vy * ny, bDot = b.vx * nx + b.vy * ny
    const closing = Math.max(0, aDot - bDot)
    a.vx = (a.vx - aDot * nx + bDot * nx) * BOUNCE_DAMPENING
    a.vy = (a.vy - aDot * ny + bDot * ny) * BOUNCE_DAMPENING
    b.vx = (b.vx - bDot * nx + aDot * nx) * BOUNCE_DAMPENING
    b.vy = (b.vy - bDot * ny + aDot * ny) * BOUNCE_DAMPENING
    const ov = minDist - dist
    a.x -= ov / 2 * nx
    a.y -= ov / 2 * ny
    b.x += ov / 2 * nx
    b.y += ov / 2 * ny
    const aSt = statsFor(a), bSt = statsFor(b)
    const cone = Math.cos(Math.PI / 4)
    let bBack = false, aBack = false
    if (bSpeed >= BASE_MAX_FORCE * bSt.speedMultiplier * 0.25) bBack = (b.vx / bSpeed * nx + b.vy / bSpeed * ny) >= cone
    // NOTE: the shipped code reads b.vx AFTER the bounce above; replicated as-is.
    if (aSpeed >= BASE_MAX_FORCE * aSt.speedMultiplier * 0.25) aBack = (a.vx / aSpeed * nx + a.vy / aSpeed * ny) <= -cone
    let hadKill = false
    const aAdv = (bSpeed > 0 && aSpeed >= bSpeed * 2) ? 0.75 : 1
    const bAdv = (aSpeed > 0 && bSpeed >= aSpeed * 2) ? 0.75 : 1
    if (armed) {
      let dAB = 0, dBA = 0, aCrit = false, bCrit = false
      if (aSpeed > STOP_THRESHOLD && !aBack) {
        const ready = now - (lastCritAt.get(b.id) ?? -Infinity) >= CRIT_COOLDOWN_MS
        aCrit = bBack && aSpeed >= bSpeed * 2 && ready
        if (!aCrit && a.config.topPartId === 'star' && aSpeed > bSpeed && ready && rng() < 0.08) aCrit = true
        let defMul = aCrit ? 1 : bSt.defenseMultiplier
        if (a.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (a.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        dAB = (closing * aSt.damageMultiplier * (aCrit ? 1.25 : 1) * aSt.totalWeight) / (bSt.totalWeight * defMul) * DAMAGE_SCALE * bAdv * (friendlyFire ? FRIENDLY_FIRE_MUL : 1)
      }
      if (bSpeed > STOP_THRESHOLD && !bBack) {
        const ready = now - (lastCritAt.get(a.id) ?? -Infinity) >= CRIT_COOLDOWN_MS
        bCrit = aBack && bSpeed >= aSpeed * 2 && ready
        if (!bCrit && b.config.topPartId === 'star' && bSpeed > aSpeed && ready && rng() < 0.08) bCrit = true
        let defMul = bCrit ? 1 : aSt.defenseMultiplier
        if (b.config.topPartId === 'piercer') defMul = 1 + (defMul - 1) * 0.25
        else if (b.config.topPartId === 'star') defMul = 1 + (defMul - 1) * 0.75
        dBA = (closing * bSt.damageMultiplier * (bCrit ? 1.25 : 1) * bSt.totalWeight) / (aSt.totalWeight * defMul) * DAMAGE_SCALE * aAdv * (friendlyFire ? FRIENDLY_FIRE_MUL : 1)
      }
      // ── skills: outgoing multipliers, then incoming dodge/mirror ─────────
      dAB = outgoing(a, b, dAB, aCrit).dmg
      dBA = outgoing(b, a, dBA, bCrit).dmg
      const inB = incoming(b, a, dAB)
      const inA = incoming(a, b, dBA)
      dAB = inB.taken
      dBA = inA.taken
      // anti-draw (3405-3423)
      const aDie = dBA > 0 && a.hp - dBA <= 0
      const bDie = dAB > 0 && b.hp - dAB <= 0
      if (aDie && bDie) {
        let aWins
        if (dAB !== dBA) aWins = dAB > dBA
        else if (aSpeed !== bSpeed) aWins = aSpeed > bSpeed
        else aWins = aSt.damageMultiplier >= bSt.damageMultiplier
        if (aWins) dBA = Math.max(0, a.hp - 1)
        else dAB = Math.max(0, b.hp - 1)
      }
      if (dAB > 0) {
        if (aCrit) lastCritAt.set(b.id, now)
        if (applyBladeDamage(b, dAB, a.owner)) hadKill = true
        if (a.owner === 'player' && b.owner === 'npc') m.playerHits++
        if (a.isLifeLeech) a.hp = Math.min(a.maxHp, a.hp + dAB * 0.3)
      }
      if (dBA > 0) {
        if (bCrit) lastCritAt.set(a.id, now)
        if (applyBladeDamage(a, dBA, b.owner)) hadKill = true
        if (b.owner === 'player' && a.owner === 'npc') m.playerHits++
        if (b.isLifeLeech) b.hp = Math.min(b.maxHp, b.hp + dBA * 0.3)
      }
      // Mirror Plate reflections (after the hit lands)
      if (inB.reflect > 0 && a.hp > 0) {
        if (applyBladeDamage(a, inB.reflect, b.owner, 'reflect')) hadKill = true
      }
      if (inA.reflect > 0 && b.hp > 0) {
        if (applyBladeDamage(b, inA.reflect, a.owner, 'reflect')) hadKill = true
      }
      // contact-driven skills
      if (isEnemyPair(a, b)) {
        if (a.owner === 'player') onEnemyContact(a, b)
        else onEnemyContact(b, a)
      }
    }
    if (armed) {
      for (const em of [a, b]) {
        if (!em.isChildEmitter || em.hp <= 0) continue
        const cnt = allLive().filter(x => x.isEmittedChild && x.owner === em.owner && x.hp > 0).length
        if (cnt >= 3) continue
        const ang = rng() * Math.PI * 2
        const sd = em.radius + BLADE_RADIUS * 0.5 + 2
        const ch = createBlade(em.owner, em.x + Math.cos(ang) * sd, em.y + Math.sin(ang) * sd, {
          ...em.config,
          bossAbility: undefined,
          isBoss: false
        }, false)
        ch.radius = BLADE_RADIUS * 0.45
        em.emittedChildCount = (em.emittedChildCount ?? 0) + 1
        ch.maxHp = 1 + Math.floor(em.emittedChildCount / 2)
        ch.hp = ch.maxHp
        ch.isEmittedChild = true
        ch.groupId = nextGroup++
        ch.vx = Math.cos(ang) * 1.5
        ch.vy = Math.sin(ang) * 1.5
        ch.syncKey = childSyncKey(em)
        ;(em.owner === 'npc' ? npc : player).push(ch)
      }
    }
    // spiky chip (3516-3538) — outside the armed gate
    {
      const last = spikyCd.get(key) ?? 0
      if (now - last >= SPIKY_CHIP_COOLDOWN_MS) {
        let chipped = false
        const ffm = friendlyFire ? FRIENDLY_FIRE_MUL : 1
        const chipFor = (v) => Math.max(SPIKY_CHIP_MIN_DAMAGE, v.maxHp * SPIKY_CHIP_HP_FRACTION) * ffm
        const phased = (v) => v.sk && now < v.sk.phasedUntil && isEnemyPair(a, b)
        if (a.config.topPartId === 'triangle' && !aBack && b.hp > 0) {
          if (!phased(b)) {
            if (applyBladeDamage(b, chipFor(b), a.owner, 'chip')) hadKill = true
          }
          chipped = true
        }
        if (b.config.topPartId === 'triangle' && !bBack && a.hp > 0) {
          if (!phased(a)) {
            if (applyBladeDamage(a, chipFor(a), b.owner, 'chip')) hadKill = true
          }
          chipped = true
        }
        if (chipped) spikyCd.set(key, now)
      }
    }
    if (hadKill) {
      for (const x of [a, b]) if (x.hp <= 0 && x.splitsOnDeath && !x.isSplitChild) {
        x.splitsOnDeath = false
        spawnSplitChildren(x)
      }
    }
  }

  // updatePowerups (4566-4660) — lifecycle scale approximated per phase
  const updatePowerups = () => {
    if (!powerupsEnabled) return
    const everyone = allLive()
    const live = phase === 'player_turn' || phase === 'player_launched' || phase === 'npc_turn' || phase === 'npc_launched'
    if (live) {
      powerupTimer -= 16
      if (powerupTimer <= 0) {
        if (powerups.length < 2) {
          for (let at = 0; at < 12; at++) {
            const ang = rng() * Math.PI * 2
            const r = (ARENA_RADIUS - POWERUP_RADIUS - 12) * (0.25 + rng() * 0.7)
            const { x, y } = clampInArena(Math.cos(ang) * r, Math.sin(ang) * r, POWERUP_RADIUS, 12)
            if (everyone.some(b => b.hp > 0 && hyp(b.x - x, b.y - y) < BLADE_RADIUS + POWERUP_RADIUS + 6)) continue
            if (powerups.some(p => hyp(p.x - x, p.y - y) < POWERUP_RADIUS * 2 + 8)) continue
            const stat = ['attack', 'defense', 'speed'][Math.floor(rng() * 3)]
            powerups.push({ x, y, stat, age: 0 })
            break
          }
        }
        powerupTimer = POWERUP_INTERVAL[0] + rng() * (POWERUP_INTERVAL[1] - POWERUP_INTERVAL[0])
      }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i]
      p.age += 16
      if (p.age >= POWERUP_LIFETIME_MS + 800) {
        powerups.splice(i, 1)
        continue
      }
      const scale = p.age < 350 ? 1.15 * p.age / 350 : (p.age < 800 ? 1.0 : 0.85)
      const hitR = POWERUP_RADIUS * Math.max(0.4, scale)
      for (const b of everyone) {
        if (b.hp <= 0) continue
        if (hyp(b.x - p.x, b.y - p.y) <= b.radius + hitR) {
          b.buffs = b.buffs ?? {}
          b.buffs[p.stat] = (b.buffs[p.stat] ?? 1) * POWERUP_BUFF
          b._st = null
          powerups.splice(i, 1)
          break
        }
      }
    }
  }

  // ── main loop (updatePhysics 2650-2940) ──────────────────────────────────
  const MAX_TICKS = 60 * 60 * 30
  while (!result && tick < MAX_TICKS) {
    tick++
    // launches happen "between" ticks, like a pointer release / NPC timer
    if (phase === 'player_turn') {
      playerThink += 16
      if (playerThink >= 600) {
        playerThink = 0
        if (playerLaunch()) {
          phase = 'player_launched'
          turns++
        }
      }
    }
    const all = allLive()
    for (const b of all) {
      if (b.hp <= 0) continue
      if (b.accelFramesLeft > 0) {
        b.vx += b.ax
        b.vy += b.ay
        b.accelFramesLeft--
        if (b.accelFramesLeft === 0) {
          b.ax = 0
          b.ay = 0
          b.lastHitTime = gameTime()
        }
      }
      b.x += b.vx
      b.y += b.vy
      if (b.accelFramesLeft === 0) {
        const st = statsFor(b)
        let decay = st.forceDecay
        if (arena === 'ice') decay = 1 - (1 - decay) * 0.35
        const sr = speed(b) / (BASE_MAX_FORCE * st.speedMultiplier)
        if (sr < 0.25) {
          const t = 1 - sr / 0.25
          decay = decay * (1 - t) + 0.95 * t
        }
        if (b.lastHitTime > 0) {
          const el = gameTime() - b.lastHitTime
          if (el > 1000) decay *= Math.pow(0.99, Math.pow((el - 1000) / 1000, 1.5))
        }
        b.vx *= decay
        b.vy *= decay
      }
      if (speed(b) < STOP_THRESHOLD && b.accelFramesLeft === 0) {
        b.vx = 0
        b.vy = 0
      }
      bounceOffWalls(b)
      bounceOffBouncers(b)
    }
    // All-pairs collision in canonical syncKey order (post-WP0 updatePhysics)
    const ord = orderedBlades()
    for (let i = 0; i < ord.length; i++) {
      for (let k = i + 1; k < ord.length; k++) {
        if (ord[i].hp <= 0 || ord[k].hp <= 0) continue
        resolveCollision(ord[i], ord[k])
      }
    }
    // thunder boss aura (2801-2829)
    const nowT = gameTime()
    for (const src of all) {
      if (!src.isThunder || src.hp <= 0) continue
      const hr = src.radius * THUNDER_RADIUS_MUL
      for (const t of all) {
        if (t === src || t.hp <= 0) continue
        if (hyp(t.x - src.x, t.y - src.y) > hr + t.radius) continue
        if (nowT - (src.thunderLastHit.get(t.id) ?? -Infinity) < THUNDER_COOLDOWN_MS) continue
        src.thunderLastHit.set(t.id, nowT)
        loseHp(t, THUNDER_DAMAGE, t.owner === src.owner ? 'ff-npc' : 'thunder')
      }
    }
    // rockets in flight (skill)
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]
      if (gameTime() < r.arriveAt) continue
      rockets.splice(i, 1)
      const t = allLive().find(b => b.id === r.targetId)
      if (!t || t.hp <= 0 || isInvuln(t)) continue
      if (applyBladeDamage(t, Math.max(1, r.dmg), 'player', 'rocket') && t.splitsOnDeath && !t.isSplitChild) {
        t.splitsOnDeath = false
        spawnSplitChildren(t)
      }
    }
    updatePowerups()

    let pa = 0, na = 0
    for (const b of player) if (b.hp > 0) pa++
    for (const b of npc) if (b.hp > 0) na++
    if (pa === 0 || na === 0) {
      result = na === 0 ? 'win' : 'lose'
      break
    }

    const launched = launchedId === null ? null : (player.find(b => b.id === launchedId) ?? npc.find(b => b.id === launchedId))
    const stopped = !launched || launched.hp <= 0 || (speed(launched) < STOP_THRESHOLD && launched.accelFramesLeft === 0)
    if (phase === 'player_launched' && stopped) {
      phase = 'npc_turn'
      npcThink = 0
      launchedId = null
      for (const b of npc) if (b.statSwitchPhase) {
        b.statSwitchPhase = 'attack'
        b._st = null
      }
    }
    if (phase === 'npc_launched' && stopped) {
      phase = 'player_turn'
      launchedId = null
      playerThink = 0
      for (const b of npc) if (b.statSwitchPhase) {
        b.statSwitchPhase = 'defense'
        b._st = null
      }
    }
    if (phase === 'npc_turn') {
      npcThink += 16
      if (npcThink >= NPC_THINK_MS) {
        if (npcLaunch()) {
          phase = 'npc_launched'
          turns++
        } else {
          phase = 'player_turn'
          playerThink = 0
          turns++
        }
      }
    }
    if (turns >= maxTurns) break
  }
  return { result: result ?? 'timeout', turns, ticks: tick, ...m }
}

export const GOV = { OUT_MUL_CAP: 2.2 }

/** Default player team: the DEFAULT_TEAM every player starts with
 *  (useSpinnerConfig.ts: star/balanced + round/balanced), parts at the
 *  lockstep level for the stage. */
export const TEAMS = {
  default: [['star', 'balanced'], ['round', 'balanced']],
  glass: [['star', 'speedy'], ['piercer', 'speedy']],
  tank: [['cushioned', 'tanky'], ['round', 'tanky']],
  spiky: [['triangle', 'speedy'], ['quadratic', 'balanced']]
}
export const teamFor = (name, stageId, levelOverride) => {
  const lvl = levelOverride ?? lockstepLevel(stageId)
  return TEAMS[name].map(([t, b]) => ({ topPartId: t, bottomPartId: b, topLevel: lvl, bottomLevel: lvl }))
}

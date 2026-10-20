// Pulls the game's REAL tables out of the TypeScript sources so the sim can
// never drift from the shipped numbers. Nothing here is re-typed by hand:
//   TOP_PARTS / BOTTOM_PARTS          src/use/useSpinnerConfig.ts
//   TOP/BOTTOM_UPGRADE_BONUS, stages  src/use/useSpinnerCampaign.ts
// Literal blocks are sliced out by their declaration line and evaluated as JS
// (they contain no TS syntax beyond the `: Type` annotation we strip).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '')
const cfgSrc = readFileSync(`${REPO}/src/use/useSpinnerConfig.ts`, 'utf8')
const campSrc = readFileSync(`${REPO}/src/use/useSpinnerCampaign.ts`, 'utf8')
const gameSrc = readFileSync(`${REPO}/src/use/useSpinnerGame.ts`, 'utf8')

/** Slice `export const NAME: Type = { ... }` (balanced braces) and eval it. */
const evalObject = (src, name) => {
  const start = src.indexOf(`const ${name}`)
  if (start < 0) throw new Error(`missing ${name}`)
  const open = src.indexOf('{', src.indexOf('=', start))
  let depth = 0
  let i = open
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return new Function(`return (${src.slice(open, i + 1)})`)()
}

export const TOP_PARTS = evalObject(cfgSrc, 'TOP_PARTS')
export const BOTTOM_PARTS = evalObject(cfgSrc, 'BOTTOM_PARTS')
export const TOP_UPGRADE_BONUS = evalObject(campSrc, 'TOP_UPGRADE_BONUS')
export const BOTTOM_UPGRADE_BONUS = evalObject(campSrc, 'BOTTOM_UPGRADE_BONUS')

// BASE_HP (useSpinnerConfig.ts `const BASE_HP = 20`)
export const BASE_HP = Number(/const BASE_HP = (\d+)/.exec(cfgSrc)[1])

// Sanity: physics constants the engine hard-codes must still match the source.
const expectConst = (name, value) => {
  const m = new RegExp(`const ${name} = ([^\\n]+)`).exec(gameSrc)
  if (!m) throw new Error(`const ${name} not found in useSpinnerGame.ts`)
  const raw = m[1].replace(/\/\/.*$/, '').trim()
  const v = raw.includes('?') ? Number(raw.split(':').pop()) : Number(raw)
  if (Math.abs(v - value) > 1e-9) throw new Error(`${name}: source=${raw} sim=${value}`)
}
for (const [k, v] of Object.entries({
  ARENA_RADIUS: 200, BASE_MAX_FORCE: 14, STOP_THRESHOLD: 0.25, DAMAGE_SCALE: 1.4,
  BOUNCE_DAMPENING: 0.75, WALL_BOOST_FACTOR: 1.08, WALL_BOUNCE_DECAY_PER_HIT: 0.12,
  WALL_BOUNCE_MIN_EFFECTIVENESS: 0.30, BOUNCER_RADIUS: 6, ACCEL_FRAMES: 28,
  POWERUP_BUFF_MULTIPLIER: 1.25, CONTACT_REARM_MS: 50, HUG_BREAK_MS: 1000,
  HUG_SEPARATION_IMPULSE: 3.5, CRIT_COOLDOWN_MS: 1500, SPIKY_CHIP_HP_FRACTION: 0.025,
  SPIKY_CHIP_COOLDOWN_MS: 150, NPC_THINK_MS: 500, HEALER_CONTACT_HEAL: 2,
  HEALER_HEAL_COOLDOWN_MS: 250, SPLIT_CHILD_COUNT: 5, HEALER_RADIUS_MULT: 1.2,
  GHOST_SPLIT_OFFSET: 2.1, SPLIT_CHILD_INVULN_MS: 1100
})) expectConst(k, v)

// ── Stages: evaluate the BASE_STAGES array literal with the file's own e()/s()
const e = (top, bot, tl, bl, modelId, ability) => {
  const cfg = { topPartId: top, bottomPartId: bot, topLevel: tl, bottomLevel: bl, modelId }
  if (ability) {
    cfg.isBoss = true
    if (ability !== 'plain') cfg.bossAbility = ability
  }
  return cfg
}
const s = (id, name, enemyTeam, rewardWin, rewardLose, opts = {}) => {
  const arenaType = opts.arenaType ?? (opts.isBoss ? 'boss' : undefined)
  return { id, name, enemyTeam, rewardWin, rewardLose, ...opts, arenaType }
}
const bsStart = campSrc.indexOf('const BASE_STAGES: Stage[] = [')
const bsOpen = campSrc.indexOf('[', campSrc.indexOf('=', bsStart))
let depth = 0
let bsEnd = bsOpen
for (; bsEnd < campSrc.length; bsEnd++) {
  if (campSrc[bsEnd] === '[') depth++
  else if (campSrc[bsEnd] === ']') {
    depth--
    if (depth === 0) break
  }
}
export const BASE_STAGES = new Function('e', 's', `return ${campSrc.slice(bsOpen, bsEnd + 1)}`)(e, s)
if (BASE_STAGES.length !== 100) throw new Error('expected 100 base stages')

// Mid-game trim + cycle scaling (useSpinnerCampaign.ts tightenMidGame/scaleStage)
const MID_TRIM_REG = Number(/MID_TRIM_REG = ([\d.]+)/.exec(campSrc)[1])
const MID_TRIM_BOSS = Number(/MID_TRIM_BOSS = ([\d.]+)/.exec(campSrc)[1])
const tighten = (st) => (st.id < 20 || st.id > 100) ? st
  : { ...st, rewardWin: Math.round(st.rewardWin * (st.isBoss ? MID_TRIM_BOSS : MID_TRIM_REG)) }
export const getStageById = (id) => {
  const cycle = Math.floor((id - 1) / 100)
  const base = tighten(BASE_STAGES[(id - 1) % 100])
  if (cycle <= 0) return { ...base, id }
  return {
    ...base, id,
    enemyTeam: base.enemyTeam.map(c => ({
      ...c,
      topLevel: c.topLevel + cycle * 22,
      bottomLevel: c.bottomLevel + cycle * 22
    })),
    rewardWin: Math.round(base.rewardWin * (1 + cycle * 0.35)),
    rewardLose: Math.round(base.rewardLose * (1 + cycle * 0.35))
  }
}

/** useSpinnerCampaign.ts upgradeCost */
export const upgradeCost = (toLevel) =>
  100 + (toLevel - 1) * 20 + (toLevel > 10 ? 3 * (toLevel - 10) ** 2 : 0)

/** useSpinnerConfig.ts computeStats */
export const computeStats = (cfg) => {
  const top = TOP_PARTS[cfg.topPartId]
  const bottom = BOTTOM_PARTS[cfg.bottomPartId]
  const tb = TOP_UPGRADE_BONUS[cfg.topPartId]
  const bb = BOTTOM_UPGRADE_BONUS[cfg.bottomPartId]
  const tl = cfg.topLevel ?? 0
  const bl = cfg.bottomLevel ?? 0
  return {
    maxHp: BASE_HP + top.healthBonus + bottom.healthBonus + tb.hp * tl + bb.hp * bl,
    totalWeight: bottom.weight,
    damageMultiplier: top.damageMultiplier + tb.damage * tl,
    defenseMultiplier: top.defenseMultiplier + tb.defense * tl,
    speedMultiplier: bottom.speedMultiplier + bb.speed * bl,
    forceDecay: bottom.forceDecay + bb.decay * bl
  }
}

/** Player part level in "lockstep" with the campaign: mean enemy part level
 *  of the NON-boss stages within ±3 of `stage` (the campaign table's own
 *  stated intent — "enemies stay roughly in lockstep with a player who's been
 *  upgrading their own parts"). */
export const lockstepLevel = (stage) => {
  let sum = 0
  let n = 0
  for (let id = Math.max(1, stage - 3); id <= stage + 3; id++) {
    const st = getStageById(id)
    if (st.isBoss) continue
    for (const c of st.enemyTeam) {
      sum += (c.topLevel + c.bottomLevel) / 2
      n++
    }
  }
  return Math.round(sum / n)
}

// Pulls the game's REAL tables out of the TypeScript sources so the sim can
// never drift from the shipped numbers. Nothing here is re-typed by hand:
//   TOP_PARTS / BOTTOM_PARTS          src/use/useSpinnerConfig.ts
//   TOP/BOTTOM_UPGRADE_BONUS, stages  src/use/useSpinnerCampaign.ts
//   SMASHER_* part tables + tuning     src/use/useSpinnerConfig.ts
//   CAMPAIGN_NPC_TUNING, rubber band   src/use/useSpinnerCampaign.ts
//   smasher catalog (48 smashers)      src/data/smasherCatalog.ts + src/data/smashers/batch*.ts
//   disc / armour clamps               src/use/smasherMechanics.ts
// Literal blocks are sliced out by their declaration line and evaluated as JS
// (they contain no TS syntax beyond the `: Type` annotation we strip).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '')
const cfgSrc = readFileSync(`${REPO}/src/use/useSpinnerConfig.ts`, 'utf8')
const campSrc = readFileSync(`${REPO}/src/use/useSpinnerCampaign.ts`, 'utf8')
const gameSrc = readFileSync(`${REPO}/src/use/useSpinnerGame.ts`, 'utf8')
const catSrc = readFileSync(`${REPO}/src/data/smasherCatalog.ts`, 'utf8')
const mechSrc = readFileSync(`${REPO}/src/use/smasherMechanics.ts`, 'utf8')
const skillCatSrc = readFileSync(`${REPO}/src/data/skillCatalog.ts`, 'utf8')

/** Slice `export const NAME: Type = { ... }` (balanced braces) and eval it. */
const declAt = (src, name) => {
  const m = new RegExp(`const ${name}\\b(?!_)`).exec(src)
  if (!m) throw new Error(`missing ${name}`)
  return m.index
}
const evalObject = (src, name, scope = {}) => {
  const start = declAt(src, name)
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
  return new Function(...Object.keys(scope), `return (${src.slice(open, i + 1)})`)(...Object.values(scope))
}
/** Slice `const NAME = [ ... ] as const` and eval the array literal. */
const evalArray = (src, name) => {
  const start = declAt(src, name)
  const open = src.indexOf('[', src.indexOf('=', start))
  const close = src.indexOf(']', open)
  return new Function(`return (${src.slice(open, close + 1)})`)()
}
/** `const NAME = <number>` (an optional `export` / type annotation is fine). */
const readNum = (src, name, file) => {
  const m = new RegExp(`const ${name}(?::[^=]+)? = ([\\d.]+)`).exec(src)
  if (!m) throw new Error(`data.mjs: const ${name} not found in ${file}`)
  return Number(m[1])
}
/** Abort when a formula the sim replicates is no longer in the game source. */
const expectSource = (src, file, needle) => {
  if (!src.replace(/\s+/g, ' ').includes(needle.replace(/\s+/g, ' '))) {
    throw new Error(`data.mjs: ${file} no longer contains \`${needle}\` — re-check the sim's copy of that rule`)
  }
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
  ARENA_RADIUS: 200, BASE_MAX_FORCE: 14, STOP_THRESHOLD: 0.25, DAMAGE_SCALE: 0.91,
  BOUNCE_DAMPENING: 0.75, WALL_BOOST_FACTOR: 1.08, WALL_BOUNCE_DECAY_PER_HIT: 0.12,
  WALL_BOUNCE_MIN_EFFECTIVENESS: 0.30, ACCEL_FRAMES: 28,
  POWERUP_BUFF_MULTIPLIER: 1.25, CONTACT_REARM_MS: 50, HUG_BREAK_MS: 1000,
  HUG_SEPARATION_IMPULSE: 3.5, CRIT_COOLDOWN_MS: 1500, SPIKY_CHIP_HP_FRACTION: 0.025,
  SPIKY_CHIP_COOLDOWN_MS: 150, NPC_THINK_MS: 500, HEALER_CONTACT_HEAL: 2,
  HEALER_HEAL_COOLDOWN_MS: 250, SPLIT_CHILD_COUNT: 5, HEALER_RADIUS_MULT: 0.9, BOSS_RADIUS_MULT: 1.2,
  GHOST_SPLIT_OFFSET: 2.1, SPLIT_CHILD_INVULN_MS: 1100
})) expectConst(k, v)
// The sim has no floor obstacles of its own (no terrain, and the pinball
// bumpers were removed from the game): abort if the game grows them back.
if (/\bbounceOffBouncers\b|\bBOUNCER_RADIUS\b/.test(gameSrc) || /\bbouncers\??:/.test(campSrc)) {
  throw new Error('useSpinnerGame.ts / useSpinnerCampaign.ts have pinball bumpers again — the sim does not model them')
}

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

// ── Smashers ────────────────────────────────────────────────────────────────
// Part tables a SMASHER config reads (part-only configs keep the legacy ones).
export const SMASHER_TOP_PARTS = evalObject(cfgSrc, 'SMASHER_TOP_PARTS')
export const SMASHER_BOTTOM_PARTS = evalObject(cfgSrc, 'SMASHER_BOTTOM_PARTS')
export const SMASHER_TOP_UPGRADE = evalObject(cfgSrc, 'SMASHER_TOP_UPGRADE')
export const SMASHER_BOTTOM_UPGRADE = evalObject(cfgSrc, 'SMASHER_BOTTOM_UPGRADE')
export const SMASHER_TUNING = evalObject(cfgSrc, 'SMASHER_TUNING')
for (const [name, t, keys] of [
  ['SMASHER_TOP_PARTS', SMASHER_TOP_PARTS, Object.keys(TOP_PARTS)],
  ['SMASHER_BOTTOM_PARTS', SMASHER_BOTTOM_PARTS, Object.keys(BOTTOM_PARTS)],
  ['SMASHER_TOP_UPGRADE', SMASHER_TOP_UPGRADE, Object.keys(TOP_PARTS)],
  ['SMASHER_BOTTOM_UPGRADE', SMASHER_BOTTOM_UPGRADE, Object.keys(BOTTOM_PARTS)]
]) {
  if (Object.keys(t).sort().join() !== [...keys].sort().join()) throw new Error(`data.mjs: ${name} part ids differ from the legacy table`)
  for (const [id, row] of Object.entries(t)) for (const [k, v] of Object.entries(row)) {
    if (!Number.isFinite(v)) throw new Error(`data.mjs: ${name}.${id}.${k} is not a finite number`)
  }
}
if (!Number.isFinite(SMASHER_TUNING.profileWeightExp)) throw new Error('data.mjs: SMASHER_TUNING.profileWeightExp missing')
// computeStats' smasher branch (the sim's copy below must match it term by term)
for (const needle of [
  'const prof = isSmasherId(config.smasherId) ? SMASHERS[config.smasherId].profile : null',
  'const tl = prof ? smasherUpgradeLevel(topLevel) : topLevel',
  'const bl = prof ? smasherUpgradeLevel(bottomLevel) : bottomLevel',
  'const dl = prof ? Math.min(bottomLevel, SMASHER_TAPER_LEVEL - 1) : bottomLevel',
  'maxHp: (BASE_HP + t.healthBonus + b.healthBonus + tb.hp * tl + bb.hp * bl) * (prof?.hp ?? 1)',
  'totalWeight: b.weight * (prof ? prof.weight ** SMASHER_TUNING.profileWeightExp : 1)',
  'damageMultiplier: (t.damageMultiplier + tb.damage * tl) * (prof?.damage ?? 1)',
  'defenseMultiplier: (t.defenseMultiplier + tb.defense * tl) * (prof?.defense ?? 1)',
  'speedMultiplier: (b.speedMultiplier + bb.speed * bl) * (prof?.speed ?? 1)',
  'forceDecay: b.forceDecay + bb.decay * dl'
]) expectSource(cfgSrc, 'useSpinnerConfig.ts', needle)

// Catalog: the base twelve + batches, evaluated with the kit's own p() / sk().
const kitP = (hp, damage, defense, speed, weight = 1) => ({ hp, damage, defense, speed, weight })
const kitSk = (id, effect, mods = {}) => ({ id, effect, mods })
const kitSrc = readFileSync(`${REPO}/src/data/smashers/kit.ts`, 'utf8')
expectSource(kitSrc, 'smashers/kit.ts', 'Object.freeze({ hp, damage, defense, speed, weight })')
expectSource(kitSrc, 'smashers/kit.ts', 'export const p = (hp: number, damage: number, defense: number, speed: number, weight = 1)')
const smasherDefs = {}
const smasherIds = [...evalArray(catSrc, 'BASE_SMASHER_IDS')]
Object.assign(smasherDefs, evalObject(catSrc, 'BASE_SMASHERS', { p: kitP, sk: kitSk }))
for (const batch of ['A', 'B', 'C']) {
  const src = readFileSync(`${REPO}/src/data/smashers/batch${batch}.ts`, 'utf8')
  smasherIds.push(...evalArray(src, `BATCH_${batch}_IDS`))
  Object.assign(smasherDefs, evalObject(src, `BATCH_${batch}`, { p: kitP, sk: kitSk }))
}
expectSource(catSrc, 'smasherCatalog.ts', 'export const SMASHER_IDS = [...BASE_SMASHER_IDS, ...BATCH_A_IDS, ...BATCH_B_IDS, ...BATCH_C_IDS] as const')
export const SMASHER_IDS = Object.freeze(smasherIds)
export const SMASHERS = Object.freeze(smasherDefs)
// Release gate (smasherCatalog.ts RELEASED_SMASHER_COUNT): the sims default to
// the released smashers; VITE_APP_SMASHERS_RELEASED=all|N opens more, like the game.
const releasedDefault = Number((catSrc.match(/export const DEFAULT_RELEASED_SMASHER_COUNT = (\d+)/) || [])[1])
if (!Number.isInteger(releasedDefault)) throw new Error('data.mjs: DEFAULT_RELEASED_SMASHER_COUNT not found in smasherCatalog.ts')
const releasedFlag = process.env.VITE_APP_SMASHERS_RELEASED
export const RELEASED_SMASHER_COUNT = releasedFlag === 'all'
  ? smasherIds.length
  : /^[1-9]\d*$/.test(releasedFlag ?? '') ? Math.min(smasherIds.length, Number(releasedFlag)) : releasedDefault
export const RELEASED_SMASHER_IDS = Object.freeze(smasherIds.slice(0, RELEASED_SMASHER_COUNT))
if (Object.keys(SMASHERS).sort().join() !== [...SMASHER_IDS].sort().join()) throw new Error('data.mjs: smasher ids differ from the catalog entries')
for (const id of SMASHER_IDS) {
  const d = SMASHERS[id]
  if (d.id !== id || !TOP_PARTS[d.archetype?.top] || !BOTTOM_PARTS[d.archetype?.bottom] || d.skills?.length !== 3) {
    throw new Error(`data.mjs: smasher ${id} is malformed`)
  }
  for (const k of ['hp', 'damage', 'defense', 'speed', 'weight']) if (!Number.isFinite(d.profile[k])) throw new Error(`data.mjs: ${id}.profile.${k}`)
}
export const isSmasherId = (v) => typeof v === 'string' && Object.hasOwn(SMASHERS, v)
export const SMASHER_LEVEL_SANITY_MAX = readNum(catSrc, 'SMASHER_LEVEL_SANITY_MAX', 'smasherCatalog.ts')
export const SMASHER_TAPER_LEVEL = readNum(catSrc, 'SMASHER_TAPER_LEVEL', 'smasherCatalog.ts')
export const SMASHER_COST_GROWTH = readNum(catSrc, 'SMASHER_COST_GROWTH', 'smasherCatalog.ts')
export const SMASHER_TAPER_SCALE = readNum(catSrc, 'SMASHER_TAPER_SCALE', 'smasherCatalog.ts')
export const SKILL_SLOT_LEVELS = Object.freeze(evalArray(catSrc, 'SKILL_SLOT_LEVELS'))
/** The default team every player starts with (useSpinnerConfig.ts). */
export const DEFAULT_TEAM_SMASHERS = Object.freeze(evalArray(cfgSrc, 'DEFAULT_TEAM_SMASHERS'))
// smasherConfig / smasherSkillLevel / smasherLevelCost (copied below)
for (const needle of [
  'topLevel: lv - 1,',
  'bottomLevel: lv - 1',
  'return Math.min(10, 1 + Math.floor((lv - open) / 2))',
  'const extra = to > 10 ? 3 * (to - 10) * (to - 10) : 0',
  'const base = (100 + (to - 1) * 20 + extra) * 1.6',
  'const steep = to > SMASHER_TAPER_LEVEL ? SMASHER_COST_GROWTH ** (to - SMASHER_TAPER_LEVEL) : 1',
  'return Math.min(Number.MAX_SAFE_INTEGER, Math.round(base * steep))',
  'if (!Number.isInteger(level) || level < 1 || level >= SMASHER_LEVEL_SANITY_MAX) return null',
  'return Math.min(SMASHER_LEVEL_SANITY_MAX, Math.max(1, n))',
  'return knee + 2 * SMASHER_TAPER_SCALE * (Math.sqrt(1 + x / SMASHER_TAPER_SCALE) - 1)'
]) expectSource(catSrc, 'smasherCatalog.ts', needle)
export const clampSmasherLevel = (level) => {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 1
  return Math.min(SMASHER_LEVEL_SANITY_MAX, Math.max(1, n))
}
/** smasherCatalog.ts smasherUpgradeLevel — √ taper past level 30. */
export const smasherUpgradeLevel = (n) => {
  const knee = SMASHER_TAPER_LEVEL - 1
  if (!(n > knee)) return n
  const x = n - knee
  return knee + 2 * SMASHER_TAPER_SCALE * (Math.sqrt(1 + x / SMASHER_TAPER_SCALE) - 1)
}
/** smasherCatalog.ts smasherConfig — archetype parts upgraded level − 1 times. */
export const smasherConfig = (id, level) => {
  if (!isSmasherId(id)) throw new Error(`unknown smasher ${id}`)
  const def = SMASHERS[id]
  const lv = clampSmasherLevel(level)
  return { smasherId: id, level: lv, topPartId: def.archetype.top, bottomPartId: def.archetype.bottom, topLevel: lv - 1, bottomLevel: lv - 1 }
}
/** smasherCatalog.ts smasherSkillLevel — slot opens at L1, +1 every two levels. */
export const smasherSkillLevel = (level, slot) => {
  const open = SKILL_SLOT_LEVELS[slot] ?? Infinity
  const lv = clampSmasherLevel(level)
  if (lv < open) return 0
  return Math.min(10, 1 + Math.floor((lv - open) / 2))
}
/** smasherCatalog.ts smasherLoadout — [{ id: effect, level, mods, key }] */
export const smasherLoadout = (config) => {
  if (!isSmasherId(config.smasherId)) return []
  const out = []
  SMASHERS[config.smasherId].skills.forEach((skill, slot) => {
    const level = smasherSkillLevel(config.level ?? 1, slot)
    if (level > 0) out.push({ id: skill.effect, level, mods: { ...skill.mods }, key: skill.id })
  })
  return out
}
/** smasherCatalog.ts smasherLevelCost — coins from `level` to `level + 1`. */
export const smasherLevelCost = (level) => {
  if (!Number.isInteger(level) || level < 1 || level >= SMASHER_LEVEL_SANITY_MAX) return null
  const to = level + 1
  const extra = to > 10 ? 3 * (to - 10) * (to - 10) : 0
  const base = (100 + (to - 1) * 20 + extra) * 1.6
  const steep = to > SMASHER_TAPER_LEVEL ? SMASHER_COST_GROWTH ** (to - SMASHER_TAPER_LEVEL) : 1
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(base * steep))
}

// Disc + directional armour (smasherMechanics.ts)
export const DISC_MIN = readNum(mechSrc, 'DISC_MIN', 'smasherMechanics.ts')
export const DISC_MAX = readNum(mechSrc, 'DISC_MAX', 'smasherMechanics.ts')
export const ARMOR_MIN = readNum(mechSrc, 'ARMOR_MIN', 'smasherMechanics.ts')
export const ARMOR_MAX = readNum(mechSrc, 'ARMOR_MAX', 'smasherMechanics.ts')
export const ARMOR_CONE_COS = readNum(mechSrc, 'ARMOR_CONE_COS', 'smasherMechanics.ts')
for (const needle of [
  'if (c >= ARMOR_CONE_COS) return ZONE_FRONT',
  'if (c <= -ARMOR_CONE_COS) return ZONE_BACK',
  "return zone === ZONE_FRONT ? armor.front : zone === ZONE_BACK ? armor.back : 1",
  'if (front === 1 && back === 1) return null',
  "export const defaultHeadingY = (owner: 'player' | 'npc'): number => (owner === 'player' ? -1 : 1)"
]) expectSource(mechSrc, 'smasherMechanics.ts', needle)
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
// ── Team size (src/data/teamSize.ts) ────────────────────────────────────────
// Every blade's radius × SMASHER_BASE_SIZE × TEAM_SIZE_MUL[its side's count]
// (folded into `disc`); a side of one gets SOLO_BOOST on damage and max HP.
const teamSrc = readFileSync(`${REPO}/src/data/teamSize.ts`, 'utf8')
export const SMASHER_BASE_SIZE = readNum(teamSrc, 'SMASHER_BASE_SIZE', 'teamSize.ts')
export const SOLO_BOOST = readNum(teamSrc, 'SOLO_BOOST', 'teamSize.ts')
const TEAM_SIZE_MUL_SRC = /TEAM_SIZE_MUL[^=]*= Object\.freeze\((\{[^}]*\})\)/.exec(teamSrc)
if (!TEAM_SIZE_MUL_SRC) throw new Error('data.mjs: TEAM_SIZE_MUL not found in teamSize.ts')
export const TEAM_SIZE_MUL = new Function(`return (${TEAM_SIZE_MUL_SRC[1]})`)()
const clampTeam = (n) => (n <= 1 ? 1 : n >= 3 ? 3 : Math.floor(n))
/** sideSizeMul / sideStatMul of teamSize.ts for a side of `count` blades. */
export const sideSizeMul = (count) => SMASHER_BASE_SIZE * TEAM_SIZE_MUL[clampTeam(count)]
export const sideStatMul = (count) => (count === 1 ? SOLO_BOOST : 1)
for (const needle of [
  'export const sideSizeMul = (count: number): number => SMASHER_BASE_SIZE * TEAM_SIZE_MUL[clampTeamSize(count)]',
  'export const sideStatMul = (count: number): number => (count === 1 ? SOLO_BOOST : 1)'
]) expectSource(teamSrc, 'teamSize.ts', needle)
for (const needle of [
  'const disc = discOf(config) * teamSizeMul[owner]',
  'dmg *= teamStatMul[blade.owner]',
  'teamSizeMul.player = sideSizeMul(pTeam.length)',
  'teamSizeMul.npc = sideSizeMul(nTeam.length)',
  'teamStatMul.player = sideStatMul(pTeam.length)',
  'teamStatMul.npc = sideStatMul(nTeam.length)',
  'const childRadius = BLADE_RADIUS * teamSizeMul[parent.owner] * SPLIT_CHILD_RADIUS_PCT',
  'const sideUnit = BLADE_RADIUS * teamSizeMul[emitter.owner]',
  'if (teamStatMul[blade.owner] !== 1 && isLegacyNpc(blade.owner, blade.config)) dmg *= CAMPAIGN_NPC_TUNING.soloDmgMul',
  'const teamHpMultiplier = teamStatMul[owner] * (teamStatMul[owner] !== 1 && isLegacyNpc(owner, config) ? CAMPAIGN_NPC_TUNING.soloHpMul : 1)',
  '* (isLegacyNpc(owner, config) ? campaignNpcCountHpMul(npcTeamCount) : 1)',
  'npcTeamCount = nTeam.length'
]) expectSource(gameSrc, 'useSpinnerGame.ts', needle)

/** discOf: disc radius multiplier (1 without a smasher). */
export const discOf = (config) => {
  if (!isSmasherId(config.smasherId)) return 1
  const d = SMASHERS[config.smasherId].disc
  return typeof d === 'number' && Number.isFinite(d) ? clamp(d, DISC_MIN, DISC_MAX) : 1
}
/** armorOf: { front, back } damage-taken multipliers, or null when neutral. */
export const armorOf = (config) => {
  if (!isSmasherId(config.smasherId)) return null
  const a = SMASHERS[config.smasherId].armor
  if (!a) return null
  const front = Number.isFinite(a.front) ? clamp(a.front, ARMOR_MIN, ARMOR_MAX) : 1
  const back = Number.isFinite(a.back) ? clamp(a.back, ARMOR_MIN, ARMOR_MAX) : 1
  if (front === 1 && back === 1) return null
  return { front, back }
}

// Skill mods (skillCatalog.ts applySkillMods) — a smasher skill = effect × mods
export const SKILL_MOD_MIN = readNum(skillCatSrc, 'SKILL_MOD_MIN', 'skillCatalog.ts')
export const SKILL_MOD_MAX = readNum(skillCatSrc, 'SKILL_MOD_MAX', 'skillCatalog.ts')
export const SKILL_BLADE_SLOTS = readNum(skillCatSrc, 'SKILL_BLADE_SLOTS', 'skillCatalog.ts')
const INT_FIELDS = new Set(evalArray(skillCatSrc, 'INT_FIELDS'))
for (const needle of [
  'if (INT_FIELDS.has(k)) v = Math.max(1, Math.round(v))',
  "else if (k === 'mult') v = 1 + ((out[k] as number) - 1) * mul",
  "else if (k !== 'threshold' && v > 0.95) v = 0.95"
]) expectSource(skillCatSrc, 'skillCatalog.ts', needle)
export const applySkillMods = (params, mods) => {
  if (!mods) return params
  const out = { ...params }
  for (const [k, m] of Object.entries(mods)) {
    if (typeof m !== 'number' || !Number.isFinite(m) || !(k in out)) continue
    const mul = Math.min(SKILL_MOD_MAX, Math.max(SKILL_MOD_MIN, m))
    let v = out[k] * mul
    if (INT_FIELDS.has(k)) v = Math.max(1, Math.round(v))
    else if (k === 'mult') v = 1 + (out[k] - 1) * mul
    else if (k !== 'threshold' && v > 0.95) v = 0.95
    out[k] = v
  }
  return out
}

// ── Part-only campaign NPCs (useSpinnerCampaign.ts) ─────────────────────────
// CAMPAIGN_NPC_TUNING: HP curve on the NPC's mean part level + damage mul,
// applied by createBladeState / statsFor to isLegacyNpc blades (owner npc,
// not PvP, no smasherId). The curve is read; the interpolation is copied.
export const CAMPAIGN_NPC_TUNING = evalObject(campSrc, 'CAMPAIGN_NPC_TUNING')
if (!Array.isArray(CAMPAIGN_NPC_TUNING.hpCurve) || !Number.isFinite(CAMPAIGN_NPC_TUNING.dmgMul) || !Number.isFinite(CAMPAIGN_NPC_TUNING.bossHpMul)) {
  throw new Error('data.mjs: CAMPAIGN_NPC_TUNING shape changed')
}
for (const needle of [
  'if (level <= c[0]![0]) return c[0]![1]',
  'return m0 + ((m1 - m0) * (level - l0)) / (l1 - l0)',
  'return c[c.length - 1]![1]'
]) expectSource(campSrc, 'useSpinnerCampaign.ts', needle)
for (const needle of [
  "owner === 'npc' && !pvpMode.value && !isSmasherId(config.smasherId)",
  'if (isLegacyNpc(blade.owner, blade.config)) dmg *= CAMPAIGN_NPC_TUNING.dmgMul',
  'const legacyNpcHpMul = isLegacyNpc(owner, config) ? campaignNpcHpMul(((config.topLevel ?? 0) + (config.bottomLevel ?? 0)) / 2) : 1',
  'const finalHp = stats.maxHp * legacyNpcHpMul * bossHpMultiplier * boostHpMultiplier * difficultyHpMultiplier * rubberBandHpMultiplier * teamHpMultiplier',
  'const bossHpMultiplier = isBoss ? CAMPAIGN_NPC_TUNING.bossHpMul : bossStats ? 2 : 1',
  'const bossRadius = BLADE_RADIUS * radiusMult * disc',
  'followHeading(blade.ax, blade.ay, 0, blade)',
  'followHeading(blade.vx, blade.vy, STOP_THRESHOLD, blade)',
  'const thornsBaseAtoB = dmgAtoB',
  'b.armor !== undefined && b.armor.back < b.armor.front ? ZONE_BACK : ZONE_FRONT',
  'if (perp < BLADE_RADIUS * ((blade.disc ?? 1) + (ally.disc ?? 1) + 1)) return true'
]) expectSource(gameSrc, 'useSpinnerGame.ts', needle)
/** campaignNpcHpMul(level) with an optional curve override (tests / sweeps). */
export const campaignNpcHpMul = (level, curve = CAMPAIGN_NPC_TUNING.hpCurve) => {
  const c = curve
  if (c.length === 0) return 1
  if (level <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    const [l1, m1] = c[i]
    if (level <= l1) {
      const [l0, m0] = c[i - 1]
      return m0 + ((m1 - m0) * (level - l0)) / (l1 - l0)
    }
  }
  return c[c.length - 1][1]
}

// Boss rubber band: consecutive campaign boss losses shave the boss's max HP.
const RB_PER_STEP = readNum(campSrc, 'BOSS_HP_REDUCTION_PER_STEP', 'useSpinnerCampaign.ts')
const RB_STEP = readNum(campSrc, 'BOSS_HP_REDUCTION_STEP', 'useSpinnerCampaign.ts')
const RB_CAP = readNum(campSrc, 'BOSS_HP_REDUCTION_CAP', 'useSpinnerCampaign.ts')
expectSource(campSrc, 'useSpinnerCampaign.ts', 'const reduction = Math.min(BOSS_HP_REDUCTION_CAP, tiers * BOSS_HP_REDUCTION_PER_STEP)')
/** bossHpRubberBandMul for a loss streak (the game reads the streak from storage). */
export const bossHpRubberBandMul = (streak = 0) => {
  const tiers = Math.floor(Math.max(0, streak) / RB_STEP)
  return 1 - Math.min(RB_CAP, tiers * RB_PER_STEP)
}

/** useSpinnerConfig.ts computeStats — smasher configs read the smasher part
 *  tables × the smasher's profile (weight through profileWeightExp);
 *  part-only configs the legacy tables. */
export const computeStats = (cfg) => {
  const prof = isSmasherId(cfg.smasherId) ? SMASHERS[cfg.smasherId].profile : null
  const t = prof ? SMASHER_TOP_PARTS[cfg.topPartId] : TOP_PARTS[cfg.topPartId]
  const b = prof ? SMASHER_BOTTOM_PARTS[cfg.bottomPartId] : BOTTOM_PARTS[cfg.bottomPartId]
  const tb = prof ? SMASHER_TOP_UPGRADE[cfg.topPartId] : TOP_UPGRADE_BONUS[cfg.topPartId]
  const bb = prof ? SMASHER_BOTTOM_UPGRADE[cfg.bottomPartId] : BOTTOM_UPGRADE_BONUS[cfg.bottomPartId]
  const tl0 = cfg.topLevel ?? 0
  const bl0 = cfg.bottomLevel ?? 0
  const tl = prof ? smasherUpgradeLevel(tl0) : tl0
  const bl = prof ? smasherUpgradeLevel(bl0) : bl0
  const dl = prof ? Math.min(bl0, SMASHER_TAPER_LEVEL - 1) : bl0
  return {
    maxHp: (BASE_HP + t.healthBonus + b.healthBonus + tb.hp * tl + bb.hp * bl) * (prof?.hp ?? 1),
    totalWeight: b.weight * (prof ? prof.weight ** SMASHER_TUNING.profileWeightExp : 1),
    damageMultiplier: (t.damageMultiplier + tb.damage * tl) * (prof?.damage ?? 1),
    defenseMultiplier: (t.defenseMultiplier + tb.defense * tl) * (prof?.defense ?? 1),
    speedMultiplier: (b.speedMultiplier + bb.speed * bl) * (prof?.speed ?? 1),
    forceDecay: b.forceDecay + bb.decay * dl
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

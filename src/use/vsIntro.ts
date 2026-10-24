// ─── VS intro: the 5-second face-off before a new matchup ────────────────────
//
// Owner (2026-10-21): "a VS screen … before the meteor shower and 3, 2, 1
// appears; show the skills of the player and the enemy smashers; as epically
// mind-blowing as a Brawl Stars VS screen" — first asked for 3 s, then 5 s
// ("longer hold on the full lineup with the skills readable; keep the slam-in
// punchy") and ONCE PER NEW MATCHUP (see "Once per matchup" below). Modelled on the Auroras
// Magic duel preview (same shape: one clock, a pure timeline, one layout
// function both orientations read), in this game's toy-box language.
//
// THIS FILE is pure (no DOM, no Vue): the timeline, the skip / pause / PvP
// rules, the per-smasher skill mapping, the power number and the layout. The
// screen itself is `components/organisms/VsIntro.vue` (+ `atoms/VsPortrait.vue`
// for the high-resolution rig portraits); the arena (`views/SpinnerArena.vue`)
// owns WHEN it plays — between the tap-to-start (and any due interstitial) and
// `startMatch()`, i.e. right before the meteor shower and the 3-2-1.
//
// THE CLOCK runs from the screen's first frame. Single-player modes take real
// frame time and FREEZE while the game is paused (ad, hidden tab, portal
// pause), like every other in-battle timer. A human PvP match uses a plain
// wall-clock timeout instead: both peers start the board exactly
// `VS_HANDOFF_MS` after they received the match start, no pause, no skip — the
// screen is purely presentational and never moves one peer's simulation
// relative to the other (the lock-step sim only advances on launches anyway).
//
// SKIP: from `VS_SKIP_FROM_MS` a tap / Space / Enter jumps to the exit wipe,
// which still plays. Never in PvP (and not in the random-search bot match,
// which is presented exactly like a human one).
//
// TUTORIAL: no VS on campaign stage 1 — the first-launch cutscene has just
// introduced the fight, and a brand-new player's first drag must not wait.
//
// ONCE PER MATCHUP (owner): the screen introduces an opponent the player has
// not met yet; a retry goes straight to the meteor shower + 3-2-1.
//   • Campaign (boss stages included): the first attempt of a stage beyond
//     the highest stage that already had its VS (`smashers_vs_seen`.stage, in
//     the cloud save). A retry after a loss / restart is the same stage → no
//     VS; winning opens the next stage → VS; replaying an already-won stage
//     later is below that mark → no VS. Boss Lab / cheat stages always show
//     and record nothing.
//   • Leaderboard ghost and league: once per opponent (their id / name, the
//     last VS_SEEN_OPP_CAP opponents in the same save key).
//   • Random-search bot: once per bot name in this session (every search
//     rolls a new bot, so in practice: every bot match).
//   • Human PvP: the first match of a pairing; rematches in the same pairing
//     skip it. Both peers see the same match sequence of their pairing, so
//     both decide the same — a per-device "seen this player" memory could
//     differ between them, and one peer skipping would build its board 4.8 s
//     before the other.

import { SKILL_SLOT_LEVELS, SMASHERS, isSmasherId, smasherForParts, smasherSkillLevel, type SmasherId } from '@/data/smasherCatalog'
import type { SkillId, SkillLoadout } from '@/types/skills'
import type { BossTrait, SpinnerConfig } from '@/types/spinner'

// ─── Timeline (ms from the screen's first frame) ─────────────────────────────

/** The whole screen, first frame to unmount (owner: "5 seconds"). */
export const VS_TOTAL_MS = 5000
/**
 * The battle is handed over here — `startMatch()` (meteor shower + the 3-2-1)
 * or, in PvP, the board build — while the exit wipe is still opening, so its
 * start-up frame runs under the wipe and the arena is live at `VS_TOTAL_MS`.
 */
export const VS_HANDOFF_MS = 4800
/** The exit wipe starts (a skip jumps here). */
export const VS_EXIT_MS = 4550
/** A tap may skip from here on (single-player only). */
export const VS_SKIP_FROM_MS = 800

/** Beat times (ms). The CSS keyframes in VsIntro.vue use the same numbers. */
export const VS_BEATS = {
  /** Both team halves slam in from opposite sides on the diagonal split. */
  halves: 0,
  /** Halves land; the seam flashes. */
  halvesLand: 220,
  /** First card of each side starts sliding in (player, then enemy). */
  cardsMe: 160,
  cardsThem: 240,
  /** Extra delay per card in a side. */
  cardStagger: 70,
  /** How long one card's slide takes. */
  cardSlide: 300,
  /** The VS emblem starts punching in… */
  vsStart: 560,
  /** …and LANDS here: shockwave ring, sparks, screen shake, the slam sound. */
  vsLand: 720,
  /** Skill chips pop (player first), `skillStagger` apart. */
  skills: 880,
  skillStagger: 40,
  /** Team power plates pop. */
  power: 1000,
  /** Everything is on; idle motion until the exit — the long, readable
   *  look at both lineups and their skills (~3.1 s). */
  hold: 1400,
  exit: VS_EXIT_MS,
  handoff: VS_HANDOFF_MS,
  done: VS_TOTAL_MS
} as const

export type VsMode = 'campaign' | 'boss' | 'ghost' | 'league' | 'bot' | 'pvp'

/** A human PvP match runs on a wall-clock timeout (no pause, no skip). */
export const vsUsesWallClock = (mode: VsMode): boolean => mode === 'pvp'

/** Modes the player may skip. PvP never; the bot match poses as PvP. */
export const vsSkippable = (mode: VsMode): boolean => mode !== 'pvp' && mode !== 'bot'

/** Whether a tap at `ms` skips. */
export const vsCanSkipAt = (mode: VsMode, ms: number): boolean =>
  vsSkippable(mode) && ms >= VS_SKIP_FROM_MS && ms < VS_EXIT_MS

/** Where the clock goes on a skip (never backwards). */
export const vsAfterSkip = (ms: number): number => Math.max(ms, VS_EXIT_MS)

/** What the save remembers about VS screens already shown. */
export interface VsSeen {
  /** Highest campaign stage whose VS was shown (0: none). */
  stage: number
  /** Opponents met (ghost / league ids, most recent last). */
  opp: string[]
}

/** Opponent ids kept in the save (oldest dropped first). */
export const VS_SEEN_OPP_CAP = 60

export const emptyVsSeen = (): VsSeen => ({ stage: 0, opp: [] })

/** Parse the stored value; anything malformed is "nothing seen". */
export const parseVsSeen = (raw: string | null | undefined): VsSeen => {
  if (!raw) return emptyVsSeen()
  try {
    const v = JSON.parse(raw) as Partial<VsSeen>
    const stage = typeof v.stage === 'number' && Number.isFinite(v.stage) ? Math.max(0, Math.floor(v.stage)) : 0
    const opp = Array.isArray(v.opp) ? v.opp.filter((x): x is string => typeof x === 'string').slice(-VS_SEEN_OPP_CAP) : []
    return { stage, opp }
  } catch {
    return emptyVsSeen()
  }
}

/** The battle about to start, as far as the once-per-matchup rule cares. */
export interface VsMatchup {
  mode: VsMode
  /** Campaign stage being fought (campaign / boss). */
  stageId: number
  /** Boss Lab / cheat stage (always shown, never recorded). */
  lab?: boolean
  /** Opponent identity (ghost / league / bot). */
  opponent?: string
  /** Human PvP: matches already started in this pairing before this one. */
  pairingMatches?: number
}

/**
 * Whether this battle gets a VS screen (see "Once per matchup" in the header).
 * `sessionOpp` holds the bot opponents met in this session.
 */
export const shouldShowVsIntro = (m: VsMatchup, seen: VsSeen, sessionOpp: ReadonlySet<string> = new Set()): boolean => {
  if (m.mode === 'pvp') return (m.pairingMatches ?? 0) === 0
  if (m.mode === 'bot') return !m.opponent || !sessionOpp.has(m.opponent)
  if (m.mode === 'ghost' || m.mode === 'league') return !m.opponent || !seen.opp.includes(m.opponent)
  if (m.lab) return true
  // Campaign / boss: never the tutorial; else only a stage not reached before.
  return m.stageId > 1 && m.stageId > seen.stage
}

/** The save after a VS screen was shown for `m` (unchanged when nothing to record). */
export const recordVsSeen = (m: VsMatchup, seen: VsSeen): VsSeen => {
  if ((m.mode === 'campaign' || m.mode === 'boss') && !m.lab) {
    return m.stageId > seen.stage ? { ...seen, stage: m.stageId } : seen
  }
  if ((m.mode === 'ghost' || m.mode === 'league') && m.opponent && !seen.opp.includes(m.opponent)) {
    return { ...seen, opp: [...seen.opp, m.opponent].slice(-VS_SEEN_OPP_CAP) }
  }
  return seen
}

// ─── Sound cues ──────────────────────────────────────────────────────────────

export type VsSfx = 'vs-whoosh' | 'vs-thump' | 'vs-slam'

export interface VsSoundCue {
  at: number
  name: VsSfx
  /** playSound ratio (× the SFX slider). A clash is 0.025. */
  ratio: number
  rate: number
}

/** The screen's sound track (the exit whoosh is played by the exit beat). */
export const VS_SOUND_CUES: readonly VsSoundCue[] = [
  { at: VS_BEATS.halves, name: 'vs-whoosh', ratio: 0.025, rate: 1 },
  { at: VS_BEATS.cardsMe + VS_BEATS.cardSlide - 60, name: 'vs-thump', ratio: 0.022, rate: 1 },
  { at: VS_BEATS.cardsThem + VS_BEATS.cardSlide - 40, name: 'vs-thump', ratio: 0.022, rate: 0.9 },
  { at: VS_BEATS.vsLand, name: 'vs-slam', ratio: 0.028, rate: 1 },
  { at: VS_EXIT_MS, name: 'vs-whoosh', ratio: 0.016, rate: 1.25 }
]

/** Cues crossed when the clock moves from `a` (exclusive) to `b` (inclusive).
 *  A skip passes `skipped` so the jumped-over cues stay silent except the exit. */
export const vsCuesBetween = (a: number, b: number, skipped = false): VsSoundCue[] =>
  VS_SOUND_CUES.filter(c => (a < 0 ? c.at >= 0 : c.at > a) && c.at <= b && (!skipped || c.at >= VS_EXIT_MS))

// ─── The clock (pure stepper; VsIntro.vue drives it from rAF) ────────────────

export interface VsClock {
  /** Ms on screen so far. −1 before the first frame. */
  ms: number
  handedOff: boolean
  done: boolean
}

export const newVsClock = (): VsClock => ({ ms: -1, handedOff: false, done: false })

/** Longest real frame the clock accepts (a tab back from the background). */
export const VS_STEP_CAP_MS = 250

export interface VsStep {
  cues: VsSoundCue[]
  handoff: boolean
  done: boolean
}

/**
 * Advance the clock by one frame of `dtMs` real time (ignored while paused;
 * the first frame lands on 0). Returns the cues to play and whether the
 * hand-off / the end were reached on this frame.
 */
export const stepVsClock = (c: VsClock, dtMs: number, paused: boolean): VsStep => {
  const out: VsStep = { cues: [], handoff: false, done: false }
  if (c.done) return out
  const from = c.ms
  if (c.ms < 0) c.ms = 0
  else if (!paused) c.ms += Math.min(VS_STEP_CAP_MS, Math.max(0, dtMs))
  out.cues = vsCuesBetween(from, c.ms)
  if (!c.handedOff && c.ms >= VS_HANDOFF_MS) {
    c.handedOff = true
    out.handoff = true
  }
  if (c.ms >= VS_TOTAL_MS) {
    c.done = true
    out.done = true
  }
  return out
}

/** Skip: jump to the exit (returns false when not allowed now). */
export const skipVsClock = (c: VsClock, mode: VsMode): VsStep | null => {
  if (c.done || !vsCanSkipAt(mode, c.ms)) return null
  const from = c.ms
  c.ms = vsAfterSkip(c.ms)
  return { cues: vsCuesBetween(from, c.ms, true), handoff: false, done: false }
}

// ─── Content: what each card shows ───────────────────────────────────────────

export interface VsSkillChip {
  /** Smasher skill id ('' for a generic loadout skill). */
  key: string
  effect: SkillId
  /** Engine level of the skill (0 when locked). */
  level: number
  locked: boolean
  /** Smasher level that opens a locked slot. */
  unlockLevel: number
  /** i18n key of the skill's name. */
  nameKey: string
}

/**
 * The skills a blade brings into THIS battle, exactly as the engine equips
 * them (`useSpinnerGame` equipSide): a smasher brings its own three slots —
 * open ones at their engine level, the slots its level has not opened yet
 * shown LOCKED with the level that opens them; a part-only blade (campaign
 * NPCs, legacy ghosts) carries its side's loadout, if any. Campaign enemies
 * carry no skills (skills-feature §9), so their row is empty. Skills-off
 * builds show none.
 */
export const vsSkillChips = (
  config: Pick<SpinnerConfig, 'smasherId' | 'level'>,
  sideLoadout: SkillLoadout | null | undefined,
  skillsOn: boolean
): VsSkillChip[] => {
  if (!skillsOn) return []
  if (isSmasherId(config.smasherId)) {
    const def = SMASHERS[config.smasherId]
    return def.skills.map((s, slot) => {
      const level = smasherSkillLevel(config.level ?? 1, slot)
      return {
        key: s.id,
        effect: s.effect,
        level,
        locked: level === 0,
        unlockLevel: SKILL_SLOT_LEVELS[slot] ?? 1,
        nameKey: `smasher_skill_${s.id}`
      }
    })
  }
  return (sideLoadout ?? []).slice(0, 3).map(s => ({
    key: '',
    effect: s.id,
    level: s.level,
    locked: false,
    unlockLevel: 1,
    nameKey: `skills.names.${s.id}`
  }))
}

/** Level shown on a card: the smasher level, or a part-only blade's parts. */
export const vsLevelOf = (c: Pick<SpinnerConfig, 'smasherId' | 'level' | 'topLevel' | 'bottomLevel'>): number =>
  isSmasherId(c.smasherId) && c.level
    ? c.level
    : Math.max(c.topLevel ?? 0, c.bottomLevel ?? 0) + 1

/** The smasher a blade LOOKS like — the engine's rule (`getBladeLook`). */
export const vsLookOf = (
  c: Pick<SpinnerConfig, 'smasherId' | 'topPartId' | 'bottomPartId' | 'modelId'>,
  owner: 'player' | 'npc',
  modelFallback?: string
): { smasherId: SmasherId; modelId?: string } => {
  const modelId = c.modelId ?? modelFallback
  const smasherId = isSmasherId(c.smasherId)
    ? c.smasherId
    : smasherForParts(c.topPartId, c.bottomPartId, modelId ?? `${c.topPartId}_${owner}`)
  return modelId ? { smasherId, modelId } : { smasherId }
}

/**
 * One card's power number: HP weighted by the average of its attack and
 * defence multipliers, plus a bonus per open skill. Presentation only (it
 * never feeds a gameplay rule); the same formula on both sides so the two
 * team totals compare honestly.
 */
export const vsUnitPower = (maxHp: number, damageMul: number, defenseMul: number, openSkills: number): number => {
  const hp = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0
  const avg = ((Number.isFinite(damageMul) ? damageMul : 1) + (Number.isFinite(defenseMul) ? defenseMul : 1)) / 2
  return Math.max(1, Math.round(hp * avg * 10 + 40 * Math.max(0, openSkills)))
}

export interface VsUnit {
  smasherId: SmasherId
  modelId?: string
  boss: boolean
  level: number
  skills: VsSkillChip[]
  /** Stage-101+ boss mechanics (glyph chips in place of skills). */
  traits: BossTrait[]
  power: number
}

export interface VsSide {
  /** Display label (already translated): "YOU", the opponent, the stage. */
  label: string
  units: VsUnit[]
  power: number
  /** Any boss on this side → the boss styling. */
  boss: boolean
}

export interface VsIntroData {
  mode: VsMode
  me: VsSide
  them: VsSide
  /** Small kicker above the enemy label ("Stage 12" / "Boss Stage"), translated. */
  kicker?: string
}

export interface VsUnitInput {
  config: SpinnerConfig
  maxHp: number
  damageMul: number
  defenseMul: number
}

/** Build a side from its blades (or configs + computed stats in PvP). */
export const buildVsSide = (
  label: string,
  owner: 'player' | 'npc',
  units: readonly VsUnitInput[],
  opts: { sideLoadout?: SkillLoadout | null; skillsOn: boolean; modelFallback?: (c: SpinnerConfig) => string | undefined }
): VsSide => {
  const out: VsUnit[] = units.map(u => {
    const look = vsLookOf(u.config, owner, opts.modelFallback?.(u.config))
    const skills = vsSkillChips(u.config, opts.sideLoadout, opts.skillsOn)
    const traits: BossTrait[] = u.config.bossTrait ? [u.config.bossTrait] : []
    const unit: VsUnit = {
      ...look,
      boss: !!u.config.isBoss,
      level: vsLevelOf(u.config),
      skills,
      traits,
      power: vsUnitPower(u.maxHp, u.damageMul, u.defenseMul, skills.filter(s => !s.locked).length)
    }
    return unit
  })
  return { label, units: out, power: out.reduce((s, u) => s + u.power, 0), boss: out.some(u => u.boss) }
}

// ─── Layout (CSS px; both orientations) ──────────────────────────────────────

export interface VsBox { x: number; y: number; w: number; h: number }

export type VsCardKind = 'names' | 'icons' | 'plain'

export interface VsSideLayout {
  /** The side's band for its cards. */
  region: VsBox
  header: VsBox
  cards: VsBox[]
  /** Card width (the card's em is cardW / 10). */
  cardW: number
  kind: VsCardKind
}

export interface VsLayout {
  portrait: boolean
  w: number
  h: number
  me: VsSideLayout
  them: VsSideLayout
  emblem: { x: number; y: number; size: number }
  skip: VsBox
}

export interface VsInsets { top: number; right: number; bottom: number; left: number }

/** Card height / width per kind (see the em grid in VsIntro.vue). */
export const VS_CARD_ASPECT: Readonly<Record<VsCardKind, number>> = { names: 1.56, icons: 1.4, plain: 1.1 }
/** Skill names only when a card is at least this wide (labels ≥ ~9 px). */
export const VS_NAMES_MIN_W = 140

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Best grid for `n` cards in a region: the widest card that fits. */
export const fitVsGrid = (n: number, rw: number, rh: number, gap: number, cap: number, aspect: number): { cw: number; rows: number; cols: number } => {
  let best = { cw: 0, rows: 1, cols: Math.max(1, n) }
  for (let rows = 1; rows <= Math.max(1, n); rows++) {
    const cols = Math.ceil(n / rows)
    const byW = (rw - (cols - 1) * gap) / cols
    const byH = (rh - (rows - 1) * gap) / rows / aspect
    const cw = Math.floor(Math.max(0, Math.min(cap, byW, byH)))
    if (cw > best.cw + 0.5) best = { cw, rows, cols }
  }
  return best
}

const placeGrid = (n: number, region: VsBox, cw: number, ch: number, rows: number, cols: number, gap: number, anchor: 'center' | 'start' | 'end'): VsBox[] => {
  const gridH = rows * ch + (rows - 1) * gap
  const y0 = anchor === 'start' ? region.y : anchor === 'end' ? region.y + region.h - gridH : region.y + (region.h - gridH) / 2
  const out: VsBox[] = []
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols)
    if (inRow <= 0) break
    const rowW = inRow * cw + (inRow - 1) * gap
    const x0 = region.x + (region.w - rowW) / 2
    for (let c = 0; c < inRow; c++) out.push({ x: x0 + c * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch })
  }
  return out
}

const sideLayout = (n: number, region: VsBox, header: VsBox, gap: number, cap: number, hasSkills: boolean, anchor: 'center' | 'start' | 'end'): VsSideLayout => {
  let kind: VsCardKind = hasSkills ? 'names' : 'plain'
  let g = fitVsGrid(n, region.w, region.h, gap, cap, VS_CARD_ASPECT[kind])
  if (kind === 'names' && g.cw < VS_NAMES_MIN_W) {
    kind = 'icons'
    g = fitVsGrid(n, region.w, region.h, gap, cap, VS_CARD_ASPECT[kind])
  }
  const ch = Math.floor(g.cw * VS_CARD_ASPECT[kind])
  return { region, header, cards: placeGrid(n, region, g.cw, ch, g.rows, g.cols, gap, anchor), cardW: g.cw, kind }
}

/**
 * The whole screen's layout. Landscape: player LEFT, enemy RIGHT, VS in the
 * middle. Portrait: enemy TOP, player BOTTOM (as on the arena). Headers (team
 * label + power) sit on the outer edge of each side; the skip pill sits where
 * nothing else does (top centre in landscape, at the end of the player's
 * header row in portrait). Safe-area insets are respected; `tests/vsIntro.test.ts` proves no
 * two boxes overlap for 1–3 vs 1–4 at the reference screens.
 */
export const computeVsLayout = (
  w: number, h: number, insets: VsInsets, nMe: number, nThem: number,
  skills: { me: boolean; them: boolean }
): VsLayout => {
  const portrait = h > w
  const short = Math.min(w, h)
  const pad = clamp(short * 0.03, 8, 24)
  const gap = clamp(short * 0.02, 6, 16)
  const mT = insets.top + pad
  const mB = insets.bottom + pad
  const mL = insets.left + pad
  const mR = insets.right + pad
  const headH = Math.round(clamp(short * 0.075, 26, 52))
  const E = Math.round(clamp(short * (portrait ? 0.3 : 0.32), 92, 230))
  const cap = Math.min(270, Math.max(w, h) * 0.2)
  const skipW = Math.round(clamp(short * 0.22, 72, 120))
  const skipH = Math.round(clamp(short * 0.07, 26, 40))
  const cx = w / 2
  const cy = h / 2

  if (!portrait) {
    const half = E / 2 + gap
    const meRegion: VsBox = { x: mL, y: mT + headH + gap, w: Math.max(0, cx - half - mL), h: Math.max(0, h - mB - (mT + headH + gap)) }
    const themRegion: VsBox = { x: cx + half, y: meRegion.y, w: Math.max(0, w - mR - (cx + half)), h: meRegion.h }
    // The skip pill sits top-centre, between the two headers.
    const skip: VsBox = { x: cx - skipW / 2, y: mT, w: skipW, h: skipH }
    const headInset = skipW / 2 + gap
    const meHead: VsBox = { x: mL, y: mT, w: Math.max(0, cx - headInset - mL), h: headH }
    const themHead: VsBox = { x: cx + headInset, y: mT, w: Math.max(0, w - mR - (cx + headInset)), h: headH }
    return {
      portrait, w, h,
      me: sideLayout(nMe, meRegion, meHead, gap, cap, skills.me, 'center'),
      them: sideLayout(nThem, themRegion, themHead, gap, cap, skills.them, 'center'),
      emblem: { x: cx, y: cy + headH / 2, size: E },
      skip
    }
  }

  const half = E / 2 + gap
  const themHead: VsBox = { x: mL, y: mT, w: w - mL - mR, h: headH }
  const themRegion: VsBox = { x: mL, y: mT + headH + gap, w: w - mL - mR, h: Math.max(0, cy - half - (mT + headH + gap)) }
  // The skip pill shares the player's header row (bottom right, by the thumb).
  const meHead: VsBox = { x: mL, y: h - mB - headH, w: Math.max(0, w - mL - mR - skipW - gap), h: headH }
  const skip: VsBox = { x: w - mR - skipW, y: meHead.y + (headH - skipH) / 2, w: skipW, h: skipH }
  const meRegion: VsBox = { x: mL, y: cy + half, w: w - mL - mR, h: Math.max(0, meHead.y - gap - (cy + half)) }
  return {
    portrait, w, h,
    me: sideLayout(nMe, meRegion, meHead, gap, cap, skills.me, 'center'),
    them: sideLayout(nThem, themRegion, themHead, gap, cap, skills.them, 'center'),
    emblem: { x: cx, y: cy, size: E },
    skip
  }
}

/** Whether two boxes overlap (touching edges do not count). */
export const vsBoxesOverlap = (a: VsBox, b: VsBox): boolean =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

/** The emblem's square box. */
export const vsEmblemBox = (l: VsLayout): VsBox => ({ x: l.emblem.x - l.emblem.size / 2, y: l.emblem.y - l.emblem.size / 2, w: l.emblem.size, h: l.emblem.size })

// ─── Look constants ──────────────────────────────────────────────────────────

/** Disc rim colours — the battle canvas's own (useSpinnerGame getBladeLook). */
export const VS_RIM = { player: '#3f7fd8', npc: '#d8433f' } as const

/** Portrait yaw frames: each side turned a little toward the VS (3/4 front). */
export const VS_PORTRAIT_FRAME = { me: 29, them: 3 } as const

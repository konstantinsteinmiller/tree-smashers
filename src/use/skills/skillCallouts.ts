// ─── Skill proc callouts ───────────────────────────────────────────────────
//
// When a smasher skill fires, a short team-coloured pill floats up over the
// blade it belongs to: the skill's own medallion + its localized NAME + what
// it just did ("12 blocked", "+8 HP", "Crit ×1.6", "Stunned!"). So the player
// always reads WHICH smasher's WHICH skill did WHAT, and whose side it was
// (player = sky blue pill, opponent = berry red pill).
//
// Rate limit: ONE callout object per (blade, effect). A proc inside
// CALLOUT_MERGE_MS of that callout's start MERGES into it (values add up,
// multipliers take the latest) instead of spawning a new pill, so momentum
// stacks and shield chips never spam. A later proc restarts the same slot.
//
// Pure VFX: wall clock (performance.now), no gameplay state is read back, no
// gameplay RNG, nothing here enters the PvP state hash. Both quality tiers
// show callouts (they are information); FX.low skips only the pop animation.

import type { SkillId } from '@/types/skills'
import type { SkillEventKind } from '@/use/skills/skillVfx'
import { drawSmasherSkillIcon, INK } from '@/use/skills/smasherSkillArt'
import { fmtNum } from '@/utils/localeNumber'

export const CALLOUT_POOL_SIZE = 8
export const CALLOUT_MERGE_MS = 1100
export const CALLOUT_LIFE_MS = 1500
const POP_MS = 160
const FADE_MS = 320

export type Translate = (key: string, named?: Record<string, unknown>) => string

/** The anchor blade fields a callout follows. `SpinnerState` satisfies it. */
export interface CalloutAnchor {
  id: number
  x: number
  y: number
  radius: number
}

export interface SkillCallout {
  active: boolean
  anchor: CalloutAnchor | null
  bladeId: number
  /** Whose skill it is (colour), not necessarily the anchor's side. */
  side: 'player' | 'npc'
  key: string
  effect: SkillId
  kind: SkillEventKind
  value: number
  mult: number
  stunned: boolean
  born: number
  /** Last merge (restarts the life). */
  touched: number
  name: string
  text: string
  /** Measured text widths in css px; -1 = measure on next render. */
  nameW: number
  textW: number
  x: number
  y: number
}

export interface SkillCallouts {
  pool: SkillCallout[]
  /** Callout pills started (QA / tests; merges do not count). */
  started: number
  merged: number
  font: string
}

/** Kinds that produce a callout (rocket_hit: the damage number says it). */
export const CALLOUT_KINDS: readonly SkillEventKind[] = [
  'shield_absorb', 'shield_break', 'ward', 'heal', 'mirror', 'phase', 'lucky',
  'momentum', 'rocket_volley', 'salvo', 'static', 'stun_skip',
  'bank', 'anchor', 'tower', 'thorns'
]

const resolveFont = (): string => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-game').trim()
    if (v && !v.startsWith('var(')) return v
  } catch { /* no DOM */
  }
  return 'Nunito, "Arial Rounded MT Bold", Arial, sans-serif'
}

export function createSkillCallouts(): SkillCallouts {
  return {
    pool: Array.from({ length: CALLOUT_POOL_SIZE }, () => ({
      active: false, anchor: null, bladeId: -1, side: 'player' as const, key: '', effect: 'momentum' as SkillId,
      kind: 'momentum' as SkillEventKind, value: 0, mult: 1, stunned: false, born: 0, touched: 0,
      name: '', text: '', nameW: -1, textW: -1, x: 0, y: 0
    })),
    started: 0,
    merged: 0,
    font: resolveFont()
  }
}

export function resetSkillCallouts(c: SkillCallouts): void {
  for (const s of c.pool) {
    s.active = false
    s.anchor = null
  }
}

/** The value line of a callout (i18n, interpolated — never concatenated). */
export function calloutText(s: Pick<SkillCallout, 'kind' | 'value' | 'mult' | 'stunned'>, t: Translate, locale = 'en'): string {
  const v = Math.max(0, Math.round(s.value))
  const m = fmtNum(Math.round(s.mult * 100) / 100, locale)
  switch (s.kind) {
    case 'shield_absorb':
    case 'ward':
      return t('skills.callout.blocked', { n: v })
    case 'shield_break':
      return t('skills.callout.broken')
    case 'heal':
      return t('skills.callout.heal', { n: v })
    case 'mirror':
      return t('skills.callout.reflected', { n: v })
    case 'phase':
      return t('skills.callout.dodged')
    case 'lucky':
      return t('skills.callout.crit', { mult: m })
    case 'momentum':
      return t('skills.callout.boost', { mult: m })
    case 'rocket_volley':
      return t('skills.callout.volley', { n: v })
    case 'salvo':
      return t('skills.callout.salvo', { n: v })
    case 'static':
      return s.stunned ? t('skills.callout.stunned') : t('skills.callout.zapped')
    case 'stun_skip':
      return t('skills.callout.skipTurn')
    case 'bank':
      return t('skills.callout.bank', { mult: m })
    case 'anchor':
      return t('skills.callout.anchored')
    case 'tower':
      return t('skills.callout.tower', { n: v })
    case 'thorns':
      return t('skills.callout.thorns', { n: v })
    default:
      return ''
  }
}

const SUMMED: ReadonlySet<SkillEventKind> = new Set<SkillEventKind>([
  'shield_absorb', 'ward', 'heal', 'mirror', 'rocket_volley', 'salvo', 'tower', 'thorns'
])

export interface CalloutInput {
  kind: SkillEventKind
  effect: SkillId
  /** Smasher skill id ('' = a part-only blade: generic effect name). */
  key: string
  value: number
  /** Multiplier for lucky / momentum (1 otherwise). */
  mult?: number
  /** static: the shock also stunned. */
  stunned?: boolean
  side: 'player' | 'npc'
}

/**
 * A skill proc: start (or merge into) the callout of (anchor, effect).
 * Returns the callout, or null for a kind without one.
 */
export function pushSkillCallout(
  c: SkillCallouts,
  input: Readonly<CalloutInput>,
  anchor: CalloutAnchor,
  now: number,
  t: Translate,
  locale = 'en'
): SkillCallout | null {
  if (!CALLOUT_KINDS.includes(input.kind)) return null
  const effect = input.effect
  let slot: SkillCallout | null = null
  for (const s of c.pool) {
    if (s.active && s.bladeId === anchor.id && s.effect === effect) {
      slot = s
      break
    }
  }
  if (slot !== null && now - slot.born < CALLOUT_MERGE_MS) {
    // Merge: one pill per window.
    c.merged++
    if (input.kind === 'shield_break') slot.kind = 'shield_break'
    else if (slot.kind !== 'shield_break' && slot.kind === input.kind && SUMMED.has(input.kind)) slot.value += input.value
    else if (slot.kind !== 'shield_break') {
      slot.kind = input.kind
      slot.value = input.value
    }
    if (input.mult !== undefined) slot.mult = input.mult
    if (input.stunned) slot.stunned = true
    slot.touched = now
    slot.anchor = anchor
    slot.text = calloutText(slot, t, locale)
    slot.textW = -1
    return slot
  }
  if (slot === null) {
    for (const s of c.pool) {
      if (!s.active) {
        slot = s
        break
      }
    }
  }
  if (slot === null) {
    // Pool full: recycle the oldest.
    slot = c.pool[0]!
    for (const s of c.pool) if (s.touched < slot.touched) slot = s
  }
  c.started++
  slot.active = true
  slot.anchor = anchor
  slot.bladeId = anchor.id
  slot.side = input.side
  slot.key = input.key
  slot.effect = effect
  slot.kind = input.kind
  slot.value = input.value
  slot.mult = input.mult ?? 1
  slot.stunned = input.stunned ?? false
  slot.born = now
  slot.touched = now
  slot.name = t(input.key ? `smasher_skill_${input.key}` : `skills.names.${effect}`)
  slot.text = calloutText(slot, t, locale)
  slot.nameW = -1
  slot.textW = -1
  slot.x = anchor.x
  slot.y = anchor.y
  return slot
}

/** Expire callouts whose life is over (called from render; cheap). */
export function tickSkillCallouts(c: SkillCallouts, now: number): number {
  let alive = 0
  for (const s of c.pool) {
    if (!s.active) continue
    if (now - s.touched >= CALLOUT_LIFE_MS) {
      s.active = false
      s.anchor = null
    } else alive++
  }
  return alive
}

// ─── Render ────────────────────────────────────────────────────────────────

const PILL_PLAYER = '#0b80d0' // sky-600
const PILL_ENEMY = '#c81d54' // berry-600
const PILL_LIP_PLAYER = '#38c4ff'
const PILL_LIP_ENEMY = '#ff5c8f'
const NAME_COLOR = '#ffffff'
const VALUE_COLOR = '#ffeb3b'

const NAME_PX = 12
const VALUE_PX = 13
const ICON_PX = 28
const PILL_H = 36
const GAP = 4

const easeOutBack = (u: number): number => {
  const k = 1.70158
  const v = u - 1
  return 1 + (k + 1) * v * v * v + k * v * v
}

/**
 * Draw every live callout. The context is in WORLD units; `px` = world units
 * per css pixel (so pills keep a phone-readable size at any arena zoom);
 * `halfW/halfH` = visible half extents in world units (pills stay on screen).
 */
export function renderSkillCallouts(
  ctx: CanvasRenderingContext2D,
  c: SkillCallouts,
  now: number,
  px: number,
  halfW: number,
  halfH: number,
  low: boolean
): void {
  if (tickSkillCallouts(c, now) === 0) return
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  for (const s of c.pool) {
    if (!s.active) continue
    // Scheduled for later (born in the future: waits for the turn banner).
    if (now < s.born) continue
    if (s.anchor !== null) {
      s.x = s.anchor.x
      s.y = s.anchor.y - s.anchor.radius
    }
    // Stack pills of the same blade: older ones sit higher.
    let rank = 0
    for (const o of c.pool) if (o !== s && o.active && o.bladeId === s.bladeId && o.born > s.born && o.born <= now) rank++

    const nameFont = `900 ${NAME_PX}px ${c.font}`
    const valueFont = `900 ${VALUE_PX}px ${c.font}`
    if (s.nameW < 0) {
      ctx.font = nameFont
      s.nameW = ctx.measureText(s.name).width
    }
    if (s.textW < 0) {
      ctx.font = valueFont
      s.textW = ctx.measureText(s.text).width
    }
    const age = now - s.born
    const sinceTouch = now - s.touched
    const left = CALLOUT_LIFE_MS - sinceTouch
    const alpha = left < FADE_MS ? Math.max(0, left / FADE_MS) : 1
    const pop = low ? 1 : (age < POP_MS ? easeOutBack(age / POP_MS) : 1)
    // A merge gives the pill a small bump so the player sees it count up.
    const bump = low || sinceTouch > 140 || age < POP_MS ? 1 : 1 + 0.08 * (1 - sinceTouch / 140)
    const rise = Math.min(1, age / 500) * 10

    const textW = Math.max(s.nameW, s.textW)
    const wCss = ICON_PX + GAP + textW + 14
    const k = px * pop * bump
    const w = wCss * k
    const h = PILL_H * k
    let cx = s.x
    let top = s.y - (14 + rise) * px - h - rank * (PILL_H + 4) * px
    cx = Math.max(-halfW + w / 2 + 4 * px, Math.min(halfW - w / 2 - 4 * px, cx))
    top = Math.max(-halfH + 4 * px, top)
    const x0 = cx - w / 2

    ctx.globalAlpha = alpha
    ctx.save()
    ctx.translate(x0, top)
    ctx.scale(k, k)
    // Pill: ink edge + team fill + lighter top lip, hard drop "shadow".
    const r = PILL_H / 2
    ctx.fillStyle = INK
    roundRect(ctx, -1.5, 1, wCss + 3, PILL_H + 2.5, r + 1.5)
    ctx.fill()
    ctx.fillStyle = s.side === 'player' ? PILL_PLAYER : PILL_ENEMY
    roundRect(ctx, 0, 0, wCss, PILL_H, r)
    ctx.fill()
    ctx.fillStyle = s.side === 'player' ? PILL_LIP_PLAYER : PILL_LIP_ENEMY
    roundRect(ctx, r * 0.6, 2.5, wCss - r * 1.2, 3, 1.5)
    ctx.fill()
    // Medallion on the left, overlapping the edge a little.
    drawSmasherSkillIcon(ctx, s.key, s.effect, ICON_PX / 2 + 1, PILL_H / 2, ICON_PX + 2)
    // Name + value (cream / sun, ink outline).
    const tx = ICON_PX + GAP + 2
    ctx.font = nameFont
    ctx.lineWidth = 3
    ctx.strokeStyle = INK
    ctx.strokeText(s.name, tx, 11.5)
    ctx.fillStyle = NAME_COLOR
    ctx.fillText(s.name, tx, 11.5)
    ctx.font = valueFont
    ctx.strokeText(s.text, tx, 25.5)
    ctx.fillStyle = VALUE_COLOR
    ctx.fillText(s.text, tx, 25.5)
    ctx.restore()
  }
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

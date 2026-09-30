// ─── Skills intro / reveal gate (skills-feature.md §7.1, WP7, G12/G13) ──────
//
// Pure decisions for WHEN the arena may put a skills surface on screen. The
// arena (SpinnerArena.vue) feeds it plain booleans; nothing here touches Vue,
// storage, the DOM or the ad SDKs, so every rule is unit-tested in
// tests/skillRevealGate.test.ts.
//
// Two surfaces share the gate:
//   • the INTRO (SkillsIntroScreen) — the first time skills exist for the
//     player. Only ever QUEUED by a result-screen close (`queueIntroAfterClose`):
//       new player     → the stage-10 boss win, after boss-defeated card →
//                        roulette → roulette reward → continue;
//       existing player (past stage 10 when skills ship) → their next non-PvP
//                        win-screen close;
//       drop-off       → nothing is persisted until the intro CLOSED, so a
//                        player who leaves on the win screen gets it on the
//                        next win-screen close.
//   • the lighter REVEAL (SkillRevealOverlay) for every later unlock / slot 2,
//     pending in useSkills (`pendingReveals` / `pendingSlotReveal`) and shown
//     the next time the gate opens.
//
// The gate (G13): only on `tap_to_start`, never mid-battle, never over an ad,
// never while the first-launch cutscene, Daily Rewards, Battle Pass, the PvP
// lobby / invite auto-join, a result screen or any other modal is up, and at
// least REVEAL_MIN_GAP_MS after the previous skills surface closed. While a
// surface is open it blocks `beginBattle` (the midgame interstitial fires in
// there, so the overlay can never sit on top of an ad).

import type { SkillId } from '@/types/skills'
import type { BattleMode } from '@/use/bossPeek'

/** Minimum spacing between two skills surfaces (§7.1: "≥ 1.2 s apart"). */
export const REVEAL_MIN_GAP_MS = 1200

/** Drum-roll build-up before the intro panel opens (1.2–1.5 s). */
export const INTRO_BUILDUP_MS = 1300

export interface RevealGateInput {
  /** `isSkillsEnabled` (build literal). */
  enabled: boolean
  /** The engine phase — only 'tap_to_start' may show anything. */
  phase: string
  /** A PvP match or the PvP lobby / invite auto-join is active. */
  pvp: boolean
  /** An ad is playing or about to (interstitial, rewarded, rewarded intro). */
  adActive: boolean
  /** The first-launch intro cutscene is up. */
  cutscene: boolean
  /** Any other modal / overlay is open (Daily Rewards, Battle Pass, result
   *  screens, roulette, Team, Options, leaderboard, skin chest, …). */
  modalOpen: boolean
  /** A skills surface (intro, reveal, picker) is already open. */
  surfaceOpen: boolean
  /** `performance.now()` of this check. */
  now: number
  /** When the previous skills surface closed (-Infinity = never). */
  lastClosedAt: number
}

/** May a skills surface open right now? */
export const revealGateOpen = (s: RevealGateInput): boolean =>
  s.enabled
  && s.phase === 'tap_to_start'
  && !s.pvp
  && !s.adActive
  && !s.cutscene
  && !s.modalOpen
  && !s.surfaceOpen
  && s.now - s.lastClosedAt >= REVEAL_MIN_GAP_MS

export interface IntroQueueInput {
  enabled: boolean
  /** The closed screen's battle result. */
  result: 'win' | 'lose' | null
  /** The closed screen's battle mode. */
  mode: BattleMode
  /** useSkills.shouldShowSkillsIntro({ trigger, mode }) for this close. */
  shouldShow: (ctx: { trigger: 'win-closed' | 'loss-closed'; mode: BattleMode }) => boolean
}

/**
 * A result screen closed: should the intro be queued for the next gate
 * opening? Wins only, PvP never (useSkills enforces both too — this keeps the
 * arena honest even if the predicate is widened later).
 */
export const queueIntroAfterClose = (i: IntroQueueInput): boolean => {
  if (!i.enabled || i.mode === 'pvp') return false
  if (i.result !== 'win') return false
  return i.shouldShow({ trigger: 'win-closed', mode: i.mode })
}

export type RevealItem =
  | { kind: 'intro'; ids: SkillId[] }
  | { kind: 'slot'; ids: SkillId[] }
  | { kind: 'combined'; ids: SkillId[] }
  | { kind: 'skill'; ids: [SkillId] }

export interface NextRevealInput {
  /** The intro was queued by a win-screen close and is still pending. */
  introQueued: boolean
  /** useSkills.isSkillsIntroPending */
  introPending: boolean
  /** useSkills.introSkillIds */
  introIds: SkillId[]
  /** useSkills.pendingReveals (empty until the intro was seen) */
  pendingReveals: SkillId[]
  /** useSkills.pendingSlotReveal */
  pendingSlot: boolean
}

/**
 * What the next skills surface is, or null. The intro wins (and covers every
 * unlock so far); later: slot 2 (with the skill that opened it), several
 * catch-up unlocks at once (combined), or one skill.
 */
export const nextRevealItem = (i: NextRevealInput): RevealItem | null => {
  if (i.introPending) {
    // The intro is only ever shown when a win-screen close queued it; the
    // lighter reveals stay silent until it was seen.
    return i.introQueued && i.introIds.length > 0 ? { kind: 'intro', ids: [...i.introIds] } : null
  }
  if (i.pendingSlot) return { kind: 'slot', ids: [...i.pendingReveals] }
  if (i.pendingReveals.length > 1) return { kind: 'combined', ids: [...i.pendingReveals] }
  const first = i.pendingReveals[0]
  if (first) return { kind: 'skill', ids: [first] }
  return null
}

/** `beginBattle` must wait while a skills surface is open. */
export const revealBlocksBattle = (s: { surfaceOpen: boolean }): boolean => s.surfaceOpen

// ─── Poki telemetry diff (skills-feature.md §10.6) ──────────────────────────

export type SkillLevelMap = Partial<Record<SkillId, number>>

export interface SkillTelemetryEvent {
  what: string
  action: 'unlock' | 'learn' | 'upgrade' | 'maxed' | 'equip'
}

/**
 * Events between two skill-state snapshots taken on the same save (a hydrate
 * or reset is NOT diffed — the caller re-baselines on `saveDataVersion`).
 */
export const diffSkillTelemetry = (
  prev: { unlocked: readonly SkillId[]; levels: SkillLevelMap; slots: readonly (SkillId | null)[] },
  next: { unlocked: readonly SkillId[]; levels: SkillLevelMap; slots: readonly (SkillId | null)[] },
  maxLevel: number
): SkillTelemetryEvent[] => {
  const out: SkillTelemetryEvent[] = []
  for (const id of next.unlocked) if (!prev.unlocked.includes(id)) out.push({ what: id, action: 'unlock' })
  for (const key of Object.keys(next.levels) as SkillId[]) {
    const a = prev.levels[key] ?? 0
    const b = next.levels[key] ?? 0
    if (b <= a) continue
    out.push({ what: key, action: a === 0 ? 'learn' : 'upgrade' })
    if (b >= maxLevel && a < maxLevel) out.push({ what: key, action: 'maxed' })
  }
  next.slots.forEach((id, i) => {
    if (id != null && prev.slots[i] !== id) out.push({ what: id, action: 'equip' })
  })
  return out
}

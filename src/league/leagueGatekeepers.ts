/**
 * ─── League gatekeepers (LG7) ───────────────────────────────────────────────
 *
 * The boss guarding each tier promotion (decision LD1 A / B6): at a tier's
 * Div I x99 the next ranked fight is this gatekeeper, and only a win crosses
 * into the tier (leagueMath `applyBattle`). One stage per TARGET tier:
 *
 *   into Bronze    split          classic (buildAbilityBossStage)
 *   into Silver    healers ×4     classic
 *   into Gold      thunder        classic
 *   into Platinum  cinder_tyrant  encounter (buildBossEncounterStage)
 *   into Diamond   glacier_warden encounter
 *   into Champion  elemental_court encounter
 *
 * FIXED LEVELS: every gatekeeper part sits at GATEKEEPER_LEVEL[tier]
 * (leagueMath, sim-fitted so the default team at TIER_FLOOR_POWER wins
 * 55–65 %), never scaled to the challenger — the gate is a bar, not a mirror.
 * Stage id −1 (the sentinel: never persists or advances), rewards 0 (the
 * league pays through leagueMath `rewardCoins`).
 *
 * BOSSES100-OFF BUILD: the encounter table and the trait engine do not exist
 * (src/bosses/bosses100Gate.ts), so the three encounter gates fall back to
 * classic ability bosses at their own sim-fitted levels
 * (LEAGUE_GATEKEEPER_FALLBACK / GATEKEEPER_FALLBACK_LEVEL). Every runtime use
 * of the boundary data (`@/data/bossEncounters`, `@/data/bossArt`) sits behind
 * the folded BOSSES100_BUILD literal, so an off build drops the table.
 *
 * UI CONTRACT (LM4): a gate card shows the boss NAME and BADGE only — never
 * levels. `gatekeeperCard` is the only view LG5b needs; it carries no level.
 *
 * Calibration: tools/skills-sim/league.mjs `floor` (encounter build) and
 * `floor --fallback` (bosses100-off build); numbers in the sim README.
 */
import type { LeagueTier } from '@/use/leagueTiers'
import type { BossAbility, SpinnerConfig } from '@/types/spinner'
import { GATEKEEPER_LEVEL } from '@/league/leagueMath'
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'
// Pure, unobfuscated boundary data (bosses gate header): runtime use only
// behind BOSSES100_BUILD.
import { buildBossEncounterStage, type BossEncounterId } from '@/data/bossEncounters'
import { bossBadgeImgPathForSkin } from '@/data/bossArt'
import { buildAbilityBossStage, type Stage } from '@/use/useSpinnerCampaign'
import { stageEnemyConfigs } from '@/use/stageBladeConfig'

/** Tiers that have a promotion gate INTO them (Wood is the entry tier). */
export type GateTier = Exclude<LeagueTier, 'wood'>

export const GATE_TIERS: readonly GateTier[] = Object.freeze(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'])

export const isGateTier = (tier: unknown): tier is GateTier =>
  typeof tier === 'string' && (GATE_TIERS as readonly string[]).includes(tier)

/** Classic gatekeepers of the lower promotions (O7), every build. */
export const LEAGUE_GATEKEEPER_CLASSIC: Readonly<Record<'bronze' | 'silver' | 'gold', BossAbility>> = Object.freeze({
  bronze: 'split',
  silver: 'healers',
  gold: 'thunder'
})

/** Encounter gatekeepers (B6), bosses100 builds only. */
export const LEAGUE_GATEKEEPER_ENCOUNTERS: Readonly<Record<'platinum' | 'diamond' | 'champion', BossEncounterId>> = Object.freeze({
  platinum: 'cinder_tyrant', // Gold → Platinum
  diamond: 'glacier_warden', // Platinum → Diamond
  champion: 'elemental_court' // Diamond → Champion
})

/**
 * bosses100-off stand-ins for the encounter gates: the classic ability boss
 * closest in shape to each encounter — Cinder Tyrant (lone round/tanky) →
 * child-emitter (lone round/tanky), Glacier Warden (lone speedster) →
 * life-leech (lone triangle/speedy), Elemental Court (partner trio) →
 * partners (trio). Stat-switch was tried for Platinum and rejected: its win
 * curve jumps 67.8 % → 51.3 % between levels 11 and 12, so no level lands in
 * the band; ghost stays above 87 % through level 22.
 * Keep a plain literal — tools/skills-sim/league.mjs parses it.
 */
export const LEAGUE_GATEKEEPER_FALLBACK: Readonly<Record<'platinum' | 'diamond' | 'champion', BossAbility>> = Object.freeze({ platinum: 'child-emitter', diamond: 'life-leech', champion: 'partners' })

/**
 * Part level of the bosses100-off stand-ins (league.mjs `floor --fallback`,
 * 1 000 battles each: the default team at TIER_FLOOR_POWER wins Platinum
 * 58.3 %, Diamond 60.5 %, Champion 61.4 %). Plain literal (parsed).
 */
export const GATEKEEPER_FALLBACK_LEVEL: Readonly<Record<'platinum' | 'diamond' | 'champion', number>> = /* sim-fit */ Object.freeze({ platinum: 14, diamond: 32, champion: 20 })

export type GatekeeperSpec =
  | { tier: GateTier; kind: 'ability'; ability: BossAbility; level: number }
  | { tier: GateTier; kind: 'encounter'; encounterId: BossEncounterId; level: number }

/** Which boss, at which fixed level, guards the promotion into `tier` on THIS build. */
export const gatekeeperSpecFor = (tier: GateTier): GatekeeperSpec => {
  if (!isGateTier(tier)) throw new Error(`no league gatekeeper for tier: ${String(tier)}`)
  if (tier === 'bronze' || tier === 'silver' || tier === 'gold') {
    return { tier, kind: 'ability', ability: LEAGUE_GATEKEEPER_CLASSIC[tier], level: GATEKEEPER_LEVEL[tier] }
  }
  return BOSSES100_BUILD
    ? { tier, kind: 'encounter', encounterId: LEAGUE_GATEKEEPER_ENCOUNTERS[tier], level: GATEKEEPER_LEVEL[tier] }
    : { tier, kind: 'ability', ability: LEAGUE_GATEKEEPER_FALLBACK[tier], level: GATEKEEPER_FALLBACK_LEVEL[tier] }
}

/**
 * The playable gate stage for the promotion INTO `tier` — pure and
 * deterministic (a fresh deep-equal object per call). Encounter gates carry
 * `bossEncounterId` and the blades' `bossTrait` / `shardTrait`; the caller
 * (LG6) skips trophies, roulette and stage advance as for every league fight.
 */
export const gatekeeperStageFor = (tier: GateTier): Stage => {
  const spec = gatekeeperSpecFor(tier)
  const L = spec.level
  if (spec.kind === 'encounter' && BOSSES100_BUILD) {
    return buildBossEncounterStage(spec.encounterId, () => ({ topLevel: L, bottomLevel: L }), {
      stageId: -1,
      rewardWin: 0,
      rewardLose: 0
    })
  }
  if (spec.kind !== 'ability') throw new Error(`encounter gatekeeper on a bosses100-off build: ${tier}`)
  return {
    ...buildAbilityBossStage(spec.ability, () => ({ topLevel: L, bottomLevel: L })),
    id: -1,
    rewardWin: 0,
    rewardLose: 0
  }
}

/** The gate stage's roster as `initGame` takes it — the campaign's own
 *  stage → enemy config path, so boss traits and shard traits are forwarded. */
export const gatekeeperEnemyConfigs = (stage: Pick<Stage, 'enemyTeam'>): SpinnerConfig[] => stageEnemyConfigs(stage)

// ─── Card view (LM4: name + badge, never levels) ────────────────────────────

export interface GatekeeperCard {
  tier: GateTier
  /** Full vue-i18n key of the boss name (`stages.<name>`). */
  nameKey: string
  /** Skin of the lead blade — the portrait (`modelImgPath(modelId)`). */
  modelId: string | null
  /** Crest URL of a badged encounter boss (bosses100 builds), else null. */
  badgeSrc: string | null
}

/** i18n key of the gatekeeper's name (`stages.cheat_split`, `stages.boss_cinder_tyrant`, …). */
export const gatekeeperNameKey = (tier: GateTier): string => `stages.${gatekeeperStageFor(tier).name}`

/** Crest of the gatekeeper (encounter bosses on a bosses100 build), else null. */
export const gatekeeperBadgeSrc = (tier: GateTier): string | null => {
  if (!BOSSES100_BUILD) return null
  const stage = gatekeeperStageFor(tier)
  return stage.bossEncounterId ? bossBadgeImgPathForSkin(stage.enemyTeam[0]?.modelId) : null
}

/** Everything a gate card may show — deliberately without any level. */
export const gatekeeperCard = (tier: GateTier): GatekeeperCard => {
  const stage = gatekeeperStageFor(tier)
  return {
    tier,
    nameKey: `stages.${stage.name}`,
    modelId: stage.enemyTeam[0]?.modelId ?? null,
    badgeSrc: gatekeeperBadgeSrc(tier)
  }
}

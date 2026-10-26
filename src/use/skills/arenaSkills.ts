// ─── SpinnerArena's skill glue ──────────────────────────────────────────────
//
// Everything the arena does with skills, kept out of SpinnerArena.vue so a
// skills-off build bundles none of it: the arena loads this module only
// through the skills gate (`loadArenaSkills`), creates it inside its own
// effect scope and talks to it through the returned object (null when off).
//
// Skills belong to the smashers now: every smasher blade brings its own
// unlocked skills into battle (`smasherLoadout`, applied per blade by the
// engine's `equipSide`). A side LOADOUT is only the fallback for part-only
// blades (legacy league ghosts, old PvP peers) — the local player sends none.
//
//   • battle loadouts: the local side's (always empty), a ghost's derived
//     one, both PvP loadouts, the honour skill-level sums;
//   • the gated skill SFX request for an opponent with skills;
//   • HUD chip rows (per blade — each smasher shows its own chips) + the
//     first-battle "breathe" lesson.

import { computed, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { SkillId, SkillLoadout } from '@/types/skills'
import type { InitGameOptions, SkillHudRows } from '@/use/useSpinnerGame'
import type { BattleMode } from '@/use/bossPeek'
import type { LeaderboardEntry } from '@/use/useLeaderboard'
import { skillLevelSum } from '@/use/loadoutSanitizer'
import { smasherLoadout } from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'
import { ghostSkillLoadout } from '@/use/skills/ghostSkills'
import { requestSkillBattleSfx } from '@/use/skills/skillSfx'

/** What the arena owns and the skill glue reads. */
export interface ArenaSkillsContext {
  pvpRole: Ref<'host' | 'guest' | null>
  pvpHostSkills: Ref<SkillLoadout>
  pvpGuestSkills: Ref<SkillLoadout>
  /** The engine's published HUD rows (local side). */
  skillHud: ShallowRef<SkillHudRows>
  isBattleActive: Ref<boolean>
}

export function useArenaSkills(ctx: ArenaSkillsContext) {
  const { pvpRole, pvpHostSkills, pvpGuestSkills, skillHud } = ctx

  // ── Battle loadouts ────────────────────────────────────────────────────────

  /** The trailing initGame options for a non-PvP battle. The local side
   *  carries no side loadout (its smashers bring their own skills); the
   *  enemy's is a ghost's, if any. Smasher skills always want the SFX set. */
  const battleSkillOptions = (_mode: BattleMode, enemy: SkillLoadout = []): InitGameOptions => {
    requestSkillBattleSfx()
    return { skillLoadout: [], enemySkillLoadout: enemy }
  }

  /** A leaderboard ghost's side loadout (only its part-only blades use it):
   *  an explicit one, else derived (pure in id + maxStage → a rematch
   *  replays it). */
  const ghostLoadout = (entry: LeaderboardEntry): SkillLoadout =>
    entry.skills ?? ghostSkillLoadout(entry)

  /** This client's and the opponent's PvP side loadouts (ready exchange). */
  const pvpLoadouts = (): { mine: SkillLoadout; theirs: SkillLoadout } => {
    const host = pvpRole.value !== 'guest'
    return {
      mine: host ? pvpHostSkills.value : pvpGuestSkills.value,
      theirs: host ? pvpGuestSkills.value : pvpHostSkills.value
    }
  }

  /** Σ skill levels per side — honour counts 0.8 per level. The smashers' own
   *  skills (`smasherLoadout` per blade) plus any side loadout (legacy peers). */
  const pvpHonorSkillLevels = (myTeam: readonly SpinnerConfig[], enemyTeam: readonly SpinnerConfig[]): { mine: number; theirs: number } => {
    const { mine, theirs } = pvpLoadouts()
    const teamSum = (team: readonly SpinnerConfig[]) => team.reduce((s, c) => s + skillLevelSum(smasherLoadout(c)), 0)
    return { mine: skillLevelSum(mine) + teamSum(myTeam), theirs: skillLevelSum(theirs) + teamSum(enemyTeam) }
  }

  /** PvP start: both side loadouts for initGame. */
  const pvpBattleSkillOptions = (): InitGameOptions => {
    const { mine, theirs } = pvpLoadouts()
    requestSkillBattleSfx()
    return { skillLoadout: mine, enemySkillLoadout: theirs }
  }

  // ── HUD chips ──────────────────────────────────────────────────────────────
  // `hudRows[i]` = the chips of the i-th local blade: each smasher shows ITS
  // skills (up to three, different per blade).
  const hudRows = computed(() => skillHud.value)
  /** Wordless lesson: the chips breathe for the first 3 s of the first
   *  battle (this session) with a skill the HUD has not shown yet. */
  const hudBreathe = ref(false)
  const hudShown = new Set<SkillId>()
  let hudBreatheTimer: number | null = null
  watch(ctx.isBattleActive, (active) => {
    if (hudBreatheTimer !== null) {
      clearTimeout(hudBreatheTimer)
      hudBreatheTimer = null
    }
    hudBreathe.value = false
    if (!active) return
    let fresh = false
    for (const row of skillHud.value) {
      for (const chip of row) {
        if (!hudShown.has(chip.id)) fresh = true
        hudShown.add(chip.id)
      }
    }
    if (!fresh) return
    hudBreathe.value = true
    hudBreatheTimer = window.setTimeout(() => {
      hudBreathe.value = false
      hudBreatheTimer = null
    }, 3000)
  })

  /** Timers the effect scope does not own. */
  const dispose = () => {
    if (hudBreatheTimer !== null) clearTimeout(hudBreatheTimer)
    hudBreatheTimer = null
  }

  return {
    battleSkillOptions,
    ghostLoadout,
    pvpBattleSkillOptions,
    pvpHonorSkillLevels,
    hudRows,
    hudBreathe,
    dispose
  }
}

export type ArenaSkills = ReturnType<typeof useArenaSkills>

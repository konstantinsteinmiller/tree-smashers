// ─── SpinnerArena's skill glue (skills-feature.md §7–§10, WP7) ──────────────
//
// Everything the arena does with skills, moved out of SpinnerArena.vue so a
// skills-off build bundles none of it: the arena loads this module only
// through the skills gate (`loadArenaSkills`), creates it inside its own
// effect scope and talks to it through the returned object (null when off).
//
//   • battle loadouts: the team's loadout per mode, the ghost's derived one,
//     both PvP loadouts, the honour skill-level sums;
//   • the gated skill SFX request for an opponent with skills;
//   • the waiting board's rebuild when the loadout changes on the menu;
//   • HUD chip rows + the first-battle "breathe" lesson (§7.6);
//   • the NEW dot on the Team button;
//   • the intro / reveal queue and gate (G12, G13) and the surfaces' state;
//   • the Poki skills funnel (§10.6).

import { computed, nextTick, ref, watch, type Ref, type ShallowRef } from 'vue'
import { prefetchSkillSurfaces, type SkillsApi } from '@/skills/skillsGate'
import type { SkillId, SkillLoadout } from '@/types/skills'
import type { GamePhase } from '@/types/spinner'
import type { InitGameOptions, SkillHudRows } from '@/use/useSpinnerGame'
import type { BattleMode } from '@/use/bossPeek'
import type { LeaderboardEntry } from '@/use/useLeaderboard'
import { saveDataVersion } from '@/use/useSaveStatus'
import { skillLevelSum } from '@/use/loadoutSanitizer'
import { SKILL_MAX_LEVEL } from '@/data/skillCatalog'
import { ghostSkillLoadout } from '@/use/skills/ghostSkills'
import { playSkillDrumroll, requestSkillBattleSfx } from '@/use/skills/skillSfx'
import {
  INTRO_BUILDUP_MS,
  diffSkillTelemetry,
  nextRevealItem,
  queueIntroAfterClose,
  revealBlocksBattle,
  revealGateOpen,
  type RevealItem
} from '@/use/skillRevealGate'
// Stub-swapped on every non-Poki build (vite.config alias).
import { pokiMeasure } from '@/utils/pokiPlugin'

/** What the arena owns and the skill glue reads. */
export interface ArenaSkillsContext {
  phase: Ref<GamePhase>
  pvpMode: Ref<boolean>
  pvpRole: Ref<'host' | 'guest' | null>
  pvpHostSkills: Ref<SkillLoadout>
  pvpGuestSkills: Ref<SkillLoadout>
  /** The engine's published HUD rows (local side). */
  skillHud: ShallowRef<SkillHudRows>
  isBattleActive: Ref<boolean>
  /** The arena-side blockers of the reveal gate, read at every check. */
  gateBlockers: () => { pvp: boolean; adActive: boolean; cutscene: boolean; modalOpen: boolean }
  /** Re-run the board that waits on tap_to_start (no-op if there is none). */
  rebuildBoard: () => void
  /** Open the Team modal (reveal → "Open Team"). */
  openTeam: () => void
}

export function useArenaSkills(skills: SkillsApi, ctx: ArenaSkillsContext) {
  const { phase, pvpMode, pvpRole, pvpHostSkills, pvpGuestSkills, skillHud } = ctx

  // ── Battle loadouts ────────────────────────────────────────────────────────

  /** The trailing initGame options for a non-PvP battle: the team's loadout
   *  for `mode` (useSkills — the single place that decides it) and the
   *  enemy's (ghost only; campaign / daily AI carry no skills in v1). */
  const battleSkillOptions = (mode: BattleMode, enemy: SkillLoadout = []): InitGameOptions => {
    if (enemy.length > 0) requestSkillBattleSfx()
    return { skillLoadout: skills.loadoutForBattle(mode), enemySkillLoadout: enemy }
  }

  /** A leaderboard ghost's loadout: an explicit one, else derived (pure in
   *  id + maxStage, so a rematch replays it). */
  const ghostLoadout = (entry: LeaderboardEntry): SkillLoadout =>
    entry.skills ?? ghostSkillLoadout(entry)

  /** This client's and the opponent's PvP loadouts (from the ready exchange). */
  const pvpLoadouts = (): { mine: SkillLoadout; theirs: SkillLoadout } => {
    const host = pvpRole.value !== 'guest'
    return {
      mine: host ? pvpHostSkills.value : pvpGuestSkills.value,
      theirs: host ? pvpGuestSkills.value : pvpHostSkills.value
    }
  }

  /** Σ skill levels of both PvP loadouts — honour counts 0.8 per level (§9.1). */
  const pvpHonorSkillLevels = (): { mine: number; theirs: number } => {
    const { mine, theirs } = pvpLoadouts()
    return { mine: skillLevelSum(mine), theirs: skillLevelSum(theirs) }
  }

  /** PvP start: both loadouts for initGame (the SFX set if the peer has any). */
  const pvpBattleSkillOptions = (): InitGameOptions => {
    const { mine, theirs } = pvpLoadouts()
    if (theirs.length > 0) requestSkillBattleSfx()
    return { skillLoadout: mine, enemySkillLoadout: theirs }
  }

  // Loadout edited on the menu (intro → picker, reveal → Team): the board that
  // is waiting on tap_to_start was built with the old loadout — rebuild it,
  // the same way saving the Team modal does. Never mid-battle, never in PvP.
  const skillLoadoutKey = computed(() => JSON.stringify([skills.slots.value, skills.levels.value]))
  watch(skillLoadoutKey, () => {
    if (phase.value !== 'tap_to_start' || pvpMode.value) return
    ctx.rebuildBoard()
  })

  // ── HUD chips (§8.1) ───────────────────────────────────────────────────────
  const hudRows = computed(() => skillHud.value)
  /** Wordless lesson (§7.6): the chips breathe for the first 3 s of the first
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

  /** NEW dot on the Team button: an unlocked skill the player has not VIEWED
   *  yet (its reveal / the intro / the skill picker), or the slot-2 reveal is
   *  pending. Clears on first view, not on learn; the next unlock brings it
   *  back. Condition + persistence live in `useSkills.hasUnviewedSkill`. */
  const teamNew = computed(() => skills.hasUnviewedSkill.value)

  // ── Intro / reveal queue + gate (G12, G13) ─────────────────────────────────
  /** Set by a result-screen close that qualifies (queueIntro); cleared once
   *  the intro closed. Deliberately NOT persisted — the drop-off rule. */
  const introQueued = ref(false)
  const introOpen = ref(false)
  const introIds: Ref<SkillId[]> = ref([])
  const reveal: Ref<RevealItem | null> = ref(null)
  const pickerOpen = ref(false)
  const pickerSlot = ref(0)
  let lastClosedAt = -Infinity
  let cancelDrumroll: (() => void) | null = null

  const surfaceOpen = computed(() => introOpen.value || reveal.value !== null || pickerOpen.value)

  const queueIntro = (result: 'win' | 'lose' | null, mode: BattleMode) => {
    if (queueIntroAfterClose({
      enabled: true,
      result,
      mode,
      shouldShow: skills.shouldShowSkillsIntro
    })) introQueued.value = true
  }

  const revealCandidate = computed<RevealItem | null>(() => nextRevealItem({
    introQueued: introQueued.value,
    introPending: skills.isSkillsIntroPending.value,
    introIds: skills.introSkillIds.value,
    pendingReveals: skills.pendingReveals.value,
    pendingSlot: skills.pendingSlotReveal.value
  }))

  const gateIsOpen = (): boolean => revealGateOpen({
    enabled: true,
    phase: phase.value,
    ...ctx.gateBlockers(),
    surfaceOpen: surfaceOpen.value,
    now: performance.now(),
    lastClosedAt
  })

  const openSurface = (item: RevealItem) => {
    if (item.kind === 'intro') {
      introIds.value = item.ids
      introOpen.value = true
      pokiMeasure('skills', 'intro', 'visible')
    } else {
      reveal.value = item
      pokiMeasure('skills', 'reveal', 'visible')
    }
  }

  /** Open the pending surface if the gate allows it now. */
  const tryOpenSurface = (): boolean => {
    const item = revealCandidate.value
    if (!item || !gateIsOpen()) return false
    openSurface(item)
    return true
  }

  /** beginBattle's check: an open surface blocks the battle, and a pending
   *  one whose gate is open takes this tap instead — so it can never land
   *  mid-battle or over the interstitial. True = do not start the battle. */
  const takesBattleTap = (): boolean =>
    revealBlocksBattle({ surfaceOpen: surfaceOpen.value }) || tryOpenSurface()

  // Re-check while something is pending: most blockers (FModals, spacing, ad
  // state) are not one reactive source, so a light 250 ms poll runs ONLY while
  // a candidate exists and stops the moment none does.
  let gatePoll: number | null = null
  // Warm the surface chunks once one can come up soon (teaser stage, intro
  // pending, or a candidate), so the intro's drum roll never waits on a fetch.
  watch(
    () => skills.showTeaser.value || skills.isSkillsIntroPending.value || revealCandidate.value !== null,
    (soon) => {
      if (soon) prefetchSkillSurfaces()
    },
    { immediate: true }
  )
  watch(revealCandidate, (item) => {
    if (item && gatePoll === null) {
      gatePoll = window.setInterval(tryOpenSurface, 250)
    } else if (!item && gatePoll !== null) {
      clearInterval(gatePoll)
      gatePoll = null
    }
  }, { immediate: true })
  // The tap_to_start edge itself is checked at once, not on the next poll.
  watch(phase, (p) => {
    if (p === 'tap_to_start') void nextTick(tryOpenSurface)
  })

  const noteSurfaceClosed = () => {
    lastClosedAt = performance.now()
  }

  // Intro (first unlock): drum roll → panel → "Pick your skill" / close.
  const onIntroDrumroll = (ms: number) => {
    cancelDrumroll?.()
    cancelDrumroll = playSkillDrumroll(ms)
  }
  const closeIntro = (openPicker: boolean) => {
    if (!introOpen.value) return
    cancelDrumroll?.()
    cancelDrumroll = null
    introOpen.value = false
    introQueued.value = false
    // Seen only now that it was actually shown AND closed.
    skills.markSkillsIntroSeen()
    noteSurfaceClosed()
    if (openPicker) {
      pokiMeasure('skills', 'intro', 'interact')
      const empty = skills.slots.value.findIndex(id => id == null)
      pickerSlot.value = empty >= 0 && empty < skills.slotCount.value ? empty : 0
      pickerOpen.value = true
    }
  }
  const onIntroClose = () => closeIntro(false)
  const onIntroPicker = () => closeIntro(true)

  // Later unlocks: the light reveal overlay.
  const revealVariant = computed(() => {
    const k = reveal.value?.kind
    return k === 'slot' ? 'slot' : k === 'combined' ? 'combined' : 'skill'
  })
  const revealAutoSlot = computed(() => {
    const id = reveal.value?.ids[0]
    if (!id) return null
    const i = skills.slots.value.indexOf(id)
    return i >= 0 ? i : null
  })
  const finishReveal = () => {
    const item = reveal.value
    if (!item) return
    for (const id of item.ids) skills.markSeen(id)
    if (item.kind === 'slot') skills.markSlot2Seen()
    reveal.value = null
    noteSurfaceClosed()
  }
  const onRevealContinue = () => finishReveal()
  const onRevealOpenTeam = () => {
    pokiMeasure('skills', 'reveal', 'interact')
    finishReveal()
    ctx.openTeam()
  }

  watch(pickerOpen, (open) => {
    if (!open) noteSurfaceClosed()
  })

  // ── Poki funnel (§10.6): unlock / learn / upgrade / maxed / equip ──────────
  // Diffed from the skill state wherever the change came from (intro picker,
  // reveal, Team modal). A save re-read (hydrate / reset) only re-baselines.
  // `flush: 'post'` so useSkills' own saveDataVersion re-read has already run.
  const snapSkills = () => ({
    unlocked: [...skills.unlockedIds.value],
    levels: { ...skills.levels.value },
    slots: [...skills.slots.value]
  })
  let skillSnap = snapSkills()
  let skillSnapVersion = saveDataVersion.value
  watch(
    [() => skills.unlockedIds.value, () => skills.levels.value, () => skills.slots.value, saveDataVersion],
    () => {
      const next = snapSkills()
      if (saveDataVersion.value !== skillSnapVersion) {
        skillSnapVersion = saveDataVersion.value
      } else {
        for (const ev of diffSkillTelemetry(skillSnap, next, SKILL_MAX_LEVEL)) {
          pokiMeasure('skills', ev.what, ev.action)
        }
      }
      skillSnap = next
    },
    { flush: 'post' }
  )

  /** Timers the effect scope does not own. */
  const dispose = () => {
    if (gatePoll !== null) clearInterval(gatePoll)
    gatePoll = null
    if (hudBreatheTimer !== null) clearTimeout(hudBreatheTimer)
    hudBreatheTimer = null
    cancelDrumroll?.()
    cancelDrumroll = null
  }

  /** The team has a skill equipped (the arena rebuilds the waiting board once
   *  this module is in, since that board was built before it loaded). */
  const hasEquippedSkill = (): boolean => skills.slots.value.some(id => id != null)

  return {
    introBuildUpMs: INTRO_BUILDUP_MS,
    battleSkillOptions,
    ghostLoadout,
    hasEquippedSkill,
    pvpBattleSkillOptions,
    pvpHonorSkillLevels,
    hudRows,
    hudBreathe,
    teamNew,
    introOpen,
    introIds,
    reveal,
    pickerOpen,
    pickerSlot,
    revealVariant,
    revealAutoSlot,
    surfaceOpen,
    queueIntro,
    takesBattleTap,
    tryOpenSurface,
    onIntroDrumroll,
    onIntroClose,
    onIntroPicker,
    onRevealContinue,
    onRevealOpenTeam,
    dispose
  }
}

export type ArenaSkills = ReturnType<typeof useArenaSkills>

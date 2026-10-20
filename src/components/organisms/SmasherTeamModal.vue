<script setup lang="ts">
import { ref, computed, watch, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import CardRuneFrame from '@/components/atoms/CardRuneFrame.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import StatIcon from '@/components/icons/StatIcon.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import BGSkinButton from '@/components/organisms/BGSkinButton.vue'
import type { SpinnerConfig, TopPartId } from '@/types/spinner'
import useSpinnerConfig, { computeStats } from '@/use/useSpinnerConfig'
import useSmashers, { smasherLevel, levelUpSmasher, isSmasherUnlocked } from '@/use/useSmashers'
import {
  SMASHERS,
  SMASHER_LIST,
  SMASHER_MAX_LEVEL,
  SKILL_SLOT_LEVELS,
  isSmasherId,
  smasherConfig,
  smasherLevelCost,
  smasherSkillLevel,
  type SmasherId
} from '@/data/smasherCatalog'
// Skill UI through the skills gate (lazy; null / never loaded when off).
import { SKILLS_BUILD, SkillIconUi, loadSmasherSkillText, type SmasherSkillTextModule } from '@/skills/skillsGate'
import {
  SKINS_PER_TOP, skinCost,
  modelImgPath, isSkinOwned, purchaseSkinWithCoins, selectSkin, getSelectedSkin,
  hasUnownedSkinsForTop,
  isAdUnlockSkin, isEarnOnlySkin, recordSkinAdWatch, settleSkinAdProgress,
  markSkinPickerOpened, wasSkinPickerOpened,
  type SpinnerModelId
} from '@/use/useModels'
import { isBgSkinsEnabled, isNative } from '@/use/useUser'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
// Bosses 100+ (bosses gate): pure boundary data, used only behind the literal.
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'
import { fmtFixed } from '@/utils/localeNumber'
import { trophySkinFirstStage } from '@/data/bossEncounters'

// ─── Team modal: the smasher roster + the 2-slot team ──────────────────────
//
// Replaces the old part-based SpinnerConfigModal. Every smasher is ONE unit:
// pick it into a team slot, level it up with coins (stats + skill levels),
// and read its three unique skills (slot 2 opens at Lv 10, slot 3 at Lv 20).
// Colourways stay per archetype top part AND team slot (`getSelectedSkin(top,
// slot)`) — the same mapping `playerTeamWithUpgrades` reads.

interface Props {
  modelValue: boolean
  initialTeam?: SpinnerConfig[]
  /** Best campaign stage ever reached — recruits the roster. */
  bestStage?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialTeam: () => [smasherConfig('bramble', 1), smasherConfig('thumper', 1)],
  bestStage: 1
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', team: SpinnerConfig[]): void
}>()

const { t, locale } = useSfcI18n('SmasherTeamModal')
const { coins, addCoins } = useSpinnerConfig()
const { levels: rosterLevels } = useSmashers()

// ─── Team (local editable copy) ─────────────────────────────────────────────

const teamIds: Ref<SmasherId[]> = ref([])
const selectedId: Ref<SmasherId> = ref('bramble')

const teamFromProps = (): SmasherId[] =>
  props.initialTeam.map(c => (isSmasherId(c.smasherId) ? c.smasherId : 'bramble'))

watch(() => props.modelValue, (open) => {
  if (!open) return
  teamIds.value = teamFromProps()
  selectedId.value = teamIds.value[0] ?? 'bramble'
  // CrazyGames `gameplayStop` at the call site (idempotent; see the arena).
  stopGameplay()
}, { immediate: true })

const emitTeam = () => {
  emit('save', teamIds.value.map((id, i) => {
    const cfg = smasherConfig(id, smasherLevel(id))
    cfg.modelId = getSelectedSkin(cfg.topPartId, i)
    return cfg
  }))
}

/** Team slot of a smasher, or -1. */
const slotOf = (id: SmasherId): number => teamIds.value.indexOf(id)

const unlocked = (id: SmasherId): boolean => isSmasherUnlocked(id, props.bestStage)

/** Put the selected smasher into `slot`; a smasher already in the other slot
 *  swaps places, so the team never holds a duplicate. */
const putInSlot = (slot: number) => {
  const id = selectedId.value
  if (!unlocked(id) || slot < 0 || slot >= teamIds.value.length) return
  const next = [...teamIds.value]
  const from = next.indexOf(id)
  if (from === slot) return
  if (from >= 0) next[from] = next[slot]!
  next[slot] = id
  teamIds.value = next
  emitTeam()
}

const selectSmasher = (id: SmasherId) => {
  selectedId.value = id
}

// ─── Levels, stats ─────────────────────────────────────────────────────────

// Reading the roster ref keeps every level-derived value reactive.
const levelOf = (id: SmasherId): number => {
  void rosterLevels.value
  return smasherLevel(id)
}

const statsAt = (id: SmasherId, level: number) => {
  const cfg = smasherConfig(id, level)
  return computeStats(cfg, cfg.topLevel ?? 0, cfg.bottomLevel ?? 0)
}

type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'weight'
const STAT_ROWS: { key: StatKey, icon: 'hp' | 'attack' | 'defense' | 'speed' | 'weight', label: string, color: string }[] = [
  { key: 'hp', icon: 'hp', label: 'statHp', color: 'var(--color-leaf-500)' },
  { key: 'atk', icon: 'attack', label: 'statAtk', color: 'var(--color-berry-500)' },
  { key: 'def', icon: 'defense', label: 'statDef', color: 'var(--color-sky-500)' },
  { key: 'spd', icon: 'speed', label: 'statSpd', color: 'var(--color-sun-500)' },
  { key: 'weight', icon: 'weight', label: 'statWeight', color: 'var(--color-wood-500)' }
]

const statValue = (s: ReturnType<typeof statsAt>, key: StatKey): number => {
  switch (key) {
    case 'hp': return s.maxHp
    case 'atk': return s.damageMultiplier
    case 'def': return s.defenseMultiplier
    case 'spd': return s.speedMultiplier
    case 'weight': return s.totalWeight
  }
}

/** Bar scale per stat: the highest value any smasher reaches at max level. */
const STAT_CAP: Record<StatKey, number> = (() => {
  const cap: Record<StatKey, number> = { hp: 1, atk: 1, def: 1, spd: 1, weight: 1 }
  for (const s of SMASHER_LIST) {
    const st = statsAt(s.id, SMASHER_MAX_LEVEL)
    for (const r of STAT_ROWS) cap[r.key] = Math.max(cap[r.key], statValue(st, r.key))
  }
  return cap
})()

const fmtStat = (key: StatKey, v: number): string =>
  key === 'hp' ? String(Math.round(v)) : key === 'weight' ? fmtFixed(v, 1, locale.value) : `${fmtFixed(v, 2, locale.value)}x`

const selectedLevel = computed(() => levelOf(selectedId.value))
const selectedMaxed = computed(() => selectedLevel.value >= SMASHER_MAX_LEVEL)
const selectedCost = computed(() => smasherLevelCost(selectedLevel.value))
const canAfford = computed(() => selectedCost.value !== null && coins.value >= selectedCost.value)

const statRows = computed(() => {
  const id = selectedId.value
  const now = statsAt(id, selectedLevel.value)
  const next = selectedMaxed.value ? null : statsAt(id, selectedLevel.value + 1)
  return STAT_ROWS.map(r => {
    const v = statValue(now, r.key)
    const nv = next ? statValue(next, r.key) : v
    return {
      ...r,
      value: fmtStat(r.key, v),
      next: next && nv - v > 1e-9 ? fmtStat(r.key, nv) : null,
      frac: Math.min(1, v / STAT_CAP[r.key]),
      nextFrac: Math.min(1, nv / STAT_CAP[r.key])
    }
  })
})

// ─── Level up ──────────────────────────────────────────────────────────────

/** Bumps on every level-up: re-keys the pop / coin-float animations. */
const levelUpPulse = ref(0)
const lastSpent = ref(0)

const buyLevel = () => {
  const id = selectedId.value
  const cost = smasherLevelCost(levelOf(id))
  if (cost === null || coins.value < cost || !unlocked(id)) return
  addCoins(-cost)
  if (levelUpSmasher(id) === null) {
    addCoins(cost)
    return
  }
  lastSpent.value = cost
  levelUpPulse.value++
  if (slotOf(id) >= 0) emitTeam()
}

// ─── Skills ────────────────────────────────────────────────────────────────

const skillText = shallowRef<SmasherSkillTextModule | null>(null)
void loadSmasherSkillText().then((m) => {
  skillText.value = m
}).catch(() => { /* names still show; numbers arrive with the next open */
})

const skillRows = computed(() => {
  const text = skillText.value
  const def = SMASHERS[selectedId.value]
  const lv = selectedLevel.value
  return def.skills.map((skill, slot) => {
    const skillLv = smasherSkillLevel(lv, slot)
    return {
      skill,
      slot,
      locked: skillLv === 0,
      unlockAt: SKILL_SLOT_LEVELS[slot]!,
      level: skillLv,
      name: t(`smasher_skill_${skill.id}`),
      desc: text ? t(`smasher_skill_${skill.id}_desc`, text.smasherSkillDescParams(skill, Math.max(1, skillLv), locale.value)) : ''
    }
  })
})

// ─── Skin picker (per archetype top + team slot) ────────────────────────────

const selectedSlot = computed(() => slotOf(selectedId.value))
const selectedTop = computed<TopPartId>(() => SMASHERS[selectedId.value].archetype.top)

/** Portrait of a smasher: its colourway in its team slot, else slot 0's. */
const portraitOf = (id: SmasherId): string => {
  const slot = Math.max(0, slotOf(id))
  return modelImgPath(getSelectedSkin(SMASHERS[id].archetype.top, slot))
}

const trophyCardText = (modelId: string): string => {
  const n = BOSSES100_BUILD ? trophySkinFirstStage(modelId) : null
  return n === null ? t('trophySkin.label') : t('trophySkin.beatStage', { n })
}

const skinPickerOpen = ref(false)
const skinPickerKey = ref(0)
const pickerSkins = computed(() => {
  const topId = selectedTop.value
  const all = SKINS_PER_TOP[topId]
  return BOSSES100_BUILD ? all : all.filter(id => !isEarnOnlySkin(id) || isSkinOwned(topId, id))
})

const openSkinPicker = () => {
  if (selectedSlot.value < 0) return
  skinPickerKey.value++
  skinPickerOpen.value = true
  markSkinPickerOpened(selectedTop.value)
  settleSkinAdProgress()
}

const shouldBouncePlus = computed(() =>
  hasUnownedSkinsForTop(selectedTop.value) && !wasSkinPickerOpened(selectedTop.value)
)

const handleBuySkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  const cost = skinCost(modelId)
  if (coins.value < cost) return
  if (purchaseSkinWithCoins(topId, modelId)) addCoins(-cost)
}

const skinAdPending = ref(false)
const handleWatchSkinAd = async (topId: TopPartId, modelId: SpinnerModelId) => {
  if (skinAdPending.value || !isRewardedReady.value) return
  skinAdPending.value = true
  try {
    const ok = await showRewardedAd({ kind: 'skinAd' })
    if (ok) recordSkinAdWatch(topId, modelId)
  } finally {
    skinAdPending.value = false
  }
}

const handleSelectSkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  if (selectedSlot.value < 0) return
  selectSkin(topId, modelId, selectedSlot.value)
  emitTeam()
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :title="t('team')"
  )
    div.team-layout(data-testid="smasher-team-modal")
      //- ── Left: team slots + roster ──────────────────────────────────────
      div.team-col
        div.relative.flex.justify-center.items-center.team-header
          div.coin-pill.ui-chip.ui-chip--sun.absolute.left-0
            IconCoin(class="w-3.5 h-3.5")
            span(data-testid="team-coins") {{ coins }}
          h3.label-section {{ t('team') }}
          div.absolute.right-0.flex.items-center(v-if="isBgSkinsEnabled")
            div.relative
              BGSkinButton
              IconDiamond(class="absolute -bottom-1 -left-1 w-3.5 h-3.5 z-10 pointer-events-none")

        div.team-slots
          button.team-slot(
            v-for="(id, i) in teamIds"
            :key="'slot-' + i"
            type="button"
            :class="{ 'is-selected': selectedId === id }"
            :data-testid="'team-slot-' + i"
            @click="selectSmasher(id)"
          )
            CardRuneFrame(:part-id="SMASHERS[id].archetype.top" :selected="selectedId === id")
            span.slot-tag.game-text {{ t('slotLabel', { n: i + 1 }) }}
            img.slot-portrait(:src="portraitOf(id)" :alt="t('smasher_' + id)" draggable="false")
            span.slot-name.game-text {{ t('smasher_' + id) }}
            span.lv-badge.game-text {{ t('levelShort', { n: levelOf(id) }) }}

        h3.label-section.roster-title {{ t('roster') }}
        div.roster-grid
          button.roster-card(
            v-for="s in SMASHER_LIST"
            :key="s.id"
            type="button"
            :class="{ 'is-selected': selectedId === s.id, 'is-locked': !unlocked(s.id) }"
            :aria-pressed="selectedId === s.id"
            :data-testid="'roster-' + s.id"
            @click="selectSmasher(s.id)"
          )
            CardRuneFrame(:part-id="s.archetype.top" :selected="selectedId === s.id")
            img.roster-portrait(:src="portraitOf(s.id)" :alt="t('smasher_' + s.id)" draggable="false")
            span.roster-name.game-text {{ t('smasher_' + s.id) }}
            span.roster-species {{ t('smasher_' + s.id + '_species') }}
            span.lv-badge.game-text(v-if="unlocked(s.id)") {{ t('levelShort', { n: levelOf(s.id) }) }}
            span.lock-note.game-text(v-else) 🔒 {{ t('lockedUntilStage', { n: s.unlockStage }) }}
            span.team-mark.game-text(v-if="slotOf(s.id) >= 0") {{ slotOf(s.id) + 1 }}

      //- ── Right: detail panel of the selected smasher ────────────────────
      div.detail-col(data-testid="smasher-detail")
        div.detail-head
          div.detail-portrait-wrap
            img.detail-portrait(:src="portraitOf(selectedId)" :alt="t('smasher_' + selectedId)" draggable="false")
            //- Colourway picker: per archetype top + team slot.
            button.skin-plus-btn(
              v-if="selectedSlot >= 0"
              type="button"
              :class="{ 'hint-bounce-2': shouldBouncePlus }"
              :title="t('purchaseMoreSkins')"
              :aria-label="t('selectSkin')"
              @click="openSkinPicker"
            ) +
          div.detail-title
            div.detail-name.game-text {{ t('smasher_' + selectedId) }}
            div.detail-species {{ t('smasher_' + selectedId + '_species') }}
            div.detail-desc {{ t('smasher_' + selectedId + '_desc') }}
            div.level-line
              span.lv-badge.lv-badge--big.game-text(:key="'lv-' + levelUpPulse" :class="{ 'lv-pop': levelUpPulse > 0 }")
                | {{ selectedMaxed ? t('maxLevel') : t('levelShort', { n: selectedLevel }) }}

        //- Stats with the next-level preview
        div.stat-bars
          div.stat-row(v-for="r in statRows" :key="r.key")
            StatIcon.stat-row-icon(:stat="r.icon")
            span.stat-row-label {{ t(r.label) }}
            div.stat-bar
              div.stat-bar-next(v-if="r.next" :style="{ width: (r.nextFrac * 100) + '%', backgroundColor: r.color }")
              div.stat-bar-fill(:style="{ width: (r.frac * 100) + '%', backgroundColor: r.color }")
            span.stat-row-value.game-text {{ r.value }}
            span.stat-row-next.game-text(v-if="r.next") ▸ {{ r.next }}

        //- Level up / recruit state / team placement
        div.action-row
          template(v-if="unlocked(selectedId)")
            div.levelup-wrap(v-if="!selectedMaxed")
              FButton(
                tone="premium"
                size="sm"
                :is-disabled="!canAfford"
                :aria-label="t('levelUpAria', { name: t('smasher_' + selectedId), cost: selectedCost }, selectedCost ?? 0)"
                data-testid="level-up"
                @click="buyLevel"
              )
                span.levelup-label
                  StatIcon.levelup-icon(stat="level-up")
                  span {{ t('levelUp') }}
                  IconCoin.levelup-icon
                  span {{ selectedCost }}
              span.coin-float.game-text(
                v-if="levelUpPulse > 0"
                :key="'spent-' + levelUpPulse"
                aria-hidden="true"
              ) −{{ lastSpent }}
            div.max-note.game-text(v-else) {{ t('maxLevel') }}
            div.slot-buttons
              button.slot-btn.ui-btn.ui-btn--primary(
                v-for="(_, i) in teamIds"
                :key="'put-' + i"
                type="button"
                :disabled="teamIds[i] === selectedId"
                :data-testid="'put-in-slot-' + i"
                @click="putInSlot(i)"
              ) {{ teamIds[i] === selectedId ? t('inTeam') : t('putInSlot', { n: i + 1 }) }}
          div.lock-banner.game-text(v-else) 🔒 {{ t('lockedUntilStage', { n: SMASHERS[selectedId].unlockStage }) }}

        //- The three unique skills
        h3.label-section(v-if="SKILLS_BUILD") {{ t('skillsLabel') }}
        div.skill-list(v-if="SKILLS_BUILD" data-testid="smasher-skills")
          div.skill-row(
            v-for="row in skillRows"
            :key="row.skill.id"
            :class="{ 'is-locked': row.locked }"
            :data-testid="'skill-' + row.skill.id"
          )
            component(v-if="SkillIconUi" :is="SkillIconUi" :id="row.skill.effect" :size="36" decorative)
            div.skill-text
              div.skill-head
                span.skill-name.game-text {{ row.name }}
                span.skill-lv.game-text(v-if="!row.locked") {{ t('skillLevel', { n: row.level }) }}
                span.skill-lock.game-text(v-else) 🔒 {{ t('unlocksAtLevel', { n: row.unlockAt }) }}
              div.skill-desc(v-if="row.desc") {{ row.desc }}

        p.hint-text {{ t('hintTeam') }}

  //- ── Skin Picker Modal ───────────────────────────────────────────────────
  FModal(
    :model-value="skinPickerOpen"
    @update:model-value="skinPickerOpen = $event"
    :is-closable="true"
    :title="t('selectSkin')"
    :key="'skin-' + skinPickerKey"
  )
    div.skin-picker-body(class="px-2 sm:px-4 py-2")
      div.flex.items-center.justify-between.mb-2
        div.coin-pill.ui-chip.ui-chip--sun
          IconCoin(class="w-3.5 h-3.5")
          span {{ coins }}
      div.grid.gap-2.skin-picker-grid(class="grid-cols-3 sm:grid-cols-4")
        div.skin-card(
          v-for="modelId in pickerSkins"
          :key="modelId"
          class="flex flex-col items-center p-1.5"
          :class="[\
            getSelectedSkin(selectedTop, selectedSlot) === modelId\
              ? 'is-equipped'\
              : isSkinOwned(selectedTop, modelId)\
                ? 'is-owned'\
                : 'is-locked'\
          ]"
        )
          img.skin-card-img(
            :src="modelImgPath(modelId)"
            class="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-lg"
            :alt="modelId"
          )
          div.skin-card-name(class="mt-0.5 text-[0.7rem] sm:text-xs") {{ t('skins.' + modelId) }}
          template(v-if="getSelectedSkin(selectedTop, selectedSlot) === modelId")
            div.ui-chip.ui-chip--leaf(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]") {{ t('equipped') }}
          template(v-else-if="isSkinOwned(selectedTop, modelId)")
            button.skin-btn.ui-btn.ui-btn--primary(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
              @click="handleSelectSkin(selectedTop, modelId)"
            ) {{ t('selectButton') }}
          template(v-else-if="isEarnOnlySkin(modelId)")
            div.trophy-note.ui-chip.ui-chip--wood(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
              role="note"
              :title="t('trophySkin.hint')"
              :aria-label="trophyCardText(modelId)"
            )
              span(aria-hidden="true") 🏆
              span.game-text {{ trophyCardText(modelId) }}
          template(v-else-if="isAdUnlockSkin(modelId)")
            button.skin-btn.ui-btn.ui-btn--ad(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
              :disabled="!isRewardedReady || skinAdPending"
              :aria-label="t('watchAdsToUnlock')"
              :title="t('watchAdsToUnlock')"
              @click="handleWatchSkinAd(selectedTop, modelId)"
            )
              span.game-text(v-if="isNative") {{ t('spinner.ad') }}
              img.object-contain(
                :src="prependBaseUrl('images/icons/movie_128x96.webp')"
                class="w-3.5 h-3.5 sm:w-4 sm:h-4"
                alt=""
              )
          template(v-else)
            button.skin-btn.ui-btn.ui-btn--premium(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]"
              :class="{ 'is-disabled': coins < skinCost(modelId) }"
              @click="handleBuySkin(selectedTop, modelId)"
            )
              IconCoin(class="w-3 h-3")
              span.game-text {{ skinCost(modelId) }}
</template>


<style scoped lang="sass">
// Cozy restyle: everything sits on FModal's cream parchment, so text is ink.
// Cards are cream patches with a stitched felt frame (CardRuneFrame), badges
// are wood chips, stat bars are wood wells with the semantic stat colours.
// Perf: flat fills, 0-blur shadows only.

$ink: var(--color-ink)
$ink-outline: 0 1px 0 $ink, 1px 0 0 $ink, -1px 0 0 $ink, 0 -1px 0 $ink, 1px 1px 0 $ink, -1px 1px 0 $ink, 1px -1px 0 $ink, -1px -1px 0 $ink

// Ink text on parchment by default; outlined cream only on coloured chips.
.game-text
  text-shadow: none

.label-section
  font-size: 1rem
  font-weight: 900
  line-height: 1.1
  letter-spacing: 0.02em
  color: var(--ui-text)

.coin-pill
  font-size: 0.85rem

.team-layout
  display: flex
  flex-direction: column
  gap: 0.6rem
  padding: 0.25rem 0.45rem
  color: var(--ui-text)

.team-col, .detail-col
  min-width: 0
  display: flex
  flex-direction: column
  gap: 0.45rem

.team-header
  min-height: 2rem

// ── Team slots / roster cards: cream felt patches ──────────────────────────
.team-slots
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 0.5rem

.team-slot, .roster-card
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  border: 2px solid transparent
  border-radius: var(--radius-ui)
  background-color: var(--color-cream-200)
  color: var(--ui-text)
  box-shadow: 0 3px 0 var(--color-wood-700)
  cursor: pointer
  transition: transform 0.12s
  -webkit-tap-highlight-color: transparent
  &:hover
    transform: translateY(-1px)
  &:active
    transform: translateY(2px)
    box-shadow: 0 1px 0 var(--color-wood-700)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  &.is-selected
    background-color: var(--color-sun-200)
    box-shadow: 0 3px 0 $ink

.team-slot
  padding: 0.4rem 0.35rem 0.45rem

.slot-tag
  align-self: flex-start
  position: relative
  z-index: 16
  font-size: 0.7rem
  font-weight: 900
  color: var(--ui-text-muted)

.slot-portrait
  width: 4.2rem
  height: 4.2rem
  object-fit: contain

.slot-name, .roster-name
  font-weight: 900
  font-size: 0.9rem
  line-height: 1.1
  overflow-wrap: anywhere
  text-align: center
  color: var(--ui-text)

.lv-badge
  position: relative
  z-index: 20
  display: inline-block
  margin-top: 0.15rem
  padding: 1px 6px 2px
  font-size: 0.72rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-cream-50)
  background-color: var(--color-wood-600)
  border: 2px solid $ink
  border-radius: 999px
  box-shadow: 0 2px 0 $ink
  text-shadow: $ink-outline

.lv-badge--big
  font-size: 0.95rem
  padding: 2px 10px 3px

.lv-pop
  animation: lv-pop 0.45s ease-out

@keyframes lv-pop
  0%
    transform: scale(1)
  40%
    transform: scale(1.45)
  100%
    transform: scale(1)

// ── Roster ─────────────────────────────────────────────────────────────────
.roster-title
  text-align: center

.roster-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 0.45rem

.roster-card
  padding: 0.35rem 0.2rem 0.4rem
  &.is-locked
    background-color: var(--color-cream-300)
    .roster-portrait
      filter: grayscale(1) brightness(0.7)

.roster-portrait
  width: 3.1rem
  height: 3.1rem
  object-fit: contain

.roster-name
  font-size: 0.78rem

.roster-species
  font-size: 0.66rem
  font-weight: 800
  color: var(--ui-text-muted)
  line-height: 1.1
  text-align: center

.lock-note
  margin-top: 0.15rem
  font-size: 0.62rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-berry-700)
  text-align: center

.team-mark
  position: absolute
  z-index: 20
  top: 0.2rem
  right: 0.25rem
  width: 1.2rem
  height: 1.2rem
  border-radius: 999px
  background-color: var(--color-leaf-500)
  border: 2px solid $ink
  color: var(--color-cream-50)
  text-shadow: $ink-outline
  font-size: 0.7rem
  font-weight: 900
  display: flex
  align-items: center
  justify-content: center

// ── Detail panel: a recessed parchment well ────────────────────────────────
.detail-col
  background-color: var(--ui-surface-2)
  border: 2px solid var(--color-cream-400)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 2px 0 rgba(110, 69, 39, 0.16)
  padding: 0.55rem

.detail-head
  display: flex
  gap: 0.6rem
  align-items: center

.detail-portrait-wrap
  position: relative
  flex: 0 0 auto
  border-radius: var(--radius-ui)
  background-color: var(--color-cream-50)
  border: 2px solid var(--color-wood-700)
  outline: 2px dashed rgba(110, 69, 39, 0.35)
  outline-offset: -6px

.detail-portrait
  width: 5.5rem
  height: 5.5rem
  object-fit: contain

.skin-plus-btn
  position: absolute
  right: -0.4rem
  bottom: -0.35rem
  width: 1.9rem
  height: 1.9rem
  border-radius: 999px
  border: 2px solid $ink
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), 0 2px 0 $ink
  color: var(--color-cream-50)
  text-shadow: $ink-outline
  font-weight: 900
  font-size: 1.25rem
  line-height: 1
  cursor: pointer
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
  // Visual disc stays small; the tap area is padded out.
  &::after
    content: ''
    position: absolute
    inset: -0.6rem

.detail-title
  min-width: 0
  flex: 1 1 auto

.detail-name
  color: var(--ui-text)
  font-weight: 900
  font-size: 1.25rem
  line-height: 1.1

.detail-species
  color: var(--color-wood-600)
  font-size: 0.8rem
  font-weight: 900

.detail-desc
  color: var(--ui-text-muted)
  font-size: 0.8rem
  font-weight: 800
  line-height: 1.25
  margin-top: 0.15rem

.level-line
  margin-top: 0.3rem

// ── Stats ──────────────────────────────────────────────────────────────────
.stat-bars
  display: flex
  flex-direction: column
  gap: 0.25rem

.stat-row
  display: grid
  grid-template-columns: 1.3rem 3.6rem minmax(0, 1fr) auto auto
  align-items: center
  gap: 0.35rem
  font-size: 0.82rem
  color: var(--ui-text)

.stat-row-icon
  width: 1.25rem
  height: 1.25rem

.stat-row-label
  font-weight: 900
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.stat-bar
  position: relative
  height: 0.7rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-wood-800)
  overflow: hidden

.stat-bar-fill, .stat-bar-next
  position: absolute
  inset: 0 auto 0 0
  border-radius: 999px

.stat-bar-fill
  box-shadow: inset 0 2px 0 rgba(255, 250, 240, 0.35)

.stat-bar-next
  opacity: 0.4

.stat-row-value
  font-weight: 900
  color: var(--ui-text)
  min-width: 2.6rem
  text-align: right

.stat-row-next
  font-weight: 900
  color: var(--color-leaf-700)
  min-width: 3rem

// ── Actions ────────────────────────────────────────────────────────────────
.action-row
  display: flex
  flex-wrap: wrap
  gap: 0.45rem
  align-items: center
  justify-content: space-between

.levelup-wrap
  position: relative
  flex: 1 1 10rem
  min-width: 0

.levelup-label
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.25rem
  font-size: 0.95rem

.levelup-icon
  width: 1.1rem
  height: 1.1rem

.coin-float
  position: absolute
  top: -0.4rem
  right: 0.6rem
  color: var(--color-sun-300)
  text-shadow: $ink-outline
  font-weight: 900
  pointer-events: none
  animation: coin-float 0.9s ease-out forwards

@keyframes coin-float
  0%
    opacity: 1
    transform: translateY(0)
  100%
    opacity: 0
    transform: translateY(-1.6rem)

.max-note, .lock-banner
  flex: 1 1 10rem
  text-align: center
  font-weight: 900
  padding: 0.5rem
  border-radius: var(--radius-ui)
  border: 2px solid $ink
  box-shadow: 0 3px 0 $ink

.max-note
  background-color: var(--color-sun-200)
  color: var(--ui-text)

.lock-banner
  background-color: var(--color-wood-600)
  color: var(--color-cream-50)
  text-shadow: $ink-outline

.slot-buttons
  display: flex
  gap: 0.4rem
  flex: 1 1 10rem

.slot-btn
  flex: 1 1 0
  min-height: 2.75rem
  padding: 0.3rem 0.4rem 0.4rem
  font-size: 0.82rem

// ── Skills: cream chips with the skill icon ────────────────────────────────
.skill-list
  display: flex
  flex-direction: column
  gap: 0.35rem

.skill-row
  display: flex
  gap: 0.5rem
  align-items: flex-start
  padding: 0.4rem 0.45rem
  border-radius: var(--radius-ui)
  background-color: var(--color-cream-50)
  border: 2px solid var(--color-wood-700)
  box-shadow: 0 2px 0 var(--color-wood-700)
  &.is-locked
    background-color: var(--color-cream-300)
    border-color: var(--color-cream-400)
    box-shadow: none
    .skill-desc, .skill-name
      opacity: 0.7
    :deep(svg)
      filter: grayscale(1)

.skill-text
  min-width: 0
  flex: 1 1 auto

.skill-head
  display: flex
  flex-wrap: wrap
  gap: 0.15rem 0.45rem
  align-items: center

.skill-name
  color: var(--ui-text)
  font-weight: 900
  font-size: 0.92rem

.skill-lv, .skill-lock
  display: inline-flex
  padding: 0 0.45em 0.05em
  border-radius: 999px
  border: 2px solid $ink
  font-size: 0.72rem
  font-weight: 900
  line-height: 1.3

.skill-lv
  background-color: var(--color-plum-500)
  color: var(--color-cream-50)
  text-shadow: $ink-outline

.skill-lock
  background-color: var(--color-cream-200)
  color: var(--ui-text)

.skill-desc
  color: var(--ui-text-muted)
  font-weight: 800
  font-size: 0.78rem
  line-height: 1.3

.hint-text
  margin: 0
  font-size: 0.75rem
  font-weight: 800
  line-height: 1.25
  color: var(--ui-text-muted)
  text-align: center

// ── Desktop / tablet: roster beside the detail panel ───────────────────────
@media (min-width: 760px)
  .team-layout
    flex-direction: row
    align-items: flex-start
  .team-col
    flex: 1 1 52%
  .detail-col
    flex: 1 1 48%
  .label-section
    font-size: 1.15rem

// ── Landscape phones: the same two columns, tighter ────────────────────────
@media (orientation: landscape) and (max-height: 500px)
  .team-layout
    flex-direction: row
    align-items: flex-start
    gap: 0.4rem
  .team-col
    flex: 1 1 55%
  .detail-col
    flex: 1 1 45%
    padding: 0.4rem
  .roster-grid
    grid-template-columns: repeat(6, minmax(0, 1fr))
    gap: 0.3rem
  .roster-portrait
    width: 2.4rem
    height: 2.4rem
  .roster-species
    display: none
  .slot-portrait
    width: 3rem
    height: 3rem
  .detail-portrait
    width: 4rem
    height: 4rem
  .detail-desc
    display: none

// ── Skin picker ────────────────────────────────────────────────────────────
.skin-card
  border: 2px solid var(--color-cream-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-cream-200)
  color: var(--ui-text)
  &.is-owned
    border-color: var(--color-wood-700)
    background-color: var(--color-cream-50)
    cursor: pointer
  &.is-equipped
    border-color: $ink
    background-color: var(--color-sun-200)
    box-shadow: 0 3px 0 $ink

.skin-card-name
  font-weight: 900
  text-align: center
  color: var(--ui-text)

.skin-btn
  min-height: 2.75rem
  padding: 0.3em 0.8em 0.4em
  gap: 0.25rem

.trophy-note
  gap: 0.25rem
  .game-text
    color: var(--color-cream-50)
    text-shadow: $ink-outline

.skin-btn .game-text
  color: inherit
  text-shadow: inherit

@media (orientation: landscape) and (max-height: 500px)
  .skin-picker-grid
    gap: 0.3rem
    grid-template-columns: repeat(6, minmax(0, 1fr))
  .skin-card-img
    width: 2.4rem
    height: 2.4rem
</style>

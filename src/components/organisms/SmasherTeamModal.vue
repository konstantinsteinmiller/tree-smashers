<script setup lang="ts">
import { ref, computed, watch, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import CardRuneFrame from '@/components/atoms/CardRuneFrame.vue'
import { smasherRarity, type SmasherRarity } from '@/data/smasherRarity'
import { playUiSfx } from '@/use/uiSfx'
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

/** Card edge tier — presentation only (see smasherRarity.ts). */
const rarityOf = (id: SmasherId): SmasherRarity => smasherRarity(SMASHERS[id].unlockStage)

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
  { key: 'weight', icon: 'weight', label: 'statWeight', color: 'var(--color-royal-500)' }
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
  playUiSfx('reward')
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
  return modelImgPath(getSelectedSkin(SMASHERS[id].archetype.top, slot), id)
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
          button.team-slot.ui-pop-in(
            v-for="(id, i) in teamIds"
            :key="'slot-' + i"
            type="button"
            :class="[`rarity-${rarityOf(id)}`, { 'is-selected': selectedId === id }]"
            :style="{ '--i': i }"
            :data-testid="'team-slot-' + i"
            @click="selectSmasher(id)"
          )
            CardRuneFrame(:part-id="SMASHERS[id].archetype.top" :rarity="rarityOf(id)" :selected="selectedId === id")
            span.slot-tag.game-text {{ t('slotLabel', { n: i + 1 }) }}
            img.slot-portrait(:src="portraitOf(id)" :alt="t('smasher_' + id)" draggable="false")
            span.name-plate.slot-name.game-text
              span {{ t('smasher_' + id) }}
            span.lv-badge.game-text
              span {{ t('levelShort', { n: levelOf(id) }) }}

        h3.label-section.roster-title {{ t('roster') }}
        div.roster-grid
          button.roster-card.ui-pop-in(
            v-for="(s, i) in SMASHER_LIST"
            :key="s.id"
            type="button"
            :class="[`rarity-${rarityOf(s.id)}`, { 'is-selected': selectedId === s.id, 'is-locked': !unlocked(s.id) }]"
            :style="{ '--i': Math.min(i + 2, 14) }"
            :aria-pressed="selectedId === s.id"
            :data-testid="'roster-' + s.id"
            @click="selectSmasher(s.id)"
          )
            CardRuneFrame(:part-id="s.archetype.top" :rarity="rarityOf(s.id)" :locked="!unlocked(s.id)" :selected="selectedId === s.id")
            img.roster-portrait(:src="portraitOf(s.id)" :alt="t('smasher_' + s.id)" draggable="false")
            span.name-plate.roster-name.game-text
              span {{ t('smasher_' + s.id) }}
            span.roster-species {{ t('smasher_' + s.id + '_species') }}
            span.lv-badge.game-text(v-if="unlocked(s.id)")
              span {{ t('levelShort', { n: levelOf(s.id) }) }}
            span.lock-note.game-text(v-else) 🔒 {{ t('lockedUntilStage', { n: s.unlockStage }) }}
            span.team-mark.game-text(v-if="slotOf(s.id) >= 0") {{ slotOf(s.id) + 1 }}

      //- ── Right: detail panel of the selected smasher ────────────────────
      div.detail-col(data-testid="smasher-detail")
        div.detail-head
          div.detail-portrait-wrap(:class="`rarity-${rarityOf(selectedId)}`" :key="'portrait-' + selectedId")
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
          div.stat-row.ui-pop-in(v-for="(r, i) in statRows" :key="r.key + '-' + selectedId" :style="{ '--i': i }")
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
              //- The screen's ONE hero CTA: sun, uppercase, shine + heartbeat
              //- while affordable; steel + deny shake when short.
              FButton(
                tone="premium"
                variant="brawl"
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
          div.skill-row.ui-pop-in(
            v-for="row in skillRows"
            :key="row.skill.id"
            :style="{ '--i': row.slot + 3 }"
            :class="{ 'is-locked': row.locked }"
            :data-testid="'skill-' + row.skill.id"
          )
            component(v-if="SkillIconUi" :is="SkillIconUi" :id="row.skill.effect" :skill-key="row.skill.id" :size="36" decorative)
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
            :src="modelImgPath(modelId, selectedId)"
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
// Action pass: everything sits on FModal's ice card, so body text is ink.
// Team slots + roster are COLLECTIBLE CARDS: a bold ink frame with a rarity
// edge band + corner stripes (CardRuneFrame, presentation-only rarity from
// smasherRarity.ts), a skewed ink name plate, an angled level chip. Cards lift
// and tilt on hover, sink on press (the global press handler adds
// .is-pressed), and the picked card turns sun with a pop. Locked cards are
// steel with flat hatch stripes. Stat bars are navy wells with striped fills.
// Perf: flat fills, 0-blur shadows only, transform/opacity motion only.

$ink: var(--color-ink)
$ink-outline: 0 1px 0 $ink, 1px 0 0 $ink, -1px 0 0 $ink, 0 -1px 0 $ink, 1px 1px 0 $ink, -1px 1px 0 $ink, 1px -1px 0 $ink, -1px -1px 0 $ink

// Ink text on the ice card by default; outlined white only on coloured chips.
.game-text
  text-shadow: none

.label-section
  font-size: 1rem
  font-weight: 900
  line-height: 1.1
  letter-spacing: 0.04em
  text-transform: uppercase
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

// ── Team slots / roster cards: collectible cards ───────────────────────────
.team-slots
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 0.55rem

.team-slot, .roster-card
  --edge: var(--rarity-common)
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  border: 2px solid transparent
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  // A faint stripe wash in the edge colour across the art area.
  background-image: repeating-linear-gradient(300deg, rgba(22, 26, 64, 0.04) 0 7px, transparent 7px 16px)
  color: var(--ui-text)
  box-shadow: 0 4px 0 $ink
  cursor: pointer
  transform-origin: 50% 100%
  transition: transform 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring), background-color 0.12s ease
  -webkit-tap-highlight-color: transparent
  // The pop-in stagger must not pin `transform` after it ends (fill: both
  // would beat :hover / :active), so it only back-fills the delay.
  &.ui-pop-in
    animation-fill-mode: backwards
  @media (hover: hover)
    &:hover
      transform: translateY(-3px) rotate(-1.2deg)
      box-shadow: 0 7px 0 $ink
  &:active, &.is-pressed
    transform: translateY(3px) scale(0.97)
    box-shadow: 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
  &.is-selected
    background-color: var(--color-sun-200)
    background-image: var(--ui-stripes)
    box-shadow: 0 0 0 3px var(--color-sun-400), 0 6px 0 $ink
    transform: translateY(-2px)
    animation: card-pick 0.36s var(--ui-spring)

@keyframes card-pick
  0%
    transform: translateY(2px) scale(0.9)
  100%
    transform: translateY(-2px) scale(1)

.rarity-common
  --edge: var(--rarity-common)
.rarity-rare
  --edge: var(--rarity-rare)
.rarity-super
  --edge: var(--rarity-super)
.rarity-epic
  --edge: var(--rarity-epic)
.rarity-legendary
  --edge: var(--rarity-legendary)

.team-slot
  padding: 0.4rem 0.4rem 0.6rem

.slot-tag
  align-self: flex-start
  position: relative
  z-index: 16
  font-size: 0.7rem
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  color: var(--ui-text-muted)

.slot-portrait
  width: 4.2rem
  height: 4.2rem
  object-fit: contain
  position: relative
  z-index: 16
  transition: transform 0.3s var(--ui-spring)

.team-slot.is-selected .slot-portrait, .roster-card.is-selected .roster-portrait
  transform: scale(1.08) translateY(-2px)

// Skewed ink name plate across the card (the title strip of a trading card).
.name-plate
  position: relative
  z-index: 16
  display: inline-flex
  justify-content: center
  max-width: 100%
  padding: 0.12em 0.7em 0.18em
  isolation: isolate
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    background-color: var(--color-royal-800)
    border: 2px solid $ink
    border-radius: 0.3rem
    box-shadow: inset 0 2px 0 var(--color-royal-600), 0 2px 0 $ink
    transform: skewX(-12deg)
  > span
    min-width: 0
    color: var(--color-ice-50)
    text-shadow: $ink-outline
    overflow-wrap: break-word
    hyphens: auto
    text-align: center

.slot-name, .roster-name
  font-weight: 900
  font-size: 0.9rem
  line-height: 1.1
  margin-top: 0.1rem

// Angled level chip (parallelogram), royal with a stroked white number.
.lv-badge
  position: relative
  z-index: 20
  display: inline-block
  margin-top: 0.3rem
  padding: 1px 8px 2px
  font-size: 0.72rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-ice-50)
  background-color: var(--color-royal-500)
  border: 2px solid $ink
  border-radius: 0.3rem
  box-shadow: inset 0 2px 0 var(--color-royal-300), 0 2px 0 $ink
  text-shadow: $ink-outline
  transform: skewX(-10deg)
  > span
    display: inline-block
    transform: skewX(10deg)

.lv-badge--big
  font-size: 0.95rem
  padding: 2px 12px 3px
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 3px 0 $ink

.lv-pop
  animation: lv-pop 0.45s var(--ui-spring)

@keyframes lv-pop
  0%
    transform: skewX(-10deg) scale(1)
  40%
    transform: skewX(-10deg) scale(1.5) rotate(-4deg)
  100%
    transform: skewX(-10deg) scale(1)

// ── Roster ─────────────────────────────────────────────────────────────────
.roster-title
  text-align: center

.roster-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 0.5rem

.roster-card
  padding: 0.35rem 0.2rem 0.55rem
  &.is-locked
    background-color: var(--color-steel-300)
    background-image: var(--ui-stripes-ink)
    .roster-portrait
      filter: grayscale(1) brightness(0.7)
    .name-plate::before
      background-color: var(--color-steel-600)
      box-shadow: 0 2px 0 $ink

.roster-portrait
  width: 3.1rem
  height: 3.1rem
  object-fit: contain
  position: relative
  z-index: 16
  transition: transform 0.3s var(--ui-spring)

// Roster plates span the card so long names (Woodpecker, Chomper) fit
// without breaking mid-word on a 360 px phone.
.roster-name
  align-self: stretch
  margin-left: 0.15rem
  margin-right: 0.15rem
  font-size: clamp(0.58rem, 2.6vw, 0.7rem)
  padding: 0.1em 0.1em 0.15em

.roster-species
  max-width: 100%
  font-size: clamp(0.55rem, 2.4vw, 0.64rem)
  font-weight: 800
  color: var(--ui-text-muted)
  line-height: 1.1
  margin-top: 0.15rem
  text-align: center
  overflow-wrap: break-word
  hyphens: auto
  position: relative
  z-index: 16

.lock-note
  position: relative
  z-index: 16
  margin-top: 0.15rem
  font-size: 0.62rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-berry-700)
  text-align: center

// Team-slot number on a roster card: a leaf sticker that hops in.
.team-mark
  position: absolute
  z-index: 20
  top: 0.15rem
  left: 0.2rem
  width: 1.3rem
  height: 1.3rem
  border-radius: 999px
  background-color: var(--color-leaf-500)
  border: 2px solid $ink
  box-shadow: inset 0 2px 0 var(--color-leaf-300), 0 2px 0 $ink
  color: var(--color-ice-50)
  text-shadow: $ink-outline
  font-size: 0.72rem
  font-weight: 900
  display: flex
  align-items: center
  justify-content: center
  animation: team-mark-in 0.34s var(--ui-spring) both

@keyframes team-mark-in
  0%
    transform: scale(0) rotate(-30deg)
  100%
    transform: none

// ── Detail panel: a recessed ice well ──────────────────────────────────────
.detail-col
  background-color: var(--ui-surface-2)
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.16)
  padding: 0.55rem

.detail-head
  display: flex
  gap: 0.6rem
  align-items: center

// Portrait in a rarity-edged frame with corner stripes; swings in on a new pick.
.detail-portrait-wrap
  --edge: var(--rarity-common)
  position: relative
  flex: 0 0 auto
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  background-image: repeating-linear-gradient(300deg, rgba(22, 26, 64, 0.05) 0 7px, transparent 7px 16px)
  border: 3px solid $ink
  box-shadow: inset 0 0 0 3px var(--edge), inset 0 -6px 0 var(--edge), 0 4px 0 $ink
  animation: portrait-in 0.4s var(--ui-spring)
  &::after
    content: ''
    position: absolute
    top: 0
    right: 0
    width: 1.9rem
    height: 1.9rem
    background-image: repeating-linear-gradient(315deg, var(--edge) 0 3px, transparent 3px 7px)
    clip-path: polygon(30% 0, 100% 0, 100% 70%)
    border-top-right-radius: calc(var(--radius-ui) - 3px)
    pointer-events: none

@keyframes portrait-in
  0%
    transform: scale(0.82) rotate(-5deg)
  100%
    transform: none

.detail-portrait
  width: 5.5rem
  height: 5.5rem
  object-fit: contain

// "+" colourway button: a little sun 3D button that sinks when pressed.
.skin-plus-btn
  position: absolute
  z-index: 2
  right: -0.5rem
  bottom: -0.45rem
  width: 2rem
  height: 2rem
  border-radius: 999px
  border: 2px solid $ink
  background-color: var(--color-sun-400)
  box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600), 0 3px 0 $ink
  color: var(--color-ice-50)
  text-shadow: $ink-outline
  font-weight: 900
  font-size: 1.3rem
  line-height: 1
  cursor: pointer
  transition: translate 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring)
  @media (hover: hover)
    &:hover
      translate: 0 -2px
  &:active
    translate: 0 2px
    box-shadow: inset 0 2px 0 var(--color-sun-200), inset 0 -1px 0 var(--color-sun-600), 0 1px 0 $ink
    transition-duration: var(--ui-press-down)
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
  color: var(--color-royal-600)
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
  height: 0.8rem
  border: 2px solid $ink
  border-radius: 999px
  background-color: var(--color-royal-900)
  box-shadow: inset 0 2px 0 $ink
  overflow: hidden

.stat-bar-fill, .stat-bar-next
  position: absolute
  inset: 0 auto 0 0
  border-radius: 999px

// Striped fill that grows in from 0 on every pick (rows are re-keyed).
.stat-bar-fill
  background-image: var(--ui-stripes)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(22, 26, 64, 0.25)
  transform-origin: 0 50%
  transition: width 0.45s var(--ui-back-out)
  animation: bar-grow 0.5s var(--ui-back-out) both
  animation-delay: calc(var(--i, 0) * 45ms + 80ms)

// Next-level preview: a pale ghost of the fill that blinks gently.
.stat-bar-next
  opacity: 0.4
  animation: next-blink 1.4s ease-in-out infinite

@keyframes bar-grow
  0%
    transform: scaleX(0)
  100%
    transform: scaleX(1)

@keyframes next-blink
  0%, 100%
    opacity: 0.25
  50%
    opacity: 0.55

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
  background-color: var(--color-steel-500)
  background-image: var(--ui-stripes)
  color: var(--color-ice-50)
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

// ── Skills: ice cards with the skill medallion ─────────────────────────────
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
  background-color: var(--color-ice-50)
  border: 2px solid $ink
  box-shadow: inset 4px 0 0 var(--color-plum-500), 0 3px 0 $ink
  &.is-locked
    background-color: var(--color-steel-300)
    background-image: var(--ui-stripes-ink)
    border-color: var(--color-steel-500)
    box-shadow: inset 4px 0 0 var(--color-steel-500)
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
  color: var(--color-ice-50)
  text-shadow: $ink-outline

.skill-lock
  background-color: var(--color-ice-200)
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
// Colourway cards: ice cards with an ink edge; locked = steel hatch, the
// equipped one sun with stripes and a lift.
.skin-card
  border: 2px solid var(--color-steel-500)
  border-radius: var(--radius-ui)
  background-color: var(--color-steel-300)
  background-image: var(--ui-stripes-ink)
  color: var(--ui-text)
  box-shadow: 0 3px 0 var(--color-steel-600)
  &.is-owned
    border-color: $ink
    background-color: var(--color-ice-50)
    background-image: none
    box-shadow: 0 3px 0 $ink
    cursor: pointer
  &.is-equipped
    border-color: $ink
    background-color: var(--color-sun-200)
    background-image: var(--ui-stripes)
    box-shadow: 0 0 0 3px var(--color-sun-400), 0 4px 0 $ink
    transform: translateY(-2px)

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
    color: var(--color-ice-50)
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

// Reduced motion: no entrances, no idle blink; state colours stay.
@media (prefers-reduced-motion: reduce)
  .team-slot.is-selected, .roster-card.is-selected, .team-mark, .detail-portrait-wrap, .stat-bar-fill, .stat-bar-next, .lv-pop
    animation: none
  .team-slot, .roster-card, .slot-portrait, .roster-portrait, .skin-plus-btn
    transition-duration: 0.08s
    transition-timing-function: ease-out
</style>

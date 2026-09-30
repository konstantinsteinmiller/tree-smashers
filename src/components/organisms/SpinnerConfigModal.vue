<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import type { SpinnerConfig, TopPartId, BottomPartId } from '@/types/spinner'
import type { TabOption } from '@/components/atoms/FTabs.vue'
import {
  TOP_PARTS_LIST,
  BOTTOM_PARTS_LIST,
  computeStats
} from '@/use/useSpinnerConfig'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSpinnerCampaign, { upgradeCost, TOP_UPGRADE_BONUS, BOTTOM_UPGRADE_BONUS } from '@/use/useSpinnerCampaign'
import {
  SKINS_PER_TOP, skinCost,
  modelImgPath, isSkinOwned, purchaseSkinWithCoins, selectSkin, getSelectedSkin,
  hasUnownedSkinsForTop,
  isAdUnlockSkin, isEarnOnlySkin, recordSkinAdWatch, settleSkinAdProgress,
  markSkinPickerOpened, wasSkinPickerOpened,
  type SpinnerModelId
} from '@/use/useModels'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconAttack from '@/components/icons/IconAttack.vue'
import IconDefense from '@/components/icons/IconDefense.vue'
import IconHp from '@/components/icons/IconHp.vue'
import IconSpeed from '@/components/icons/IconSpeed.vue'
import IconWeight from '@/components/icons/IconWeight.vue'
import BGSkinButton from '@/components/organisms/BGSkinButton.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import { isBgSkinsEnabled, isNative } from '@/use/useUser'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
import FSpeechBubble from '@/components/molecules/FSpeechBubble.vue'
// Skills section: a lazy handle, null on a skills-off build (skillsGate.ts).
import { TeamSkillsSectionUi } from '@/skills/skillsGate'
// Bosses 100+ (bosses gate): pure boundary data, used only behind the literal.
import { BOSSES100_BUILD } from '@/bosses/bosses100Gate'
import { fmtFixed } from '@/utils/localeNumber'
import { trophySkinFirstStage } from '@/data/bossEncounters'

interface Props {
  modelValue: boolean
  initialTeam?: SpinnerConfig[]
}

const props = withDefaults(defineProps<Props>(), {
  initialTeam: () => [
    { topPartId: 'star' as TopPartId, bottomPartId: 'balanced' as BottomPartId },
    { topPartId: 'round' as TopPartId, bottomPartId: 'balanced' as BottomPartId }
  ]
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', team: SpinnerConfig[]): void
}>()

const { t, locale } = useSfcI18n('SpinnerConfigModal')

/** Unowned trophy skin card (A2): "Beat stage 110" — the first stage whose
 *  boss grants it; the plain "Boss trophy" label if no encounter does. */
const trophyCardText = (modelId: string): string => {
  const n = BOSSES100_BUILD ? trophySkinFirstStage(modelId) : null
  return n === null ? t('trophySkin.label') : t('trophySkin.beatStage', { n })
}

// ─── Skills (skills-feature.md §7.2) ───────────────────────────────────────
//
// The whole section (tiles, picker, NEW badge, auto-fill) is
// TeamSkillsSection.vue, rendered through the gate's lazy handle — a
// skills-off build bundles none of it. A locked slot explains itself in this
// modal's speech bubble (outside the scroll box).
const skillBubbleOpen = ref(false)
const skillBubbleText = ref('')
const onSkillSlotLocked = (text: string) => {
  skillBubbleText.value = text
  skillBubbleOpen.value = true
}

// ─── Blade Selector (which blade are we configuring) ───────────────────────

const activeBladeIndex: Ref<string | number> = ref(0)

const bladeTabs = computed<TabOption[]>(() =>
  props.initialTeam.map((_, i) => ({
    label: `${t('bladeLabel')} ${i + 1}`,
    value: i
  }))
)

// ─── Per-Blade Configs (local editable copies) ────────────────────────────

const localTeam: Ref<SpinnerConfig[]> = ref([])

// Sync only when modal opens (not on every prop change, which would reset the tab)
watch(() => props.modelValue, (open) => {
  if (open) {
    localTeam.value = props.initialTeam.map(c => ({ ...c }))
    activeBladeIndex.value = 0
    // Belt-and-suspenders for the CrazyGames `gameplayStop` signal — the
    // reactive watcher in SpinnerArena already pauses the SDK when this
    // modal opens (`isGameplayActive` reads `configModalOpen`), but per
    // the CG QA request we fire it here too so the call site is explicit
    // and impossible to miss in a future refactor of the arena watcher.
    // `stopGameplay()` is idempotent (early-returns when SDK is inactive
    // or already stopped) so the redundant call is free.
    stopGameplay()
  }
}, { immediate: true })

// ─── Current Blade Being Edited ────────────────────────────────────────────

const currentConfig = computed(() =>
  localTeam.value[activeBladeIndex.value as number] ?? localTeam.value[0]
)

const { coins, addCoins } = useSpinnerConfig()
const { playerUpgrades, upgradeTop, upgradeBottom } = useSpinnerCampaign()

const topLevel = (id: TopPartId) => playerUpgrades.value.tops[id]
const bottomLevel = (id: BottomPartId) => playerUpgrades.value.bottoms[id]

const stats = computed(() => {
  const cfg = currentConfig.value!
  return computeStats(cfg, topLevel(cfg.topPartId), bottomLevel(cfg.bottomPartId))
})

const buyTopUpgrade = (id: TopPartId) => {
  const cost = upgradeCost(topLevel(id) + 1)
  if (coins.value < cost) return
  addCoins(-cost)
  upgradeTop(id)
  emit('save', localTeam.value.map(c => ({ ...c })))
}

const buyBottomUpgrade = (id: BottomPartId) => {
  const cost = upgradeCost(bottomLevel(id) + 1)
  if (coins.value < cost) return
  addCoins(-cost)
  upgradeBottom(id)
  emit('save', localTeam.value.map(c => ({ ...c })))
}

// Upgraded stat values for display — in the active language's decimal
// notation ("1.50x" en, "1,50x" de/ru/fr/tr), like the skill values (T3).
const statNum = (n: number, digits: number): string => fmtFixed(n, digits, locale.value)

const topDamage = (part: typeof TOP_PARTS_LIST[number]) =>
  statNum(part.damageMultiplier + TOP_UPGRADE_BONUS[part.id].damage * topLevel(part.id), 2)

const topDefense = (part: typeof TOP_PARTS_LIST[number]) =>
  statNum(part.defenseMultiplier + TOP_UPGRADE_BONUS[part.id].defense * topLevel(part.id), 2)

const topHp = (part: typeof TOP_PARTS_LIST[number]) =>
  part.healthBonus + TOP_UPGRADE_BONUS[part.id].hp * topLevel(part.id)

const bottomSpeed = (part: typeof BOTTOM_PARTS_LIST[number]) =>
  statNum(part.speedMultiplier + BOTTOM_UPGRADE_BONUS[part.id].speed * bottomLevel(part.id), 2)

const bottomHp = (part: typeof BOTTOM_PARTS_LIST[number]) =>
  part.healthBonus + BOTTOM_UPGRADE_BONUS[part.id].hp * bottomLevel(part.id)

const setTop = (id: TopPartId) => {
  const idx = activeBladeIndex.value as number
  // Tapping the already-selected top part acts as a shortcut to the
  // upgrade button — more discoverable than the small ⬆ row, especially
  // on mobile. Only upgrades if the player can actually afford it,
  // otherwise the tap is a no-op (the card is already selected).
  if (localTeam.value[idx]?.topPartId === id) {
    if (coins.value >= upgradeCost(topLevel(id) + 1)) buyTopUpgrade(id)
    return
  }
  localTeam.value[idx] = { ...localTeam.value[idx]!, topPartId: id }
  emit('save', localTeam.value.map(c => ({ ...c })))
}

const setBottom = (id: BottomPartId) => {
  const idx = activeBladeIndex.value as number
  // Same shortcut behavior as setTop — tapping the selected bottom
  // triggers an upgrade if affordable.
  if (localTeam.value[idx]?.bottomPartId === id) {
    if (coins.value >= upgradeCost(bottomLevel(id) + 1)) buyBottomUpgrade(id)
    return
  }
  localTeam.value[idx] = { ...localTeam.value[idx]!, bottomPartId: id }
  emit('save', localTeam.value.map(c => ({ ...c })))
}

// ─── Skin Picker ──────────────────────────────────────────────────────────

const skinPickerOpen = ref(false)
const skinPickerTopId = ref<TopPartId>('star')
/** The picker's cards. A bosses100-off build has no encounter that grants a
 *  boss trophy, so an UNOWNED trophy card is hidden; one the player already
 *  owns stays listed (and selectable). */
const pickerSkins = computed(() => {
  const topId = skinPickerTopId.value
  const all = SKINS_PER_TOP[topId]
  return BOSSES100_BUILD ? all : all.filter(id => !isEarnOnlySkin(id) || isSkinOwned(topId, id))
})
const skinPickerKey = ref(0)

const openSkinPicker = (topId: TopPartId) => {
  skinPickerTopId.value = topId
  skinPickerKey.value++
  skinPickerOpen.value = true
  markSkinPickerOpened(topId)
  // Ad progress saved under the old 3-ad rule already pays for a skin now.
  settleSkinAdProgress()
}

/** True when the plus icon should hint-bounce (unowned skins available
 *  AND the player hasn't yet opened the picker for this top part). */
const shouldBouncePlus = (topId: TopPartId): boolean =>
  hasUnownedSkinsForTop(topId) && !wasSkinPickerOpened(topId)

const handleBuySkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  const cost = skinCost(modelId)
  if (coins.value < cost) return
  // Refuses the ad-unlock skins, so coins are only taken for a real grant.
  if (purchaseSkinWithCoins(topId, modelId)) addCoins(-cost)
}

// Ad-unlock skins (the newest 4 per top part) are never sold for coins on a
// build with rewarded ads: ONE completed rewarded ad unlocks the skin. The
// button is disabled while no rewarded ad is ready (readiness gating), and a
// skipped / no-fill ad grants nothing. On a build without rewarded ads
// `isAdUnlockSkin` is false, the button is never rendered and the skin
// falls through to the coin price (`skinCost`).
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
  selectSkin(topId, modelId, activeBladeIndex.value as number)
  emit('save', localTeam.value.map(c => ({ ...c })))
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :tabs="bladeTabs"
    :active-tab="activeBladeIndex"
    @update:active-tab="activeBladeIndex = $event"
  )
    div.config-layout

      //- ── Top Blade Parts ──────────────────────────────────────────────────
      div.top-col
        div.relative.flex.justify-center.items-center.mb-3
          div.absolute.left-0.flex.items-center.gap-1.rounded.font-bold(
            class="top-1/2 -translate-y-[50%] px-1.5 py-0.5 bg-yellow-600/60 text-yellow-300 text-[0.85rem] sm:text-xs"
          )
            IconCoin(class="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 text-yellow-300")
            span {{ coins }}
          h3.text-yellow-300.font-black.uppercase.italic.label-section(
            class="tracking-wider"
          ) {{ t('topBlade') }}
          //- Background-skin shop launcher, pinned to the far right of the
          //- TOP BLADE header. Wrapped in an absolutely-positioned box because
          //- BGSkinButton has two root nodes (button + teleported modal), so a
          //- `class` passed directly to it can't fall through — it would land
          //- back in flow and overlap the centred title. A diamond badge tucks
          //- behind the button's top-right corner to signal that backgrounds
          //- are bought with diamonds. Feature-flagged for production hotfixes.
          div.absolute.flex.items-center(
            v-if="isBgSkinsEnabled"
            class="right-0 top-1/2 -translate-y-[50%]"
          )
            div.relative(class=" -mb-4")
              BGSkinButton
              //- Diamond badge rendered AFTER the button (and z-10) so it sits
              //- ON TOP for clear recognition. Bottom-left corner keeps it off
              //- the modal frame edge, whose overflow clip halved it before.
              IconDiamond(class="absolute -bottom-1 -left-1 w-3.5 h-3.5 z-10 pointer-events-none")
        div.grid.top-grid
          div(
            v-for="part in TOP_PARTS_LIST"
            :key="part.id"
            @click="setTop(part.id)"
            class="relative cursor-pointer rounded-lg transition-all duration-150 hover:scale-105 active:scale-95 flex flex-col top-part-card"
            :class="currentConfig.topPartId === part.id \
            ? 'bg-gradient-to-b from-yellow-500 to-yellow-600 border-2 border-yellow-300' \
            : 'bg-slate-700 border-2 border-slate-600 hover:border-slate-400'"
          )
            //- Floating skin row above the card border:
            //- Desktop/landscape: all owned skin thumbnails + plus button
            //- Mobile portrait: selected skin + plus button only (skin selection in shop)
            //- `z-30`, above the `z-20` level badge.
            //-
            //- The skin row floats over its card's TOP edge, and the level
            //- badge ("Lv.1") hangs off the BOTTOM-right corner of the card
            //- in the row above — so on the second grid row the two share
            //- space. At `z-10` the badge won, burying the interactive "+"
            //- (which bounces upward to draw attention, making the collision
            //- worse) under a decorative, `pointer-events-none` label.
            div.skin-row.-mt-2.absolute.left-0.right-0.flex.justify-center.items-center.pointer-events-none(
              class="z-30"
            )
              div.flex.items-center.justify-center.rounded-full.bg-slate-900.border.border-slate-600.pointer-events-auto.skin-row-inner(
                class="px-1 py-0.5 gap-0.5 sm:gap-1 shadow-md"
              )
                //- Selected skin only — skin changes happen in the skin shop modal
                div.skin-row-compact
                  div(
                    class="inline-flex shrink-0 rounded-full skin-row-thumb ring-2 ring-yellow-300/80"
                  )
                    img(
                      :src="modelImgPath(getSelectedSkin(part.id, Number(activeBladeIndex)))"
                      class="block rounded-full object-cover skin-row-img"
                      :alt="getSelectedSkin(part.id, Number(activeBladeIndex))"
                    )
                //- Plus button to open skin shop — oversized tap target on mobile
                div.skin-plus-hitbox.pointer-events-auto(
                  @click.stop="openSkinPicker(part.id)"
                )
                  button.skin-plus-btn.rounded-full.border-2.border-yellow-400.bg-slate-700.text-yellow-300.font-black.flex.items-center.justify-center.cursor-pointer.transition-all(
                    class="hover:bg-slate-600 hover:scale-110"
                    :class="shouldBouncePlus(part.id) ? 'hint-bounce-2' : ''"
                    :title="t('purchaseMoreSkins')"
                  ) +
            div.text-center.part-card-body
              div.part-name.text-white.font-bold.game-text(class="text-[0.85rem] sm:text-xs") {{ t('parts.' + part.id) }}
              div.flex.flex-col.items-center.stat-list
                div.flex.items-center.justify-center.text-red-400.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]")
                  IconAttack.inline-block.stat-icon
                  span {{ topDamage(part) }}x
                div.flex.items-center.justify-center.text-blue-400.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]")
                  IconDefense.inline-block.stat-icon
                  span {{ topDefense(part) }}x
                div.flex.items-center.justify-center.text-green-400.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]" v-if="topHp(part) > 0")
                  IconHp.inline-block.stat-icon
                  span +{{ topHp(part) }}
            //- Upgrade button integrated at card bottom
            button.w-full.rounded-b-lg.font-bold.transition-all.mt-auto.upgrade-btn(
              :class="coins >= upgradeCost(topLevel(part.id) + 1) \
                ? 'bg-yellow-500 hover:bg-yellow-400 text-white cursor-pointer' \
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
              @click.stop="buyTopUpgrade(part.id)"
            )
              span.flex.items-center.justify-center(class="gap-0.5 -mt-[2px] pt-[2px]")
                span.game-text ⬆
                IconCoin.upgrade-coin-icon.text-yellow-300
                span.game-text {{ upgradeCost(topLevel(part.id) + 1) }}
            //- Level badge — bottom-right corner, overlapping the upgrade button
            div.level-badge.absolute.font-black.game-text.text-white.flex.items-center.justify-center.pointer-events-none(
              v-if="topLevel(part.id) > 0"
              class="-mb-[4px] bg-gradient-to-b from-purple-500 to-purple-800 border border-yellow-300 rounded-md shadow-md z-20"
            ) {{ t('lv') }}{{ topLevel(part.id) }}

      //- ── Bottom + Stats Column ────────────────────────────────────────────
      div.bottom-col

        //- ── Bottom Parts ───────────────────────────────────────────────────
        div
          h3.text-yellow-300.font-black.uppercase.italic.mb-1.label-section(
            class="tracking-wider"
          ) {{ t('bottomPart') }}
          div.grid.grid-cols-3.bottom-grid
            div(
              v-for="part in BOTTOM_PARTS_LIST"
              :key="part.id"
              @click="setBottom(part.id)"
              class="relative cursor-pointer rounded-lg transition-all duration-150 hover:scale-105 active:scale-95 flex flex-col"
              :class="currentConfig.bottomPartId === part.id \
              ? 'bg-gradient-to-b from-yellow-500 to-yellow-600 border-2 border-yellow-300' \
              : 'bg-slate-700 border-2 border-slate-600 hover:border-slate-400'"
            )
              div.text-center.part-card-body
                div.part-name.text-white.font-bold.game-text(class="text-[0.85rem] sm:text-xs") {{ t('parts.' + part.id) }}
                div.flex.flex-col.items-center.stat-list
                  div.flex.items-center.justify-center.text-cyan-400.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]")
                    IconSpeed.inline-block.stat-icon
                    span {{ bottomSpeed(part) }}x
                  div.flex.items-center.justify-center.text-gray-300.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]")
                    IconWeight.inline-block.stat-icon
                    span {{ part.weight }}
                  div.flex.items-center.justify-center.text-green-400.rounded-full.stat-glass(class="gap-0.5 px-[2px] py-[1px]" v-if="bottomHp(part) > 0")
                    IconHp.inline-block.stat-icon
                    span +{{ bottomHp(part) }}
              //- Upgrade button integrated at card bottom
              button.w-full.rounded-b-lg.font-bold.transition-all.mt-auto.upgrade-btn(
                :class="coins >= upgradeCost(bottomLevel(part.id) + 1) \
                  ? 'bg-yellow-500 hover:bg-yellow-400 text-white cursor-pointer' \
                  : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
                @click.stop="buyBottomUpgrade(part.id)"
              )
                span.flex.items-center.justify-center(class="gap-0.5 -mt-[2px] pt-[2px]")
                  span.game-text ⬆
                  IconCoin.upgrade-coin-icon.text-yellow-300
                  span.game-text {{ upgradeCost(bottomLevel(part.id) + 1) }}
              //- Level badge — bottom-right corner, overlapping the upgrade button
              div.level-badge.absolute.font-black.game-text.text-white.flex.items-center.justify-center.pointer-events-none(
                v-if="bottomLevel(part.id) > 0"
                class="-mb-[4px] bg-gradient-to-b from-purple-500 to-purple-800 border border-yellow-300 rounded-md shadow-md z-20"
              ) {{ t('lv') }}{{ bottomLevel(part.id) }}

        //- ── Skills (team-wide, both blade tabs) — lazy, skills builds only ──
        component(
          v-if="TeamSkillsSectionUi"
          :is="TeamSkillsSectionUi"
          :open="modelValue"
          @locked="onSkillSlotLocked"
        )

        //- ── Stats Summary ──────────────────────────────────────────────────
        div.stats-bar(class="border-t border-slate-500/50")
          h3.text-yellow-300.font-black.uppercase.italic.label-section(
            class="tracking-wider"
          ) {{ t('statsLabel') }}
          div.flex.flex-wrap.justify-center.stats-items
            div.flex.items-center
              IconHp.stat-summary-icon.text-green-400
              span.text-green-400.font-bold {{ stats.maxHp }}
            div.flex.items-center
              IconWeight.stat-summary-icon.text-gray-300
              span.text-blue-400.font-bold {{ stats.totalWeight }}
            div.flex.items-center
              IconAttack.stat-summary-icon.text-red-400
              span.text-red-400.font-bold {{ statNum(stats.damageMultiplier, 1) }}x
            div.flex.items-center
              IconDefense.stat-summary-icon.text-purple-400
              span.text-purple-400.font-bold {{ statNum(stats.defenseMultiplier, 1) }}x
            div.flex.items-center
              IconSpeed.stat-summary-icon.text-cyan-400
              span.text-cyan-400.font-bold {{ statNum(stats.speedMultiplier, 1) }}x

      //- ── Hint Texts ─────────────────────────────────────────────────────
      //- Short, precise instructions about how the modal works. Sit at the
      //- bottom of the layout (below stats / bottom column) so they don't
      //- compete for vertical space with the cards above.
      div.hint-block.text-slate-300.text-center(class="border-t border-slate-500/40")
        p.hint-text.m-0
          | {{ t('hintSelectCards') }}
        p.hint-text.m-0(class="mt-1")
          | {{ t('hintPlusIcon') }}

  //- ── Locked skill slot teaser (TeamSkillsSection → `locked`) ─────────────
  FSpeechBubble(v-model="skillBubbleOpen" :text="skillBubbleText")

  //- ── Skin Picker Modal ───────────────────────────────────────────────────
  FModal(
    :model-value="skinPickerOpen"
    @update:model-value="skinPickerOpen = $event"
    :is-closable="true"
    :title="t('selectSkin')"
    :key="'skin-' + skinPickerKey"
  )
    div.skin-picker-body(class="px-2 sm:px-4 py-2")
      div.flex.items-center.justify-between.mb-2.skin-picker-header
        div.flex.items-center.gap-1.rounded.font-bold(
          class="px-2 py-0.5 bg-yellow-600/60 text-yellow-300 text-[0.75rem] sm:text-xs"
        )
          IconCoin(class="w-3.5 h-3.5 text-yellow-300")
          span {{ coins }}g
      div.grid.gap-2.skin-picker-grid(class="grid-cols-3 sm:grid-cols-4")
        div.skin-card(
          v-for="modelId in pickerSkins"
          :key="modelId"
          class="flex flex-col items-center rounded-xl p-1.5 border-2 transition-all"
          :class="[\
            getSelectedSkin(skinPickerTopId, Number(activeBladeIndex)) === modelId\
              ? 'bg-gradient-to-b from-yellow-500/30 to-yellow-600/30 border-yellow-400'\
              : isSkinOwned(skinPickerTopId, modelId)\
                ? 'bg-slate-700 border-slate-500 hover:border-slate-300 cursor-pointer'\
                : 'bg-slate-800 border-slate-600'\
          ]"
        )
          img.skin-card-img(
            :src="modelImgPath(modelId)"
            class="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-lg"
            :alt="modelId"
          )
          div.text-white.font-bold.skin-card-name(class="mt-0.5 text-[0.7rem] sm:text-xs") {{ t('skins.' + modelId) }}
          //- Action button
          template(v-if="getSelectedSkin(skinPickerTopId, Number(activeBladeIndex)) === modelId")
            div.text-yellow-400.font-bold.skin-card-action(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem]") {{ t('equipped') }}
          template(v-else-if="isSkinOwned(skinPickerTopId, modelId)")
            button.rounded-lg.font-bold.transition-all.skin-card-action(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] px-3 py-0.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer"
              @click="handleSelectSkin(skinPickerTopId, modelId)"
            ) {{ t('selectButton') }}
          //- Boss trophy (earn-only): never sold for coins or ads — the card only
          //- says where it comes from: the first stage whose boss grants it.
          template(v-else-if="isEarnOnlySkin(modelId)")
            div.rounded-lg.font-bold.skin-card-action.flex.items-center.gap-1(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] px-2 py-0.5 bg-slate-700 text-amber-300"
              role="note"
              :title="t('trophySkin.hint')"
              :aria-label="trophyCardText(modelId)"
            )
              span(aria-hidden="true") 🏆
              span.game-text {{ trophyCardText(modelId) }}
          //- Ad-unlock skin (rewarded-ad builds only): one ad instead of a coin price.
          template(v-else-if="isAdUnlockSkin(modelId)")
            button.rounded-lg.font-bold.transition-all.skin-card-action(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] px-2 py-0.5 flex items-center gap-1"
              :class="isRewardedReady && !skinAdPending                ? 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] text-white cursor-pointer'                : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
              :disabled="!isRewardedReady || skinAdPending"
              :aria-label="t('watchAdsToUnlock')"
              :title="t('watchAdsToUnlock')"
              @click="handleWatchSkinAd(skinPickerTopId, modelId)"
            )
              span.game-text(v-if="isNative") {{ t('spinner.ad') }}
              img.object-contain(
                :src="prependBaseUrl('images/icons/movie_128x96.webp')"
                class="w-3.5 h-3.5 sm:w-4 sm:h-4"
                alt=""
              )
          template(v-else)
            button.rounded-lg.font-bold.transition-all.skin-card-action(
              class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] px-2 py-0.5 flex items-center gap-1"
              :class="coins >= skinCost(modelId)\
                ? 'bg-yellow-500 hover:bg-yellow-400 text-white cursor-pointer'\
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
              @click="handleBuySkin(skinPickerTopId, modelId)"
            )
              IconCoin(class="w-3 h-3 text-yellow-300")
              span.game-text {{ skinCost(modelId) }}
</template>

<style scoped lang="sass">
.stat-glass
  background: rgba(255, 255, 255, 0.06)
  backdrop-filter: blur(6px)
  -webkit-backdrop-filter: blur(6px)
  border: 1px solid rgba(255, 255, 255, 0.08)
  line-height: 1
  min-height: 1.1rem
  // Override the inline Tailwind `gap-0.5 px-[2px] py-[1px]` so the pill
  // hugs the icon+value tightly. Gives the stat text more visual weight
  // inside the same footprint without enlarging the card.
  padding: 1px 3px
  gap: 1px

// TOP BLADE / BOTTOM PART / STATS — base size matches text-xs sm:text-sm.
// Per-breakpoint scaling below bumps it ~30-40% for readability while
// keeping the cards inside the modal viewport.
.label-section, .skills-section :deep(.label-section)
  font-size: 0.95rem
  line-height: 1.1

.hint-block
  margin-top: 0.5rem
  padding-top: 0.4rem
  padding-left: 0.25rem
  padding-right: 0.25rem

.hint-text
  font-size: 0.75rem
  line-height: 1.25

// Skills section styles live in TeamSkillsSection.vue (the section heading
// shares `.label-section` above through :deep).

// ─── Base Layout (portrait / desktop) ────────────────────────────────────────

.config-layout
  display: flex
  flex-direction: column
  gap: 0.5rem
  // Slightly wider side padding than the old 0.25rem so the right-hand
  // column (and the background-skin button in the header) clears the
  // modal's scrollbar instead of sitting flush underneath it.
  padding: 0.25rem 0.45rem
// NO local `max-height` / `overflow-y` any more.
//
// This used to cap itself at `calc(100dvh - 9rem)` and scroll internally,
// which meant the game had two competing scroll authorities: this element
// and (since the 2026-08 UI-scale pass) FModal's own content slot. Two
// nested scrollers on one modal give you a scrollbar that stops halfway,
// a fade affordance on the wrong box, and a chrome budget that has to be
// re-tuned by hand at every breakpoint — the `- 9rem` / `- 10rem` magic
// numbers below were exactly that hand-tuning.
//
// FModal now derives the cap from the overlay's real content box and the
// measured header strip, so it is correct at every viewport without a
// per-component budget. Landscape already did it this way (see the
// `overflow: visible` override further down); this just makes portrait and
// desktop agree with it.

.top-col, .bottom-col
  min-width: 0

.top-grid
  // `minmax(0, 1fr)` (instead of plain `1fr`) lets cards shrink below
  // their min-content size, so a wide upgrade label can't push a column
  // past 1/3 of the modal width and trigger horizontal scrolling.
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 0.5rem
  // Leave room for the floating skin row that overflows above each card.
  // Raised from 1.1rem in the 2026-08 UI-scale pass: the skin row's "+"
  // discs and the section header (coin pill on the left, background-skin
  // button on the right) both grew, and at the old clearance the first and
  // third cards' discs collided with them.
  padding-top: 1.5rem
  row-gap: 1.5rem

.bottom-grid
  gap: 0.5rem

.part-card-body
  padding: 0 0 0

// Part name (top + bottom cards). Long names wrap onto a second line instead
// of truncating / spilling past the card edge ("Round Guard" overflowed a
// 360px-wide card by 4px; "Звёздный клинок", "Мягкий панцирь" were cut to
// an ellipsis). Word breaks first, hyphenation (the <html lang> is the active
// locale) for a single over-long word, a hard break only as the last resort.
// The tighter line-height + block padding keep a one-line name at its old
// ~20px height, so short-name locales lay out exactly as before.
.part-name
  line-height: 1.15
  padding: 0.15em 1px
  overflow-wrap: break-word
  hyphens: auto
  text-wrap: balance

// Top part card needs internal top padding so the floating row above
// the border doesn't visually collide with the part label.
.top-part-card
  padding-top: 0.125rem

.stat-list
  margin-top: 0.125rem
  // Breathing room between the last stat pill and the yellow upgrade
  // button — without this the pills sit flush against the button on
  // cards that fill the available stat slots (e.g. 3 stats in the 2x2
  // grid, or any card in flex-column where content fills the height).
  margin-bottom: 0.3rem
  gap: 2px
  font-size: 0.85rem

  span
    text-shadow: 1px 1px 0 #333, -1px -1px 0 #333, 1px -1px 0 #333, -1px 1px 0 #333, 1px 1px 0 #333

.stat-icon
  width: 0.8rem
  height: 0.8rem

// Floating skin row sitting above the top-part card border
.skin-row
  top: -0.95rem

.skin-row-thumb
  width: 1.15rem
  height: 1.15rem
  line-height: 0

.skin-row-img
  width: 100%
  height: 100%

.skin-row-compact
  display: flex
  align-items: center

// The visible "+" is deliberately small (it floats over the card's top edge
// and a large disc would cover the skin thumbnail), so the TAP area is
// decoupled from it: the hitbox pads out and cancels the padding with an
// equal negative margin, keeping the visual row exactly where it was.
// Playgama QA measured the old combination at ~41px — the numbers below put
// it at ~50px on a 360px phone while the disc itself only grows a little.
.skin-plus-hitbox
  display: flex
  align-items: center
  justify-content: center
  padding: 0.65rem
  margin: -0.65rem
  margin-left: 0
  cursor: pointer

// Kept modest on purpose: the disc floats over the card's top edge, so a
// large one covers the skin thumbnail and collides with the header row. The
// TAP area comes from `.skin-plus-hitbox` above, not from this box.
.skin-plus-btn
  width: 1.35rem
  height: 1.35rem
  font-size: 1.2rem
  line-height: 1
  padding: 0

// Level badge anchored to the card's bottom-right, overlapping the
// upgrade button so it pops above the yellow background.
.level-badge
  right: -0.2rem
  bottom: -0.25rem
  font-size: 0.7rem
  line-height: 1
  padding: 1px 4px
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000

// Full-card-width action bar. It was 25px tall, which is the single most
// tapped control in the modal — raised to ~38px so the whole bar is a
// comfortable target without adding a second row to each card.
.upgrade-btn
  font-size: 0.9rem
  padding: 0.62rem 0

.upgrade-coin-icon
  width: 0.85rem
  height: 0.85rem

.stats-bar
  padding-top: 0.375rem
  margin-top: 0.25rem
  display: flex
  align-items: center
  gap: 0.5rem
  flex-wrap: wrap

.stats-items
  gap: 0.5rem
  font-size: 0.9rem
  // The template already sets `flex-wrap`, but without `min-width: 0` the row
  // cannot shrink below its min-content width, so it never actually wraps —
  // it just overflows its column. In the two-column landscape layout that put
  // the last stat (`1.0x`) half off the right edge of the modal.
  min-width: 0
  flex: 1 1 auto

.stat-summary-icon
  width: 0.875rem
  height: 0.875rem
  margin-right: 0.125rem

// ─── sm+ breakpoint (≥640px) ─────────────────────────────────────────────────

@media (min-width: 640px)
  // (The sm+ `max-height: calc(100dvh - 10rem)` budget lived here. Dropped
  // along with the base one — FModal owns the height cap now.)

  .label-section, .skills-section :deep(.label-section)
    font-size: 1.15rem

  .hint-text
    font-size: 0.85rem

  // Keep the 3-column wrap from the base layout (so the 6 top parts
  // render as a 3x2 grid). The previous repeat(6, 1fr) packed all six
  // parts into a single row, which on the 42rem-wide modal forced
  // horizontal scrolling and hid the right-most cards. `minmax(0, 1fr)`
  // also stops cards with wide upgrade-cost labels from blowing out
  // their column.
  .top-grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 0.5rem
    padding-top: 1.25rem
    row-gap: 1.5rem

  .bottom-grid
    gap: 0.5rem

  .part-card-body
    padding: 0.375rem 0.375rem 0

  .top-part-card
    padding-top: 0.5rem

  .stat-list
    font-size: 0.9rem
    gap: 2px

  .stat-icon
    width: 0.85rem
    height: 0.85rem

  .skin-row
    top: -1rem

  .skin-row-thumb
    width: 1.35rem
    height: 1.35rem

  .skin-row-img
    width: 100%
    height: 100%

  .skin-row-compact
    display: flex
    align-items: center

  .skin-plus-hitbox
    padding: 0.6rem
    margin: -0.6rem
    margin-left: 0

  .skin-plus-btn
    width: 1.7rem
    height: 1.7rem
    font-size: 1.25rem

  .level-badge
    right: -0.3rem
    bottom: -0.35rem
    font-size: 0.85rem
    padding: 2px 5px

  .upgrade-btn
    font-size: 0.85rem
    padding: 0.58rem 0

  .upgrade-coin-icon
    width: 0.9rem
    height: 0.9rem

  .stats-items
    font-size: 0.85rem

  .stat-summary-icon
    width: 1rem
    height: 1rem

// ─── Mobile + tablet landscape (limited vertical viewport) ──────────────────
// Stats text in the in-card pills was previously hard to read on landscape
// devices. Bump the value text ~30%, switch the stat list to a 2x2 grid so
// the third pill (HP bonus) doesn't add a full extra row, and trim the pill
// padding/gap to keep the card footprint stable.

@media (orientation: landscape) and (max-height: 900px)
  .stat-list
    display: grid
    grid-template-columns: repeat(2, 1fr)
    column-gap: 2px
    row-gap: 2px
    margin-top: 0.125rem
    font-size: 1.2rem
    justify-items: stretch

  .stat-glass
    min-height: 0
    padding: 1px 3px
    gap: 2px

  .stat-icon
    width: 0.95rem
    height: 0.95rem

  // Bottom stats summary row also gets the readability bump.
  .stats-items
    font-size: 1.2rem
    gap: 0.5rem

  .stat-summary-icon
    width: 1.1rem
    height: 1.1rem

// ─── Landscape mobile (short viewport) ──────────────────────────────────────

@media (orientation: landscape) and (max-height: 500px)
  // Drop the 65vh cap and let the modal grow to fit content. With the
  // FModal chrome shrunk (modal-frame pt: 0.5rem, content/footer margins
  // collapsed) the whole layout fits inside a ~350-450px landscape
  // viewport with the explanation texts visible. If a particular device
  // is shorter, the modal extends a few px past the bottom edge — the
  // .modal-overlay align-items: flex-start (in FModal) keeps the top
  // (tabs + cards) anchored.
  .config-layout
    flex-direction: row
    flex-wrap: wrap
    gap: 0.25rem
    // Horizontal padding, NOT `padding: 0`. In the two-column landscape
    // layout the right-hand column ends flush with the modal body's edge, so
    // the scrollbar drew straight over the last card and the last stat pill
    // ("1.0x") — it read as clipped content.
    padding: 0 0.45rem

  // Landscape mobile is the tightest viewport — keep the section labels
  // readable but only modestly larger so the cards still fit without
  // scrolling. (~30% over the original text-xs.)
  .label-section, .skills-section :deep(.label-section)
    font-size: 0.7rem
    line-height: 1

  // Force hints to wrap to their own full-width row beneath the part
  // columns (otherwise flex-direction: row would render hints as a third
  // column and squeeze the cards). Bumped ~30% over the previous 8px so
  // the explanations stay legible on landscape phones.
  .hint-block
    flex-basis: 100%
    margin-top: 0.2rem
    padding-top: 0.2rem

  .hint-text
    font-size: 0.85rem
    line-height: 1.2

  .top-col
    flex: 3
    min-width: 0

  .bottom-col
    flex: 2
    min-width: 0
    display: flex
    flex-direction: column
    gap: 0.25rem

  // Trim the wasted vertical space above the cards. row-gap needs to be
  // at least 1rem so the floating + skin button on the second row doesn't
  // crash into the upgrade button of the row above (the bubble extends
  // ~9px above each card top).
  .top-grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 0.25rem
    padding-top: 0.8rem
    row-gap: 1rem

  .bottom-grid
    gap: 0.25rem

  // Bottom cards stay on a single column for their stats — the 2x2 grid
  // from the (max-height: 900px) block makes wider values like "3.57x"
  // overflow into the weight cell on the narrow landscape bottom-col.
  .bottom-grid .stat-list
    display: flex
    flex-direction: column
    align-items: center
    row-gap: 1px

  .part-card-body
    padding: 0.05rem 0.125rem 0

  // Bring the floating skin row closer to the card top; previously the
  // -0.7rem offset combined with .top-part-card padding-top: 0.3rem left
  // a visible empty band above the part name (e.g. above "Round Guard").
  .top-part-card
    padding-top: 0.05rem

  .skin-row
    top: -0.55rem

  // Override the (max-height: 900px) defaults — we want the pills as
  // tight as possible on mobile landscape. Padding shrunk to 0px 2px,
  // gap kept at 1px, and the value text bumped slightly to 12px so the
  // upgraded multipliers (e.g. "5.10x") stay legible at a glance.
  .stat-list
    font-size: 0.9rem
    column-gap: 1px
    row-gap: 1px

  .stat-glass
    padding: 0 2px
    gap: 1px
    min-height: 0

  .stat-icon
    width: 0.7rem
    height: 0.7rem

  .skin-row-full
    display: flex
    align-items: center
    gap: 0.125rem

  .skin-row-compact
    display: none

  .skin-row-thumb
    width: 0.75rem
    height: 0.75rem

  .skin-row-img
    width: 100%
    height: 100%

  .skin-plus-hitbox
    padding: 0.55rem
    margin: -0.55rem
    margin-left: 0

  .skin-plus-btn
    width: 1.1rem
    height: 1.1rem
    font-size: 0.9rem

  .level-badge
    right: -0.15rem
    bottom: -0.2rem
    font-size: 0.55rem
    padding: 1px 2px

  // Bump the upgrade cost text so it stays readable alongside the now-
  // larger stat pills above it. The bar keeps real padding even on the
  // shortest landscape phones — it was `padding: 0` and collapsed to a
  // ~17px sliver, which is unusable with a thumb.
  .upgrade-btn
    font-size: 0.75rem
    padding: 0.58rem 0

  .upgrade-coin-icon
    width: 0.8rem
    height: 0.8rem

  .stats-bar
    padding-top: 0.15rem
    margin-top: 0.1rem
    gap: 0.25rem

  .stats-items
    gap: 0.3rem
    font-size: 0.9rem

  .stat-summary-icon
    width: 0.85rem
    height: 0.85rem
    margin-right: 1px

  // ─── Skin picker (sibling FModal) ────────────────────────────────────────
  // Same constraint as the config layout: must fit on a ~350-450px tall
  // landscape viewport without scrolling. Shrink the wrapper padding,
  // image thumbnails, gap, and per-card padding so 3 rows fit.
  .skin-picker-body
    padding-top: 0.1rem
    padding-bottom: 0.1rem

  .skin-picker-header
    margin-bottom: 0.25rem

  // Six across, not the template's 3/4: since the 2026-09 expansion every top
  // part has 11-12 skins, and at 4 across the third row fell off the bottom
  // of a 414 px landscape phone. Six across keeps it to two rows.
  .skin-picker-grid
    gap: 0.3rem
    grid-template-columns: repeat(6, minmax(0, 1fr))

  .skin-card
    padding: 0.15rem

  .skin-card-img
    width: 2.4rem
    height: 2.4rem

  .skin-card-name
    margin-top: 0.1rem
    font-size: 0.7rem
    line-height: 1.1

  .skin-card-action
    margin-top: 0.1rem
    font-size: 0.7rem
    padding-top: 0
    padding-bottom: 0
    line-height: 1.2

// ─── Roomier landscape (taller phones / mini-tablets, ~371-500px) ───────────
// Reference viewport: 896×414 (iPhone 11/XR-class). At ~414px tall there is
// enough vertical headroom to give the cards, pill paddings, fonts, and
// gaps a modest bump (~25-30%) over the tightest mobile-landscape rules
// above, without breaking the no-scroll fit on smaller (e.g. 320×360)
// devices that still match `(max-height: 370px)`.

@media (orientation: landscape) and (min-height: 371px) and (max-height: 500px)
  .config-layout
    gap: 0.45rem

  .label-section, .skills-section :deep(.label-section)
    font-size: 0.85rem
    line-height: 1.1

  .top-grid
    gap: 0.4rem
    padding-top: 1rem
    row-gap: 1.25rem

  .bottom-grid
    gap: 0.4rem

  .top-part-card
    padding-top: 0.15rem

  .part-card-body
    padding: 0.15rem 0.15rem 0

  .skin-row
    top: -0.7rem

  .skin-row-thumb
    width: 1rem
    height: 1rem

  .skin-plus-btn
    width: 1.35rem
    height: 1.35rem
    font-size: 1rem

  .stat-list
    font-size: 0.9rem
    column-gap: 2px
    row-gap: 2px

  .stat-glass
    padding: 1px 3px
    gap: 2px

  .stat-icon
    width: 0.85rem
    height: 0.85rem

  .upgrade-btn
    font-size: 0.85rem
    padding: 0.58rem 0

  .upgrade-coin-icon
    width: 0.9rem
    height: 0.9rem

  .level-badge
    font-size: 0.62rem
    padding: 1px 3px

  .stats-bar
    padding-top: 0.3rem
    margin-top: 0.2rem
    gap: 0.4rem

  .stats-items
    gap: 0.45rem
    font-size: 0.9rem

  .stat-summary-icon
    width: 1rem
    height: 1rem

  .hint-block
    margin-top: 0.4rem
    padding-top: 0.35rem

  .hint-text
    font-size: 0.85rem
    line-height: 1.25

  // Skin picker — give thumbnails a touch more room so they don't look
  // postage-stamp-sized on a 414px-tall viewport.
  .skin-picker-body
    padding-top: 0.25rem
    padding-bottom: 0.25rem

  .skin-picker-grid
    gap: 0.45rem

  .skin-card
    padding: 0.3rem

  .skin-card-img
    width: 3rem
    height: 3rem

  .skin-card-name
    margin-top: 0.15rem
    font-size: 0.85rem

  .skin-card-action
    margin-top: 0.15rem
    font-size: 0.85rem
</style>

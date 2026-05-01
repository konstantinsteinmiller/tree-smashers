<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
  modelImgPath, isSkinOwned, buySkin, selectSkin, getSelectedSkin,
  hasUnownedSkinsForTop,
  markSkinPickerOpened, wasSkinPickerOpened,
  type SpinnerModelId
} from '@/use/useModels'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconAttack from '@/components/icons/IconAttack.vue'
import IconDefense from '@/components/icons/IconDefense.vue'
import IconHp from '@/components/icons/IconHp.vue'
import IconSpeed from '@/components/icons/IconSpeed.vue'
import IconWeight from '@/components/icons/IconWeight.vue'
import { stopGameplay } from '@/use/useCrazyGames'

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

const { t } = useI18n()

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

// Upgraded stat values for display
const topDamage = (part: typeof TOP_PARTS_LIST[number]) =>
  (part.damageMultiplier + TOP_UPGRADE_BONUS[part.id].damage * topLevel(part.id)).toFixed(2)

const topDefense = (part: typeof TOP_PARTS_LIST[number]) =>
  (part.defenseMultiplier + TOP_UPGRADE_BONUS[part.id].defense * topLevel(part.id)).toFixed(2)

const topHp = (part: typeof TOP_PARTS_LIST[number]) =>
  part.healthBonus + TOP_UPGRADE_BONUS[part.id].hp * topLevel(part.id)

const bottomSpeed = (part: typeof BOTTOM_PARTS_LIST[number]) =>
  (part.speedMultiplier + BOTTOM_UPGRADE_BONUS[part.id].speed * bottomLevel(part.id)).toFixed(2)

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
const skinPickerKey = ref(0)

const openSkinPicker = (topId: TopPartId) => {
  skinPickerTopId.value = topId
  skinPickerKey.value++
  skinPickerOpen.value = true
  markSkinPickerOpened(topId)
}

/** True when the plus icon should hint-bounce (unowned skins available
 *  AND the player hasn't yet opened the picker for this top part). */
const shouldBouncePlus = (topId: TopPartId): boolean =>
  hasUnownedSkinsForTop(topId) && !wasSkinPickerOpened(topId)

const handleBuySkin = (topId: TopPartId, modelId: SpinnerModelId) => {
  const cost = skinCost(modelId)
  if (coins.value < cost) return
  addCoins(-cost)
  buySkin(topId, modelId)
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
        div.relative.flex.justify-center.items-center.mb-2
          div.absolute.left-0.flex.items-center.gap-1.rounded.font-bold(
            class="top-1/2 -translate-y-[50%] px-1.5 py-0.5 bg-yellow-600/60 text-yellow-300 text-[11px] sm:text-xs"
          )
            IconCoin(class="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 text-yellow-300")
            span {{ coins }}
          h3.text-yellow-300.font-black.uppercase.italic.label-section(
            class="tracking-wider"
          ) {{ t('topBlade') }}
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
            div.skin-row.-mt-2.absolute.left-0.right-0.flex.justify-center.items-center.pointer-events-none(
              class="z-10"
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
              div.text-white.font-bold.truncate.game-text(class="text-[11px] sm:text-xs") {{ t('parts.' + part.id) }}
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
                div.text-white.font-bold.game-text(class="text-[11px] sm:text-xs") {{ t('parts.' + part.id) }}
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
              span.text-red-400.font-bold {{ stats.damageMultiplier.toFixed(1) }}x
            div.flex.items-center
              IconDefense.stat-summary-icon.text-purple-400
              span.text-purple-400.font-bold {{ stats.defenseMultiplier.toFixed(1) }}x
            div.flex.items-center
              IconSpeed.stat-summary-icon.text-cyan-400
              span.text-cyan-400.font-bold {{ stats.speedMultiplier.toFixed(1) }}x

      //- ── Hint Texts ─────────────────────────────────────────────────────
      //- Short, precise instructions about how the modal works. Sit at the
      //- bottom of the layout (below stats / bottom column) so they don't
      //- compete for vertical space with the cards above.
      div.hint-block.text-slate-300.text-center(class="border-t border-slate-500/40")
        p.hint-text.m-0
          | {{ t('hintSelectCards') }}
        p.hint-text.m-0(class="mt-1")
          | {{ t('hintPlusIcon') }}

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
          class="px-2 py-0.5 bg-yellow-600/60 text-yellow-300 text-[10px] sm:text-xs"
        )
          IconCoin(class="w-3.5 h-3.5 text-yellow-300")
          span {{ coins }}g
      div.grid.gap-2.skin-picker-grid(class="grid-cols-3 sm:grid-cols-4")
        div.skin-card(
          v-for="modelId in SKINS_PER_TOP[skinPickerTopId]"
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
          div.text-white.font-bold.skin-card-name(class="mt-0.5 text-[9px] sm:text-xs") {{ t('skins.' + modelId) }}
          //- Action button
          template(v-if="getSelectedSkin(skinPickerTopId, Number(activeBladeIndex)) === modelId")
            div.text-yellow-400.font-bold.skin-card-action(class="mt-0.5 text-[8px] sm:text-[10px]") {{ t('equipped') }}
          template(v-else-if="isSkinOwned(skinPickerTopId, modelId)")
            button.rounded-lg.font-bold.transition-all.skin-card-action(
              class="mt-0.5 text-[8px] sm:text-[10px] px-3 py-0.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer"
              @click="handleSelectSkin(skinPickerTopId, modelId)"
            ) {{ t('selectButton') }}
          template(v-else)
            button.rounded-lg.font-bold.transition-all.skin-card-action(
              class="mt-0.5 text-[8px] sm:text-[10px] px-2 py-0.5 flex items-center gap-1"
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
.label-section
  font-size: 0.95rem
  line-height: 1.1

.hint-block
  margin-top: 0.5rem
  padding-top: 0.4rem
  padding-left: 0.25rem
  padding-right: 0.25rem

.hint-text
  font-size: 10px
  line-height: 1.25

// ─── Base Layout (portrait / desktop) ────────────────────────────────────────

.config-layout
  display: flex
  flex-direction: column
  gap: 0.5rem
  padding: 0.25rem 0.25rem
  // Subtract a fixed chrome budget from the viewport instead of using
  // a plain `vh` cap. The FModal renders the tab heads (`BLADE 1` /
  // `BLADE 2`) above the modal-container via `bottom: 100%`, plus the
  // modal frame's own padding + close-button overhang. With a flat
  // `75vh` cap the content could grow tall enough that the modal's
  // top edge reached the viewport top — and the tabs (which sit
  // ABOVE that edge) ended up clipped by the browser chrome.
  // The 9rem (~144px) budget covers tabs + frame top padding +
  // safe-area + a small breathing margin so the tabs are always
  // fully visible. `dvh` reacts correctly to mobile-browser address-
  // bar collapse — `vh` would over-budget when the bar is showing.
  max-height: calc(100dvh - 9rem)
  overflow-y: auto
  // Reserve scrollbar gutter so hover-scale doesn't pop a scrollbar in/out
  // (which squeezes content horizontally and produces a visible jitter).
  scrollbar-gutter: stable

.top-col, .bottom-col
  min-width: 0

.top-grid
  // `minmax(0, 1fr)` (instead of plain `1fr`) lets cards shrink below
  // their min-content size, so a wide upgrade label can't push a column
  // past 1/3 of the modal width and trigger horizontal scrolling.
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 0.5rem
  // Leave room for the floating skin row that overflows above each card
  padding-top: 1.1rem
  row-gap: 1.4rem

.bottom-grid
  gap: 0.5rem

.part-card-body
  padding: 0 0 0

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
  font-size: 11px

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

.skin-plus-hitbox
  display: flex
  align-items: center
  justify-content: center
  padding: 0.5rem
  margin: -0.5rem
  margin-left: 0
  cursor: pointer

.skin-plus-btn
  width: 1.25rem
  height: 1.25rem
  font-size: 1rem
  line-height: 1
  padding: 0

// Level badge anchored to the card's bottom-right, overlapping the
// upgrade button so it pops above the yellow background.
.level-badge
  right: -0.2rem
  bottom: -0.25rem
  font-size: 9px
  line-height: 1
  padding: 1px 4px
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000

.upgrade-btn
  font-size: 10px
  padding: 0.2rem 0

.upgrade-coin-icon
  width: 0.75rem
  height: 0.75rem

.stats-bar
  padding-top: 0.375rem
  margin-top: 0.25rem
  display: flex
  align-items: center
  gap: 0.5rem
  flex-wrap: wrap

.stats-items
  gap: 0.5rem
  font-size: 12px

.stat-summary-icon
  width: 0.875rem
  height: 0.875rem
  margin-right: 0.125rem

// ─── sm+ breakpoint (≥640px) ─────────────────────────────────────────────────

@media (min-width: 640px)
  .config-layout
    // Slightly larger chrome budget for sm+ — the modal frame's
    // top padding grows from `pt-7` to `sm:pt-6` / `md:pt-10`, the
    // tabs scale up to text-base, and the desktop browser chrome /
    // scrollbar takes a bit more vertical space. 10rem (~160px)
    // keeps the tabs fully visible from the smallest desktop
    // viewport (~600px tall) up to 4K monitors.
    max-height: calc(100dvh - 10rem)

  .label-section
    font-size: 1.15rem

  .hint-text
    font-size: 11px

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
    font-size: 12px
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
    padding: 0.25rem
    margin: -0.25rem
    margin-left: 0

  .skin-plus-btn
    width: 1.45rem
    height: 1.45rem
    font-size: 1.1rem

  .level-badge
    right: -0.3rem
    bottom: -0.35rem
    font-size: 11px
    padding: 2px 5px

  .upgrade-btn
    font-size: 11px
    padding: 0.2rem 0

  .upgrade-coin-icon
    width: 0.75rem
    height: 0.75rem

  .stats-items
    font-size: 13px

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
    font-size: 16px
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
    font-size: 16px
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
    padding: 0
    max-height: none
    overflow: visible

  // Landscape mobile is the tightest viewport — keep the section labels
  // readable but only modestly larger so the cards still fit without
  // scrolling. (~30% over the original text-xs.)
  .label-section
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
    font-size: 11px
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
    padding-top: 0.55rem
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
    font-size: 12px
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
    padding: 0.25rem
    margin: -0.25rem
    margin-left: 0

  .skin-plus-btn
    width: 0.85rem
    height: 0.85rem
    font-size: 0.7rem

  .level-badge
    right: -0.15rem
    bottom: -0.2rem
    font-size: 7px
    padding: 1px 2px

  // Bump the upgrade cost text so it stays readable alongside the now-
  // larger stat pills above it.
  .upgrade-btn
    font-size: 10px
    padding: 0 0

  .upgrade-coin-icon
    width: 0.7rem
    height: 0.7rem

  .stats-bar
    padding-top: 0.15rem
    margin-top: 0.1rem
    gap: 0.25rem

  .stats-items
    gap: 0.3rem
    font-size: 12px

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

  .skin-picker-grid
    gap: 0.3rem

  .skin-card
    padding: 0.15rem

  .skin-card-img
    width: 2.4rem
    height: 2.4rem

  .skin-card-name
    margin-top: 0.1rem
    font-size: 9px
    line-height: 1.1

  .skin-card-action
    margin-top: 0.1rem
    font-size: 9px
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

  .label-section
    font-size: 0.85rem
    line-height: 1.1

  .top-grid
    gap: 0.4rem
    padding-top: 0.75rem
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
    width: 1.05rem
    height: 1.05rem
    font-size: 0.85rem

  .stat-list
    font-size: 14px
    column-gap: 2px
    row-gap: 2px

  .stat-glass
    padding: 1px 3px
    gap: 2px

  .stat-icon
    width: 0.85rem
    height: 0.85rem

  .upgrade-btn
    font-size: 12px
    padding: 1px 0

  .upgrade-coin-icon
    width: 0.8rem
    height: 0.8rem

  .level-badge
    font-size: 9px
    padding: 1px 3px

  .stats-bar
    padding-top: 0.3rem
    margin-top: 0.2rem
    gap: 0.4rem

  .stats-items
    gap: 0.45rem
    font-size: 14px

  .stat-summary-icon
    width: 1rem
    height: 1rem

  .hint-block
    margin-top: 0.4rem
    padding-top: 0.35rem

  .hint-text
    font-size: 13px
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
    font-size: 11px

  .skin-card-action
    margin-top: 0.15rem
    font-size: 11px
</style>

<i18n>
en:
  bladeLabel: "Blade"
  topBlade: "Top Blade"
  bottomPart: "Bottom Part"
  statsLabel: "Stats"
  selectSkin: "Select Skin"
  purchaseMoreSkins: "Purchase more skins"
  equipped: "EQUIPPED"
  selectButton: "SELECT"
  hintSelectCards: "Tap a card to select your spinner blade configuration. Tap the upgrade button to upgrade it."
  hintPlusIcon: "The + icon at the top of each top-blade card opens that part's skin shop (e.g. Tank Piercer skin shop) where you can acquire new skins."
  parts:
    star: "Star Blade"
    triangle: "Spiky"
    round: "Round Guard"
    quadratic: "Quad Core"
    cushioned: "Soft Shell"
    piercer: "Tank Piercer"
    speedy: "Speedy"
    tanky: "Tanky"
    balanced: "Balanced"
de:
  bladeLabel: "Blade"
  topBlade: "Obere Klinge"
  bottomPart: "Unterteil"
  statsLabel: "Werte"
  selectSkin: "Skin auswählen"
  purchaseMoreSkins: "Weitere Skins kaufen"
  equipped: "AUSGERÜSTET"
  selectButton: "WÄHLEN"
  hintSelectCards: "Tippe eine Karte an, um deine Spinner-Klingen-Konfiguration zu wählen. Tippe auf den Upgrade-Knopf, um sie zu verbessern."
  hintPlusIcon: "Das + oben auf jeder oberen Klinge öffnet den Skin-Shop dieses Teils (z. B. Panzerbrecher-Shop), wo du neue Skins kaufen kannst."
  parts:
    star: "Sternklinge"
    triangle: "Stachel"
    round: "Rundschutz"
    quadratic: "Quad-Kern"
    cushioned: "Weichpanzer"
    piercer: "Panzerbrecher"
    speedy: "Flink"
    tanky: "Robust"
    balanced: "Ausgeglichen"
fr:
  bladeLabel: "Toupie"
  topBlade: "Partie haute"
  bottomPart: "Partie basse"
  statsLabel: "Stats"
  selectSkin: "Choisir un skin"
  purchaseMoreSkins: "Acheter plus de skins"
  equipped: "ÉQUIPÉ"
  selectButton: "CHOISIR"
  hintSelectCards: "Touche une carte pour choisir la configuration de ta toupie. Touche le bouton d'amélioration pour l'améliorer."
  hintPlusIcon: "Le + en haut de chaque carte de partie haute ouvre la boutique de skins correspondante (ex. Perce-blindage), où tu peux acquérir de nouveaux skins."
  parts:
    star: "Lame étoile"
    triangle: "Épineux"
    round: "Bouclier rond"
    quadratic: "Noyau carré"
    cushioned: "Carapace"
    piercer: "Perce-blindage"
    speedy: "Rapide"
    tanky: "Résistant"
    balanced: "Équilibré"
es:
  bladeLabel: "Peonza"
  topBlade: "Parte superior"
  bottomPart: "Parte inferior"
  statsLabel: "Estadísticas"
  selectSkin: "Elegir skin"
  purchaseMoreSkins: "Comprar más skins"
  equipped: "EQUIPADO"
  selectButton: "ELEGIR"
  hintSelectCards: "Toca una tarjeta para elegir la configuración de tu peonza. Toca el botón de mejora para mejorarla."
  hintPlusIcon: "El + en la parte superior de cada tarjeta abre la tienda de skins de esa parte superior (p. ej. Perforador) donde puedes adquirir nuevas skins."
  parts:
    star: "Cuchilla estelar"
    triangle: "Espinoso"
    round: "Guardia redonda"
    quadratic: "Núcleo cuádruple"
    cushioned: "Coraza blanda"
    piercer: "Perforador"
    speedy: "Veloz"
    tanky: "Tanque"
    balanced: "Equilibrado"
jp:
  bladeLabel: "ブレード"
  topBlade: "アッパー"
  bottomPart: "ボトム"
  statsLabel: "ステータス"
  selectSkin: "スキン選択"
  purchaseMoreSkins: "スキンを追加購入"
  equipped: "装備中"
  selectButton: "選択"
  hintSelectCards: "カードをタップしてブレード構成を選び、アップグレードボタンで強化しよう。"
  hintPlusIcon: "アッパー カード上部の「+」をタップすると、そのパーツのスキンショップ（例：アーマーブレイク用）が開き、新スキンを入手できます。"
  parts:
    star: "スターブレード"
    triangle: "スパイキー"
    round: "ラウンドガード"
    quadratic: "クアッドコア"
    cushioned: "ソフトシェル"
    piercer: "アーマーブレイク"
    speedy: "スピード"
    tanky: "タンク"
    balanced: "バランス"
kr:
  bladeLabel: "블레이드"
  topBlade: "상단 파츠"
  bottomPart: "하단 파츠"
  statsLabel: "능력치"
  selectSkin: "스킨 선택"
  purchaseMoreSkins: "스킨 추가 구매"
  equipped: "장착됨"
  selectButton: "선택"
  hintSelectCards: "카드를 탭하여 블레이드 구성을 선택하고, 업그레이드 버튼으로 강화하세요."
  hintPlusIcon: "상단 파츠 카드 위쪽의 '+' 아이콘을 누르면 해당 파츠의 스킨 상점(예: 관통자 상점)이 열려 새 스킨을 구매할 수 있습니다."
  parts:
    star: "스타 블레이드"
    triangle: "가시"
    round: "라운드 가드"
    quadratic: "쿼드 코어"
    cushioned: "소프트 쉘"
    piercer: "관통자"
    speedy: "스피드"
    tanky: "탱커"
    balanced: "밸런스"
zh:
  bladeLabel: "陀螺"
  topBlade: "上部"
  bottomPart: "下部"
  statsLabel: "属性"
  selectSkin: "选择皮肤"
  purchaseMoreSkins: "购买更多皮肤"
  equipped: "已装备"
  selectButton: "选择"
  hintSelectCards: "点击卡片选择你的陀螺配置，点击升级按钮进行升级。"
  hintPlusIcon: "上部卡片顶部的「+」图标会打开对应部件的皮肤商店（例如穿甲者皮肤商店），可在此购买新皮肤。"
  parts:
    star: "星刃"
    triangle: "尖刺"
    round: "圆盾"
    quadratic: "方核"
    cushioned: "软甲"
    piercer: "穿甲者"
    speedy: "极速"
    tanky: "坦克"
    balanced: "均衡"
ru:
  bladeLabel: "Волчок"
  topBlade: "Верхняя часть"
  bottomPart: "Нижняя часть"
  statsLabel: "Статы"
  selectSkin: "Выбрать скин"
  purchaseMoreSkins: "Купить ещё скины"
  equipped: "ЭКИПИРОВАНО"
  selectButton: "ВЫБРАТЬ"
  hintSelectCards: "Нажми на карточку, чтобы выбрать конфигурацию волчка. Нажми кнопку улучшения, чтобы прокачать её."
  hintPlusIcon: "Значок «+» сверху каждой карточки верхней части открывает магазин скинов этой детали (например, для Бронебоя), где можно купить новые скины."
  parts:
    star: "Звёздный клинок"
    triangle: "Шипастый"
    round: "Круглый щит"
    quadratic: "Квадро-ядро"
    cushioned: "Мягкий панцирь"
    piercer: "Бронебой"
    speedy: "Быстрый"
    tanky: "Танк"
    balanced: "Баланс"
</i18n>

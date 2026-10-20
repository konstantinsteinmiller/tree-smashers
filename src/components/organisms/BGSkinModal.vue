<script setup lang="ts">
import { ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import InAppPurchaseShop from '@/components/organisms/InAppPurchaseShop.vue'
import useBgSkins, { type BgSkinDef } from '@/use/useBgSkins'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { prependBaseUrl } from '@/utils/function'
import { stopGameplay } from '@/use/useCrazyGames'
import { watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useSfcI18n('BGSkinModal')
const { coins, diamonds } = useSpinnerConfig()
const {
  bgSkins,
  selectedBgSkinId,
  isBgSkinOwned,
  selectBgSkin,
  buyBgSkinWithCoins,
  buyBgSkinWithDiamonds
} = useBgSkins()

// Pause CG gameplay when the modal opens (mirrors the other modals).
watch(() => props.modelValue, (open) => {
  if (open) stopGameplay()
})

const shopOpen = ref(false)

/** Card preview: real artwork when present, otherwise the gradient placeholder. */
const swatchStyle = (skin: BgSkinDef) =>
  skin.img
    ? { backgroundImage: `url(${prependBaseUrl(skin.img)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: `linear-gradient(135deg, ${skin.colors[0]}, ${skin.colors[1]}, ${skin.colors[2]})` }
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :title="t('bg.title')"
  )
    //- No local `max-h` / `overflow-y` — FModal's content slot is the single
    //- scroll authority (it derives its cap from the overlay's real content
    //- box). A second nested scroller here fought with it: the scrollbar
    //- stopped short of the frame and the scroll-edge fade rendered on the
    //- wrong box.
    div(class="space-y-3 px-2 sm:px-4 py-2")
      //- Balance row
      div.flex.items-center.justify-center.gap-3
        div.ui-chip.ui-chip--sun(class="text-xs sm:text-sm")
          IconCoin(class="w-4 h-4")
          span {{ coins }}
        div.ui-chip.diamond-chip(class="text-xs sm:text-sm")
          IconDiamond(class="w-4 h-4")
          span {{ diamonds }}

      //- Skin grid
      div.grid.gap-2(class="grid-cols-2 sm:grid-cols-3")
        div.bg-skin-card.flex.flex-col.overflow-hidden(
          v-for="skin in bgSkins"
          :key="skin.id"
          :class="{ 'is-equipped': selectedBgSkinId === skin.id }"
        )
          //- Preview swatch
          div.relative(class="h-16 sm:h-20" :style="swatchStyle(skin)")
            span.absolute.ui-chip.ui-chip--leaf(
              v-if="selectedBgSkinId === skin.id"
              class="top-1 right-1 text-[0.6rem]"
            ) {{ t('bg.equipped') }}
          //- `flex-1 justify-center` centres the label + action block in the
          //- space the grid row gives this card. Grid rows stretch every card
          //- to the tallest one, so an owned skin (one short "Equipped" line)
          //- otherwise sat pinned to the top of a card sized for two stacked
          //- price buttons, leaving a big dead gap underneath.
          div.bg-skin-card__body.flex.flex-col.items-center.justify-center.gap-1.p-1(class="flex-1")
            span.bg-skin-card__name.truncate.max-w-full(class="text-[0.75rem] sm:text-xs") {{ t('bg.skins.' + skin.id) }}
            //- Action area
            template(v-if="isBgSkinOwned(skin.id)")
              button.ui-btn.ui-btn--primary.w-full(
                v-if="selectedBgSkinId !== skin.id"
                class="px-3 py-2 text-[0.85rem] sm:text-sm"
                @click="selectBgSkin(skin.id)"
              ) {{ t('bg.select') }}
              span.bg-skin-card__equipped(v-else class="text-[0.75rem] sm:text-[0.85rem]") {{ t('bg.equippedShort') }}
            template(v-else)
              //- The two price buttons are STACKED, not side by side.
              //-
              //- They were a 65x24 pair sitting shoulder to shoulder in a
              //- half-width card. That is both under the tap-target floor and
              //- the worst place to put one: the two targets spend DIFFERENT
              //- currencies, so a mis-tap costs the player diamonds they meant
              //- to keep. Full-width rows remove the horizontal ambiguity
              //- entirely and give each button a comfortable height.
              div.flex.flex-col.items-stretch.gap-1.w-full
                //- Coin price
                button.ui-btn.ui-btn--premium.w-full.gap-1(
                  class="px-2 py-2.5 text-[0.75rem] sm:text-[0.9rem]"
                  :class="{ 'is-disabled': coins < skin.coinCost }"
                  @click="buyBgSkinWithCoins(skin.id)"
                )
                  IconCoin(class="w-5 h-5")
                  span.game-text {{ skin.coinCost >= 1000 ? (skin.coinCost / 1000) + 'k' : skin.coinCost }}
                //- Diamond price
                button.ui-btn.ui-btn--premium.w-full.gap-1(
                  class="px-2 py-2.5 text-[0.75rem] sm:text-[0.9rem]"
                  :class="{ 'is-disabled': diamonds < skin.diamondCost }"
                  @click="buyBgSkinWithDiamonds(skin.id)"
                )
                  IconDiamond(class="w-5 h-5")
                  span.game-text {{ skin.diamondCost }}

      ////- Diamond acquisition row
      //div.flex.flex-col.items-center.gap-2.border-t.border-slate-600(class="pt-2")
      //  span.text-slate-300.font-bold.uppercase.game-text(class="text-[0.75rem] sm:text-xs") {{ t('bg.needDiamonds') }}
      //  div.flex.items-center.justify-center.gap-3
      //    //- Watch-ad-for-diamond
      //    AdRewardButton(reward="diamond" :diamonds="1")
      //    //- Open the diamond IAP shop (prices revealed inside the shop)
      //    button.rounded-lg.border-2.font-bold.flex.items-center.gap-1.cursor-pointer.transition-transform(
      //      class="px-3 py-1.5 text-xs sm:text-sm bg-gradient-to-b from-[#23c4ff] to-[#1b6fb0] border-[#0f1a30] text-white hover:scale-105 active:scale-95"
      //      @click="shopOpen = true"
      //    )
      //      span.game-text {{ t('bg.buy') }}
      //      span.game-text.font-black 100
      //      IconDiamond(class="w-4 h-4")

  //- Diamond IAP shop (nested) — prices only revealed here
  InAppPurchaseShop(v-model="shopOpen")
</template>

<style scoped lang="sass">
.bg-skin-card
  border: 2px solid var(--color-wood-700)
  border-radius: var(--radius-ui)
  background-color: var(--color-cream-50)
  color: var(--ui-text)
  box-shadow: 0 3px 0 var(--color-wood-700)
  &.is-equipped
    border-color: var(--color-ink)
    background-color: var(--color-sun-200)
    box-shadow: 0 3px 0 var(--color-ink)

.bg-skin-card__body
  border-top: 2px solid var(--color-wood-700)

.bg-skin-card__name
  font-weight: 900
  font-size: 0.75rem
  color: var(--ui-text)

.bg-skin-card__equipped
  font-weight: 900
  color: var(--color-leaf-700)

// Diamonds are the plum accent.
.diamond-chip
  background-color: var(--color-plum-500)
  color: var(--color-cream-50)

.ui-btn .game-text
  text-shadow: inherit
</style>

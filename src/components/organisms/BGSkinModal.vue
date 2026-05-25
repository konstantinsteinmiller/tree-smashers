<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
    div(class="space-y-3 px-2 sm:px-4 py-2 max-h-[70vh] overflow-y-auto")
      //- Balance row
      div.flex.items-center.justify-center.gap-3
        div.flex.items-center.gap-1.rounded-full.font-bold(class="px-2 py-0.5 bg-yellow-600/50 text-yellow-200 text-xs sm:text-sm")
          IconCoin(class="w-4 h-4 text-yellow-300")
          span {{ coins }}
        div.flex.items-center.gap-1.rounded-full.font-bold(class="px-2 py-0.5 bg-cyan-700/40 text-cyan-100 text-xs sm:text-sm")
          IconDiamond(class="w-4 h-4")
          span {{ diamonds }}

      //- Skin grid
      div.grid.gap-2(class="grid-cols-2 sm:grid-cols-3")
        div.bg-skin-card.flex.flex-col.rounded-xl.border-2.overflow-hidden(
          v-for="skin in bgSkins"
          :key="skin.id"
          :class="selectedBgSkinId === skin.id ? 'border-cyan-400' : 'border-slate-600'"
        )
          //- Preview swatch
          div.relative(class="h-16 sm:h-20" :style="swatchStyle(skin)")
            span.absolute.rounded-full.font-black.uppercase.game-text(
              v-if="selectedBgSkinId === skin.id"
              class="top-1 right-1 bg-cyan-400 text-[#04161a] text-[8px] px-1.5 py-0.5"
            ) {{ t('bg.equipped') }}
          div.flex.flex-col.items-center.gap-1.p-1.bg-slate-800
            span.text-white.font-bold.game-text.truncate.max-w-full(class="text-[10px] sm:text-xs") {{ t('bg.skins.' + skin.id) }}
            //- Action area
            template(v-if="isBgSkinOwned(skin.id)")
              button.rounded-lg.font-bold.cursor-pointer.transition-all(
                v-if="selectedBgSkinId !== skin.id"
                class="px-3 py-0.5 text-[10px] sm:text-xs bg-cyan-600 hover:bg-cyan-500 text-white"
                @click="selectBgSkin(skin.id)"
              ) {{ t('bg.select') }}
              span.text-cyan-300.font-bold(v-else class="text-[9px] sm:text-[10px]") {{ t('bg.equippedShort') }}
            template(v-else)
              div.flex.items-center.gap-1
                //- Coin price
                button.rounded-lg.font-bold.flex.items-center.gap-1.transition-all(
                  class="px-1.5 py-0.5 text-[9px] sm:text-[10px]"
                  :class="coins >= skin.coinCost ? 'bg-yellow-500 hover:bg-yellow-400 text-white cursor-pointer' : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
                  @click="buyBgSkinWithCoins(skin.id)"
                )
                  IconCoin(class="w-3 h-3 text-yellow-200")
                  span.game-text {{ skin.coinCost >= 1000 ? (skin.coinCost / 1000) + 'k' : skin.coinCost }}
                //- Diamond price
                button.rounded-lg.font-bold.flex.items-center.gap-1.transition-all(
                  class="px-1.5 py-0.5 text-[9px] sm:text-[10px]"
                  :class="diamonds >= skin.diamondCost ? 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer' : 'bg-slate-600 text-slate-400 cursor-not-allowed'"
                  @click="buyBgSkinWithDiamonds(skin.id)"
                )
                  IconDiamond(class="w-3 h-3")
                  span.game-text {{ skin.diamondCost }}

      //- Diamond acquisition row
      div.flex.flex-col.items-center.gap-2.border-t.border-slate-600(class="pt-2")
        span.text-slate-300.font-bold.uppercase.game-text(class="text-[10px] sm:text-xs") {{ t('bg.needDiamonds') }}
        div.flex.items-center.justify-center.gap-3
          //- Watch-ad-for-diamond
          AdRewardButton(reward="diamond" :diamonds="1")
          //- Open the diamond IAP shop (prices revealed inside the shop)
          button.rounded-lg.border-2.font-bold.flex.items-center.gap-1.cursor-pointer.transition-transform(
            class="px-3 py-1.5 text-xs sm:text-sm bg-gradient-to-b from-[#23c4ff] to-[#1b6fb0] border-[#0f1a30] text-white hover:scale-105 active:scale-95"
            @click="shopOpen = true"
          )
            span.game-text {{ t('bg.buy') }}
            span.game-text.font-black 100
            IconDiamond(class="w-4 h-4")

  //- Diamond IAP shop (nested) — prices only revealed here
  InAppPurchaseShop(v-model="shopOpen")
</template>

<style scoped lang="sass">
.bg-skin-card
  background: #1e293b
</style>

<i18n lang="yaml">
en:
  bg:
    title: "Backgrounds"
    equipped: "On"
    equippedShort: "Equipped"
    select: "Select"
    needDiamonds: "Need more diamonds?"
    buy: "Buy"
    skins:
      classic: "Classic"
      aurora: "Aurora"
      ember: "Ember"
      nebula: "Nebula"
      circuit: "Circuit"
      cosmos: "Cosmos"
      prism: "Prism"
de:
  bg:
    title: "Hintergründe"
    equipped: "An"
    equippedShort: "Ausgerüstet"
    select: "Wählen"
    needDiamonds: "Mehr Diamanten nötig?"
    buy: "Kaufen"
    skins:
      classic: "Klassisch"
      aurora: "Aurora"
      ember: "Glut"
      nebula: "Nebel"
      circuit: "Schaltkreis"
      cosmos: "Kosmos"
      prism: "Prisma"
fr:
  bg:
    title: "Arrière-plans"
    equipped: "Actif"
    equippedShort: "Équipé"
    select: "Choisir"
    needDiamonds: "Besoin de diamants ?"
    buy: "Acheter"
    skins:
      classic: "Classique"
      aurora: "Aurore"
      ember: "Braise"
      nebula: "Nébuleuse"
      circuit: "Circuit"
      cosmos: "Cosmos"
      prism: "Prisme"
es:
  bg:
    title: "Fondos"
    equipped: "Activo"
    equippedShort: "Equipado"
    select: "Elegir"
    needDiamonds: "¿Necesitas diamantes?"
    buy: "Comprar"
    skins:
      classic: "Clásico"
      aurora: "Aurora"
      ember: "Brasa"
      nebula: "Nebulosa"
      circuit: "Circuito"
      cosmos: "Cosmos"
      prism: "Prisma"
jp:
  bg:
    title: "背景"
    equipped: "適用中"
    equippedShort: "装備中"
    select: "選択"
    needDiamonds: "ダイヤが足りない？"
    buy: "購入"
    skins:
      classic: "クラシック"
      aurora: "オーロラ"
      ember: "エンバー"
      nebula: "ネビュラ"
      circuit: "サーキット"
      cosmos: "コスモス"
      prism: "プリズム"
kr:
  bg:
    title: "배경"
    equipped: "적용"
    equippedShort: "장착됨"
    select: "선택"
    needDiamonds: "다이아몬드가 필요하세요?"
    buy: "구매"
    skins:
      classic: "클래식"
      aurora: "오로라"
      ember: "엠버"
      nebula: "네뷸라"
      circuit: "서킷"
      cosmos: "코스모스"
      prism: "프리즘"
zh:
  bg:
    title: "背景"
    equipped: "已用"
    equippedShort: "已装备"
    select: "选择"
    needDiamonds: "需要更多钻石？"
    buy: "购买"
    skins:
      classic: "经典"
      aurora: "极光"
      ember: "余烬"
      nebula: "星云"
      circuit: "电路"
      cosmos: "宇宙"
      prism: "棱镜"
ru:
  bg:
    title: "Фоны"
    equipped: "Вкл"
    equippedShort: "Экипировано"
    select: "Выбрать"
    needDiamonds: "Нужны алмазы?"
    buy: "Купить"
    skins:
      classic: "Классика"
      aurora: "Аврора"
      ember: "Уголь"
      nebula: "Туманность"
      circuit: "Схема"
      cosmos: "Космос"
      prism: "Призма"
</i18n>

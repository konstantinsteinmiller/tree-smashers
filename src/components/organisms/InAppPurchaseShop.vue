<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { isDebug } from '@/use/useMatch'

// Diamond → real-money shop. The $ prices live HERE (only revealed once the
// player opens this shop from the "get diamonds" entry in the BG-skin modal).
//
// NOTE: no real IAP backend is wired yet. In dev/debug builds a purchase grants
// the diamonds immediately so the whole flow is testable; in production the
// click is a safe no-op placeholder until a real IAP provider is wired here.

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { addDiamonds } = useSpinnerConfig()

interface Pack {
  diamonds: number
  /** Display price string (locale-agnostic for now). */
  price: string
  /** Optional ribbon, e.g. "Best value". */
  tagKey?: string
}

const PACKS: Pack[] = [
  { diamonds: 50, price: '$1.29' },
  { diamonds: 100, price: '$1.99', tagKey: 'popular' },
  { diamonds: 1000, price: '$9.99', tagKey: 'bestValue' }
]

const purchase = (pack: Pack) => {
  // TODO: replace with a real IAP provider call (platform-specific).
  if (isDebug.value) {
    addDiamonds(pack.diamonds)
    emit('update:modelValue', false)
  } else {
    // Production placeholder until real IAP is wired — intentionally inert.
    console.info('[iap] purchase requested (no backend wired yet):', pack)
  }
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :title="t('shop.title')"
  )
    div(class="space-y-2 px-2 sm:px-4 py-2")
      div.text-center.text-slate-300(class="text-[11px] sm:text-sm") {{ t('shop.subtitle') }}
      div.flex.flex-col.gap-2
        button.iap-pack.relative.flex.items-center.justify-between.rounded-xl.border-2.cursor-pointer.transition-all(
          v-for="pack in PACKS"
          :key="pack.diamonds"
          class="px-3 py-2 border-cyan-500/60 bg-cyan-900/30 hover:scale-[1.02] active:scale-95"
          @click="purchase(pack)"
        )
          //- Tag ribbon
          span.absolute.rounded-full.font-black.uppercase.game-text(
            v-if="pack.tagKey"
            class="-top-2 right-3 bg-amber-400 text-white text-[8px] sm:text-[10px] px-2 py-0.5"
          ) {{ t('shop.' + pack.tagKey) }}
          div.flex.items-center.gap-2
            IconDiamond(class="w-7 h-7 sm:w-8 sm:h-8")
            span.text-white.font-black.game-text(class="text-base sm:text-xl") {{ pack.diamonds }}
          span.text-cyan-200.font-black.game-text(class="text-sm sm:text-lg") {{ pack.price }}
      //- Honest note while real IAP isn't wired in production builds.
      div.text-center.text-slate-500(class="text-[9px] sm:text-[10px] mt-1") {{ t('shop.note') }}
</template>

<i18n lang="yaml">
en:
  shop:
    title: "Get Diamonds"
    subtitle: "Diamonds unlock backgrounds and (soon) powerful skills."
    popular: "Popular"
    bestValue: "Best value"
    note: "Purchases support the game. Secure checkout."
de:
  shop:
    title: "Diamanten holen"
    subtitle: "Diamanten schalten Hintergründe und (bald) starke Fähigkeiten frei."
    popular: "Beliebt"
    bestValue: "Bester Wert"
    note: "Käufe unterstützen das Spiel. Sicherer Checkout."
fr:
  shop:
    title: "Obtenir des diamants"
    subtitle: "Les diamants débloquent des fonds et (bientôt) de puissantes compétences."
    popular: "Populaire"
    bestValue: "Meilleure offre"
    note: "Les achats soutiennent le jeu. Paiement sécurisé."
es:
  shop:
    title: "Conseguir diamantes"
    subtitle: "Los diamantes desbloquean fondos y (pronto) habilidades poderosas."
    popular: "Popular"
    bestValue: "Mejor valor"
    note: "Las compras apoyan el juego. Pago seguro."
jp:
  shop:
    title: "ダイヤを入手"
    subtitle: "ダイヤで背景や（近日）強力なスキルを解放。"
    popular: "人気"
    bestValue: "お得"
    note: "購入はゲームを支援します。安全な決済。"
kr:
  shop:
    title: "다이아몬드 얻기"
    subtitle: "다이아몬드로 배경과 (곧) 강력한 스킬을 잠금 해제하세요."
    popular: "인기"
    bestValue: "최고의 가치"
    note: "구매는 게임을 지원합니다. 안전한 결제."
zh:
  shop:
    title: "获取钻石"
    subtitle: "钻石可解锁背景以及（即将推出的）强力技能。"
    popular: "热门"
    bestValue: "超值"
    note: "购买可支持游戏。安全结算。"
ru:
  shop:
    title: "Получить алмазы"
    subtitle: "Алмазы открывают фоны и (скоро) мощные навыки."
    popular: "Популярно"
    bestValue: "Выгодно"
    note: "Покупки поддерживают игру. Безопасная оплата."
</i18n>

<script setup lang="ts">
import { useSfcI18n } from '@/i18n/sfc'
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

const { t } = useSfcI18n('InAppPurchaseShop')
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
      div.text-center.text-slate-300(class="text-[0.85rem] sm:text-sm") {{ t('shop.subtitle') }}
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
            class="-top-2 right-3 bg-amber-400 text-white text-[0.6rem] sm:text-[0.75rem] px-2 py-0.5"
          ) {{ t('shop.' + pack.tagKey) }}
          div.flex.items-center.gap-2
            IconDiamond(class="w-7 h-7 sm:w-8 sm:h-8")
            span.text-white.font-black.game-text(class="text-base sm:text-xl") {{ pack.diamonds }}
          span.text-cyan-200.font-black.game-text(class="text-sm sm:text-lg") {{ pack.price }}
      //- Honest note while real IAP isn't wired in production builds.
      div.text-center.text-slate-500(class="text-[0.7rem] sm:text-[0.75rem] mt-1") {{ t('shop.note') }}
</template>

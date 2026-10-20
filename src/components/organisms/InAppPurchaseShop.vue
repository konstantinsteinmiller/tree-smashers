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
      div.text-center.ui-body(class="text-[0.85rem] sm:text-sm") {{ t('shop.subtitle') }}
      div.flex.flex-col.gap-2
        button.iap-pack.ui-btn.ui-btn--premium.ui-pop-in.relative.w-full.justify-between(
          v-for="(pack, i) in PACKS"
          :key="pack.diamonds"
          :style="{ '--i': i }"
          class="px-3 py-2"
          @click="purchase(pack)"
        )
          //- Tag ribbon
          //- Angled berry "best value" tag on the corner.
          span.absolute.ui-chip.ui-chip--berry.ui-chip--angled(
            v-if="pack.tagKey"
            class="-top-3 right-3 text-[0.6rem] sm:text-[0.75rem]"
          )
            span {{ t('shop.' + pack.tagKey) }}
          div.flex.items-center.gap-2
            IconDiamond(class="w-7 h-7 sm:w-8 sm:h-8")
            span.font-black(class="text-base sm:text-xl") {{ pack.diamonds }}
          span.font-black(class="text-sm sm:text-lg") {{ pack.price }}
      //- Honest note while real IAP isn't wired in production builds.
      div.text-center.ui-body(class="text-[0.7rem] sm:text-[0.75rem] mt-1") {{ t('shop.note') }}
</template>

<style scoped lang="sass">
// The pop-in stagger must not pin a transform over the button press.
.iap-pack.ui-pop-in
  animation-fill-mode: backwards
</style>

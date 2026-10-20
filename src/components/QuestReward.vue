<template lang="pug">
  FReward(
    :modelValue="modelValue"
    :showContinue="canContinue"
    celebrate
    @continue="handleClose"
  )
    template(#ribbon)
      h2.text-2xl.font-black.uppercase.ui-outline(
        class="md:text-4xl"
      ) {{ t('congratulations') }}
      span.text-4xl.mb-2(class="md:text-6xl") 🏆
    div.flex.flex-col.items-center.justify-center.max-w-2xl.text-center.p-8(
      class="gap-6 mx-4"
    )

      p.ui-outline.font-black.leading-relaxed(
        class="text-lg md:text-2xl"
      ) {{ message }}

      //- Visual timer indicator
      div.ui-bar.w-full(v-if="!canContinue")
        div.ui-bar__fill.transition-all.duration-100(
          :style="{ width: `${progress}%` }"
        )
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FReward from '@/components/atoms/FReward.vue'
import useSound from '@/use/useSound'

const props = defineProps<{
  modelValue: boolean
  type: 'campaign' | 'demo-campaign' | 'cards'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useSfcI18n('QuestReward')
const { playSound } = useSound()
const canContinue = ref(false)
const progress = ref(0)

const message = computed(() => {
  return props.type === 'campaign'
    ? t('campaignFinished')
    : props.type === 'demo-campaign'
      ? t('demoCampaignFinished')
      : t('cardsFinished')
})

const startTimer = () => {
  canContinue.value = false
  progress.value = 0

  const duration = 5000
  const interval = 50
  const step = (interval / duration) * 100

  const timer = setInterval(() => {
    progress.value += step
    if (progress.value >= 100) {
      clearInterval(timer)
      canContinue.value = true
    }
  }, interval)
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) startTimer()
})

onMounted(() => {
  if (props.modelValue) startTimer()
  playSound('win', 0.1)
})

const handleClose = () => {
  emit('close')
}
</script>


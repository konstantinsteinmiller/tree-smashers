<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PvpVsPreview from '@/components/organisms/PvpVsPreview.vue'
import { prependBaseUrl } from '@/utils/function'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

/**
 * DEV-ONLY eyeballing page for the PvP VS card (see dev/pvp-vs.html for the
 * query parameters). Copy here is developer-facing (exempt from i18n).
 */

const { t } = useI18n()
const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'full'
const role = (params.get('role') === 'guest' ? 'guest' : 'host') as 'host' | 'guest'
const low = params.get('low') === '1' ? true : undefined
const at = params.has('at') ? Number(params.get('at')) : null
const DURATION = 1200

const hostTeam: SpinnerConfig[] = scene === 'mixed'
  ? [{ topPartId: 'star', bottomPartId: 'speedy', topLevel: 7, bottomLevel: 6, modelId: 'reddragon' }]
  : [
    { topPartId: 'star', bottomPartId: 'speedy', topLevel: 7, bottomLevel: 6, modelId: 'reddragon' },
    { topPartId: 'round', bottomPartId: 'tanky', topLevel: 5, bottomLevel: 5, modelId: 'turtle' }
  ]
const guestTeam: SpinnerConfig[] = scene === 'mixed'
  ? [{ topPartId: 'piercer', bottomPartId: 'balanced', topLevel: 4, bottomLevel: 4 }]
  : [
    { topPartId: 'triangle', bottomPartId: 'balanced', topLevel: 6, bottomLevel: 7, modelId: 'scorpion' },
    { topPartId: 'cushioned', bottomPartId: 'tanky', topLevel: 6, bottomLevel: 6, modelId: 'phoenix' }
  ]
const hostSkills: SkillLoadout = scene === 'mixed'
  ? [{ id: 'guard_shell', level: 4 }]
  : scene === 'levelone'
    ? [{ id: 'mirror_plate', level: 1 }, { id: 'second_wind', level: 1 }]
    : [{ id: 'mirror_plate', level: 7 }, { id: 'second_wind', level: 10 }]
const guestSkills: SkillLoadout = scene === 'mixed'
  ? []
  : scene === 'levelone'
    ? [{ id: 'homing_rockets', level: 1 }, { id: 'static_charge', level: 1 }]
    : [{ id: 'homing_rockets', level: 5 }, { id: 'static_charge', level: 3 }]

const show = ref(true)
const runKey = ref(0)

const freeze = async () => {
  if (at == null) return
  await nextTick()
  requestAnimationFrame(() => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = at * DURATION
    }
    document.body.dataset.frozen = '1'
  })
}

const replay = () => {
  show.value = false
  setTimeout(() => {
    runKey.value++
    show.value = true
    void freeze()
  }, 30)
}

onMounted(() => {
  void freeze()
  if (params.get('loop') === '1') setInterval(replay, 2000)
})

const bg = prependBaseUrl('images/bg/bg-tile-beyblade_800x436.webp')
</script>

<template lang="pug">
  div.fixed.inset-0.overflow-hidden(
    :style="{ background: `var(--color-forest-900) url(${bg}) center / cover` }"
  )
    //- Stand-in for the arena ring the card sits over.
    div.absolute.rounded-full.border-4(
      class="border-cream-50/40 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style="width: min(88vw, 88vh); height: min(88vw, 88vh)"
    )
    PvpVsPreview(
      v-if="show"
      :key="runKey"
      :host-team="hostTeam"
      :guest-team="guestTeam"
      :host-skills="hostSkills"
      :guest-skills="guestSkills"
      :my-role="role"
      :announcement="t('spinner.yourTurn')"
      :duration-ms="DURATION"
      :low="low"
    )
    button.absolute.bottom-2.right-2.ui-btn.ui-btn--secondary.text-xs(
      v-if="at == null"
      @click="replay"
    ) replay
</template>

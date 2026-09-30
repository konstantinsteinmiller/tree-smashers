<script setup lang="ts">
import { ref } from 'vue'
import SkillsIntroScreen from '@/components/organisms/SkillsIntroScreen.vue'
import SkillPickerModal from '@/components/organisms/SkillPickerModal.vue'
import SkillRevealOverlay from '@/components/organisms/SkillRevealOverlay.vue'
import SpinnerConfigModal from '@/components/organisms/SpinnerConfigModal.vue'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import SkillHudIcon from '@/components/atoms/SkillHudIcon.vue'
import SkillSlotTile from '@/components/molecules/SkillSlotTile.vue'
import SkillIntroDemo from '@/components/molecules/SkillIntroDemo.vue'
import StageBadge from '@/components/StageBadge.vue'
import BossPeekBadge from '@/components/atoms/BossPeekBadge.vue'
import { SKILL_AUTOFILL_ORDER } from '@/data/skillCatalog'

/**
 * DEV-ONLY eyeballing page for the skill UI (see dev/skills-ui.html for the
 * query parameters). Copy here is developer-facing (exempt from i18n); every
 * string the components render comes from the locale files.
 */

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'intro'
const shot = params.has('shot')
const forceStatic = params.get('static') === '1' ? true : null

const introOpen = ref(scene === 'intro')
const pickerOpen = ref(scene === 'picker')
const revealOpen = ref(scene === 'reveal')
const configOpen = ref(scene === 'config')
const log = ref<string[]>([])
const note = (s: string) => {
  log.value = [...log.value.slice(-5), `${(performance.now() / 1000).toFixed(2)}s ${s}`]
}

const reopenIntro = () => {
  introOpen.value = false
  setTimeout(() => {
    introOpen.value = true
  }, 50)
}

const ids = SKILL_AUTOFILL_ORDER
</script>

<template lang="pug">
  div.min-h-screen.text-white(class="bg-[#0b1220]" data-testid="skills-ui-preview")
    div.p-3.flex.flex-wrap.items-center.gap-3.text-xs(v-if="!shot" class="bg-black/40")
      span.font-black skills UI (dev) · scene={{ scene }}
      button.px-2.py-1.rounded.bg-slate-700(v-if="scene === 'intro'" @click="reopenIntro") replay intro
      button.px-2.py-1.rounded.bg-slate-700(v-if="scene === 'picker'" @click="pickerOpen = true") open picker
      button.px-2.py-1.rounded.bg-slate-700(v-if="scene === 'reveal'" @click="revealOpen = true") open reveal
      button.px-2.py-1.rounded.bg-slate-700(v-if="scene === 'config'" @click="configOpen = true") open team
      span.opacity-60(v-for="l in log" :key="l") {{ l }}

    //- ── Sheet: atoms / molecules / chips ──
    div.p-4.flex.flex-col.gap-6(v-if="scene === 'sheet'")
      div.flex.flex-wrap.items-end.gap-3
        div.flex.flex-col.items-center.gap-1(v-for="id in ids" :key="id")
          SkillIcon(:id="id" :size="96")
          div.flex.items-end.gap-1
            SkillIcon(:id="id" :size="48")
            SkillIcon(:id="id" :size="32")
            SkillIcon(:id="id" :size="20")
          span.text-xs.opacity-70 {{ id }}
        div.flex.flex-col.items-center.gap-1
          SkillIcon(id="mirror_plate" :size="96" locked)
          span.text-xs.opacity-70 locked
      div.flex.flex-wrap.items-center.gap-4.p-3.rounded-xl(class="bg-slate-800")
        SkillHudIcon(id="guard_shell" :level="4" :state="{ ring: 0.6 }")
        SkillHudIcon(id="phase_step" :level="3" :state="{ cooldownMs: 3000, cooldownKey: 1 }")
        SkillHudIcon(id="momentum" :level="2" :state="{ pips: 2, pipsMax: 3 }")
        SkillHudIcon(id="homing_rockets" :level="5" :state="{ pips: 4, pipsMax: 6 }")
        SkillHudIcon(id="second_wind" :level="1" :state="{ spent: true }")
        SkillHudIcon(id="lucky_edge" :level="7" :state="{ flashKey: 1 }" breathe)
      div.grid.gap-2(class="grid-cols-2 max-w-md")
        SkillSlotTile(:slot-index="0" skill-id="mirror_plate" :level="3" effect="8% · reflect")
        SkillSlotTile(:slot-index="1" :level="0" breathe)
        SkillSlotTile(:slot-index="0" skill-id="phase_step" :level="10" is-new)
        SkillSlotTile(:slot-index="1" locked :unlock-stage="20")
      div.flex.flex-wrap.items-center.gap-8.p-4
        StageBadge(:stage-id="40" name="stage_40" is-boss show-skill-drop)
        StageBadge(:stage-id="10" name="stage_10" is-boss show-skill-drop)
      BossPeekBadge(:peek="{ wonStageId: 37, bossStageId: 40, nameKey: 'stage_40', cycleSuffix: '', stagesAway: 3, modelId: null, isTeam: false }")
      div.max-w-md.flex.flex-col.gap-3
        SkillIntroDemo
        SkillIntroDemo(storyboard)

    SkillsIntroScreen(
      v-model="introOpen"
      :static-mode="forceStatic"
      @drumroll="(ms) => note(`drumroll ${ms}ms`)"
      @revealed="note('revealed')"
      @open-picker="note('open-picker')"
      @close="note('close')"
    )
    SkillPickerModal(v-model="pickerOpen" :slot-index="0")
    SkillRevealOverlay(
      v-model="revealOpen"
      :skill-ids="['second_wind']"
      @continue="revealOpen = false"
      @open-team="note('open-team')"
    )
    SpinnerConfigModal(v-model="configOpen")
</template>

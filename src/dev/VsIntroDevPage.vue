<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VsIntro from '@/components/organisms/VsIntro.vue'
import { smasherConfig, type SmasherId } from '@/data/smasherCatalog'
import { computeStats } from '@/use/useSpinnerConfig'
import { buildVsSide, type VsIntroData, type VsMode, type VsUnitInput } from '@/use/vsIntro'
import { preloadPaintedSmashers } from '@/smashers/smasherAtlas'
import type { SpinnerConfig } from '@/types/spinner'

/**
 * DEV-ONLY eyeballing page for the VS intro (see dev/vs-intro.html for the
 * query parameters). Fixture copy here is developer-facing (exempt from i18n);
 * the screen's own copy goes through the real locale files.
 */

const { t } = useI18n()
const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? '2v2'
const at = params.has('at') ? Number(params.get('at')) : null
const low = params.get('low') === '1' ? true : undefined

const unit = (c: SpinnerConfig): VsUnitInput => {
  const s = computeStats(c, c.topLevel ?? 0, c.bottomLevel ?? 0)
  return { config: c, maxHp: s.maxHp * (c.isBoss ? 2.5 : 1), damageMul: s.damageMultiplier, defenseMul: s.defenseMultiplier }
}
const sm = (id: SmasherId, lv: number) => smasherConfig(id, lv)

const build = (): VsIntroData => {
  const me: Record<string, SpinnerConfig[]> = {
    '1v1': [sm('grizzle', 22)],
    '2v2': [sm('bramble', 12), sm('vixie', 25)],
    '3v4': [sm('bramble', 8), sm('thumper', 14), sm('grizzle', 27)],
    boss: [sm('vixie', 18), sm('tuskar', 21)],
    campaign: [sm('bramble', 6), sm('pecks', 11)]
  }
  const them: Record<string, SpinnerConfig[]> = {
    '1v1': [sm('chomper', 20)],
    '2v2': [sm('ramsey', 15), sm('hootsie', 20)],
    '3v4': [sm('shellby', 10), sm('mossy', 12), sm('zippy', 21), sm('pecks', 3)],
    boss: [
      { topPartId: 'triangle', bottomPartId: 'tanky', topLevel: 14, bottomLevel: 14, modelId: 'reddragon', isBoss: true, bossTrait: 'ember' },
      { topPartId: 'star', bottomPartId: 'speedy', topLevel: 9, bottomLevel: 9 }
    ],
    campaign: [
      { topPartId: 'star', bottomPartId: 'speedy', topLevel: 4, bottomLevel: 4 },
      { topPartId: 'round', bottomPartId: 'tanky', topLevel: 5, bottomLevel: 4 },
      { topPartId: 'triangle', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 5 }
    ]
  }
  const key = me[scene] ? scene : '2v2'
  // ?me=bramble,buford&them=hootsie — pick the cast (e.g. smashers with painted portraits)
  const cast = (k: 'me' | 'them') => params.get(k)?.split(',').filter(Boolean).map((id, i) => sm(id as SmasherId, 10 + i * 5))
  const meCast = cast('me')
  const themCast = cast('them')
  if (meCast?.length) me[key] = meCast
  if (themCast?.length) them[key] = key === 'boss' ? [them.boss![0]!, ...themCast] : themCast
  const mode: VsMode = (params.get('mode') as VsMode | null) ?? (key === 'boss' ? 'boss' : key === 'campaign' ? 'campaign' : 'league')
  const enemySkills = key !== 'boss' && key !== 'campaign'
  return {
    mode,
    me: buildVsSide(t('you'), 'player', me[key]!.map(unit), { skillsOn: true }),
    them: buildVsSide(
      key === 'boss' ? t('stages.boss_cinder_tyrant') : key === 'campaign' ? t('stages.stage_12') : 'MossyMauler77',
      'npc', them[key]!.map(unit), { skillsOn: enemySkills }
    ),
    kicker: key === 'boss' ? t('bossStage') : key === 'campaign' ? t('stageN', { n: 12 }) : undefined
  }
}

const data = ref<VsIntroData>(build())
// In the game the battle board has already loaded the painted sheets by the
// time the VS plays; do the same here before showing it.
preloadPaintedSmashers([...data.value.me.units, ...data.value.them.units].map(u => u.smasherId))
const show = ref(false)
const runKey = ref(0)

const freeze = async () => {
  if (at == null) return
  await nextTick()
  // Let the portraits draw (they are staggered one per frame) first.
  for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r))
  const seam = (window as unknown as { __vsIntro?: { hold: (ms: number) => void } }).__vsIntro
  seam?.hold(at)
  await new Promise(r => requestAnimationFrame(r))
  document.body.dataset.frozen = '1'
}

const replay = () => {
  show.value = false
  setTimeout(() => {
    runKey.value++
    show.value = true
  }, 30)
}

onMounted(async () => {
  await new Promise(r => setTimeout(r, 900))
  show.value = true
  void freeze()
  if (params.get('loop') === '1') setInterval(replay, 5400)
})
</script>

<template lang="pug">
  div.fixed.inset-0.overflow-hidden(style="background: var(--color-forest-800)")
    VsIntro(v-if="show" :key="runKey" :data="data" :low="low")
</template>

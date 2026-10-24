<script setup lang="ts">
// DEV-ONLY composite screens (dev/ui-screens.html, #UX1c). Labels here are
// dev-only; every visible game string comes from the real components / keys.
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FReward from '@/components/atoms/FReward.vue'
import FCountUp from '@/components/atoms/FCountUp.vue'
import BossDefeatedBanner from '@/components/atoms/BossDefeatedBanner.vue'
import BossIntroCard from '@/components/atoms/BossIntroCard.vue'
import RouletteWheel from '@/components/organisms/RouletteWheel.vue'
import HudToast from '@/components/atoms/HudToast.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import StageBadge from '@/components/StageBadge.vue'
import RewardRevealHost from '@/components/organisms/RewardRevealHost.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { revealRewards } from '@/use/useRewardReveal'
import { showHudToast, HUD_TOAST_MS } from '@/use/useHudToast'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { SKINS_PER_TOP } from '@/use/useModels'
import { RARITY_ORDER } from '@/data/smasherRarity'
import BossPeekBadge from '@/components/atoms/BossPeekBadge.vue'
import { smasherForSkin } from '@/smashers/smasherSkins'
import { SMASHERS } from '@/data/smasherCatalog'
import type { BossPeek } from '@/use/bossPeek'

const { t } = useI18n()
const screen = new URLSearchParams(location.search).get('screen') ?? 'modal'
/** `bossIntro`: `?model=cinder|frost-vault|yeti` shows that boss's crest badge. */
const introModel = new URLSearchParams(location.search).get('model')
const open = ref(true)
/** Timed moments (boss cards) mount only once the fonts are in, so a slow
 *  first compile never eats their 1.5–3 s on screen. */
const ready = ref(false)
const { addCoins } = useSpinnerConfig()

/** `stageBadges`: `?stages=` ids or `stages.*` keys; `key:N` adds the cycle-N
 *  Roman suffix (boss_* keys sit on slot 110+ → a "II" on their 2nd meeting). */
const badgeList = (new URLSearchParams(location.search).get('stages') ?? '5,40,100,boss_twin_pyres')
  .split(',').map((raw) => {
    const [key, cyc] = raw.split(':')
    const id = /^\d+$/.test(key!) ? Number(key) : 110
    const name = /^\d+$/.test(key!) ? `stage_${key}` : key!
    const suffix = ['', '', 'II', 'III', 'IV'][Number(cyc ?? 0)] ?? ''
    return { id, name, suffix, boss: id % 5 === 0 || name.startsWith('boss_') }
  })

const firstSkins =Object.values(SKINS_PER_TOP).map(list => list[1] ?? list[0]).filter(Boolean).slice(0, 2) as string[]

/** `bossPeek`: one next-boss badge per `?skins=` model id (default: the
 *  first skins whose smasher wears its signature — painted — look, then
 *  colourways that stay drawn). */
const allSkins = [...new Set(Object.values(SKINS_PER_TOP).flat())] as string[]
const isSignatureSkin = (m: string) => SKINS_PER_TOP[SMASHERS[smasherForSkin(m)].archetype.top]?.[0] === m
const peekSkins = (new URLSearchParams(location.search).get('skins')?.split(',') ?? [
  ...allSkins.filter(isSignatureSkin).slice(0, 4),
  ...allSkins.filter(m => !isSignatureSkin(m)).slice(0, 4)
])
const peeks: BossPeek[] = peekSkins.map((modelId) => ({
  wonStageId: 3, bossStageId: 5, stagesAway: 2, nameKey: 'stage_5', cycleSuffix: '', modelId, isTeam: false
}))

onMounted(() => {
  if (screen === 'reveal') {
    void revealRewards([{ kind: 'coins', amount: 450 }, ...firstSkins.map(modelId => ({ kind: 'skin' as const, modelId }))])
  }
  if (screen === 'coinpop') {
    window.setTimeout(() => {
      addCoins(350)
      showHudToast(t('sfc.BattlePass.claimedRewards', { n: 7 }), 'leaf', HUD_TOAST_MS * 4)
    }, 300)
  }
  void document.fonts.ready.then(() => {
    ready.value = true
    document.documentElement.setAttribute('data-screen-ready', '1')
  })
})
</script>

<template lang="pug">
  main.screens(:class="'screen-' + screen")
    //- ── Boss defeated / boss intro: over a flat arena-green stage ────────
    template(v-if="screen === 'bossDefeated' && ready")
      BossDefeatedBanner
    template(v-else-if="screen === 'bossIntro' && ready")
      BossIntroCard(name-key="stage_10" :traits="['frost', 'ember']" :model-id="introModel")
    //- ── The boss-reward roulette wheel (painted rim / pointer / hub / bolts) ──
    template(v-else-if="screen === 'roulette'")
      div.flex.items-center.justify-center(class="min-h-screen")
        RouletteWheel

    //- ── Win / lose result (the arena's FReward body, condensed) ─────────
    template(v-else-if="screen === 'win' || screen === 'lose'")
      FReward(
        v-model="open"
        :show-continue="true"
        :celebrate="screen === 'win'"
        :ribbon-tone="screen === 'lose' ? 'berry' : 'leaf'"
      )
        template(#ribbon)
          span {{ t('spinner.rewards') }}
        div.flex.flex-col.items-center.gap-4
          div.reward-result-text.font-black.uppercase.ui-slam.ui-outline-xl(
            class="text-3xl sm:text-5xl"
            :class="screen === 'win' ? 'text-sun-300' : 'text-berry-400'"
            :style="{ color: screen === 'win' ? 'var(--color-sun-300)' : 'var(--color-berry-400)' }"
          ) {{ screen === 'win' ? t('spinner.youWin') : t('spinner.youLose') }}
          div.flex.items-center.gap-3
            IconCoin(class="w-8 h-8 text-sun-400")
            FCountUp.text-sun-300.font-black.game-text(class="text-2xl sm:text-4xl" :value="screen === 'win' ? 120 : 25" prefix="+" :delay="200")

    //- ── Gift reveal ─────────────────────────────────────────────────────
    template(v-else-if="screen === 'reveal'")
      RewardRevealHost

    //- ── HUD: stage badges (?stages=5,40,boss_twin_pyres:2), placed like the
    //- arena's top-left HUD — a name fit check per locale ───────────────
    template(v-else-if="screen === 'stageBadges'")
      div.badge-stack
        StageBadge(
          v-for="b in badgeList"
          :key="b.name"
          :stage-id="b.id"
          :name="b.name"
          :cycle-suffix="b.suffix"
          :is-boss="b.boss"
        )

    //- ── HUD: coin badge (+N pop) and the toast ───────────────────────────
    template(v-else-if="screen === 'coinpop'")
      div.hud-row
        CoinBadge
      HudToast

    //- ── Next-boss badges (?skins=a,b,c) — the portrait centring check ──
    template(v-else-if="screen === 'bossPeek'")
      div.peek-grid
        div.peek-cell(v-for="p in peeks" :key="p.modelId ?? ''" :data-skin="p.modelId")
          BossPeekBadge(:peek="p")

    //- ── A sample modal with the kit's plates, chips, cards and bar ──────
    template(v-else-if="screen === 'modal'")
      FModal(v-model="open" :title="t('sfc.SmasherTeamModal.team')")
        div.sample
          div.sample-row
            span.ui-tag(v-for="tone in ['', 'leaf', 'berry', 'royal', 'plum']" :key="tone" :class="tone ? 'ui-tag--' + tone : ''")
              span.ui-outline Tag
          div.sample-row
            span.ui-chip.ui-chip--sun
              IconCoin(class="w-3.5 h-3.5")
              span 1200
            span.ui-chip.ui-chip--leaf {{ t('spinner.free') }}
            span.ui-rarity-name(v-for="r in RARITY_ORDER" :key="r" :class="'ui-rarity-name--' + r") {{ t('rarity.' + r) }}
          div.sample-row
            div.sample-card.ui-card.ui-card--interactive(v-for="r in ['rare', 'epic', 'legendary']" :key="r" :class="'ui-rarity--' + r")
              span.ui-rarity-name(:class="'ui-rarity-name--' + r") {{ t('rarity.' + r) }}
          div.ui-bar(style="width: 100%")
            div.ui-bar__fill(style="width: 64%")
</template>

<style lang="sass">
.peek-grid
  display: flex
  flex-wrap: wrap
  gap: 1rem
  padding: 1rem
.peek-cell
  flex: 0 0 auto

body
  margin: 0
  font-family: var(--font-game)
  // A flat arena-green ground (no hard diagonal: it would dominate a
  // sharpness probe of the screenshot).
  background-color: var(--color-forest-800)
  min-height: 100vh
</style>

<style scoped lang="sass">
.screens
  min-height: 100vh

.badge-stack
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: 0.6rem
  padding: 0.5rem

.hud-row
  position: fixed
  top: 0.5rem
  right: 0.5rem

.sample
  display: flex
  flex-direction: column
  gap: 1rem
  padding: 0.5rem 0.75rem 0.75rem

.sample-row
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: center
  gap: 0.8rem

.sample-card
  width: 5.5rem
  height: 6.5rem
  display: flex
  align-items: flex-end
  justify-content: center
  padding-bottom: 14px
</style>

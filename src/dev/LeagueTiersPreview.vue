<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import LeagueRankBadge from '@/components/atoms/LeagueRankBadge.vue'
import { LEAGUE_TIERS, type LeagueDivision } from '@/use/leagueTiers'

/**
 * DEV-ONLY eyeballing sheet for LeagueTierIcon: every tier at 24 / 40 / 48 /
 * 128 px on a dark and a light plate. `?div=1|2|3` sets the division, `?pos=12`
 * the Champion's leaderboard position (plus a strip of short-to-long positions),
 * `?still` stops the idle motion. The last sheet is LeagueRankBadge across the
 * 64 → 65px switch (numeral as text beside the icon, then on the plaque). Copy here is developer-facing (exempt from
 * i18n); the tier names under the icons come from the locale files.
 */

const { t } = useI18n()
const params = new URLSearchParams(location.search)
const shot = params.has('shot')
const animated = ref(!params.has('still'))
const division = ref<LeagueDivision | null>(params.has('div') ? (Number(params.get('div')) as LeagueDivision) : null)
/** Champion's leaderboard position (`?pos=12`); the other tiers ignore it. */
const position = ref(params.get('pos') ?? '')
/** Short to long positions, to check the plaque grows and still fits. */
const POSITION_STRIP = ['1', '12', '123', '1234', '99999']
/** LeagueRankBadge sizes, straddling the 64 → 65px text/plaque switch. */
const BADGE_SIZES = [24, 32, 48, 64, 65, 96]
const PLATES = [
  { id: 'dark', cls: 'bg-forest-900 text-cream-100' },
  { id: 'light', cls: 'bg-cream-100 text-ink' }
]
</script>

<template lang="pug">
  div.min-h-screen.p-4(class="bg-forest-800 text-cream-100" data-testid="league-tiers-preview")
    div.mb-3.flex.flex-wrap.items-center.gap-4(v-if="!shot")
      h1.text-lg.font-black League tier icons (dev)
      label.flex.items-center.gap-2
        input(type="checkbox" v-model="animated")
        span animated
      label.flex.items-center.gap-2
        span division
        select.text-black(v-model="division")
          option(:value="null") none
          option(:value="3") III
          option(:value="2") II
          option(:value="1") I
      label.flex.items-center.gap-2
        span champion position
        input.w-20.px-1.text-black(v-model="position" placeholder="12")
    //- One row per tier, lowest first; each plate shows the three sizes.
    div.flex.flex-wrap.gap-4
      div.rounded-xl.px-5.py-3(v-for="plate in PLATES" :key="plate.id" :class="plate.cls")
        div.flex.items-center.gap-6.py-1(v-for="tier in LEAGUE_TIERS" :key="tier")
          span.w-24.text-xs.font-bold.uppercase(class="tracking-[0.08em]") {{ t(`league.tiers.${tier}`) }}
          div.flex.w-8.justify-center
            LeagueTierIcon(:tier="tier" :size="24" :division="division" :position="position || null" :animated="animated")
          div.flex.w-12.justify-center
            LeagueTierIcon(:tier="tier" :size="40" :division="division" :position="position || null" :animated="animated")
          div.flex.w-14.justify-center
            LeagueTierIcon(:tier="tier" :size="48" :division="division" :position="position || null" :animated="animated")
          LeagueTierIcon(:tier="tier" :size="128" :division="division" :position="position || null" :animated="animated")
    //- Champion position plaque, short to long, at 40 / 48 / 128 px.
    div.mt-4.flex.flex-wrap.gap-4(v-if="position")
      div.rounded-xl.px-5.py-3(v-for="plate in PLATES" :key="plate.id" :class="plate.cls")
        div.flex.items-center.gap-6.py-1(v-for="p in POSITION_STRIP" :key="p")
          span.w-24.text-xs.font-bold {{ `#${p}` }}
          div.flex.w-12.justify-center
            LeagueTierIcon(tier="champion" :size="40" :position="p" :animated="animated")
          div.flex.w-14.justify-center
            LeagueTierIcon(tier="champion" :size="48" :position="p" :animated="animated")
          LeagueTierIcon(tier="champion" :size="128" :position="p" :animated="animated")
    //- LeagueRankBadge: numeral / #N as text up to 64px, on the plaque from 65px.
    div.mt-4.flex.flex-wrap.gap-4(data-testid="league-rank-badges")
      div.rounded-xl.px-5.py-3(v-for="plate in PLATES" :key="plate.id" :class="plate.cls")
        div.mb-1.text-xs.font-bold.uppercase(class="tracking-[0.08em]") LeagueRankBadge {{ BADGE_SIZES.join(' / ') }}px
        div.flex.items-center.gap-4.py-1(v-for="tier in LEAGUE_TIERS" :key="tier")
          span.w-24.text-xs.font-bold.uppercase(class="tracking-[0.08em]") {{ t(`league.tiers.${tier}`) }}
          div.flex.w-20.justify-start(v-for="size in BADGE_SIZES" :key="size")
            LeagueRankBadge(
              :tier="tier"
              :size="size"
              :division="division ?? 2"
              :position="position || 12"
              :animated="animated"
            )
</template>

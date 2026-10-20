<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import LeagueHub from '@/league/ui/LeagueHub.vue'
import LeagueResultPanel from '@/league/ui/LeagueResultPanel.vue'
import LeagueUnlockPopup from '@/league/ui/LeagueUnlockPopup.vue'
import LeagueSeasonRewardModal from '@/league/ui/LeagueSeasonRewardModal.vue'
import LeagueHudButton from '@/league/ui/LeagueHudButton.vue'
import LeagueLpBar from '@/league/ui/LeagueLpBar.vue'
import LeagueDeltaChip from '@/league/ui/LeagueDeltaChip.vue'
import LeagueGateCard from '@/league/ui/LeagueGateCard.vue'
import { tierOf, seasonReward } from '@/league/leagueMath'
import type { OpponentDeck } from '@/league/leagueOpponents'
import type { GateTier } from '@/league/leagueGatekeepers'
import { mockDeck, mockLeague, mockTop } from '@/dev/leagueUiMocks'

/**
 * DEV-ONLY league UI sheet (`dev/league.html`). Copy on this page that is not
 * from a component is developer-facing (exempt from i18n).
 */

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'hub'

const LP: Record<string, number> = { hub: 457, empty: 457, gate: 1199, 'gate-classic': 599, offline: 457, kids: 457, champion: 1946, top: 1946 }
const lp = Number(params.get('lp') ?? LP[scene] ?? 457)

const league = mockLeague({
  lp,
  fightsLeft: scene === 'empty' ? 0 : 7,
  offlineBlocked: scene === 'offline',
  shields: scene === 'hub' ? 2 : 0,
  streak: scene === 'hub' ? 3 : 0
})
const online = scene !== 'kids'
const kids = scene === 'kids'
const hubOpen = ref(['hub', 'empty', 'gate', 'offline', 'kids', 'champion', 'top'].includes(scene))
const lastEvent = ref('')

const loadDeck = (): Promise<OpponentDeck | null> =>
  scene === 'offline' ? Promise.resolve(null) : mockDeck(tierOf(lp).tier, 60, { online, kids })
const fetchTop = () => new Promise<unknown>(r => setTimeout(() => r(mockTop(12)), 150))

const hubRef = shallowRef<InstanceType<typeof LeagueHub> | null>(null)
onMounted(() => {
  if (scene === 'top') {
    // Switch the hub to its second tab once it is open.
    setTimeout(() => (document.querySelectorAll('.modal-header-tabs button')[1] as HTMLElement | undefined)?.click(), 400)
  }
})

// ── Result scene ──
const outcomes = [
  { label: 'win', o: { result: 'win', lpBefore: 431, lpAfter: 457, delta: 26, isGate: false, promotedTo: null, shielded: false, capped: false, coins: 48, stale: false } },
  { label: 'promotion (gate win)', o: { result: 'win', lpBefore: 899, lpAfter: 900, delta: 1, isGate: true, promotedTo: 'gold', shielded: false, capped: false, coins: 168, stale: false } },
  { label: 'division up', o: { result: 'win', lpBefore: 488, lpAfter: 512, delta: 24, isGate: false, promotedTo: null, shielded: false, capped: false, coins: 48, stale: false } },
  { label: 'loss, dropped a division', o: { result: 'loss', lpBefore: 505, lpAfter: 488, delta: -17, isGate: false, promotedTo: null, shielded: false, capped: false, coins: 12, stale: false } },
  { label: 'loss, shield held', o: { result: 'loss', lpBefore: 905, lpAfter: 905, delta: 0, isGate: false, promotedTo: null, shielded: true, capped: false, coins: 12, stale: false } },
  { label: 'gate lost', o: { result: 'loss', lpBefore: 1199, lpAfter: 1179, delta: -20, isGate: true, promotedTo: null, shielded: false, capped: false, coins: 12, stale: false } }
] as const

// ── Season / unlock ──
const unlockOpen = ref(scene === 'unlock')
const seasonOpen = ref(scene === 'season')
const seasonView = computed(() => ({ ...seasonReward('platinum', 120), season: 0, peakTier: 'platinum' as const }))

const ATOM_LPS = [0, 57, 299, 457, 899, 1500, 1946]
const GATES: GateTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion']
</script>

<template lang="pug">
  div.min-h-screen.p-4(class="bg-forest-900 text-cream-100" data-testid="league-ui-preview")
    //- A fake idle HUD behind the modals, so the backdrop has something to dim.
    div.flex.items-center.gap-3.mb-4
      LeagueHudButton(:league="league" :champion-position="lp >= 1800 ? 3 : null" @open="hubOpen = true")
      span.text-xs.opacity-70 scene: {{ scene }} · lp {{ lp }} {{ lastEvent }}

    LeagueHub(
      ref="hubRef"
      v-model="hubOpen"
      :league="league"
      :load-deck="loadDeck"
      :fetch-top="fetchTop"
      :online="online"
      :kids="kids"
      @fight="lastEvent = `fight → ${$event.target.kind}`"
    )

    div.flex.flex-col.gap-4.max-w-md.mx-auto(v-if="scene === 'result'")
      div(v-for="r in outcomes" :key="r.label")
        div.text-xs.opacity-70.mb-1 {{ r.label }}
        LeagueResultPanel(:outcome="r.o")

    div.flex.flex-wrap.gap-6(v-if="scene === 'atoms' || scene === 'gate-classic'")
      div.flex.flex-col.gap-3(v-if="scene === 'atoms'" class="w-[20rem]")
        div(v-for="v in ATOM_LPS" :key="v")
          div.text-xs.opacity-70 lp {{ v }}
          LeagueLpBar(:lp="v" :champion-position="v >= 1800 ? 12 : null")
        div.flex.gap-2.flex-wrap
          LeagueDeltaChip(:delta="24")
          LeagueDeltaChip(:delta="-17")
          LeagueDeltaChip(:delta="0")
          LeagueDeltaChip(:delta="38" size="lg")
          LeagueDeltaChip(:delta="-8" size="sm")
      div.flex.gap-6.items-start(v-if="scene === 'atoms'")
        LeagueHudButton(:league="mockLeague({ lp: 57 })")
        LeagueHudButton(:league="mockLeague({ lp: 1199, fightsLeft: 0 })")
        LeagueHudButton(:league="mockLeague({ lp: 1946 })" :champion-position="7")
        LeagueHudButton(:league="mockLeague({ lp: 700, unclaimed: { season: 0, peakTier: 'gold' } })")
      div.flex.flex-wrap.gap-6(v-if="scene === 'gate-classic'" class="w-full")
        div(v-for="g in GATES" :key="g" class="w-[17rem]")
          div.text-xs.opacity-70.mb-1 gate → {{ g }}
          LeagueGateCard(:tier="g")

    LeagueUnlockPopup(v-model="unlockOpen" @enter="unlockOpen = false; lastEvent = 'enter'")
    LeagueSeasonRewardModal(v-model="seasonOpen" :reward="seasonView" @claim="seasonOpen = false; lastEvent = 'claim'")
</template>

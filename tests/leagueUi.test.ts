// ─── League UI (LG5a / LG5b) ────────────────────────────────────────────────
//
// The atoms (LP bar, delta chip), the cards, the hub on MOCKED league state
// (src/dev/leagueUiMocks.ts), the result panel, the unlock popup and the
// season reward — plus the privacy / O3 / LM2 / LM4 rules they carry.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

// useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle).
beforeAll(async () => {
  await import('@/use/useUser')
})

const ROOT = path.resolve(__dirname, '..')
const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })
const global = () => ({ plugins: [i18n()], stubs: { teleport: true } })

const load = async () => {
  const mocks = await import('@/dev/leagueUiMocks')
  return {
    ...mocks,
    LpBar: (await import('@/league/ui/LeagueLpBar.vue')).default,
    DeltaChip: (await import('@/league/ui/LeagueDeltaChip.vue')).default,
    OpponentCard: (await import('@/league/ui/LeagueOpponentCard.vue')).default,
    GateCard: (await import('@/league/ui/LeagueGateCard.vue')).default,
    Hub: (await import('@/league/ui/LeagueHub.vue')).default,
    HudButton: (await import('@/league/ui/LeagueHudButton.vue')).default,
    ResultPanel: (await import('@/league/ui/LeagueResultPanel.vue')).default,
    UnlockPopup: (await import('@/league/ui/LeagueUnlockPopup.vue')).default,
    SeasonModal: (await import('@/league/ui/LeagueSeasonRewardModal.vue')).default,
    npc: await import('@/league/leagueNpc')
  }
}

// Hubs keep a clock interval and a quiet-retry timer while mounted.
enableAutoUnmount(afterEach)

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** Copy that would read as an error — O3 forbids it in the quiet state. */
const ERROR_COPY = /error|fail|couldn|can.t|unable|unreachable|offline|problem|went wrong/i

describe('LeagueLpBar', () => {
  it('fills the current division and exposes it as a progressbar', async () => {
    const { LpBar } = await load()
    const w = mount(LpBar, { props: { lp: 457 }, global: global() })
    const bar = w.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('57')
    expect(bar.attributes('aria-valuemax')).toBe('100')
    expect(bar.attributes('aria-valuetext')).toBe('57 of 100 LP in this division')
    expect(w.get('.llb__fill').attributes('style')).toContain('width: 57%')
    expect(w.text()).toContain('57 / 100 LP')
    expect(w.find('.llb__gate').exists()).toBe(false)
  })

  it('marks the promotion gate at x99 of Division I only', async () => {
    const { LpBar } = await load()
    expect(mount(LpBar, { props: { lp: 899 }, global: global() }).find('.llb__gate').exists()).toBe(true)
    expect(mount(LpBar, { props: { lp: 799 }, global: global() }).find('.llb__gate').exists()).toBe(false)
  })

  it('Champion: a full bar labelled #N and the LP', async () => {
    const { LpBar } = await load()
    const w = mount(LpBar, { props: { lp: 1946, championPosition: 12 }, global: global() })
    expect(w.get('.llb__fill').attributes('style')).toContain('width: 100%')
    expect(w.get('.llb__label').text()).toBe('#12 · 1,946 LP')
    const plain = mount(LpBar, { props: { lp: 1946 }, global: global() })
    expect(plain.get('.llb__label').text()).toBe('1,946 LP')
  })
})

describe('LeagueDeltaChip', () => {
  it('signs, colours and labels the final value', async () => {
    const { DeltaChip } = await load()
    const up = mount(DeltaChip, { props: { delta: 24, animate: false }, global: global() })
    expect(up.classes()).toContain('ldc--up')
    expect(up.attributes('aria-label')).toBe('+24 LP')
    expect(up.text()).toBe('+24 LP')
    const down = mount(DeltaChip, { props: { delta: -12, animate: false }, global: global() })
    expect(down.classes()).toContain('ldc--down')
    expect(down.attributes('aria-label')).toBe('−12 LP')
    const flat = mount(DeltaChip, { props: { delta: 0, animate: false }, global: global() })
    expect(flat.classes()).toContain('ldc--flat')
  })

  it('announces the final value while the number counts up', async () => {
    const { DeltaChip } = await load()
    const w = mount(DeltaChip, { props: { delta: 30 }, global: global() })
    expect(w.attributes('aria-label')).toBe('+30 LP')
    expect(w.get('.ldc__text').attributes('aria-hidden')).toBe('true')
  })
})

describe('LeagueOpponentCard', () => {
  it('shows the difficulty LABEL (never a percentage), emits fight, and is labelled', async () => {
    const { OpponentCard, mockDeck } = await load()
    const deck = await mockDeck('silver', 60)
    expect(deck.cards.map(c => c.difficulty)).toEqual(['easier', 'even', 'harder'])
    for (const card of deck.cards) {
      const w = mount(OpponentCard, { props: { card }, global: global() })
      expect(w.attributes('data-league')).toBe('opponent-card')
      expect(w.text()).toContain((en as any).league.difficulty[card.difficulty])
      expect(w.text()).not.toMatch(/%/)
      expect(w.attributes('aria-label')).toBe(`Fight ${card.name} (${(en as any).league.difficulty[card.difficulty]})`)
      await w.trigger('click')
      expect(w.emitted('fight')).toHaveLength(1)
    }
  })

  it('a disabled card does not emit', async () => {
    const { OpponentCard, mockDeck } = await load()
    const [card] = (await mockDeck()).cards
    const w = mount(OpponentCard, { props: { card: card!, disabled: true }, global: global() })
    await w.trigger('click')
    expect(w.emitted('fight')).toBeUndefined()
  })
})

describe('LeagueGateCard (LM4: name + badge, never levels)', () => {
  it.each(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'] as const)('gate → %s', async (tier) => {
    const { GateCard } = await load()
    const { gatekeeperCard } = await import('@/league/leagueGatekeepers')
    const w = mount(GateCard, { props: { tier }, global: global() })
    const gate = gatekeeperCard(tier)
    const name = (en as any).stages[gate.nameKey.replace(/^stages\./, '')] as string
    expect(name, gate.nameKey).toBeTypeOf('string')
    expect(w.text()).toContain(name)
    // No level, power or any other number — only the target rank's numeral.
    expect(w.text()).not.toMatch(/\d/)
    expect(w.text()).not.toMatch(/\blv\b|level|power/i)
    // Crest on badged encounter bosses, else the lead blade's portrait.
    const img = w.find(gate.badgeSrc ? 'img.lgc__badge' : 'img.lgc__portrait')
    expect(img.exists()).toBe(true)
    expect(w.get('button').attributes('aria-label')).toContain(name)
    await w.get('button').trigger('click')
    expect(w.emitted('fight')).toHaveLength(1)
  })
})

describe('LeagueHub', () => {
  const mountHub = async (opts: {
    lp?: number; fightsLeft?: number; offlineBlocked?: boolean; online?: boolean; kids?: boolean
    deck?: 'real' | 'live-names' | 'none'; unclaimed?: boolean; fakeTimers?: boolean
  } = {}) => {
    const m = await load()
    const league = m.mockLeague({
      lp: opts.lp ?? 457,
      fightsLeft: opts.fightsLeft ?? 7,
      offlineBlocked: opts.offlineBlocked ?? false,
      unclaimed: opts.unclaimed ? { season: 0, peakTier: 'gold' } : null
    })
    const base = await m.mockDeck('bronze', 40, { online: opts.online ?? true })
    const deck = opts.deck === 'none'
      ? null
      : opts.deck === 'live-names'
        ? { cards: base.cards.map((c, i) => ({ ...c, name: m.REAL_NAMES[i]!, source: 'live' as const, oppId: `lb:${i}` })), liveOk: true }
        : base
    const loadDeck = vi.fn(async () => deck)
    const fetchTop = vi.fn(async () => m.mockTop(10))
    const w = mount(m.Hub, {
      props: { modelValue: true, league, loadDeck, fetchTop, online: opts.online ?? true, kids: opts.kids ?? false },
      global: global()
    })
    // flushPromises rides on setTimeout — under fake timers, advance instead.
    if (opts.fakeTimers) await vi.advanceTimersByTimeAsync(0)
    else await flushPromises()
    return { w, league, loadDeck, fetchTop, m }
  }

  it('renders the standing, fights and three cards from mocked state', async () => {
    const { w } = await mountHub()
    expect(w.find('[data-league="hub"]').exists()).toBe(true)
    expect(w.text()).toContain('Bronze II')
    expect(w.text()).toContain('57 / 100 LP')
    expect(w.text()).toContain('Season 1')
    expect(w.text()).toMatch(/Ends in 12d 5h/)
    expect(w.get('.lh__fightsCount').attributes('aria-label')).toBe('7 fights left')
    expect(w.findAll('[data-league="opponent-card"]')).toHaveLength(3)
    expect(w.find('[data-league="gate-card"]').exists()).toBe(false)
  })

  it('emits the fight target for beginLocalBattle — it never starts a battle itself', async () => {
    const { w } = await mountHub()
    await w.findAll('[data-league="opponent-card"]')[1]!.trigger('click')
    const [payload] = w.emitted('fight')![0] as [{ target: { kind: string; id: string; power: number }; card: { oppId: string } }]
    expect(payload.target.kind).toBe('card')
    expect(payload.target.id).toBe(payload.card.oppId)
    expect(payload.target.power).toBeGreaterThan(0)
  })

  it('no fights left: cards disabled, reset countdown shown', async () => {
    const { w } = await mountHub({ fightsLeft: 0 })
    expect(w.text()).toContain('New fights in 5h 12m')
    await w.findAll('[data-league="opponent-card"]')[0]!.trigger('click')
    expect(w.emitted('fight')).toBeUndefined()
  })

  it('x99 of Division I: the gatekeeper card replaces the cards (no deck request)', async () => {
    const { w, loadDeck } = await mountHub({ lp: 1199 })
    expect(w.find('[data-league="gate-card"]').exists()).toBe(true)
    expect(w.findAll('[data-league="opponent-card"]')).toHaveLength(0)
    expect(loadDeck).not.toHaveBeenCalled()
    expect(w.text()).toContain('Win to reach Platinum III')
    await w.get('[data-league="gate-card"] button').trigger('click')
    expect((w.emitted('fight')![0] as [{ target: { kind: string } }])[0].target).toEqual({ kind: 'gate' })
  })

  it('O3: an online build without a server shows a quiet state — no cards, no error copy', async () => {
    const blocked = await mountHub({ offlineBlocked: true })
    expect(blocked.w.find('[data-league="quiet"]').exists()).toBe(true)
    expect(blocked.w.findAll('[data-league="opponent-card"]')).toHaveLength(0)
    expect(blocked.w.text()).not.toMatch(ERROR_COPY)
    // The live pool not answering is the same quiet state.
    const noPool = await mountHub({ deck: 'none' })
    expect(noPool.w.find('[data-league="quiet"]').exists()).toBe(true)
    expect(noPool.w.text()).not.toMatch(ERROR_COPY)
  })

  it('O3 retries the deck quietly in the background', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const { loadDeck } = await mountHub({ deck: 'none', fakeTimers: true })
    expect(loadDeck).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(loadDeck).toHaveBeenCalledTimes(2)
  })

  it('online: season top tab, fetchTop called, names shown', async () => {
    const { w, fetchTop } = await mountHub()
    expect(fetchTop).toHaveBeenCalled()
    expect(w.text()).toContain('Season top')
  })

  it('kids build: no top list, no fetchTop, and no real name ever reaches a card', async () => {
    const { w, fetchTop, m } = await mountHub({ kids: true, online: false, deck: 'live-names' })
    expect(fetchTop).not.toHaveBeenCalled()
    expect(w.find('[data-league="top-list"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Season top')
    for (const real of m.REAL_NAMES) expect(w.text()).not.toContain(real)
    const cards = w.findAll('[data-league="opponent-card"]')
    expect(cards).toHaveLength(3)
    cards.forEach((c, i) => expect(c.text()).toContain(m.npc.generatedOpponentName(`lb:${i}`)))
  })

  it('an unclaimed season opens the reward; Claim credits the wallet once', async () => {
    const { w, league } = await mountHub({ unclaimed: true })
    const cfg = (await import('@/use/useSpinnerConfig')).default()
    const before = cfg.coins.value
    const modal = w.findComponent({ name: 'LeagueSeasonRewardModal' })
    expect(modal.exists()).toBe(true)
    expect(w.find('[data-league="season-reward"]').exists()).toBe(true)
    expect(w.text()).toContain('Season 1 complete')
    modal.vm.$emit('claim')
    await flushPromises()
    expect(league.claims).toBe(1)
    const [reward] = w.emitted('season-claimed')![0] as [{ coins: number }]
    expect(cfg.coins.value - before).toBe(reward.coins)
    expect(league.unclaimedSeason.value).toBeNull()
  })
})

describe('LeagueHudButton', () => {
  it('labels rank + fights and emits open', async () => {
    const m = await load()
    const w = mount(m.HudButton, { props: { league: m.mockLeague({ lp: 457, fightsLeft: 3 }) }, global: global() })
    expect(w.attributes('data-league')).toBe('hud-button')
    expect(w.attributes('aria-label')).toBe('League: Bronze II, 3 fights left')
    expect(w.get('.lhb__bubble').text()).toBe('3')
    await w.trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })

  it('Champion shows #N; an unclaimed season shows the gift marker', async () => {
    const m = await load()
    const champ = mount(m.HudButton, { props: { league: m.mockLeague({ lp: 1900 }), championPosition: 4 }, global: global() })
    expect(champ.get('.lhb__tag').text()).toBe('#4')
    expect(champ.attributes('aria-label')).toContain('Champion #4')
    const gift = mount(m.HudButton, { props: { league: m.mockLeague({ unclaimed: { season: 0, peakTier: 'gold' } }) }, global: global() })
    expect(gift.find('.lhb__bubble--gift').exists()).toBe(true)
  })
})

describe('LeagueResultPanel', () => {
  const base = { result: 'win', lpBefore: 431, lpAfter: 457, delta: 26, isGate: false, promotedTo: null, shielded: false, capped: false, coins: 48, stale: false } as const

  it('win: delta chip, bar, coins', async () => {
    const { ResultPanel } = await load()
    const w = mount(ResultPanel, { props: { outcome: base }, global: global() })
    expect(w.attributes('data-league')).toBe('result-panel')
    expect(w.get('[data-league="delta-chip"]').attributes('aria-label')).toBe('+26 LP')
    expect(w.text()).toContain('+48 coins')
    expect(w.find('.lrp__status').exists()).toBe(false)
  })

  it('promotion, division drop, shield and gate loss each get their status line', async () => {
    const { ResultPanel } = await load()
    const status = (o: object) => mount(ResultPanel, { props: { outcome: { ...base, ...o } }, global: global() }).find('.lrp__status').text()
    expect(status({ lpBefore: 899, lpAfter: 900, delta: 1, isGate: true, promotedTo: 'gold' })).toBe('Promoted to Gold III!')
    expect(status({ result: 'loss', lpBefore: 505, lpAfter: 488, delta: -17 })).toBe('Dropped to Bronze II')
    expect(status({ result: 'loss', lpBefore: 905, lpAfter: 905, delta: 0, shielded: true })).toBe('Shield held: no LP lost')
    expect(status({ result: 'loss', lpBefore: 1199, lpAfter: 1179, delta: -20, isGate: true })).toBe('The gatekeeper holds. Try again!')
  })

  it('a stale outcome renders nothing', async () => {
    const { ResultPanel } = await load()
    const w = mount(ResultPanel, { props: { outcome: { ...base, stale: true } }, global: global() })
    expect(w.find('[data-league]').exists()).toBe(false)
  })
})

describe('LeagueUnlockPopup / LeagueSeasonRewardModal', () => {
  it('unlock: all seven tiers, Enter emits enter, Later closes', async () => {
    const { UnlockPopup } = await load()
    const w = mount(UnlockPopup, { props: { modelValue: true }, global: global() })
    expect(w.find('[data-league="unlock-popup"]').exists()).toBe(true)
    expect(w.findAll('.lup__step')).toHaveLength(7)
    await w.get('.lup__actions button').trigger('click')
    expect(w.emitted('enter')).toHaveLength(1)
    await w.get('.lup__later').trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('season reward: coins, diamonds, frame and aria labels', async () => {
    const { SeasonModal } = await load()
    const reward = { season: 2, peakTier: 'champion', coins: 1440, diamonds: 5, championFrame: true } as const
    const w = mount(SeasonModal, { props: { modelValue: true, reward }, global: global() })
    expect(w.text()).toContain('Season 3 complete')
    expect(w.text()).toContain('Best rank: Champion')
    expect(w.find('[aria-label="1440 coins"]').exists()).toBe(true)
    expect(w.find('[aria-label="5 diamonds"]').exists()).toBe(true)
    expect(w.text()).toContain('Champion frame')
  })
})

describe('boundaries', () => {
  it('every league UI root carries data-league', () => {
    for (const f of ['LeagueLpBar', 'LeagueDeltaChip', 'LeagueOpponentCard', 'LeagueGateCard', 'LeagueFightsTopUp',
      'LeagueHudButton', 'LeagueHub', 'LeagueResultPanel', 'LeagueUnlockPopup', 'LeagueSeasonRewardModal', 'LeagueTopList']) {
      const src = readFileSync(path.join(ROOT, 'src/league/ui', `${f}.vue`), 'utf8')
      const tpl = src.slice(src.indexOf('<template lang="pug">'))
      const firstNode = tpl.split('\n').slice(1).find(l => l.trim() && !l.trim().startsWith('//-'))!
      const rootBlock = tpl.slice(tpl.indexOf(firstNode), tpl.indexOf(firstNode) + 400)
      expect(rootBlock, f).toMatch(/data-league="/)
    }
  })

  it('the dev preview never ships: no build input names it', () => {
    const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf-8')
    expect(viteConfig).not.toMatch(/dev\/league\.html|leagueUiPreview/)
    expect(readFileSync(path.join(ROOT, 'index.html'), 'utf-8')).not.toMatch(/league\.html|src\/dev/)
  })
})

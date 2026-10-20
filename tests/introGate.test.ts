import { describe, expect, it } from 'vitest'
import {
  decideIntro,
  hasSavedProgress,
  readIntroFlags,
  isIntroLikely,
  INTRO_SEEN_KEY,
  INTRO_DECISION_BUDGET_MS,
  type IntroGateInput
} from '@/use/introGate'

// ─── The should-play predicate ──────────────────────────────────────────────
//
// The first-launch intro is a hook for STRANGERS. Every branch below is one
// of the ways a returning player could be mistaken for a new one (or a new
// one could be locked out forever), taken from the onboarding skill's rule:
// play only when there is no seen-flag, no saved progress, AND the save read
// has SETTLED — unknown fails closed.

const base: IntroGateInput = {
  seen: false,
  hasProgress: false,
  hydrate: 'success-empty',
  replayRequested: false,
  battleStarted: false,
  waitedMs: 0
}

describe('decideIntro', () => {
  it('plays for a genuine first-timer once the save read has settled', () => {
    expect(decideIntro(base)).toBe('play')
    // LocalStorageStrategy reports success-with-data unconditionally.
    expect(decideIntro({ ...base, hydrate: 'success-with-data' })).toBe('play')
  })

  it('never plays twice — the seen flag wins over everything but a reset', () => {
    expect(decideIntro({ ...base, seen: true })).toBe('skip')
    expect(decideIntro({ ...base, seen: true, hydrate: 'pending' })).toBe('skip')
  })

  it('does not decide while the cloud save is still in flight', () => {
    expect(decideIntro({ ...base, hydrate: 'pending' })).toBe('wait')
    expect(decideIntro({ ...base, hydrate: 'failed-retrying' })).toBe('wait')
  })

  it('an unsettled read that never settles runs out the budget and skips', () => {
    expect(decideIntro({ ...base, hydrate: 'pending', waitedMs: INTRO_DECISION_BUDGET_MS - 1 })).toBe('wait')
    expect(decideIntro({ ...base, hydrate: 'pending', waitedMs: INTRO_DECISION_BUDGET_MS })).toBe('skip')
  })

  it('fails closed when retries are exhausted (a returning save may be unreachable)', () => {
    expect(decideIntro({ ...base, hydrate: 'failed-final' })).toBe('skip')
  })

  it('never plays for a returning player — with or without a settled hydrate', () => {
    for (const hydrate of ['success-with-data', 'success-empty', 'pending', 'failed-retrying', 'failed-final'] as const) {
      expect(decideIntro({ ...base, hasProgress: true, hydrate })).toBe('skip')
    }
  })

  it('treats a storage read that threw as unknown → returning', () => {
    expect(decideIntro({ ...base, seen: null })).toBe('skip')
    expect(decideIntro({ ...base, hasProgress: null })).toBe('skip')
  })

  it('never interrupts a fight the player already started', () => {
    expect(decideIntro({ ...base, battleStarted: true })).toBe('skip')
    expect(decideIntro({ ...base, battleStarted: true, replayRequested: true })).toBe('skip')
  })

  it('a confirmed reset replays it, whatever the (just-wiped) save says', () => {
    expect(decideIntro({ ...base, replayRequested: true, hasProgress: true, hydrate: 'pending' })).toBe('play')
  })
})

// ─── The progress probe ────────────────────────────────────────────────────

const store = (entries: Record<string, string>) => (k: string): string | null => entries[k] ?? null

describe('hasSavedProgress', () => {
  it('a fresh boot writes only settings — that is NOT progress', () => {
    // Measured on a fresh Chrome profile: these three keys are all a first
    // boot leaves in storage before the player does anything.
    const fresh = store({
      smashers_user_sound_volume: '0.7',
      smashers_user_music_volume: '0.6',
      smashers_user_difficulty: 'medium'
    })
    expect(hasSavedProgress(fresh)).toBe(false)
    expect(hasSavedProgress(store({}))).toBe(false)
    // Defaults that parse as "nothing yet".
    expect(hasSavedProgress(store({
      smashers_campaign_stage: '1',
      smashers_coins: '0',
      smashers_owned_skins: '[]'
    }))).toBe(false)
    expect(hasSavedProgress(store({
      smashers_upgrades: JSON.stringify({
        tops: { star: 0 },
        bottoms: {}
      })
    }))).toBe(false)
  })

  it.each([
    ['smashers_campaign_stage', '2'],
    ['smashers_player_max_stage', '7'],
    ['smashers_coins', '30'],
    ['smashers_diamonds', '1'],
    ['smashers_game_start_count', '1'],
    ['smashers_first_win', '1'],
    ['smashers_last_result', 'lose'],
    ['smashers_upgrades', JSON.stringify({ tops: { star: 2 }, bottoms: {} })],
    ['smashers_owned_skins', JSON.stringify(['star:ice'])],
    ['smashers_bg_skins_owned', JSON.stringify(['kpop'])],
    ['smashers_battle_pass', JSON.stringify({ xp: 40 })],
    ['smashers_pvp_stats', JSON.stringify({ wins: 1 })],
    ['smashers_daily_rewards', JSON.stringify({ day: 2 })],
    ['smashers_config_opened', '1']
  ])('%s = %s marks a returning player', (key, value) => {
    expect(hasSavedProgress(store({ [key]: value }))).toBe(true)
  })
})

describe('readIntroFlags / isIntroLikely', () => {
  it('reads the seen flag', () => {
    expect(readIntroFlags(store({ [INTRO_SEEN_KEY]: '1' }))).toEqual({ seen: true, hasProgress: false })
    expect(isIntroLikely(store({}))).toBe(true)
    expect(isIntroLikely(store({ [INTRO_SEEN_KEY]: '1' }))).toBe(false)
    expect(isIntroLikely(store({ smashers_last_result: 'win' }))).toBe(false)
  })

  it('maps a throwing storage to unknown, not to empty', () => {
    const boom = (): string | null => {
      throw new Error('SecurityError: storage blocked')
    }
    expect(readIntroFlags(boom)).toEqual({ seen: null, hasProgress: null })
    expect(isIntroLikely(boom)).toBe(false)
  })
})

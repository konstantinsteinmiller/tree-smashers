// ─── Random-search bot fill: timer, names, team power, skill staircase ──────
//
// src/use/pvpBots.ts is the pure half of the bot fallback: when a random PvP
// search finds no human within a random 15–25 s the player gets a bot that
// must read as a normal opponent. Pinned here: the wait window and the
// human-first grace (fake timers), the name pool (clean, username-shaped, no
// repeats in a row), the team at the player's power, the bracket badge, and
// the staircase that tunes the bot toward a 50 % player win rate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_HUMAN_GRACE_MS,
  BOT_NAME_FIRST,
  BOT_NAME_RE,
  BOT_NAME_SECOND,
  BOT_RECENT_NAMES,
  BOT_SKILL_DEFAULT,
  BOT_SKILL_MAX,
  BOT_SKILL_MIN,
  BOT_WAIT_MAX_MS,
  BOT_WAIT_MIN_MS,
  botPlayStyle,
  botThinkMs,
  bracketTier,
  buildBotTeam,
  composeBotName,
  createBotFillTimer,
  createBotOpponent,
  makeBotName,
  nextBotSkill,
  rememberBotName,
  rollBotWaitMs,
  teamDisplayLevel,
  teamLevelSum
} from '@/use/pvpBots'
import { createRng } from '@/use/useDeterministicRng'
import { isDenylistedName } from '@/utils/nameDenylist'
import { SMASHER_IDS, smasherConfig, type SmasherId } from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'

const team = (...levels: number[]): SpinnerConfig[] =>
  levels.map((lv, i) => smasherConfig(SMASHER_IDS[i] as SmasherId, lv))

describe('bot wait window', () => {
  it('is uniform over 15–25 s, fresh per search', () => {
    expect(rollBotWaitMs(() => 0)).toBe(BOT_WAIT_MIN_MS)
    expect(rollBotWaitMs(() => 0.999999)).toBeLessThanOrEqual(BOT_WAIT_MAX_MS)
    expect(rollBotWaitMs(() => 0.5)).toBe(20_000)
    const rand = createRng(99)
    const waits = Array.from({ length: 4000 }, () => rollBotWaitMs(rand))
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(15_000)
    expect(Math.max(...waits)).toBeLessThanOrEqual(25_000)
    // Uniform: each 2 s bucket holds ~20 % of the draws.
    for (let b = 0; b < 5; b++) {
      const lo = 15_000 + b * 2000
      const share = waits.filter(w => w >= lo && w < lo + 2000).length / waits.length
      expect(share).toBeGreaterThan(0.16)
      expect(share).toBeLessThan(0.24)
    }
  })

  describe('fill timer (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('fires exactly at the rolled wait', () => {
      const onFire = vi.fn()
      const waitMs = rollBotWaitMs(() => 0.37)
      createBotFillTimer({ waitMs, isHumanPending: () => false, onFire })
      vi.advanceTimersByTime(waitMs - 1)
      expect(onFire).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onFire).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(60_000)
      expect(onFire).toHaveBeenCalledTimes(1)
    })

    it('never fires before 15 s nor after 25 s for any roll', () => {
      for (const r of [0, 0.01, 0.5, 0.99, 1]) {
        const onFire = vi.fn()
        createBotFillTimer({ waitMs: rollBotWaitMs(() => r), isHumanPending: () => false, onFire })
        vi.advanceTimersByTime(BOT_WAIT_MIN_MS - 1)
        expect(onFire).not.toHaveBeenCalled()
        vi.advanceTimersByTime(BOT_WAIT_MAX_MS - BOT_WAIT_MIN_MS + 1)
        expect(onFire).toHaveBeenCalledTimes(1)
      }
    })

    it('a cancelled timer (a human matched, the player left) never fires', () => {
      const onFire = vi.fn()
      const t = createBotFillTimer({ waitMs: 15_000, isHumanPending: () => false, onFire })
      vi.advanceTimersByTime(10_000)
      t.cancel()
      expect(t.done).toBe(true)
      vi.advanceTimersByTime(30_000)
      expect(onFire).not.toHaveBeenCalled()
    })

    it('prefers a human handshake in flight: one grace, then fires anyway', () => {
      const onFire = vi.fn()
      let pending = true
      createBotFillTimer({ waitMs: 20_000, isHumanPending: () => pending, onFire })
      vi.advanceTimersByTime(20_000)
      expect(onFire).not.toHaveBeenCalled()
      vi.advanceTimersByTime(BOT_HUMAN_GRACE_MS - 1)
      expect(onFire).not.toHaveBeenCalled()
      // Still pending at the second deadline: a hanging handshake must not
      // strand the player.
      vi.advanceTimersByTime(1)
      expect(onFire).toHaveBeenCalledTimes(1)
      pending = false
    })

    it('a human who matched during the grace cancels the bot', () => {
      const onFire = vi.fn()
      const t = createBotFillTimer({ waitMs: 18_000, isHumanPending: () => true, onFire })
      vi.advanceTimersByTime(18_000 + 1000)
      t.cancel()
      vi.advanceTimersByTime(60_000)
      expect(onFire).not.toHaveBeenCalled()
    })
  })
})

describe('bot names', () => {
  it('every word is ASCII letters, no word is a given name pool duplicate', () => {
    for (const w of [...BOT_NAME_FIRST, ...BOT_NAME_SECOND]) expect(w).toMatch(/^[A-Za-z]+$/)
    expect(new Set(BOT_NAME_FIRST).size).toBe(BOT_NAME_FIRST.length)
    expect(new Set(BOT_NAME_SECOND).size).toBe(BOT_NAME_SECOND.length)
  })

  it('every combination in every style is profanity-free (shared denylist)', () => {
    const hits: string[] = []
    for (const a of BOT_NAME_FIRST) {
      for (const b of BOT_NAME_SECOND) {
        for (const n of [`${a}${b}`, `${a.toLowerCase()}_${b.toLowerCase()}`, `${a}${b}`.toLowerCase(), `${a}.${b}`]) {
          if (isDenylistedName(n)) hits.push(n)
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('generated names have the CrazyGames username shape and stay clean with suffixes', () => {
    const rand = createRng(7)
    for (let i = 0; i < 3000; i++) {
      const name = composeBotName(rand)
      expect(name).toMatch(BOT_NAME_RE)
      expect(isDenylistedName(name)).toBe(false)
    }
  })

  it('looks varied: number suffixes on some, bare words on others, several casings', () => {
    const rand = createRng(11)
    const names = Array.from({ length: 600 }, () => composeBotName(rand))
    const withDigits = names.filter(n => /\d$/.test(n)).length / names.length
    expect(withDigits).toBeGreaterThan(0.35)
    expect(withDigits).toBeLessThan(0.75)
    expect(names.some(n => n.includes('_'))).toBe(true)
    expect(names.some(n => /^[a-z0-9]+$/.test(n))).toBe(true)
    expect(names.some(n => /^[A-Z][a-z]+[A-Z]/.test(n))).toBe(true)
    expect(new Set(names).size).toBeGreaterThan(500)
  })

  it('never repeats one of the last names shown (no duplicates in a row)', () => {
    const rand = createRng(5)
    let recent: string[] = []
    const shown: string[] = []
    for (let i = 0; i < 2000; i++) {
      const name = makeBotName(rand, recent)
      expect(recent.map(n => n.toLowerCase())).not.toContain(name.toLowerCase())
      recent = rememberBotName(recent, name)
      shown.push(name)
    }
    expect(recent.length).toBe(BOT_RECENT_NAMES)
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1])
  })

  it('terminates with a fresh name even when the RNG keeps colliding', () => {
    const name = makeBotName(() => 0, ['TurboFox', 'turbo_fox', 'turbofox', 'Turbo.Fox'])
    expect(name).toMatch(BOT_NAME_RE)
    expect(['TurboFox', 'turbo_fox', 'turbofox', 'Turbo.Fox']).not.toContain(name)
  })
})

describe('bot team at the player\'s power', () => {
  it('fields the player\'s team size with distinct smashers', () => {
    for (const levels of [[4], [6, 9], [12, 14, 20]]) {
      const t = buildBotTeam({ rand: createRng(3), playerTeam: team(...levels) })
      expect(t).toHaveLength(levels.length)
      expect(new Set(t.map(c => c.smasherId)).size).toBe(levels.length)
    }
  })

  it('summed levels within ±1 of the player\'s, over many seeds', () => {
    const player = team(7, 11, 15)
    const target = teamLevelSum(player)
    let exact = 0
    for (let seed = 1; seed <= 400; seed++) {
      const t = buildBotTeam({ rand: createRng(seed), playerTeam: player })
      const diff = teamLevelSum(t) - target
      expect(Math.abs(diff)).toBeLessThanOrEqual(1)
      if (diff === 0) exact++
    }
    // Close but not a mirror: some bots are a level up or down.
    expect(exact).toBeGreaterThan(100)
    expect(exact).toBeLessThan(350)
  })

  it('low levels (average below 4): exactly the player\'s summed level', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const player = team(1, 3)
      expect(teamLevelSum(buildBotTeam({ rand: createRng(seed), playerTeam: player }))).toBe(teamLevelSum(player))
    }
  })

  it('"level 1" lobbies: every bot smasher at level 1', () => {
    const t = buildBotTeam({ rand: createRng(9), playerTeam: team(20, 25), levelOne: true })
    expect(t.map(c => c.level)).toEqual([1, 1])
  })

  it('draws from the allowed pool first, then pads from the roster', () => {
    const pool = SMASHER_IDS.slice(5, 7) as SmasherId[]
    const t = buildBotTeam({ rand: createRng(4), playerTeam: team(3, 3, 3), pool })
    const ids = t.map(c => c.smasherId)
    expect(ids).toEqual(expect.arrayContaining(pool))
    expect(new Set(ids).size).toBe(3)
  })

  it('levels stay ≥ 1 and within one of the player — no cap at 30 (levels are unbounded)', () => {
    for (const lv of [1, 30, 75]) {
      for (let seed = 1; seed < 60; seed++) {
        for (const c of buildBotTeam({ rand: createRng(seed), playerTeam: team(lv, lv) })) {
          expect(c.level).toBeGreaterThanOrEqual(Math.max(1, lv - 1))
          expect(c.level).toBeLessThanOrEqual(lv + 1)
        }
      }
    }
  })
})

describe('bracket badge', () => {
  it('maps the team level to a tier, never champion', () => {
    expect(bracketTier(1)).toBe('wood')
    expect(bracketTier(3)).toBe('wood')
    expect(bracketTier(4)).toBe('bronze')
    expect(bracketTier(10)).toBe('silver')
    expect(bracketTier(16)).toBe('gold')
    expect(bracketTier(22)).toBe('platinum')
    expect(bracketTier(30)).toBe('diamond')
  })

  it('a bot\'s level and badge sit next to the player\'s', () => {
    for (const levels of [[2, 3], [9, 10, 11], [24]]) {
      const player = team(...levels)
      const bot = createBotOpponent({ seed: 42 + levels[0]!, skill: 0.5, playerTeam: player })
      expect(Math.abs(bot.profile.level - teamDisplayLevel(player))).toBeLessThanOrEqual(1)
      expect(bot.profile.bot).toBe(true)
      expect(bot.profile.name).toMatch(BOT_NAME_RE)
    }
  })
})

describe('bot skill: human-like play toward 50 %', () => {
  it('reaction delays look human (1.2 s and up, sometimes a long think)', () => {
    const rand = createRng(21)
    const thinks = Array.from({ length: 2000 }, () => botThinkMs(rand))
    expect(Math.min(...thinks)).toBeGreaterThanOrEqual(1200)
    expect(Math.max(...thinks)).toBeLessThanOrEqual(1200 + 2200 + 800 + 1200)
    expect(thinks.filter(t => t > 3400).length).toBeGreaterThan(50)
  })

  it('a sharper bot aims tighter, fluffs less and hits harder', () => {
    const lo = botPlayStyle(BOT_SKILL_MIN, 1)
    const hi = botPlayStyle(BOT_SKILL_MAX, 1)
    expect(hi.aimSpread).toBeLessThan(lo.aimSpread)
    expect(hi.whiffChance).toBeLessThan(lo.whiffChance)
    expect(hi.forceMin).toBeGreaterThan(lo.forceMin)
    expect(lo.forceMax).toBe(1)
    expect(lo.opponentLabel).toBe(true)
    // Even the sharpest bot is looser than a perfect shot.
    expect(hi.aimSpread).toBeGreaterThan(0.2)
  })

  it('the staircase moves up on a player win, down on a loss, inside its bounds', () => {
    expect(nextBotSkill(BOT_SKILL_DEFAULT, 'win')).toBeGreaterThan(BOT_SKILL_DEFAULT)
    expect(nextBotSkill(BOT_SKILL_DEFAULT, 'lose')).toBeLessThan(BOT_SKILL_DEFAULT)
    expect(nextBotSkill(BOT_SKILL_MAX, 'win')).toBe(BOT_SKILL_MAX)
    expect(nextBotSkill(BOT_SKILL_MIN, 'lose')).toBe(BOT_SKILL_MIN)
    expect(nextBotSkill(Number.NaN, 'win')).toBeGreaterThan(BOT_SKILL_MIN)
  })

  it('settles a player of any strength near a 50 % win rate', () => {
    // A simulated player whose chance to beat a bot falls as the bot sharpens;
    // `strength` shifts where the 50 % point sits.
    for (const strength of [0.3, 0.55, 0.8]) {
      const rand = createRng(Math.round(strength * 1000))
      let skill = BOT_SKILL_DEFAULT
      let wins = 0
      const N = 3000
      for (let i = 0; i < N; i++) {
        const pWin = Math.min(0.97, Math.max(0.03, 0.5 + (strength - skill) * 1.6))
        const won = rand() < pWin
        if (i >= 500 && won) wins++
        skill = nextBotSkill(skill, won ? 'win' : 'lose')
      }
      const rate = wins / (N - 500)
      expect(rate).toBeGreaterThan(0.42)
      expect(rate).toBeLessThan(0.58)
    }
  })

  it('one seed reproduces the whole bot (name, team, first turn, style stream)', () => {
    const input = { seed: 0xabcdef, skill: 0.6, playerTeam: team(8, 9) }
    const a = createBotOpponent(input)
    const b = createBotOpponent(input)
    expect(b).toEqual(a)
    const sa = botPlayStyle(a.skill, a.seed)
    const sb = botPlayStyle(b.skill, b.seed)
    expect([sa.thinkMs(), sa.rand(), sa.thinkMs()]).toEqual([sb.thinkMs(), sb.rand(), sb.thinkMs()])
  })

  it('the first turn is a coin flip, not the campaign\'s loss bias', () => {
    let player = 0
    for (let seed = 1; seed <= 1000; seed++) {
      if (createBotOpponent({ seed, skill: 0.5, playerTeam: team(5, 5) }).firstTurn === 'player') player++
    }
    expect(player).toBeGreaterThan(430)
    expect(player).toBeLessThan(570)
  })
})

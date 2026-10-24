// ─── #UX100: playtime-paced interstitials + the coin-badge chord ───────────
//
// What is pinned here:
//   • the active-playtime clock (fake clock): only active time counts, late
//     timers are clamped, it persists to the save and survives a reload, and a
//     cloud hydration mid-session is added to rather than overwritten;
//   • the pacing rule: first eligible after 240 s of active playtime, then at
//     most one per 121 s; GameMonetize's grace is 0;
//   • the natural-break gate: never in PvP, never over another ad, never in
//     the tutorial, never without a loaded ad; a pending chord bypasses pacing;
//   • the chord: 20 taps, a 1.5 s gap restarts, a tap elsewhere resets, a
//     modal over the badge does not count, the press is never swallowed;
//   • every ad break (and a completed rewarded ad, except on Poki) restarts
//     the cooldown;
//   • the per-build switches.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  COIN_CHORD_GAP_MS,
  COIN_CHORD_TAPS,
  INTERSTITIAL_COOLDOWN_MS,
  INTERSTITIAL_FIRST_AFTER_MS,
  LAST_AD_BREAK_KEY,
  PLAYTIME_KEY,
  PLAYTIME_MAX_TICK_DELTA_MS,
  PLAYTIME_PERSIST_EVERY_MS
} from '@/use/ads/interstitialConfig'
import { createPlaytimeClock, type PlaytimeClockDeps } from '@/use/playtimeClock'
import {
  coinChordAction,
  isPlaytimeAdDue,
  preBattleAdReason,
  type ChordContext,
  type PreBattleAdContext
} from '@/use/interstitialPacing'
import { createTapChord, installCoinBadgeChord } from '@/use/coinBadgeChord'

const S = 1000

// ─── Playtime clock ─────────────────────────────────────────────────────────

const fakeStore = () => {
  const map = new Map<string, string>()
  return {
    map,
    read: (k: string) => map.get(k) ?? null,
    write: (k: string, v: string) => {
      map.set(k, v)
      return true
    }
  }
}

const makeClock = (store = fakeStore(), active = { on: true }) => {
  let t = 0
  const deps: PlaytimeClockDeps = {
    now: () => t,
    read: store.read,
    write: store.write,
    isActive: () => active.on
  }
  const clock = createPlaytimeClock(deps)
  clock.sample()
  /** Advance in 1 s ticks, sampling each one (what the interval does). */
  const play = (ms: number) => {
    for (let left = ms; left > 0; left -= S) {
      t += Math.min(S, left)
      clock.sample()
    }
  }
  const jump = (ms: number) => {
    t += ms
    clock.sample()
  }
  return { clock, store, active, play, jump }
}

describe('active playtime clock', () => {
  it('counts only while active (ad in flight / platform pause / hidden tab excluded)', () => {
    const c = makeClock()
    c.play(30 * S)
    expect(c.clock.total()).toBe(30 * S)
    c.active.on = false // e.g. an ad is in flight
    c.play(45 * S)
    expect(c.clock.total()).toBe(30 * S)
    c.active.on = true
    c.play(10 * S)
    expect(c.clock.total()).toBe(40 * S)
  })

  it('a late timer (background throttling, sleep) adds at most one clamped tick', () => {
    const c = makeClock()
    c.jump(10 * 60 * S)
    expect(c.clock.total()).toBe(PLAYTIME_MAX_TICK_DELTA_MS)
  })

  it('persists to the save every PLAYTIME_PERSIST_EVERY_MS and on flush', () => {
    const c = makeClock()
    c.play(PLAYTIME_PERSIST_EVERY_MS - S)
    expect(c.store.map.get(PLAYTIME_KEY)).toBeUndefined()
    c.play(S)
    expect(c.store.map.get(PLAYTIME_KEY)).toBe(String(PLAYTIME_PERSIST_EVERY_MS))
    c.play(5 * S)
    c.clock.flush()
    expect(c.store.map.get(PLAYTIME_KEY)).toBe(String(PLAYTIME_PERSIST_EVERY_MS + 5 * S))
  })

  it('survives a reload: a new clock on the same save continues the total', () => {
    const first = makeClock()
    first.play(200 * S)
    first.clock.flush()
    const second = makeClock(first.store)
    expect(second.clock.total()).toBe(200 * S)
    second.play(40 * S)
    expect(second.clock.total()).toBe(240 * S)
  })

  it('a cloud hydration mid-session becomes the base; the unsaved delta is added on top', () => {
    const c = makeClock()
    c.play(20 * S)
    // The SaveManager hydrates a cloud row written on another device.
    c.store.map.set(PLAYTIME_KEY, String(500 * S))
    expect(c.clock.total()).toBe(520 * S)
    c.clock.flush()
    expect(c.store.map.get(PLAYTIME_KEY)).toBe(String(520 * S))
  })

  it('keeps the delta in memory when the save refuses the write', () => {
    const store = fakeStore()
    const c = makeClock({ ...store, write: () => false })
    c.play(70 * S)
    c.clock.flush()
    expect(c.clock.total()).toBe(70 * S)
  })

  it('ignores a corrupt saved value', () => {
    const store = fakeStore()
    store.map.set(PLAYTIME_KEY, 'NaN')
    const c = makeClock(store)
    c.play(3 * S)
    expect(c.clock.total()).toBe(3 * S)
  })
})

// ─── Pacing rule ────────────────────────────────────────────────────────────

describe('playtime pacing: 240 s first, then a 121 s cooldown', () => {
  it('uses the roadmap numbers', () => {
    expect(INTERSTITIAL_FIRST_AFTER_MS).toBe(240_000)
    expect(INTERSTITIAL_COOLDOWN_MS).toBe(121_000)
  })

  it('nothing before 240 s of active playtime', () => {
    expect(isPlaytimeAdDue(239_999, null, 240_000, 121_000)).toBe(false)
    expect(isPlaytimeAdDue(240_000, null, 240_000, 121_000)).toBe(true)
  })

  it('then at most one per 121 s', () => {
    expect(isPlaytimeAdDue(300_000, 240_000, 240_000, 121_000)).toBe(false)
    expect(isPlaytimeAdDue(360_999, 240_000, 240_000, 121_000)).toBe(false)
    expect(isPlaytimeAdDue(361_000, 240_000, 240_000, 121_000)).toBe(true)
  })

  it('an earlier ad break (GameMonetize first-load ad, a chord) still owes the grace, then the cooldown', () => {
    // A chord ad at 30 s: nothing until 240 s anyway, and at 240 s the
    // cooldown from 30 s has long passed.
    expect(isPlaytimeAdDue(200_000, 30_000, 240_000, 121_000)).toBe(false)
    expect(isPlaytimeAdDue(240_000, 30_000, 240_000, 121_000)).toBe(true)
    // With grace 0 (GameMonetize): the cooldown alone paces.
    expect(isPlaytimeAdDue(100_000, 0, 0, 121_000)).toBe(false)
    expect(isPlaytimeAdDue(121_000, 0, 0, 121_000)).toBe(true)
  })
})

// ─── Natural-break gate ─────────────────────────────────────────────────────

const ctx = (over: Partial<PreBattleAdContext> = {}): PreBattleAdContext => ({
  ready: true,
  pvpActive: false,
  adInFlight: false,
  tutorial: false,
  chordPending: false,
  playtimeBuild: true,
  playtimeDue: true,
  cadenceDue: false,
  ...over
})

describe('pre-battle break: when an interstitial may play', () => {
  it('plays when playtime says so', () => {
    expect(preBattleAdReason(ctx())).toBe('playtime')
    expect(preBattleAdReason(ctx({ playtimeDue: false }))).toBeNull()
  })

  it('never in or around a PvP match — not even a pending chord', () => {
    expect(preBattleAdReason(ctx({ pvpActive: true }))).toBeNull()
    expect(preBattleAdReason(ctx({ pvpActive: true, chordPending: true }))).toBeNull()
  })

  it('never over another ad (no double ads)', () => {
    expect(preBattleAdReason(ctx({ adInFlight: true }))).toBeNull()
    expect(preBattleAdReason(ctx({ adInFlight: true, chordPending: true }))).toBeNull()
  })

  it('never without a loaded interstitial (no pause for a no-fill)', () => {
    expect(preBattleAdReason(ctx({ ready: false }))).toBeNull()
    expect(preBattleAdReason(ctx({ ready: false, chordPending: true }))).toBeNull()
  })

  it('no playtime ad in the tutorial', () => {
    expect(preBattleAdReason(ctx({ tutorial: true }))).toBeNull()
  })

  it('a pending chord bypasses grace, cooldown and the tutorial', () => {
    expect(preBattleAdReason(ctx({ chordPending: true, playtimeDue: false, tutorial: true }))).toBe('chord')
  })

  it('playtime pacing switched off for the build → the battle-count cadence decides', () => {
    expect(preBattleAdReason(ctx({ playtimeBuild: false, playtimeDue: true, cadenceDue: false }))).toBeNull()
    expect(preBattleAdReason(ctx({ playtimeBuild: false, playtimeDue: false, cadenceDue: true }))).toBe('cadence')
  })
})

const chordCtx = (over: Partial<ChordContext> = {}): ChordContext => ({
  buildEnabled: true,
  pvpActive: false,
  adInFlight: false,
  ready: true,
  atBreak: true,
  ...over
})

describe('a finished chord', () => {
  it('plays at once at the pre-battle break', () => {
    expect(coinChordAction(chordCtx())).toBe('show')
  })
  it('waits for the next break when it finishes mid-battle', () => {
    expect(coinChordAction(chordCtx({ atBreak: false }))).toBe('defer')
    expect(coinChordAction(chordCtx({ atBreak: false, ready: false }))).toBe('defer')
  })
  it('does nothing in PvP, over an ad, without a fill, or on a build without the chord', () => {
    expect(coinChordAction(chordCtx({ pvpActive: true }))).toBe('drop')
    expect(coinChordAction(chordCtx({ pvpActive: true, atBreak: false }))).toBe('drop')
    expect(coinChordAction(chordCtx({ adInFlight: true }))).toBe('drop')
    expect(coinChordAction(chordCtx({ ready: false }))).toBe('drop')
    expect(coinChordAction(chordCtx({ buildEnabled: false }))).toBe('drop')
  })
})

// ─── Chord counting ─────────────────────────────────────────────────────────

describe('coin-badge chord counter', () => {
  it('fires on the 20th consecutive tap and starts over', () => {
    expect(COIN_CHORD_TAPS).toBe(20)
    const chord = createTapChord()
    let t = 0
    for (let i = 1; i < 20; i++) {
      expect(chord.tap(t)).toBe(false)
      t += 200
    }
    expect(chord.tap(t)).toBe(true)
    expect(chord.count).toBe(0)
    expect(chord.tap(t + 100)).toBe(false)
    expect(chord.count).toBe(1)
  })

  it('a pause longer than 1.5 s restarts the count from that tap', () => {
    expect(COIN_CHORD_GAP_MS).toBe(1_500)
    const chord = createTapChord()
    let t = 0
    for (let i = 0; i < 15; i++) chord.tap((t += 300))
    expect(chord.count).toBe(15)
    chord.tap((t += COIN_CHORD_GAP_MS + 1))
    expect(chord.count).toBe(1)
    chord.tap((t += COIN_CHORD_GAP_MS)) // exactly the gap still counts
    expect(chord.count).toBe(2)
  })
})

describe('coin-badge chord in the DOM', () => {
  let badge: HTMLDivElement
  let canvas: HTMLCanvasElement
  let other: HTMLButtonElement
  let modal: HTMLDivElement
  let now = 0
  let fired = 0
  let uninstall: () => void

  const rect = (left: number, top: number, w: number, h: number) =>
    ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  const press = (target: Element, x: number, y: number, init: PointerEventInit = {}) => {
    now += 150
    const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init })
    Object.defineProperty(e, 'isPrimary', { value: init.isPrimary ?? true })
    target.dispatchEvent(e)
    return e
  }
  const tapBadge = () => press(canvas, 1210, 30)

  beforeEach(() => {
    document.body.innerHTML = ''
    const arena = document.createElement('div')
    canvas = document.createElement('canvas')
    const hud = document.createElement('div')
    badge = document.createElement('div')
    other = document.createElement('button')
    arena.append(canvas, hud)
    hud.append(badge, other)
    document.body.append(arena)
    modal = document.createElement('div')
    document.body.append(modal)
    badge.getBoundingClientRect = () => rect(1180, 10, 80, 50)
    fired = 0
    now = 0
    uninstall = installCoinBadgeChord({ getBadge: () => badge, onChord: () => fired++, now: () => now })
  })
  afterEach(() => uninstall())

  it('20 presses on the badge (falling through to the canvas, as its HUD layer is pass-through) trigger it', () => {
    for (let i = 0; i < 19; i++) tapBadge()
    expect(fired).toBe(0)
    tapBadge()
    expect(fired).toBe(1)
  })

  it('a press on the badge element itself counts too', () => {
    for (let i = 0; i < 20; i++) press(badge, 1200, 20)
    expect(fired).toBe(1)
  })

  it('a tap on another element resets the count', () => {
    for (let i = 0; i < 19; i++) tapBadge()
    press(other, 1220, 120)
    for (let i = 0; i < 19; i++) tapBadge()
    expect(fired).toBe(0)
    tapBadge()
    expect(fired).toBe(1)
  })

  it('a tap on the arena outside the badge resets the count', () => {
    for (let i = 0; i < 10; i++) tapBadge()
    press(canvas, 400, 400)
    for (let i = 0; i < 19; i++) tapBadge()
    expect(fired).toBe(0)
  })

  it('a modal drawn over the badge does not count (and resets)', () => {
    for (let i = 0; i < 20; i++) press(modal, 1210, 30)
    expect(fired).toBe(0)
  })

  it('second fingers and right clicks are not taps', () => {
    for (let i = 0; i < 20; i++) press(canvas, 1210, 30, { isPrimary: false })
    for (let i = 0; i < 20; i++) press(canvas, 1210, 30, { button: 2 })
    expect(fired).toBe(0)
  })

  it("never swallows the press: the badge's normal behaviour (the canvas under it) still gets it", () => {
    const canvasDown = vi.fn()
    canvas.addEventListener('pointerdown', canvasDown)
    let last: Event | null = null
    for (let i = 0; i < 20; i++) last = tapBadge()
    expect(fired).toBe(1)
    expect(canvasDown).toHaveBeenCalledTimes(20)
    expect(last?.defaultPrevented).toBe(false)
  })

  it('uninstall stops listening', () => {
    uninstall()
    for (let i = 0; i < 20; i++) tapBadge()
    expect(fired).toBe(0)
  })
})

// ─── Persisted cooldown mark + rewarded-as-ad-break ─────────────────────────

describe('ad-break mark (persisted)', () => {
  beforeEach(async () => {
    const pacing = await import('@/use/interstitialPacing')
    const clock = await import('@/use/playtimeClock')
    pacing.resetInterstitialPacingForTests()
    clock.resetPlaytimeClockForTests()
    localStorage.clear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('noteAdBreak stores the playtime; the next ad waits the cooldown, also after a reload', async () => {
    const pacing = await import('@/use/interstitialPacing')
    const clock = await import('@/use/playtimeClock')
    localStorage.setItem(PLAYTIME_KEY, String(250_000))
    expect(pacing.isPlaytimeInterstitialDue()).toBe(true)
    pacing.noteAdBreak()
    expect(localStorage.getItem(LAST_AD_BREAK_KEY)).toBe('250000')
    expect(pacing.isPlaytimeInterstitialDue()).toBe(false)

    // "Reload": fresh module state, same save.
    pacing.resetInterstitialPacingForTests()
    clock.resetPlaytimeClockForTests()
    localStorage.setItem(PLAYTIME_KEY, String(250_000 + 120_000))
    expect(pacing.isPlaytimeInterstitialDue()).toBe(false)
    localStorage.setItem(PLAYTIME_KEY, String(250_000 + 121_000))
    expect(pacing.isPlaytimeInterstitialDue()).toBe(true)
  })

  it('a mark AHEAD of the total (keys from two different saves) re-anchors to now', async () => {
    const pacing = await import('@/use/interstitialPacing')
    localStorage.setItem(PLAYTIME_KEY, String(300_000))
    localStorage.setItem(LAST_AD_BREAK_KEY, String(900_000))
    expect(pacing.lastAdBreakPlaytimeMs()).toBe(300_000)
    expect(localStorage.getItem(LAST_AD_BREAK_KEY)).toBe('300000')
    expect(pacing.isPlaytimeInterstitialDue()).toBe(false)
    localStorage.setItem(PLAYTIME_KEY, String(421_000))
    expect(pacing.isPlaytimeInterstitialDue()).toBe(true)
  })

  it('a completed rewarded ad restarts the cooldown (B6) …', async () => {
    vi.stubEnv('VITE_APP_POKI', 'false')
    const cadence = await import('@/use/midgameCadence')
    const pacing = await import('@/use/interstitialPacing')
    localStorage.setItem(PLAYTIME_KEY, String(400_000))
    cadence.noteRewardedAdCompleted()
    expect(pacing.lastAdBreakPlaytimeMs()).toBe(400_000)
    expect(pacing.isPlaytimeInterstitialDue()).toBe(false)
  })

  it('… except on Poki, whose SDK owns pacing', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const cadence = await import('@/use/midgameCadence')
    const pacing = await import('@/use/interstitialPacing')
    localStorage.setItem(PLAYTIME_KEY, String(400_000))
    cadence.noteRewardedAdCompleted()
    expect(pacing.lastAdBreakPlaytimeMs()).toBeNull()
    expect(pacing.isPlaytimeInterstitialDue()).toBe(true)
  })
})

// ─── Arena glue: chord now / deferred / PvP / no double ads ────────────────

describe('arena ad breaks', () => {
  const isInterstitialReady = ref(true)
  const adsInFlight = ref(0)
  let resolveAd: (() => void) | null = null
  const showMidgameAd = vi.fn(() => {
    adsInFlight.value++
    return new Promise<void>((r) => {
      resolveAd = () => {
        adsInFlight.value--
        r()
      }
    })
  })

  const load = async () => {
    vi.resetModules()
    vi.doMock('@/use/useAds', () => ({ isInterstitialReady, adsInFlight, showMidgameAd }))
    const glue = await import('@/use/arenaAdBreaks')
    const pause = await import('@/use/useGamePause')
    return { ...glue, pause }
  }

  let badge: HTMLDivElement
  const tap20 = () => {
    for (let i = 0; i < 20; i++) {
      const e = new MouseEvent('pointerdown', { bubbles: true, clientX: 15, clientY: 15, button: 0 })
      badge.dispatchEvent(e)
    }
  }

  beforeEach(() => {
    localStorage.clear()
    isInterstitialReady.value = true
    adsInFlight.value = 0
    resolveAd = null
    showMidgameAd.mockClear()
    document.body.innerHTML = ''
    badge = document.createElement('div')
    badge.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 30, bottom: 30, width: 30, height: 30, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    document.body.append(badge)
  })
  afterEach(() => {
    vi.doUnmock('@/use/useAds')
  })

  const setup = async (over: { pvp?: boolean, clear?: boolean, tutorial?: boolean } = {}) => {
    const mod = await load()
    const phase = ref<'tap_to_start' | 'player_turn' | 'ad_break' | 'meteor_intro'>('tap_to_start')
    const state = { pvp: over.pvp ?? false, clear: over.clear ?? true, tutorial: over.tutorial ?? false }
    const ads = mod.useArenaAdBreaks({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phase: phase as any,
      pvpActive: () => state.pvp,
      tutorial: () => state.tutorial,
      arenaClear: () => state.clear,
      getBadge: () => badge
    })
    ads.mount()
    return { ...mod, ads, phase, state }
  }

  it('a chord on the "tap to start" screen plays at once, parks the board, then hands it back', async () => {
    const { ads, phase } = await setup()
    tap20()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
    expect(phase.value).toBe('ad_break')
    // A second chord while the ad is up: no double ad.
    tap20()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
    resolveAd?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(phase.value).toBe('tap_to_start')
    // The chord restarted the cooldown: the mark sits at the current playtime.
    expect(localStorage.getItem(LAST_AD_BREAK_KEY)).not.toBeNull()
    ads.unmount()
  })

  it('a chord mid-battle never interrupts the battle — it waits for the next pre-battle break', async () => {
    const { ads, phase } = await setup()
    phase.value = 'player_turn'
    tap20()
    expect(showMidgameAd).not.toHaveBeenCalled()
    expect(ads.isChordPending()).toBe(true)
    phase.value = 'tap_to_start'
    expect(ads.preBattleAd()).toBe('chord')
    const run = ads.runAdBreak('chord')
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
    expect(ads.isChordPending()).toBe(false)
    resolveAd?.()
    await run
    ads.unmount()
  })

  it('a chord during PvP is dropped, not deferred', async () => {
    const { ads, phase, state } = await setup({ pvp: true })
    tap20()
    phase.value = 'player_turn'
    tap20()
    expect(showMidgameAd).not.toHaveBeenCalled()
    expect(ads.isChordPending()).toBe(false)
    state.pvp = false
    expect(ads.preBattleAd()).toBeNull()
    ads.unmount()
  })

  it('a chord under a modal / cutscene does not open an ad on top of it', async () => {
    const { ads } = await setup({ clear: false })
    tap20()
    expect(showMidgameAd).not.toHaveBeenCalled()
    ads.unmount()
  })

  it('pre-battle: playtime past 240 s → an ad; then the cooldown holds the next one', async () => {
    const { ads } = await setup()
    localStorage.setItem(PLAYTIME_KEY, String(239_000))
    expect(ads.preBattleAd()).toBeNull()
    localStorage.setItem(PLAYTIME_KEY, String(240_000))
    expect(ads.preBattleAd()).toBe('playtime')
    const run = ads.runAdBreak('playtime')
    resolveAd?.()
    await run
    localStorage.setItem(PLAYTIME_KEY, String(240_000 + 60_000))
    expect(ads.preBattleAd()).toBeNull()
    localStorage.setItem(PLAYTIME_KEY, String(240_000 + 121_000))
    expect(ads.preBattleAd()).toBe('playtime')
    ads.unmount()
  })

  it('pre-battle: never in PvP, never in the tutorial, never while the platform pauses', async () => {
    const { ads, state, pause } = await setup()
    localStorage.setItem(PLAYTIME_KEY, String(600_000))
    state.pvp = true
    expect(ads.preBattleAd()).toBeNull()
    state.pvp = false
    state.tutorial = true
    expect(ads.preBattleAd()).toBeNull()
    state.tutorial = false
    pause.setGamePaused(true)
    await nextTick()
    expect(ads.preBattleAd()).toBeNull()
    pause.setGamePaused(false)
    expect(ads.preBattleAd()).toBe('playtime')
    ads.unmount()
  })

  it('a failing SDK is swallowed and the board comes back', async () => {
    const { ads, phase } = await setup()
    showMidgameAd.mockImplementationOnce(() => Promise.reject(new Error('sdk down')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tap20()
    await new Promise((r) => setTimeout(r, 0))
    expect(phase.value).toBe('tap_to_start')
    warn.mockRestore()
    ads.unmount()
  })
})

// ─── Per-build switches ─────────────────────────────────────────────────────

describe('per-build matrix', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const cfg = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return await import('@/use/ads/interstitialConfig')
  }

  it('on by default (every ad portal: CrazyGames, Poki, Playgama/YouTube, GameMonetize, native 18+)', async () => {
    for (const flag of ['VITE_APP_CRAZY_WEB', 'VITE_APP_POKI', 'VITE_APP_PLAYGAMA', 'VITE_APP_GAME_MONETIZE']) {
      const c = await cfg({ [flag]: 'true', VITE_APP_NATIVE: 'false', VITE_APP_KIDS: 'false' })
      expect(c.PLAYTIME_INTERSTITIALS_BUILD, flag).toBe(true)
      expect(c.COIN_CHORD_INTERSTITIAL_BUILD, flag).toBe(true)
      vi.unstubAllEnvs()
    }
  })

  it('240 s grace everywhere except GameMonetize (first-load ad portal: 0)', async () => {
    expect((await cfg({ VITE_APP_POKI: 'true' })).INTERSTITIAL_GRACE_MS).toBe(240_000)
    vi.unstubAllEnvs()
    expect((await cfg({ VITE_APP_CRAZY_WEB: 'true' })).INTERSTITIAL_GRACE_MS).toBe(240_000)
    vi.unstubAllEnvs()
    expect((await cfg({ VITE_APP_GAME_MONETIZE: 'true' })).INTERSTITIAL_GRACE_MS).toBe(0)
  })

  it('a .env opt-out switches each feature off on its own', async () => {
    const a = await cfg({ VITE_APP_PLAYTIME_INTERSTITIALS: 'false' })
    expect(a.PLAYTIME_INTERSTITIALS_BUILD).toBe(false)
    expect(a.COIN_CHORD_INTERSTITIAL_BUILD).toBe(true)
    vi.unstubAllEnvs()
    const b = await cfg({ VITE_APP_COIN_CHORD_INTERSTITIAL: 'false' })
    expect(b.PLAYTIME_INTERSTITIALS_BUILD).toBe(true)
    expect(b.COIN_CHORD_INTERSTITIAL_BUILD).toBe(false)
  })

  it('child-directed ad posture: both off (native unless explicitly not child-directed)', async () => {
    const nativeKids = await cfg({ VITE_APP_NATIVE: 'true', VITE_APP_ADS_CHILD_DIRECTED: 'true' })
    expect(nativeKids.PLAYTIME_INTERSTITIALS_BUILD).toBe(false)
    expect(nativeKids.COIN_CHORD_INTERSTITIAL_BUILD).toBe(false)
    vi.unstubAllEnvs()
    const nativeUnset = await cfg({ VITE_APP_NATIVE: 'true', VITE_APP_ADS_CHILD_DIRECTED: '' })
    expect(nativeUnset.PLAYTIME_INTERSTITIALS_BUILD).toBe(false)
    vi.unstubAllEnvs()
    // The 18+ native app (.env.tauri): VITE_APP_KIDS there only means the
    // offline league, not the ad posture.
    const native18 = await cfg({ VITE_APP_NATIVE: 'true', VITE_APP_ADS_CHILD_DIRECTED: 'false', VITE_APP_KIDS: 'true' })
    expect(native18.PLAYTIME_INTERSTITIALS_BUILD).toBe(true)
    expect(native18.COIN_CHORD_INTERSTITIAL_BUILD).toBe(true)
    vi.unstubAllEnvs()
    // Web portals carry no child-directed ad flag (Tauri / store builds only).
    const web = await cfg({ VITE_APP_NATIVE: 'false', VITE_APP_KIDS: 'true' })
    expect(web.PLAYTIME_INTERSTITIALS_BUILD).toBe(true)
    vi.unstubAllEnvs()
    const webExplicit = await cfg({ VITE_APP_NATIVE: 'false', VITE_APP_ADS_CHILD_DIRECTED: 'true' })
    expect(webExplicit.PLAYTIME_INTERSTITIALS_BUILD).toBe(false)
    expect(webExplicit.COIN_CHORD_INTERSTITIAL_BUILD).toBe(false)
  })
})

// ─── Source pins: the placement stays where it is safe ──────────────────────

describe('placement pins', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

  it('the arena asks the pacing at the pre-battle break and nowhere else', () => {
    const arena = src('src/views/SpinnerArena.vue')
    // One helper asks the pacing and runs the break …
    expect(arena.match(/arenaAds\.preBattleAd\(\)/g)?.length).toBe(1)
    expect(arena.match(/arenaAds\.runAdBreak\(/g)?.length).toBe(1)
    const helper = arena.slice(arena.indexOf('const playDueInterstitial = async'))
    expect(helper.slice(0, 400)).toContain('arenaAds.preBattleAd()')
    // … no direct interstitial call from the view (game over / result screen) …
    expect(arena).not.toMatch(/\bshowMidgameAd\(/)
    // … and it is only awaited where the board waits on "tap to start":
    // before the battle (before its music starts) and on a closed win screen.
    const calls = [...arena.matchAll(/^.*await playDueInterstitial\(\).*$/gm)].map((m) => m[0].trim())
    expect(calls).toEqual([
      'await playDueInterstitial()',
      "if (phase.value === 'tap_to_start') await playDueInterstitial()"
    ])
    const begin = arena.slice(arena.indexOf('const beginBattle = async'))
    expect(begin.indexOf('await playDueInterstitial()')).toBeLessThan(begin.indexOf('startBattleMusic()'))
    expect(begin.indexOf('await playDueInterstitial()')).toBeLessThan(begin.indexOf('startMatch()'))
  })

  it('the GameMonetize first-load ad seeds the cooldown', () => {
    expect(src('src/use/useFirstLoadInterstitial.ts')).toContain('noteAdBreak()')
  })

  it('YouTube builds never read the Page Visibility API for the playtime clock', () => {
    const glue = src('src/use/arenaAdBreaks.ts')
    expect(glue).toContain("const READS_VISIBILITY = import.meta.env.VITE_APP_YOUTUBE !== 'true'")
    for (const line of glue.split('\n').filter((l) => /document\.hidden|visibilitychange/.test(l) && !l.trim().startsWith('//'))) {
      expect(line, line).toMatch(/READS_VISIBILITY|document\.hidden\)/)
    }
  })
})

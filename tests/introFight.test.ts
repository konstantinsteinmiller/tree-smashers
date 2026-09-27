import { describe, expect, it } from 'vitest'
import {
  createIntroFight,
  simulateIntroFight,
  sampleTrack,
  BOSS,
  P1,
  P2,
  F_ALIVE,
  F_HP
} from '@/use/introFight'
import { buildDirector, createDirector, UNKNOWN_T } from '@/use/introTimeline'
import { matchRng, seedMatchRng, createRng } from '@/use/useDeterministicRng'

// ─── The intro's boss fight: the boss wins, every time, at every frame rate ──

const track = simulateIntroFight()
const director = buildDirector(track)
const b = director.beats

/**
 * Play the fight LIVE exactly like IntroCutscene's rAF loop does — a fresh
 * fight, stepped by a fresh director as the frames arrive (delta clamped to
 * 250 ms) — and report the first FRAME at which each blue is seen dead. That is
 * what the player sees, at that frame rate.
 */
const playAt = (nextDt: () => number) => {
  const fight = createIntroFight()
  const live = createDirector(fight)
  let T = 0
  const seenDead: [number, number] = [-1, -1]
  let frames = 0
  let maxAhead = 0
  while (T < b.battleEndT + 0.5) {
    T += Math.min(0.25, nextDt())
    frames++
    const S = live.toS(T)
    // Live means live: the physics never runs more than a few steps ahead.
    maxAhead = Math.max(maxAhead, (fight.track.steps - 1) / 240 - S)
    for (const [i, id] of [[0, P1], [1, P2]] as const) {
      if (seenDead[i] < 0 && sampleTrack(fight.track, S, id, F_ALIVE) < 0.5) seenDead[i] = T
    }
  }
  const S = live.toS(T)
  return {
    seenDead,
    frames,
    maxAhead,
    beats: { ...live.beats, koT: [...live.beats.koT] },
    bossAlive: sampleTrack(fight.track, S, BOSS, F_ALIVE) >= 0.5,
    bossHp: sampleTrack(fight.track, S, BOSS, F_HP)
  }
}

describe('simulateIntroFight — the verdict', () => {
  it('the boss destroys both player spinners, by contact, and survives', () => {
    const kos = track.events.filter(e => e.kind === 'ko')
    expect(kos.map(e => e.a).sort()).toEqual([P1, P2])
    // A charge that connects is the KO — the safety net never had to fire.
    for (const ko of kos) expect(ko.byContact).toBe(true)
    expect(track.koS[0]).toBeGreaterThan(0)
    expect(track.koS[1]).toBeGreaterThan(track.koS[0])
    const end = track.endS
    expect(sampleTrack(track, end, BOSS, F_ALIVE)).toBe(1)
    // Hope, then crush: the blues DO hurt it (its ring is well down) — and it
    // still wins.
    const bossHp = sampleTrack(track, end, BOSS, F_HP)
    expect(bossHp).toBeGreaterThan(0.15)
    expect(bossHp).toBeLessThan(0.5)
    expect(sampleTrack(track, end, P1, F_ALIVE)).toBe(0)
    expect(sampleTrack(track, end, P2, F_ALIVE)).toBe(0)
  })

  it('the boss ability visibly fires — twice — and the bumper is used', () => {
    const thunders = new Set(track.events.filter(e => e.kind === 'thunder').map(e => e.s))
    expect(thunders.size).toBe(2)
    expect(track.events.some(e => e.kind === 'bumper' && e.a !== BOSS)).toBe(true)
    expect(track.events.filter(e => e.kind === 'hit' && e.b === BOSS).length).toBeGreaterThanOrEqual(6)
  })

  it('both KOs, and the whole fight, land before 8 s of screen time', () => {
    expect(b.koT[0]).toBeLessThan(b.koT[1])
    expect(b.koT[1]).toBeLessThan(8)
    expect(b.battleEndT).toBeLessThan(8)
  })

  it('is bit-for-bit reproducible', () => {
    const again = simulateIntroFight()
    expect(again.steps).toBe(track.steps)
    expect(Array.from(again.data)).toEqual(Array.from(track.data))
    expect(again.events).toEqual(track.events)
  })

  it('never touches the shared match RNG (the next real match is unaffected)', () => {
    seedMatchRng(1234)
    const expected = [matchRng(), matchRng(), matchRng()]
    seedMatchRng(1234)
    simulateIntroFight()
    expect([matchRng(), matchRng(), matchRng()]).toEqual(expected)
  })
})

describe('frame-rate independence', () => {
  const rates = [30, 60, 144]

  it.each(rates)('at %i fps the KOs happen on the storyboard frame, before 8 s', (fps) => {
    const r = playAt(() => 1 / fps)
    const frame = 1 / fps
    for (const i of [0, 1] as const) {
      expect(r.seenDead[i]).toBeGreaterThan(0)
      // Dead on the first frame at or after the KO contact (whose hit-stop
      // then freezes that exact instant on screen).
      const koIdx = track.events.findIndex(e => e.kind === 'ko' && e.a === (i === 0 ? P1 : P2))
      const visibleAt = director.eventT[koIdx]!
      expect(r.seenDead[i]).toBeGreaterThanOrEqual(visibleAt - 1e-9)
      expect(r.seenDead[i]).toBeLessThan(visibleAt + frame + 1e-3)
      expect(r.seenDead[i]).toBeLessThan(8)
    }
    expect(r.bossAlive).toBe(true)
    // The live director converges on exactly the map of the finished fight.
    expect(r.beats.koT[0]).toBeCloseTo(b.koT[0], 9)
    expect(r.beats.koT[1]).toBeCloseTo(b.koT[1], 9)
    expect(r.beats.battleEndT).toBeCloseTo(b.battleEndT, 9)
    // …while never simulating more than a frame's worth ahead of the screen.
    expect(r.maxAhead).toBeLessThan(0.3 + 3 / 240)
  })

  it('knows nothing about the future before it happens', () => {
    const fight = createIntroFight()
    const live = createDirector(fight)
    live.toS(2)
    expect(live.beats.koT[0]).toBe(UNKNOWN_T)
    expect(live.beats.battleEndT).toBe(UNKNOWN_T)
    expect(fight.track.done).toBe(false)
    expect(fight.track.events.every(e => e.s <= 2.1)).toBe(true)
  })

  it('a throttled CPU (45–100 ms frames, jittering) keeps the same result and timing', () => {
    const rng = createRng(99)
    const r = playAt(() => 0.045 + rng() * 0.055)
    const ref = playAt(() => 1 / 144)
    expect(r.bossAlive).toBe(true)
    for (const i of [0, 1] as const) {
      expect(r.seenDead[i]).toBeGreaterThan(0)
      expect(Math.abs(r.seenDead[i] - ref.seenDead[i])).toBeLessThan(0.11)
      expect(r.seenDead[i]).toBeLessThan(8)
    }
    expect(r.bossHp).toBeCloseTo(ref.bossHp, 5)
  })

  it('the same director time maps to the same sim time whatever the frame history', () => {
    // toS() keeps a walking cursor for speed; a bug there would make the board
    // depend on HOW the frames arrived. Walk one director at 30 fps, query a
    // fresh one out of order (a seek, a skip, a resize) — same answers.
    const walked = buildDirector(track)
    const fresh = buildDirector(track)
    const probes: number[] = []
    const got = new Map<number, number>()
    for (let T = 0; T <= b.battleEndT + 1; T += 1 / 30) {
      const s = walked.toS(T)
      if (probes.length < 400) {
        probes.push(T)
        got.set(T, s)
      }
    }
    const order = [...probes].sort((x, y) => Math.sin(x * 1e4) - Math.sin(y * 1e4))
    for (const T of order) expect(fresh.toS(T)).toBe(got.get(T))
  })
})

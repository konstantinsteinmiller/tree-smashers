// UI sound engine (src/use/uiSfx.ts): the gates that keep UI ticks honest —
// silent at volume 0 (= platform mute), under a platform pause, while an ad is
// in flight, before the AudioContext runs — plus the spam guards (per-sound
// gap, voice cap) and the level ordering that keeps taps under the fight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const volume = ref(0.7)
vi.mock('@/use/useUser', () => ({ default: () => ({ userSoundVolume: volume }) }))

interface FakeParam { value: number, setValueAtTime: (v: number) => void, exponentialRampToValueAtTime: (v: number) => void }
const param = (): FakeParam => {
  const p: FakeParam = {
    value: 0,
    setValueAtTime: (v) => { p.value = Math.max(p.value, v) },
    exponentialRampToValueAtTime: (v) => { p.value = Math.max(p.value, v) }
  }
  return p
}
const node = () => ({ connect: (n: unknown) => n })

let started = 0
let peaks: number[] = []
const ctx = {
  state: 'running' as AudioContextState,
  currentTime: 0,
  sampleRate: 22050,
  destination: node(),
  resume: vi.fn(() => Promise.resolve()),
  createGain: () => {
    const g = { ...node(), gain: param() }
    const connect = (n: unknown) => { peaks.push(g.gain.value); return n }
    return { ...g, connect }
  },
  createOscillator: () => ({ ...node(), type: 'sine', frequency: param(), start: () => { started++ }, stop: () => {} }),
  createBufferSource: () => ({ ...node(), buffer: null, start: () => { started++ }, stop: () => {} }),
  createBiquadFilter: () => ({ ...node(), type: 'lowpass', Q: param(), frequency: param() }),
  createBuffer: (_c: number, len: number, sr: number) => ({ sampleRate: sr, getChannelData: () => new Float32Array(len) })
}
vi.mock('@/use/useAssets', () => ({ getAudioContext: () => ctx }))

const { playUiSfx, setUiSfxSuppressed, __resetUiSfxForTests, UI_GAIN, UI_SFX_MAX_VOICES } = await import('@/use/uiSfx')
const { setGamePaused } = await import('@/use/useGamePause')

beforeEach(() => {
  __resetUiSfxForTests()
  vi.useFakeTimers()
  vi.setSystemTime(0)
  started = 0
  peaks = []
  volume.value = 0.7
  ctx.state = 'running'
  setGamePaused(false)
})
afterEach(() => {
  vi.useRealTimers()
  setGamePaused(false)
})

describe('uiSfx gates', () => {
  it('plays a press on a running context', () => {
    playUiSfx('press')
    expect(started).toBeGreaterThan(0)
  })

  it('is silent at SFX volume 0 (the platform-mute path)', () => {
    volume.value = 0
    playUiSfx('press')
    expect(started).toBe(0)
  })

  it('is silent while the platform has the game paused (overlay / ad)', () => {
    setGamePaused(true)
    playUiSfx('reward')
    expect(started).toBe(0)
  })

  it('is silent while an ad is in flight', () => {
    setUiSfxSuppressed('ads', true)
    playUiSfx('open')
    expect(started).toBe(0)
    setUiSfxSuppressed('ads', false)
    playUiSfx('open')
    expect(started).toBeGreaterThan(0)
  })

  it('never queues on a suspended context — it wakes it and stays silent', () => {
    ctx.state = 'suspended'
    playUiSfx('press')
    expect(started).toBe(0)
    expect(ctx.resume).toHaveBeenCalled()
  })
})

describe('uiSfx spam guards', () => {
  it('mashing gives at most one press per gap', () => {
    for (let i = 0; i < 10; i++) playUiSfx('press')
    const one = started
    __resetUiSfxForTests()
    started = 0
    playUiSfx('press')
    expect(one).toBe(started)
  })

  it(`never overlaps more than ${UI_SFX_MAX_VOICES} voices`, () => {
    const names = ['press', 'open', 'reward', 'tab', 'toggleOn', 'deny'] as const
    let voicesStarted = 0
    for (const n of names) {
      const before = started
      playUiSfx(n)
      if (started > before) voicesStarted++
    }
    expect(voicesStarted).toBe(UI_SFX_MAX_VOICES)
  })
})

describe('uiSfx levels', () => {
  it('a press peaks at UI_GAIN × volume; release and ticks sit well under it', () => {
    playUiSfx('press')
    const press = Math.max(...peaks)
    expect(press).toBeCloseTo(UI_GAIN * 0.7, 6)
    __resetUiSfxForTests(); peaks = []
    playUiSfx('release')
    expect(Math.max(...peaks)).toBeLessThan(press * 0.6)
    __resetUiSfxForTests(); peaks = []
    playUiSfx('tick')
    expect(Math.max(...peaks)).toBeLessThan(press * 0.5)
  })
})

// Regression guard for the Playgama certification item:
//   "The game continues running when a system overlay is opened. Subscribe to
//    the SDK pause event and stop the game loop."
//
// The subtle requirement is not "stop on pause" — it's that RESUMING must not
// restart a loop that gameplay had legitimately stopped (battle over, modal
// open, reward screen up). The gate therefore tracks the platform pause and
// gameplay's own intent separately and only runs when both agree.

import { describe, it, expect, beforeEach } from 'vitest'
import { isGamePaused, registerPauseSyncer, setGamePaused } from '@/use/useGamePause'

/** Minimal stand-in for a loop owner, mirroring useSpinnerGame's wiring. */
const makeLoop = () => {
  const loop = {
    wanted: false,
    running: false,
    dispose: () => {
    }
  }
  const sync = () => {
    loop.running = loop.wanted && !isGamePaused.value
  }
  loop.dispose = registerPauseSyncer(sync)
  const start = () => {
    loop.wanted = true
    sync()
  }
  const stop = () => {
    loop.wanted = false
    sync()
  }
  return { loop, start, stop }
}

describe('game pause gate', () => {
  beforeEach(() => {
    setGamePaused(false)
  })

  it('stops a running loop when the platform pauses, and resumes it after', () => {
    const { loop, start } = makeLoop()
    start()
    expect(loop.running).toBe(true)

    setGamePaused(true)
    expect(loop.running).toBe(false)

    setGamePaused(false)
    expect(loop.running).toBe(true)
    loop.dispose()
  })

  it('does NOT restart a loop gameplay had stopped', () => {
    // The regression this gate exists for: pausing and resuming around a
    // finished battle must not silently resurrect the simulation.
    const { loop, start, stop } = makeLoop()
    start()
    stop()
    expect(loop.running).toBe(false)

    setGamePaused(true)
    setGamePaused(false)
    expect(loop.running).toBe(false)
    loop.dispose()
  })

  it('keeps a loop stopped when gameplay starts it while suspended', () => {
    const { loop, start } = makeLoop()
    setGamePaused(true)
    start()
    // Gameplay wants it, the platform says no — the platform wins.
    expect(loop.running).toBe(false)

    setGamePaused(false)
    expect(loop.running).toBe(true)
    loop.dispose()
  })

  it('is idempotent so overlapping pause sources cannot fight', () => {
    const { loop, start } = makeLoop()
    start()
    setGamePaused(true)
    setGamePaused(true)
    expect(loop.running).toBe(false)
    setGamePaused(false)
    expect(loop.running).toBe(true)
    loop.dispose()
  })

  it('drives every registered loop, and stops touching disposed ones', () => {
    const a = makeLoop()
    const b = makeLoop()
    a.start()
    b.start()

    setGamePaused(true)
    expect(a.loop.running).toBe(false)
    expect(b.loop.running).toBe(false)

    // A torn-down arena must not be kept alive by the gate.
    a.loop.dispose()
    setGamePaused(false)
    expect(a.loop.running).toBe(false)
    expect(b.loop.running).toBe(true)
    b.loop.dispose()
  })
})

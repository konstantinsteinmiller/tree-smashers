// Exercises the REAL `useSpinnerGame` physics loop against the pause gate —
// `gamePauseGate.test.ts` covers the gate in isolation, this proves the arena
// is actually wired into it.
//
// Playgama certification: the loop must stop while a system overlay is open,
// and a resume must not restart a simulation gameplay had already ended.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// Import useUser FIRST — useMatch ↔ useModels ↔ useUser is a circular import
// and pulling useSpinnerGame in cold makes the cycle resolve in the wrong
// order (`default is not a function` at module-eval time).
import '@/use/useUser'
import { useSpinnerGame } from '@/use/useSpinnerGame'
import { setGamePaused } from '@/use/useGamePause'

/** Deterministic RAF stand-in — nothing auto-runs, we drive frames by hand. */
const installFakeRaf = () => {
  let nextId = 1
  const scheduled = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    scheduled.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    scheduled.delete(id)
  })
  return {
    /** How many callbacks are currently queued — i.e. live loop chains. */
    get pending() {
      return scheduled.size
    },
    /** Run every queued callback once (they may re-schedule themselves). */
    tick(now: number) {
      const batch = [...scheduled.entries()]
      scheduled.clear()
      for (const [, cb] of batch) cb(now)
    }
  }
}

describe('useSpinnerGame physics loop — platform pause gate', () => {
  let raf: ReturnType<typeof installFakeRaf>

  beforeEach(() => {
    setGamePaused(false)
    raf = installFakeRaf()
  })

  afterEach(() => {
    setGamePaused(false)
    vi.unstubAllGlobals()
  })

  it('starts and stops on gameplay demand', () => {
    const game = useSpinnerGame()
    expect(raf.pending).toBe(0)

    game.startPhysics()
    expect(raf.pending).toBe(1)

    game.stopPhysics()
    expect(raf.pending).toBe(0)
    game.disposePhysics()
  })

  it('keeps exactly one loop chain when startPhysics is called twice', () => {
    // Two concurrent chains both reassign `physicsRafId`, so neither ever
    // sees null and the simulation silently runs at double speed.
    const game = useSpinnerGame()
    game.startPhysics()
    game.startPhysics()
    expect(raf.pending).toBe(1)

    raf.tick(16)
    expect(raf.pending).toBe(1)
    game.disposePhysics()
  })

  it('stops the loop on platform pause and resumes it after', () => {
    const game = useSpinnerGame()
    game.startPhysics()
    raf.tick(16)
    expect(raf.pending).toBe(1)

    setGamePaused(true)
    expect(raf.pending).toBe(0)

    // Frozen: no queued callback means no further simulation, which is the
    // behaviour QA checks by opening a system overlay.
    raf.tick(32)
    expect(raf.pending).toBe(0)

    setGamePaused(false)
    expect(raf.pending).toBe(1)
    game.disposePhysics()
  })

  it('does NOT resume a loop gameplay had stopped', () => {
    const game = useSpinnerGame()
    game.startPhysics()
    game.stopPhysics()

    setGamePaused(true)
    setGamePaused(false)
    expect(raf.pending).toBe(0)
    game.disposePhysics()
  })

  it('does not start while suspended, even if gameplay asks', () => {
    const game = useSpinnerGame()
    setGamePaused(true)
    game.startPhysics()
    expect(raf.pending).toBe(0)

    setGamePaused(false)
    expect(raf.pending).toBe(1)
    game.disposePhysics()
  })

  it('disposePhysics unregisters, so a resume cannot revive a dead arena', () => {
    const game = useSpinnerGame()
    game.startPhysics()
    game.disposePhysics()
    expect(raf.pending).toBe(0)

    setGamePaused(true)
    setGamePaused(false)
    expect(raf.pending).toBe(0)
  })
})

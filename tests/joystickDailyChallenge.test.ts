// ─── The virtual joystick, and the space it is actually for ─────────────────
//
// CrazyGames QA reported "mobile controls showing up in the Daily Challenge" on
// a desktop screenshot. The joystick is not daily-challenge code and never was:
// it appears in ANY mode once the selected blade passes 0.55 x ARENA_RADIUS.
//
// What makes the daily challenge different is its ARENA. It is the one mode
// that fights in a non-circular shape, and every shape in `arenaShapes` is
// INSCRIBED in the bounding circle the camera frames — an oval reaches 0.72R
// vertically, a rounded rect 0.70R, a diamond's edges 0.71R. So a blade parked
// against one of those walls trips a threshold written for a circle while still
// sitting tens of game units clear of the screen edge, with all the room it
// needs to aim and launch the ordinary way.
//
// The rule these cases pin down: in a daily match the joystick appears only
// when the blade has less outward room to the screen edge than the shortest
// full-force pull the game ever asks for. It is deliberately subtractive — it
// can only hide a joystick the old threshold would have shown — and it is
// scoped to daily, so campaign, ghost and PvP matches are bit-for-bit
// unchanged.

import { describe, it, expect, beforeEach, vi } from 'vitest'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame, ARENA_RADIUS, MAX_PULL_DISTANCE } from '@/use/useSpinnerGame'
import type { ArenaShape } from '@/use/arenaShapes'
import type { SpinnerConfig } from '@/use/useSpinnerConfig'

const cfg = (): SpinnerConfig => ({
  topPartId: 'star',
  bottomPartId: 'balanced'
} as SpinnerConfig)

/**
 * A landscape desktop viewport, which is where QA saw this.
 *
 * The camera frames `2R + padding` across the SHORTER axis, so at 1920x1080 the
 * visible game area runs to +/-360 horizontally but only +/-202.5 vertically —
 * barely 2.5 units outside a 200-unit arena. That asymmetry is the whole reason
 * a blade "at the edge" sometimes has somewhere to drag and sometimes does not,
 * and it is why the rule measures room instead of trusting a radius.
 */
const DESKTOP = { w: 1920, h: 1080 }
/** Portrait phone: the tight axis is now horizontal. */
const PHONE = { w: 400, h: 800 }

/**
 * Stand a match up and park the player's blade at an exact spot.
 *
 * `renderJoystickOverlay` is called while the phase is still idle, purely to
 * feed the composable the viewport dimensions: with nothing drawn yet and no
 * joystick wanted it records the metrics and returns before it touches the
 * context, so no canvas is needed.
 */
const scene = (
  o: { shape?: ArenaShape; daily?: boolean; viewport?: { w: number; h: number } } = {}
) => {
  const g = useSpinnerGame()
  const { shape = 'circle', daily = false, viewport = DESKTOP } = o

  g.initGame([cfg()], [cfg()], false, 'default', 0, false, undefined, null, shape, daily)
  g.renderJoystickOverlay(null as never, viewport.w, viewport.h)

  return {
    ...g,
    /** Put the selected blade at (x, y) in game space and enter the turn. */
    park(x: number, y: number) {
      const blade = g.playerBlades.value[0]!
      blade.x = x
      blade.y = y
      g.selectedBladeId.value = blade.id
      g.phase.value = 'player_turn'
      return this
    }
  }
}

/** The threshold the old rule fires at — the first radius that shows a
 *  joystick at all, and therefore the interesting one in every case below. */
const EDGE = ARENA_RADIUS * 0.55

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('campaign matches are untouched', () => {
  it('still shows the joystick against the wall on the tight axis', async () => {
    // Straight up from centre on a landscape desktop: the screen edge is 2.5
    // units past the arena wall, so there is genuinely nowhere to pull.
    const g = scene({ shape: 'circle', daily: false }).park(0, -ARENA_RADIUS)
    expect(g.isJoystickVisible.value).toBe(true)
  })

  it('shows it on the WIDE axis too, where a daily match would not', async () => {
    // 160 units of slack out to the left — a daily match hides the joystick
    // here, and this case exists to prove the campaign deliberately does not.
    // Changing that is a gameplay decision, not a QA fix.
    const g = scene({ shape: 'circle', daily: false }).park(-ARENA_RADIUS, 0)
    expect(g.isJoystickVisible.value).toBe(true)
  })

  it('keeps the joystick away from the middle of the arena', async () => {
    const g = scene({ shape: 'circle', daily: false }).park(0, 0)
    expect(g.isJoystickVisible.value).toBe(false)
  })
})

describe('daily challenge: an inscribed wall is not a screen edge', () => {
  it('hides the joystick at an oval arena wall with room to spare', async () => {
    // The oval only reaches 0.72R vertically. Sitting against that wall — one
    // blade radius inside it — still leaves ~84 units to the screen edge, well
    // clear of the ~51 the room bar asks for. This is the case QA's screenshot
    // was of, and the one the bar was chosen to cover; see the last block.
    const g = scene({ shape: 'oval', daily: true }).park(0, -(ARENA_RADIUS * 0.72 - 26))
    expect(g.isJoystickVisible.value).toBe(false)
  })

  it('hides it against a diamond wall, well inside the bounding circle', async () => {
    // A diamond's edge midpoint sits at R/sqrt(2) ~ 0.71R. Comfortably past the
    // 0.55 threshold, comfortably clear of the screen.
    const g = scene({ shape: 'diamond', daily: true }).park(100, 100)
    expect(g.isJoystickVisible.value).toBe(false)
  })

  it('hides it out to the side, where a landscape screen has 160 units of slack', async () => {
    const g = scene({ shape: 'roundedRect', daily: true }).park(-ARENA_RADIUS * 0.9, 0)
    expect(g.isJoystickVisible.value).toBe(false)
  })

  it('STILL shows it where the blade really is jammed against the screen', async () => {
    // A diamond's vertex does reach the bounding circle, and on a landscape
    // desktop the top of that circle is the top of the screen. The helper is
    // the point here — hiding it would be the opposite bug.
    const g = scene({ shape: 'diamond', daily: true }).park(0, -ARENA_RADIUS)
    expect(g.isJoystickVisible.value).toBe(true)
  })

  it('still respects the edge threshold — no joystick from the centre', async () => {
    const g = scene({ shape: 'oval', daily: true }).park(0, 0)
    expect(g.isJoystickVisible.value).toBe(false)
  })
})

describe('the rule is subtractive', () => {
  it('never shows a joystick the old threshold would have hidden', async () => {
    // Just inside 0.55R, where the campaign shows nothing. The room test runs
    // only after that threshold passes, so a daily match cannot show MORE.
    const inside = EDGE - 1
    for (const daily of [false, true]) {
      const g = scene({ shape: daily ? 'oval' : 'circle', daily }).park(0, -inside)
      expect(g.isJoystickVisible.value).toBe(false)
    }
  })

  it('hides the joystick in daily only where campaign would have shown one', async () => {
    // Same blade, same viewport, same everything but the mode: whenever the two
    // disagree it is daily that hides, never daily that shows.
    for (const [x, y] of [[-180, 0], [0, -180], [130, 130], [-120, -120]] as const) {
      const campaign = scene({ shape: 'circle', daily: false }).park(x, y)
      const daily = scene({ shape: 'circle', daily: true }).park(x, y)
      if (daily.isJoystickVisible.value) expect(campaign.isJoystickVisible.value).toBe(true)
    }
  })
})

describe('viewport shape decides which edge is tight', () => {
  it('flips the constrained axis on a portrait phone', async () => {
    // Same oval, same wall, same daily mode — a phone has vertical room to
    // spare and no horizontal room at all, exactly inverting the desktop case.
    const side = scene({ shape: 'oval', daily: true, viewport: PHONE })
      .park(-ARENA_RADIUS, 0)
    expect(side.isJoystickVisible.value).toBe(true)

    const top = scene({ shape: 'oval', daily: true, viewport: PHONE })
      .park(0, -(ARENA_RADIUS * 0.72 - 26))
    expect(top.isJoystickVisible.value).toBe(false)
  })

  it('keeps the joystick when the viewport has never been measured', async () => {
    // No frame drawn yet, so nothing is known about the screen. "No room" is
    // the safe answer: showing a helper nobody needed beats taking away the one
    // control a boxed-in player has.
    const g = useSpinnerGame()
    g.initGame([cfg()], [cfg()], false, 'default', 0, false, undefined, null, 'oval', true)
    const blade = g.playerBlades.value[0]!
    blade.x = 0
    blade.y = -ARENA_RADIUS * 0.72
    g.selectedBladeId.value = blade.id
    g.phase.value = 'player_turn'
    expect(g.isJoystickVisible.value).toBe(true)
  })
})

describe('the room bar is derived from the launch physics, not picked', () => {
  // The bar is `MAX_PULL_DISTANCE / WALL_BOOST_MAX` — the shortest pull the
  // game ever asks for a full-force shot, which is what a blade pinned against
  // a wall is granted. A blade with at least that much room in front of it is,
  // by the game's own reckoning, not fighting the screen boundary.
  const BAR = MAX_PULL_DISTANCE / 2

  it('hides the joystick just above the bar and shows it just below', async () => {
    // Straight out to the left, where the desktop viewport reaches 360, so the
    // room is exactly `360 - |x|` and the two cases straddle the bar by a unit.
    const above = scene({ shape: 'oval', daily: true }).park(-(360 - BAR - 1), 0)
    expect(above.isJoystickVisible.value).toBe(false)

    const below = scene({ shape: 'oval', daily: true }).park(-(360 - BAR + 1), 0)
    expect(below.isJoystickVisible.value).toBe(true)
  })

  it('is NOT the longer pull this particular blade would need', async () => {
    // The oval wall case that drove the choice. `wallProximityMultiplier` is
    // keyed on distance over ARENA_RADIUS — the same circle assumption the
    // threshold makes — so a blade against the oval's 0.72R wall reads as
    // barely off-centre and is granted almost no boost, leaving an "ideal" pull
    // of ~94 units against ~84 of room. Holding it to that would keep the
    // joystick exactly where QA said it did not belong.
    const g = scene({ shape: 'oval', daily: true }).park(0, -(ARENA_RADIUS * 0.72 - 26))
    expect(g.isJoystickVisible.value).toBe(false)
  })
})

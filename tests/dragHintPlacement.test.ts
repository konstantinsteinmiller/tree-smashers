import { describe, expect, it } from 'vitest'
import { computeDragHintLift, type Box } from '@/use/useDragHintPlacement'

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom })

describe('computeDragHintLift', () => {
  // 844×390 phone landscape, three spinners: the combat-log pill rides on the
  // CENTRE card, right where the centred hint sits (measured from the game).
  const hint = box(277, 306, 567, 326)
  const log = box(359, 302, 462, 326)
  const centreCard = box(375, 330, 462, 390)
  const sideCards = [box(6, 330, 99, 390), box(738, 330, 838, 390)]

  it('stays put when nothing is in the way', () => {
    expect(computeDragHintLift(hint, sideCards)).toBe(0)
  })

  it('lifts just clear of the log pill it would sit on (plus the gap)', () => {
    const lift = computeDragHintLift(hint, [log, centreCard, ...sideCards], 6)
    expect(lift).toBe(326 - (302 - 6))
    const moved = box(hint.left, hint.top - lift, hint.right, hint.bottom - lift)
    expect(moved.bottom).toBeLessThanOrEqual(log.top - 6)
  })

  it('clears a card it overlaps horizontally even without the log (desktop Spinner 2 panel)', () => {
    const desktopHint = box(495, 636, 785, 656)
    const panel = box(568, 645, 680, 714)
    const lift = computeDragHintLift(desktopHint, [panel], 6)
    expect(desktopHint.bottom - lift).toBeLessThanOrEqual(panel.top - 6)
  })

  it('keeps rising when the first lift lands it on a taller neighbour', () => {
    const low = box(300, 300, 400, 320)
    const tall = box(390, 250, 450, 318) // a taller box beside the short one
    const short = box(320, 310, 360, 330)
    const lift = computeDragHintLift(low, [short, tall], 4)
    expect(low.bottom - lift).toBeLessThanOrEqual(250 - 4)
  })

  it('ignores hidden (zero-size) boxes and respects the ceiling', () => {
    expect(computeDragHintLift(hint, [box(0, 0, 0, 0)])).toBe(0)
    expect(computeDragHintLift(hint, [log], 6, 10)).toBe(10)
  })
})

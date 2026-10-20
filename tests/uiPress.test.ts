// Global press feel (src/use/useUiPress.ts): pointerdown sinks the button
// (`.is-pressed`, held ≥ MIN_HOLD_MS so a quick phone tap still shows), the
// press / release ticks pick the right sound, a disabled-looking button answers
// with the deny shake + bonk, and opt-outs are honoured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const played: string[] = []
vi.mock('@/use/uiSfx', () => ({ playUiSfx: (n: string) => { played.push(n) } }))

const { installUiPress, MIN_HOLD_MS } = await import('@/use/useUiPress')

let uninstall: () => void = () => {}
const down = (el: Element, pointerType = 'mouse') => {
  const e = new Event('pointerdown', { bubbles: true }) as Event & { pointerType: string, button: number }
  Object.assign(e, { pointerType, button: 0 })
  el.dispatchEvent(e)
}
const up = () => window.dispatchEvent(new Event('pointerup'))
const click = (el: Element, detail = 1) => {
  const e = new MouseEvent('click', { bubbles: true, detail })
  el.dispatchEvent(e)
}

beforeEach(() => {
  vi.useFakeTimers()
  played.length = 0
  document.body.innerHTML = ''
  uninstall = installUiPress()
})
afterEach(() => {
  uninstall()
  vi.useRealTimers()
})

const mk = (html: string): HTMLElement => {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('useUiPress', () => {
  it('a .ui-btn sinks on pointerdown and stays down at least MIN_HOLD_MS', () => {
    const b = mk('<button class="ui-btn ui-btn--primary"><span>Go</span></button>')
    down(b.querySelector('span')!)
    expect(b.classList.contains('is-pressed')).toBe(true)
    up()
    expect(b.classList.contains('is-pressed')).toBe(true)
    vi.advanceTimersByTime(MIN_HOLD_MS)
    expect(b.classList.contains('is-pressed')).toBe(false)
    expect(played).toEqual(['press'])
  })

  it('the hero CTA gets the deeper press, and a completed click the release pip', () => {
    const b = mk('<button class="ui-btn ui-btn--hero">Fight</button>')
    down(b)
    click(b)
    expect(played).toEqual(['pressHero', 'release'])
  })

  it('a wrapper button sinks its inner .ui-btn (modal close X)', () => {
    const b = mk('<button><div class="ui-btn ui-btn--danger"><svg></svg></div></button>')
    down(b.querySelector('svg')!)
    expect(b.querySelector('.ui-btn')!.classList.contains('is-pressed')).toBe(true)
  })

  it('tabs and segments tick, switches are left to the component', () => {
    const t = mk('<div><button role="tab">A</button><div role="switch" data-sfx="self">S</div></div>')
    down(t.querySelector('[role=tab]')!)
    down(t.querySelector('[role=switch]')!)
    expect(played).toEqual(['tab'])
  })

  it('a disabled-looking button refuses with a shake and the deny bonk', () => {
    const b = mk('<button class="ui-btn ui-btn--premium is-disabled">Buy</button>')
    down(b)
    expect(b.classList.contains('ui-deny')).toBe(true)
    expect(b.classList.contains('is-pressed')).toBe(false)
    expect(played).toEqual(['deny'])
  })

  it('data-sfx="off" regions stay silent and untouched', () => {
    const r = mk('<div data-sfx="off"><button class="ui-btn">x</button></div>')
    down(r.querySelector('button')!)
    expect(played).toEqual([])
    expect(r.querySelector('button')!.classList.contains('is-pressed')).toBe(false)
  })

  it('keyboard activation (click without pointer) gives press + release', () => {
    const b = mk('<button class="ui-btn">Ok</button>')
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    click(b, 0)
    vi.advanceTimersByTime(100)
    expect(played).toEqual(['press', 'release'])
  })

  it('a touch inside a scroller defers the press tick to the click (no rattle on flicks)', () => {
    const s = mk('<div class="modal-content-slot"><button class="ui-card ui-card--interactive">c</button></div>')
    const card = s.querySelector('button')!
    down(card, 'touch')
    expect(played).toEqual([])
    window.dispatchEvent(new Event('pointercancel'))
    expect(card.classList.contains('is-pressed')).toBe(false)
    down(card, 'touch')
    click(card)
    expect(played).toEqual(['press'])
  })

  it('a programmatic click (no real pointer / key first) stays silent', () => {
    const b = mk('<button class="ui-btn">x</button>')
    click(b, 0)
    expect(played).toEqual([])
  })

  it('plain non-interactive elements and the canvas are ignored', () => {
    const c = mk('<div><canvas></canvas><p>text</p></div>')
    down(c.querySelector('canvas')!)
    down(c.querySelector('p')!)
    expect(played).toEqual([])
  })
})

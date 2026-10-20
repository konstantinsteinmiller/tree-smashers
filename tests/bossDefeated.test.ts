import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import {
  BOSS_DEFEATED_SKIP_AFTER_MS,
  BOSS_DEFEATED_TOTAL_MS,
  BOSS_TITLE_FILL,
  BOSS_TITLE_MIN_PX,
  bossTitleBasePx,
  bossTitleFontPx,
  BOSS_TITLE_TWO_LINE_BELOW,
  chooseTitleLayout,
  createPausableTimer,
  shouldShowBossDefeated,
  splitTitleLines
} from '@/use/bossDefeated'
import { isGamePaused, setGamePaused } from '@/use/useGamePause'
import BossDefeatedBanner from '@/components/atoms/BossDefeatedBanner.vue'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] as const }

describe('shouldShowBossDefeated', () => {
  it('shows on a won boss stage in the campaign (and on cheat stages, same roulette path)', () => {
    expect(shouldShowBossDefeated({ result: 'win', isBossStage: true, mode: 'campaign' })).toBe(true)
    expect(shouldShowBossDefeated({ result: 'win', isBossStage: true, mode: 'cheat' })).toBe(true)
  })

  it('never on a normal stage, a loss, or a non-campaign mode', () => {
    expect(shouldShowBossDefeated({ result: 'win', isBossStage: false, mode: 'campaign' })).toBe(false)
    expect(shouldShowBossDefeated({ result: 'lose', isBossStage: true, mode: 'campaign' })).toBe(false)
    expect(shouldShowBossDefeated({ result: null, isBossStage: true, mode: 'campaign' })).toBe(false)
    for (const mode of ['pvp', 'ghost'] as const) {
      expect(shouldShowBossDefeated({ result: 'win', isBossStage: true, mode })).toBe(false)
    }
  })
})

describe('createPausableTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once after the duration of RUNNING time; pauses do not count', () => {
    const done = vi.fn()
    const timer = createPausableTimer(1000, done)
    timer.resume()
    vi.advanceTimersByTime(400)
    timer.pause()
    vi.advanceTimersByTime(5000)
    expect(done).not.toHaveBeenCalled()
    expect(timer.elapsed()).toBeCloseTo(400, 0)
    timer.resume()
    vi.advanceTimersByTime(599)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledTimes(1)
    timer.finish()
    timer.resume()
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('finish() fires early exactly once; cancel() never fires', () => {
    const a = vi.fn()
    const ta = createPausableTimer(1000, a)
    ta.resume()
    ta.finish()
    ta.finish()
    vi.advanceTimersByTime(2000)
    expect(a).toHaveBeenCalledTimes(1)

    const b = vi.fn()
    const tb = createPausableTimer(1000, b)
    tb.resume()
    tb.cancel()
    tb.finish()
    vi.advanceTimersByTime(2000)
    expect(b).not.toHaveBeenCalled()
  })
})

describe('title sizing', () => {
  it('base size follows the width in portrait and the height in landscape', () => {
    const portrait = bossTitleBasePx(360, 740)
    const landscape = bossTitleBasePx(740, 360)
    expect(portrait).toBeCloseTo(360 * 0.13, 0)
    expect(landscape).toBeCloseTo(360 * 0.2, 0)
    expect(bossTitleBasePx(3840, 2160)).toBe(120)
    expect(bossTitleBasePx(100, 100)).toBeGreaterThan(BOSS_TITLE_MIN_PX)
  })

  it('keeps the base when it fits and shrinks by the overflow ratio when not', () => {
    expect(bossTitleFontPx(60, 1000, 400)).toBe(60)
    const px = bossTitleFontPx(60, 300, 600)
    expect(px).toBeLessThan(60 * (300 * BOSS_TITLE_FILL) / 600)
    expect(px).toBeGreaterThan(60 * (300 * BOSS_TITLE_FILL) / 600 * 0.95)
    expect(bossTitleFontPx(60, 10, 6000)).toBe(BOSS_TITLE_MIN_PX)
  })
})

describe('two-line fallback', () => {
  it('splits at the space nearest the middle, or not at all', () => {
    expect(splitTitleLines('Boss Defeated')).toEqual(['Boss', 'Defeated'])
    expect(splitTitleLines('Boss məğlub edildi')).toEqual(['Boss məğlub', 'edildi'])
    expect(splitTitleLines('击败首领')).toBeNull()
    expect(splitTitleLines('  ボス撃破 ')).toBeNull()
  })

  it('stays on one line while the one-line fit is big enough', () => {
    expect(chooseTitleLayout(60, 1000, 500, 300)).toEqual({ lines: 1, px: 60 })
    const mild = chooseTitleLayout(60, 300, 330, 180)
    expect(mild.lines).toBe(1)
    expect(mild.px).toBeGreaterThanOrEqual(60 * BOSS_TITLE_TWO_LINE_BELOW)
  })

  it('goes two-line when that renders larger, never when it cannot split', () => {
    const two = chooseTitleLayout(46, 288, 900, 470)
    expect(two.lines).toBe(2)
    expect(two.px).toBeGreaterThan(bossTitleFontPx(46, 288, 900))
    expect(chooseTitleLayout(46, 288, 900, null).lines).toBe(1)
  })
})

// ─── Every shipped translation fits every target screen ──────────────────────
//
// jsdom has no layout, so this uses a deliberately PESSIMISTIC advance model
// for a black-weight uppercase display face (+ the 0.14em final tracking where
// the script keeps tracking). The real component measures; this guards the
// translations: a string so long that even the measured fit would have to go
// below the floor at the smallest supported screen fails here, so the
// translator shortens it instead of the player getting a microscopic title.

const locales = import.meta.glob<Record<string, unknown>>('../src/i18n/locales/*.ts', {
  eager: true,
  import: 'default'
})

const TRACK = 0.14
const advanceEm = (ch: string): { em: number, tracked: boolean } => {
  const cp = ch.codePointAt(0)!
  if (/\s/.test(ch)) return { em: 0.3, tracked: true }
  if (/[̀-ͯัิ-ฺ็-๎ऀ-ःऺ-ॏً-ٟ]/.test(ch)) return { em: 0, tracked: false }
  if (cp >= 0x0600 && cp <= 0x06ff) return { em: 0.6, tracked: false }
  if ((cp >= 0x0900 && cp <= 0x097f) || (cp >= 0x0e00 && cp <= 0x0e7f)) return { em: 0.7, tracked: false }
  if (cp >= 0x1100) return { em: 1.0, tracked: true } // Hangul, kana, Han
  return { em: 0.82, tracked: true } // widest Latin/Cyrillic/Greek capitals, black weight
}
const widthAtPx = (text: string, px: number) =>
  [...text].reduce((w, ch) => {
    const a = advanceEm(ch)
    return w + px * (a.em + (a.tracked ? TRACK : 0))
  }, 0)

// Portrait phone, landscape phone, small iframe — each with the 2×16px gutter.
const SCREENS = [
  { name: 'portrait 320x568', w: 320, h: 568 },
  { name: 'landscape 568x320', w: 568, h: 320 },
  { name: 'iframe 800x450', w: 800, h: 450 }
]

describe('bossDefeated translations fit', () => {
  const entries = Object.entries(locales).map(([p, m]) => [p.replace(/^.*\/(.+)\.ts$/, '$1'), m.bossDefeated] as const)

  it('is present in all 39 shipped locales', () => {
    expect(entries.length).toBe(39)
    for (const [code, v] of entries) {
      expect(typeof v, code).toBe('string')
      expect((v as string).trim().length, code).toBeGreaterThan(0)
    }
  })

  for (const s of SCREENS) {
    it(`fits above the floor on ${s.name}`, () => {
      const row = s.w - 32
      for (const [code, v] of entries) {
        const text = (v as string).toUpperCase()
        const base = bossTitleBasePx(s.w, s.h)
        const halves = splitTitleLines(text)
        const { lines, px } = chooseTitleLayout(
          base,
          row,
          widthAtPx(text, base),
          halves ? Math.max(widthAtPx(halves[0], base), widthAtPx(halves[1], base)) : null
        )
        // At the chosen size the widest line must fit the row — a string that
        // only fits by overflowing at the floor size fails here.
        const need = lines === 2 && halves ? Math.max(widthAtPx(halves[0], px), widthAtPx(halves[1], px)) : widthAtPx(text, px)
        expect(need, `${code} "${text}" @${px}px`).toBeLessThanOrEqual(row)
        expect(px, code).toBeGreaterThanOrEqual(BOSS_TITLE_MIN_PX)
      }
    })
  }
})

// ─── Component: timing, pause, skip ─────────────────────────────────────────

const mountBanner = () => {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { bossDefeated: 'Boss Defeated' } } })
  return mount(BossDefeatedBanner, { global: { plugins: [i18n] }, attachTo: document.body })
}

describe('BossDefeatedBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: [...FAKE.toFake] })
    setGamePaused(false)
  })
  afterEach(() => {
    setGamePaused(false)
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('renders the translated title and emits done after the full card', async () => {
    const w = mountBanner()
    expect(w.find('.boss-defeated__title').text()).toBe('Boss Defeated')
    vi.advanceTimersByTime(BOSS_DEFEATED_TOTAL_MS - 1)
    expect(w.emitted('done')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(w.emitted('done')).toHaveLength(1)
    w.unmount()
  })

  it('freezes while the game is paused', async () => {
    const w = mountBanner()
    vi.advanceTimersByTime(1000)
    setGamePaused(true)
    await nextTick()
    expect(isGamePaused.value).toBe(true)
    expect(w.classes()).toContain('is-paused')
    vi.advanceTimersByTime(10_000)
    expect(w.emitted('done')).toBeUndefined()
    setGamePaused(false)
    await nextTick()
    vi.advanceTimersByTime(BOSS_DEFEATED_TOTAL_MS - 1000)
    expect(w.emitted('done')).toHaveLength(1)
    w.unmount()
  })

  it('a tap skips only after the title has landed', async () => {
    const w = mountBanner()
    await w.trigger('pointerdown')
    expect(w.emitted('done')).toBeUndefined()
    vi.advanceTimersByTime(BOSS_DEFEATED_SKIP_AFTER_MS)
    await w.trigger('pointerdown')
    expect(w.emitted('done')).toHaveLength(1)
    vi.advanceTimersByTime(BOSS_DEFEATED_TOTAL_MS)
    expect(w.emitted('done')).toHaveLength(1)
    w.unmount()
  })

  it('unmounting early never emits', () => {
    const w = mountBanner()
    w.unmount()
    vi.advanceTimersByTime(BOSS_DEFEATED_TOTAL_MS * 2)
    expect(w.emitted('done')).toBeUndefined()
  })
})

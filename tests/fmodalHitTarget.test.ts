// FModal close X must be the hit target at its centre (owner bug, #UX1c):
// the title header box overlaps the X's corner and sits above the frame's
// stacking context, so it must never catch the pointer — only the ribbon does.
// jsdom has no layout / scoped CSS, so this guards the rule in the SFC source
// and the decorative layers' own pointer-events.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', rel), 'utf8').replace(/\r/g, '')
const rule = (css: string, selector: string): string => {
  const i = css.indexOf(`\n${selector}\n`)
  if (i < 0) return ''
  const rest = css.slice(i + selector.length + 2)
  const end = rest.search(/\n\S/)
  return end < 0 ? rest : rest.slice(0, end)
}

describe('FModal close X is never covered by a hit-testable layer', () => {
  const fm = src('components/molecules/FModal.vue')

  it('the title / tab header ignores the pointer; only the ribbon / tabs take it', () => {
    expect(rule(fm, '.modal-header-title, .modal-header-tabs')).toMatch(/pointer-events:\s*none/)
    expect(rule(fm, '.modal-header-title .ribbon-header, .modal-header-tabs > *')).toMatch(/pointer-events:\s*auto/)
  })

  it('the header-band sparkles and the twinkle class ignore the pointer', () => {
    expect(rule(fm, '.modal-sparkles')).toMatch(/pointer-events:\s*none/)
    expect(rule(src('assets/css/design.sass'), '.ui-sparkle')).toMatch(/pointer-events:\s*none/)
  })

  it('the X wrapper stays above the header in the frame', () => {
    expect(fm).toMatch(/div\.close-button\.z-20/)
  })
})

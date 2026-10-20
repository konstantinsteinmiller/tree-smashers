// ─── Global press feel: the physical sink + the press/release ticks ────────
//
// ONE delegated listener set on the document gives every button in the game
// the same tactile response without touching each call site:
//
//   pointerdown  → `.is-pressed` on the pressable surface (held ≥ MIN_HOLD_MS
//                  so a 30 ms phone tap still visibly sinks into its lip) and
//                  the PRESS tick (`pressHero` for the hero CTA, `tab` for
//                  tabs / segments, `press` otherwise);
//   click        → the RELEASE pip (pointer), or press + release together
//                  (keyboard: Enter / Space give the same feedback);
//   refused tap  → on a disabled / `.is-disabled` button: a sideways shake
//                  (`.ui-deny`) and the dull `deny` bonk instead.
//
// Opt-outs / overrides on any ancestor:
//   data-sfx="off"     silent region (the canvas never matches anyway)
//   data-sfx="self"    the component plays its own sound (FSwitch, sliders)
//   data-sfx="<name>"  play that UiSfxName on press instead of the default
//
// Touch inside a scroller (modal bodies, lists): the press tick waits for the
// click, so flicking a list of cards does not rattle. The visual press still
// shows immediately (it is cancelled with the scroll by pointercancel).

import { playUiSfx, type UiSfxName } from '@/use/uiSfx'

const SOUNDABLE = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="option"], [role="menuitem"], summary, .ui-btn, .ui-card--interactive, [data-sfx]'
const PRESSABLE = '.ui-btn, .ui-card--interactive, [data-press]'
const SCROLLER = '.modal-content-slot, .ui-scroll, [data-scroll], .reward-body'
export const MIN_HOLD_MS = 90

const SFX_NAMES = new Set<UiSfxName>(['press', 'pressHero', 'release', 'toggleOn', 'toggleOff', 'tab', 'open', 'close', 'tick', 'reward', 'deny', 'slide'])

const isDisabled = (el: Element): boolean =>
  el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('is-disabled')

/** The element that visually sinks for this target (may be a child .ui-btn). */
const pressSurface = (el: Element): Element | null => {
  if (el.matches(PRESSABLE)) return el
  const inner = el.querySelector(':scope > .ui-btn, :scope > div > .ui-btn')
  if (inner) return inner
  return el.closest(PRESSABLE)
}

type SfxMode = { kind: 'off' } | { kind: 'self' } | { kind: 'name', name: UiSfxName }

const sfxModeOf = (el: Element): SfxMode | null => {
  const tagged = el.closest('[data-sfx]')
  const attr = tagged?.getAttribute('data-sfx')
  if (attr === 'off') return { kind: 'off' }
  if (attr === 'self') return { kind: 'self' }
  if (attr && SFX_NAMES.has(attr as UiSfxName)) return { kind: 'name', name: attr as UiSfxName }
  return null
}

const defaultPressSfx = (el: Element): UiSfxName | null => {
  const role = el.getAttribute('role')
  if (role === 'switch') return null // FSwitch plays toggleOn / toggleOff itself
  if (role === 'tab' || role === 'radio' || role === 'option') return 'tab'
  if (el.matches('.ui-btn--hero') || el.querySelector(':scope > .ui-btn--hero')) return 'pressHero'
  return 'press'
}

const pressSfxFor = (el: Element): UiSfxName | null => {
  const mode = sfxModeOf(el)
  if (mode?.kind === 'off' || mode?.kind === 'self') return null
  if (mode?.kind === 'name') return mode.name
  return defaultPressSfx(el)
}

let pressed: { el: Element, at: number, timer: number | null } | null = null
/** The press tick was deferred to the click (touch inside a scroller). */
let deferredPress: Element | null = null
/** Real input that may legitimately produce a click (programmatic
 *  `el.click()` from game code must stay silent). */
let lastDownAt = -Infinity
let lastKeyAt = -Infinity
const onKeyDown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'NumpadEnter') lastKeyAt = performance.now()
}

const releasePressed = (immediate = false): void => {
  const p = pressed
  if (!p) return
  pressed = null
  const wait = immediate ? 0 : Math.max(0, MIN_HOLD_MS - (performance.now() - p.at))
  if (wait === 0) p.el.classList.remove('is-pressed')
  else window.setTimeout(() => p.el.classList.remove('is-pressed'), wait)
}

const deny = (el: Element): void => {
  const surface = pressSurface(el) ?? el
  surface.classList.remove('ui-deny')
  // Force a restart of the shake when tapped again mid-shake.
  void (surface as HTMLElement).offsetWidth
  surface.classList.add('ui-deny')
  window.setTimeout(() => surface.classList.remove('ui-deny'), 360)
  playUiSfx('deny')
}

const onPointerDown = (e: PointerEvent): void => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const target = e.target instanceof Element ? e.target : null
  const el = target?.closest(SOUNDABLE)
  if (!el) return
  const mode = sfxModeOf(el)
  if (mode?.kind === 'off') return

  if (isDisabled(el)) {
    // Only buttons that LOOK disabled get the refusal (a steel ui-btn / card).
    if (pressSurface(el)) deny(el)
    return
  }

  releasePressed(true)
  lastDownAt = performance.now()
  const surface = pressSurface(el)
  if (surface) {
    surface.classList.add('is-pressed')
    pressed = { el: surface, at: performance.now(), timer: null }
  }

  const sfx = pressSfxFor(el)
  deferredPress = null
  if (!sfx) return
  if (e.pointerType === 'touch' && el.closest(SCROLLER)) {
    deferredPress = el
    return
  }
  playUiSfx(sfx)
}

const onPointerEnd = (): void => releasePressed()
const onPointerCancel = (): void => {
  deferredPress = null
  releasePressed(true)
}

const onClick = (e: MouseEvent): void => {
  const now = performance.now()
  if (e.detail === 0 ? now - lastKeyAt > 600 : now - lastDownAt > 3000) return
  const target = e.target instanceof Element ? e.target : null
  const el = target?.closest(SOUNDABLE)
  if (!el || isDisabled(el)) return
  const mode = sfxModeOf(el)
  if (mode?.kind === 'off' || mode?.kind === 'self') return
  const sfx = pressSfxFor(el)
  if (!sfx) return

  if (e.detail === 0) {
    // Keyboard activation: no pointerdown came first — give the whole thing.
    const surface = pressSurface(el)
    if (surface) {
      surface.classList.add('is-pressed')
      window.setTimeout(() => surface.classList.remove('is-pressed'), MIN_HOLD_MS + 30)
    }
    playUiSfx(sfx)
    window.setTimeout(() => playUiSfx('release'), 80)
    return
  }
  if (deferredPress && (deferredPress === el || deferredPress.contains(el) || el.contains(deferredPress))) {
    deferredPress = null
    playUiSfx(sfx)
    return
  }
  if (sfx !== 'tab') playUiSfx('release')
}

let installed = false

/** Install once (App.vue). Returns an uninstaller (tests, HMR). */
export const installUiPress = (root: Document = document): (() => void) => {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  const opts: AddEventListenerOptions = { capture: true, passive: true }
  root.addEventListener('pointerdown', onPointerDown as EventListener, opts)
  window.addEventListener('pointerup', onPointerEnd, opts)
  window.addEventListener('pointercancel', onPointerCancel, opts)
  window.addEventListener('blur', onPointerCancel)
  root.addEventListener('click', onClick as EventListener, opts)
  root.addEventListener('keydown', onKeyDown as EventListener, opts)
  return () => {
    installed = false
    root.removeEventListener('pointerdown', onPointerDown as EventListener, opts)
    window.removeEventListener('pointerup', onPointerEnd, opts)
    window.removeEventListener('pointercancel', onPointerCancel, opts)
    window.removeEventListener('blur', onPointerCancel)
    root.removeEventListener('click', onClick as EventListener, opts)
    root.removeEventListener('keydown', onKeyDown as EventListener, opts)
    releasePressed(true)
    deferredPress = null
    lastDownAt = -Infinity
    lastKeyAt = -Infinity
  }
}

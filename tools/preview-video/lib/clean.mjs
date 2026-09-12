// ─── Clean feed: gameplay and nothing on top of it ──────────────────────────
//
// Trailer and store specs keep asking for the same thing in the same words:
// "pure gameplay — no hardcoded text, score counters, watermarks, UI or logos".
// A game's interface lives in up to three places, and each needs its own lever:
//
//   1. the DOM — HUD bars, counters, buttons, banners, result screens, a logo.
//      Handled here, generically: everything in <body> is hidden except the
//      elements `clean.keep` names (for a canvas game, the canvas). It uses
//      `visibility`, not `display`, deliberately: a hidden element keeps its
//      box, so nothing reflows and the game's layout code — which may measure
//      its own HUD — sees the page it expects.
//
//   2. text the game PAINTS into its canvas — damage numbers, labels, captions.
//      Also generic: `CanvasRenderingContext2D.fillText/strokeText` become
//      no-ops at document start. `measureText` is untouched, so layout that
//      sizes things by their words still works. Turn it off with
//      `suppressCanvasText: false` for a game whose PIECES are font glyphs.
//
//   3. interface the game paints that is not text — a hand tray, a timer ring,
//      a minimap. Nothing outside the renderer can reach that, so the game
//      needs a flag of its own; `clean.urlParams` is where the recorder turns
//      it on (Glyphyx: `?clean=1`, see `src/game/cleanFeed.ts`).
//
// Everything here is installed as an init script, so it survives the
// re-navigations a scenario's boot does, and is in place before the game's
// first frame bakes a single word into a sprite cache.

/** @typedef {import('./types.js').CleanConfig} CleanConfig */

/**
 * @param {CleanConfig|undefined} clean
 * @returns {string[]} page-side sources, for `openPage({ initScripts })`
 */
export function cleanFeedScripts(clean) {
  const c = clean ?? {}
  const scripts = [styleSource(c)]
  if (c.suppressCanvasText !== false) scripts.push(CANVAS_TEXT_OFF_SOURCE)
  return scripts
}

function styleSource(c) {
  const keep = c.keep ?? ['canvas']
  const rules = []
  if (keep.length) {
    // Hide everything, then re-show what we keep and everything inside it.
    // `visibility` is the one hiding property a descendant can override.
    rules.push('body * { visibility: hidden !important; }')
    rules.push(`${keep.join(', ')} { visibility: visible !important; }`)
    rules.push(`${keep.map((s) => `${s} *`).join(', ')} { visibility: visible !important; }`)
  }
  if (c.hide?.length) rules.push(`${c.hide.join(', ')} { visibility: hidden !important; }`)
  rules.push('html, body { cursor: none !important; }')
  rules.push('::-webkit-scrollbar { display: none !important; }')
  if (c.css) rules.push(c.css)
  const css = rules.join('\n')
  return `
(() => {
  const put = () => {
    if (document.getElementById('__preview_clean')) return
    const el = document.createElement('style')
    el.id = '__preview_clean'
    el.textContent = ${JSON.stringify(css)}
    ;(document.head || document.documentElement).appendChild(el)
  }
  try { put() } catch (e) {}
  // A framework that rewrites <head> on mount can drop it — put it back.
  document.addEventListener('DOMContentLoaded', () => { try { put() } catch (e) {} })
})()
`
}

const CANVAS_TEXT_OFF_SOURCE = `
(() => {
  const off = (proto) => {
    if (!proto) return
    proto.fillText = function () {}
    proto.strokeText = function () {}
  }
  try { off(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype) } catch (e) {}
  try { off(window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype) } catch (e) {}
})()
`

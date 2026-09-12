// ─── Making two runs the same clip ──────────────────────────────────────────
//
// The virtual clock pins WHEN every frame is sampled. It does not pin WHAT the
// game draws, and in a game with any particle work at all that is the larger
// half of the problem: a VFX layer typically pulls `Math.random` a few hundred
// times per burst, so two runs of an identical script produce visibly different
// sparks, debris and starfields.
//
// Measured on Glyphyx before this existed: two runs of the same four-second
// scenario matched at only ~38 dB PSNR in the quiet stretches and collapsed to
// 15 dB across an explosion — every one of the 120 frames differed.
//
// So `Math.random` is replaced, at document start, with a seeded mulberry32.
// Same seed, same sparks. The seed is a knob rather than a constant because
// re-rolling it is the cheapest way to get a second take of the same beat sheet
// when the first one's particles happened to sit badly.
//
// What this deliberately does NOT touch: `crypto.getRandomValues` (a game using
// it for visuals is doing something strange, and clobbering it can break
// analytics or auth in ways that are hard to see) and `Date.now` (the clock
// owns that). If a game seeds its own RNG off the wall clock, the clock shim
// already froze it.

/**
 * A page-side source that pins `Math.random` to a seeded stream.
 *
 * @param {number} seed
 * @returns {string}
 */
export function randomSeedSource(seed) {
  return `
(() => {
  try {
    let a = ${Number(seed) >>> 0}
    const seeded = () => {
      a = (a + 0x6D2B79F5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    Math.random = seeded
    // A scenario that needs to re-roll mid-clip (a second explosion that should
    // not look identical to the first) can reach for this.
    window.__vseed = { reseed: (n) => { a = n >>> 0 }, seed: ${Number(seed) >>> 0} }
  } catch (e) { /* nothing here is worth failing a recording over */ }
})()
`
}

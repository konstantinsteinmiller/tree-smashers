/**
 * Showreel timeline math — pure, no I/O, unit-tested (tests/previewReel.test.ts).
 *
 * A reel is N recorded scene clips joined by N-1 transitions that OVERLAP the
 * outgoing scene's tail with the incoming scene's head (ffmpeg `xfade`). With
 * every length in whole FRAMES the arithmetic is exact:
 *
 *   total        = sum(len_i) - (N-1) * T
 *   offset_k     = start of transition k (joining scene k+1)
 *                = sum(len_0..len_k) - (k+1) * T           (in output frames)
 *   scene i runs = [start_i, start_i + len_i)  with start_0 = 0,
 *                  start_i = offset_{i-1}
 *
 * `planReel` takes a target total and the scenes' preferred lengths, and
 * trims the LAST scene to land on the total exactly — a 12 s reel is 360
 * frames at 30 fps, not "about 12 s".
 */

/**
 * @typedef {object} ReelSceneIn
 * @property {string} id
 * @property {number} [inFrame]     first source frame to use           (0)
 * @property {number} [frames]      preferred length in frames (before the fit)
 * @property {string} [transition]  transition INTO the next scene (ignored on the last)
 */

/**
 * @param {ReelSceneIn[]} scenes
 * @param {{ fps: number, totalFrames: number, transitionFrames: number, sourceFrames: number }} o
 *        sourceFrames = frames available in each recorded scene clip
 */
export function planReel(scenes, { fps, totalFrames, transitionFrames: T, sourceFrames }) {
  if (scenes.length < 1) throw new Error('planReel: no scenes')
  if (!(T >= 0)) throw new Error('planReel: transitionFrames must be >= 0')
  const n = scenes.length
  const lens = scenes.map((s) => s.frames ?? Math.floor(sourceFrames - (s.inFrame ?? 0)))
  // Fit: the last scene absorbs the difference.
  const withoutLast = lens.slice(0, -1).reduce((a, b) => a + b, 0)
  lens[n - 1] = totalFrames + (n - 1) * T - withoutLast

  const out = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const s = scenes[i]
    const inFrame = s.inFrame ?? 0
    const len = lens[i]
    if (len <= 2 * T) throw new Error(`planReel: scene "${s.id}" is ${len} frames — shorter than its two transitions (${2 * T})`)
    if (inFrame + len > sourceFrames) {
      throw new Error(`planReel: scene "${s.id}" needs source frames ${inFrame}..${inFrame + len - 1}, the clip has ${sourceFrames}`)
    }
    const end = start + len
    // What the viewer sees of this scene without a transition over it.
    const clearFrom = i === 0 ? start : start + T
    const clearTo = i === n - 1 ? end : end - T
    out.push({
      id: s.id,
      inFrame,
      frames: len,
      start,
      end,
      clearFrom,
      clearTo,
      midFrame: Math.floor((clearFrom + clearTo) / 2),
      transition: i < n - 1 ? (s.transition ?? 'flash') : null,
      /** xfade `offset` for the transition OUT of this scene, in seconds. */
      offsetSec: i < n - 1 ? (end - T) / fps : null
    })
    start = end - T
  }
  const total = out[n - 1].end
  if (total !== totalFrames) throw new Error(`planReel: internal — total ${total} != ${totalFrames}`)
  return { scenes: out, totalFrames, fps, transitionFrames: T, durationSec: totalFrames / fps }
}

/**
 * The transitions, as xfade names plus an optional directional motion blur
 * laid over the transition window (the "whip" in a whip-pan: a hard slide
 * alone reads as a PowerPoint slide; smeared along its direction it reads as a
 * camera whipping to the next shot).
 */
export const TRANSITIONS = {
  // Dip through white — a camera flash. Right after an explosion it reads as
  // the blast whiting out the frame.
  flash: { xfade: 'fadewhite' },
  // Whip-pans: slide + motion blur along the slide axis.
  whipLeft: { xfade: 'slideleft', blur: 'x' },
  whipUp: { xfade: 'slideup', blur: 'y' },
  // Radial sweep: the next arena sweeps in like a clock hand. (circleopen
  // was tried too: over 8 frames its soft edge reads as a plain dissolve.)
  // (xfade's `zoomin` was tried first and rejected: over 8 frames it spends
  // most of them magnified deep into the outgoing floor — a flat colour.)
  sweep: { xfade: 'radial' }
}

/**
 * Build the ffmpeg -filter_complex graph for a plan. Inputs are assumed to be
 * `-i` in scene order. Returns the graph and the label of the final video.
 *
 * @param {ReturnType<typeof planReel>} plan
 * @param {{ width: number, height: number }} size
 */
export function reelFilterGraph(plan, { width, height }) {
  const { scenes, fps, transitionFrames: T } = plan
  const parts = []
  scenes.forEach((s, i) => {
    parts.push(
      `[${i}:v]trim=start_frame=${s.inFrame}:end_frame=${s.inFrame + s.frames},setpts=PTS-STARTPTS,` +
      `fps=${fps},scale=${width}:${height},setsar=1,format=yuv444p[s${i}]`
    )
  })
  let prev = 's0'
  const blurs = []
  for (let i = 0; i < scenes.length - 1; i++) {
    const s = scenes[i]
    const tr = TRANSITIONS[s.transition]
    if (!tr) throw new Error(`reel: unknown transition "${s.transition}" (known: ${Object.keys(TRANSITIONS).join(', ')})`)
    const label = i === scenes.length - 2 ? 'xf' : `x${i}`
    parts.push(`[${prev}][s${i + 1}]xfade=transition=${tr.xfade}:duration=${(T / fps).toFixed(6)}:offset=${s.offsetSec.toFixed(6)}[${label}]`)
    prev = label
    if (tr.blur) blurs.push({ axis: tr.blur, from: s.offsetSec, to: s.offsetSec + T / fps })
  }
  if (scenes.length === 1) {
    parts.push('[s0]null[xf]')
    prev = 'xf'
  }
  // Directional motion blur on the whip windows. avgblur's sizeX/sizeY are the
  // HALF-widths; scale them to the frame so portrait and landscape smear alike.
  let last = prev
  blurs.forEach((b, i) => {
    const r = Math.max(4, Math.round((b.axis === 'x' ? width : height) * 0.03))
    const size = b.axis === 'x' ? `sizeX=${r}:sizeY=1` : `sizeX=1:sizeY=${r}`
    const out = `b${i}`
    parts.push(`[${last}]avgblur=${size}:enable='between(t,${b.from.toFixed(4)},${b.to.toFixed(4)})'[${out}]`)
    last = out
  })
  return { graph: parts.join(';'), out: last }
}

/**
 * Which reels a `showreel.mjs` run cuts, and which scenes it must record for
 * them. A reel marked `optional: '<flag>'` is cut only when that flag is on
 * the command line; the rest always are.
 *
 * @param {Record<string, { scenes: ReelSceneIn[], optional?: string }>} reels
 * @param {string[]} argv
 * @returns {{ reels: [string, ReelSceneIn[]][], sceneIds: string[] }}
 */
export function selectReels(reels, argv) {
  const picked = Object.entries(reels)
    .filter(([, r]) => !r.optional || argv.includes(r.optional))
    .map(([id, r]) => /** @type {[string, ReelSceneIn[]]} */ ([id, r.scenes]))
  if (picked.length === 0) throw new Error('no reel selected')
  const sceneIds = [...new Set(picked.flatMap(([, scenes]) => scenes.map((s) => s.id)))]
  return { reels: picked, sceneIds }
}

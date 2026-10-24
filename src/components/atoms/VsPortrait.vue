<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { drawSmasherPortrait, onPaintedArtReady } from '@/smashers/smasherAtlas'
import { FRAME_BOX, FRAME_H, FRAME_W } from '@/smashers/smasherRig'
import type { SmasherId } from '@/data/smasherCatalog'
import { alphaBounds, circleFit, type CircleFitOptions } from '@/smashers/portraitFit'

/**
 * ─── VS portrait ────────────────────────────────────────────────────────────
 *
 * One smasher on its disc for the VS screen, drawn into a canvas whose backing
 * store is exactly css size × devicePixelRatio (never below it — the render
 * sharpness rule): the hi-res painted portrait (or sheet) frame when it has
 * the pixels, the painting drawn a little smaller at 1:1 device px when it is
 * slightly short (a 3× phone), the rig as vectors otherwise
 * (`drawSmasherPortrait`; `data-drawn` / `data-art` / `data-fit` say which).
 * A portrait drawn before its painting decoded is redrawn when it arrives. Drawn once per size — the
 * caller passes the css size from the pure layout, so nothing here measures
 * the DOM (no layout reads).
 *
 * The first draw of a VS screen's portraits is spread over frames (`delay`
 * frames before drawing) so seven big vector rigs never land in one frame.
 */

const props = withDefaults(defineProps<{
  smasherId: SmasherId
  modelId?: string
  boss?: boolean
  /** Yaw frame (0 faces the camera; see smasherRig YAW_STEP). */
  frame: number
  /** CSS size of the canvas. */
  width: number
  height: number
  rim: string
  /** Frames to wait before the first draw (staggers the cost). */
  delay?: number
  /** Round opening (BossPeekBadge): measure what was drawn and fit it into
   *  the inscribed circle, optically centred (`portraitFit.ts`). Off = the
   *  FRAME_BOX layout the VS screen uses. */
  fitCircle?: CircleFitOptions | null
}>(), {
  modelId: undefined,
  boss: false,
  delay: 0,
  fitCircle: null
})

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0
let lastArt = ''
let drawnOnce = false

const draw = () => {
  const c = canvas.value
  if (!c) return
  const dpr = Math.max(1, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const w = Math.max(1, Math.round(props.width * dpr))
  const h = Math.max(1, Math.round(props.height * dpr))
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return
  const sx = w / props.width
  const sy = h / props.height
  const ppu = Math.min(props.width / FRAME_W, props.height / FRAME_H) * 0.98
  const x0 = props.width / 2
  const y0 = props.height / 2 - ((FRAME_BOX.top + FRAME_BOX.bottom) / 2) * ppu
  // Placement p' = k·p + (tx, ty) in css px over the FRAME_BOX layout.
  let k = 1, tx = 0, ty = 0
  const paint = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // Exact css → device mapping (the rounding above is ≤ 0.5 px).
    ctx.setTransform(sx * k, 0, 0, sy * k, sx * tx, sy * ty)
    // The art choice sees the device px it is really drawn at.
    return drawSmasherPortrait(ctx, props.smasherId, props.modelId, props.boss, props.frame, x0, y0, ppu, dpr * k, props.rim)
  }
  let r = paint()
  if (props.fitCircle) {
    // Measure → fit → redraw; again if the art choice changed with the size.
    for (let pass = 0; pass < 4; pass++) {
      const b = alphaBounds(ctx.getImageData(0, 0, w, h).data, w, h)
      if (!b) break
      const f = circleFit(b, w, h, props.fitCircle)
      // Only the first pass may grow the drawing: a painting short of device
      // px is drawn smaller at 1:1 rather than upscaled (drawSmasherPortrait),
      // so growing again would only chase that. Later passes shift / shrink.
      const ds = pass === 0 ? f.scale : Math.min(1, f.scale)
      const dx = f.cx - f.anchorX
      const dy = f.cy - f.anchorY
      if (Math.abs(ds - 1) < 0.01 && Math.hypot(dx, dy) < 0.75) break
      // compose A(p) = c + ds·(p − a) (device px) onto the placement
      const ax = f.anchorX / sx, ay = f.anchorY / sy
      const cx = f.cx / sx, cy = f.cy / sy
      k *= ds
      tx = cx + ds * (tx - ax)
      ty = cy + ds * (ty - ay)
      r = paint()
    }
    c.dataset.fitScale = k.toFixed(3)
  }
  lastArt = r.art
  c.dataset.drawn = r.kind
  c.dataset.art = r.art
  c.dataset.fit = r.fit.toFixed(2)
  c.dataset.dpr = String(dpr)
}

const schedule = (frames: number) => {
  cancelAnimationFrame(raf)
  if (typeof requestAnimationFrame === 'undefined') return
  const tick = () => {
    if (frames-- > 0) raf = requestAnimationFrame(tick)
    else { drawnOnce = true; draw() }
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => schedule(props.delay))
watch(() => [props.width, props.height, props.smasherId, props.modelId, props.frame, props.boss], () => schedule(0))
// a painting that decodes after the first draw upgrades the rig / sheet frame
const offArt = onPaintedArtReady(() => { if (drawnOnce && lastArt !== 'portrait') schedule(0) })
onBeforeUnmount(() => { cancelAnimationFrame(raf); offArt() })
</script>

<template lang="pug">
  canvas.vs-portrait(
    ref="canvas"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
    :data-smasher="smasherId"
  )
</template>

<style scoped lang="sass">
.vs-portrait
  display: block
  pointer-events: none
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { SKINS_PER_TOP, SPECIAL_SKINS, isModelFullyOwned, buySkin, modelImgPath } from '@/use/useModels'
import type { SpinnerModelId } from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import { resourceCache } from '@/use/useAssets'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'

export interface RouletteResult {
  type: 'multiplier' | 'skin'
  multiplier?: number
  skin?: { topPartId: TopPartId; modelId: SpinnerModelId }
}

interface Segment {
  kind: 'multiplier' | 'skin'
  color: string
  result: RouletteResult
  imgSrc?: string
  label: string
  weight: number
}

const emit = defineEmits<{
  (e: 'result', value: RouletteResult): void
}>()

// ─── Build segments ─────────────────────────────────────────────────────────
// 13 segments total:
//   3x 0.5x, 3x 1x, 2x 1.5x, 1x 2x, 1x 3x  (10 multiplier)
//   2x normal skin, 1x special skin            (3 skin)

const MULTIPLIER_DEFS: { label: string; multiplier: number; color: string; count: number; weight: number }[] = [
  { label: '0.5x', multiplier: 0.5, color: '#dc2626', count: 3, weight: 8.33 },
  { label: '1x', multiplier: 1, color: '#2563eb', count: 3, weight: 16.67 },
  { label: '1.5x', multiplier: 1.5, color: '#16a34a', count: 2, weight: 7.5 },
  { label: '2x', multiplier: 2, color: '#d97706', count: 1, weight: 10 },
  { label: '3x', multiplier: 3, color: '#a855f7', count: 1, weight: 3 }
]

const getUnownedSkins = (): { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial: boolean }[] => {
  const result: { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial: boolean }[] = []
  const seen = new Set<string>()
  for (const [topPartId, skins] of Object.entries(SKINS_PER_TOP)) {
    for (const modelId of skins) {
      if (seen.has(modelId)) continue
      seen.add(modelId)
      if (!isModelFullyOwned(modelId)) {
        result.push({ topPartId: topPartId as TopPartId, modelId, isSpecial: SPECIAL_SKINS.has(modelId) })
      }
    }
  }
  return result
}

const buildSegments = (): Segment[] => {
  const segments: Segment[] = []

  for (const def of MULTIPLIER_DEFS) {
    for (let c = 0; c < def.count; c++) {
      segments.push({
        kind: 'multiplier',
        label: def.label,
        color: def.color,
        result: { type: 'multiplier', multiplier: def.multiplier },
        weight: def.weight
      })
    }
  }

  const unowned = getUnownedSkins()
  const normalSkins = unowned.filter(s => !s.isSpecial).sort(() => Math.random() - 0.5)
  const specialSkins = unowned.filter(s => s.isSpecial).sort(() => Math.random() - 0.5)

  const skinColors = ['#db2777', '#0891b2']
  const normalSlots = Math.min(2, normalSkins.length)
  for (let i = 0; i < normalSlots; i++) {
    const skin = normalSkins[i]!
    segments.push({
      kind: 'skin',
      label: '',
      color: skinColors[i]!,
      result: { type: 'skin', skin: { topPartId: skin.topPartId, modelId: skin.modelId } },
      imgSrc: modelImgPath(skin.modelId),
      weight: 5
    })
  }

  if (specialSkins.length > 0) {
    const special = specialSkins[0]!
    segments.push({
      kind: 'skin',
      label: '',
      color: '#fbbf24',
      result: { type: 'skin', skin: { topPartId: special.topPartId, modelId: special.modelId } },
      imgSrc: modelImgPath(special.modelId),
      weight: 1
    })
  }

  return segments.sort(() => Math.random() - 0.5)
}

const segments = ref<Segment[]>(buildSegments())

// ─── Weighted outcome selection ─────────────────────────────────────────────

const pickOutcomeIndex = (): number => {
  const totalWeight = segments.value.reduce((s, seg) => s + seg.weight, 0)
  let roll = Math.random() * totalWeight
  for (let i = 0; i < segments.value.length; i++) {
    roll -= segments.value[i]!.weight
    if (roll <= 0) return i
  }
  return segments.value.length - 1
}

// ─── State ──────────────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isSpinning = ref(false)
const spinCount = ref(0)
const currentRotation = ref(0)
const showAdButton = ref(false)
const lastResult = ref<RouletteResult | null>(null)

// Wheel sizing — responsive. The previous version used a fixed 240px
// wheel + 24px arrow + result text + ribbon + spin-again/skip buttons,
// which exceeded short viewports (CG iframe in landscape with the
// portal chrome bar visible) and pushed the buttons below the fold.
// CG QA reported it 2026-05-05.
//
// Budget breakdown of the chrome AROUND the wheel inside the FReward
// overlay, used to pick a wheel size that always leaves room for the
// post-spin buttons:
//   • Ribbon (REWARDS parchment) ............ ~120 px
//   • Result text ("YOU WIN!") ............... ~60 px
//   • Spin-again / skip buttons row .......... ~60 px
//   • Gaps + overlay padding ................. ~80 px
//   ────────────────────────────────────────────────
//   Total chrome ............................ ~320 px
const MAX_WHEEL_SIZE = 240
const MIN_WHEEL_SIZE = 160
const CHROME_HEIGHT_BUDGET = 320

const computeWheelSize = (): number => {
  if (typeof window === 'undefined') return MAX_WHEEL_SIZE
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Leave room for the chrome above + below the wheel, AND the
  // overlay's horizontal padding. Floor at MIN_WHEEL_SIZE so the
  // segment labels stay legible even on very short viewports.
  const verticalRoom = vh - CHROME_HEIGHT_BUDGET
  const widthRoom = vw - 32
  return Math.round(Math.max(MIN_WHEEL_SIZE, Math.min(MAX_WHEEL_SIZE, verticalRoom, widthRoom)))
}

const wheelSize = ref(computeWheelSize())
// Arrow is 10% of wheel — keeps visual weight balanced as the wheel scales.
const arrowHeight = computed(() => Math.round(wheelSize.value * 0.1))
const canvasHeight = computed(() => wheelSize.value + arrowHeight.value)

// ─── Image cache ────────────────────────────────────────────────────────────

const skinImages = new Map<string, HTMLImageElement>()
const preloadImages = () => {
  for (const seg of segments.value) {
    if (seg.imgSrc && !skinImages.has(seg.imgSrc)) {
      const cached = resourceCache.images.get(seg.imgSrc)
      if (cached) {
        skinImages.set(seg.imgSrc, cached)
      } else {
        const img = new Image()
        img.src = seg.imgSrc
        skinImages.set(seg.imgSrc, img)
      }
    }
  }
}

// ─── Canvas drawing ─────────────────────────────────────────────────────────

const drawCoinIcon = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
  ctx.beginPath()
  ctx.arc(cx, cy, size, 0, Math.PI * 2)
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.9, 0, Math.PI * 2)
  ctx.fillStyle = '#facc15'
  ctx.fill()
  ctx.fillStyle = '#2f920e'
  ctx.font = `bold ${Math.round(size * 1.3)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$', cx, cy + 1)
}

const drawWheel = (rotation: number) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // All canvas-internal sizes scale with `wheelSize.value` so the wheel
  // stays visually consistent at any responsive size.
  const size = wheelSize.value
  const arrowH = arrowHeight.value
  const canvasH = size + arrowH
  const cx = size / 2
  const cy = size / 2 + arrowH
  const radius = size / 2 - 8
  // Proportional scale-factor relative to the design size (240px).
  const k = size / MAX_WHEEL_SIZE

  const dpr = window.devicePixelRatio || 1
  canvas.width = size * dpr
  canvas.height = canvasH * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, size, canvasH)

  // Arrow
  const arrowW = 16 * k
  ctx.fillStyle = '#facc15'
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, arrowH + 4 * k)
  ctx.lineTo(cx - arrowW, 0)
  ctx.lineTo(cx + arrowW, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.save()
  ctx.shadowColor = '#fbbf24'
  ctx.shadowBlur = 12 * k
  ctx.fill()
  ctx.restore()

  const segCount = segments.value.length
  const arcSize = (Math.PI * 2) / segCount

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)

  for (let i = 0; i < segCount; i++) {
    const seg = segments.value[i]!
    const startAngle = i * arcSize
    const endAngle = startAngle + arcSize

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radius, startAngle, endAngle)
    ctx.closePath()
    ctx.fillStyle = seg.color
    ctx.fill()

    const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius)
    grad.addColorStop(0, 'rgba(255,255,255,0.15)')
    grad.addColorStop(1, 'rgba(0,0,0,0.1)')
    ctx.fillStyle = grad
    ctx.fill()

    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.save()
    ctx.rotate(startAngle + arcSize / 2)

    if (seg.kind === 'skin' && seg.imgSrc) {
      const img = skinImages.get(seg.imgSrc)
      if (img?.complete) {
        const imgSize = 28 * k
        ctx.drawImage(img, radius * 0.5 - imgSize / 2, -imgSize / 2, imgSize, imgSize)
      }
    } else {
      drawCoinIcon(ctx, radius * 0.72, 0, 8 * k)
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(10, Math.round(13 * k))}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 4
      ctx.fillText(seg.label, radius * 0.45, 0)
      ctx.shadowBlur = 0
    }
    ctx.restore()
  }

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 4
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(0, 0, 18 * k, 0, Math.PI * 2)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = '#facc15'
  ctx.font = `bold ${Math.max(12, Math.round(16 * k))}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('\u2605', 0, 1)

  ctx.restore()
}

// ─── Spin logic ─────────────────────────────────────────────────────────────

const canShowAd = () => isRewardedReady.value

/** Emit the stored result and finalize. */
const finalizeResult = () => {
  if (!lastResult.value) return
  const result = lastResult.value
  if (result.type === 'skin' && result.skin) {
    buySkin(result.skin.topPartId, result.skin.modelId)
  }
  emit('result', result)
}

const spin = () => {
  if (isSpinning.value) return
  isSpinning.value = true
  showAdButton.value = false

  const outcomeIndex = pickOutcomeIndex()
  const segCount = segments.value.length
  const arcSize = (Math.PI * 2) / segCount

  const segCenter = outcomeIndex * arcSize + arcSize / 2
  const fullSpins = 5 + Math.floor(Math.random() * 3)
  const targetRotation = -Math.PI / 2 - segCenter + fullSpins * Math.PI * 2

  const startRotation = currentRotation.value
  const totalDelta = targetRotation - startRotation
  const duration = 3500 + Math.random() * 1000
  const startTime = performance.now()

  const animate = (now: number) => {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    const eased = 1 - Math.pow(1 - progress, 3)

    currentRotation.value = startRotation + totalDelta * eased
    drawWheel(currentRotation.value)

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      isSpinning.value = false
      spinCount.value++
      lastResult.value = segments.value[outcomeIndex]!.result

      // After first spin, offer ad respin if SDK available
      if (spinCount.value === 1 && canShowAd()) {
        showAdButton.value = true
        // Don't emit yet — wait for user decision
      } else {
        // Final spin (either first without SDK, or respin) — emit after brief pause
        setTimeout(finalizeResult, 600)
      }
    }
  }

  requestAnimationFrame(animate)
}

/** User declines ad — finalize with current result. */
const onSkipAd = () => {
  showAdButton.value = false
  setTimeout(finalizeResult, 300)
}

/** User watches ad — respin the wheel with fresh segments. */
const onAdRespin = async () => {
  showAdButton.value = false
  const ok = await showRewardedAd()
  if (ok) {
    segments.value = buildSegments()
    preloadImages()
    requestAnimationFrame(() => {
      drawWheel(currentRotation.value)
      setTimeout(spin, 300)
    })
  } else {
    // Ad failed/cancelled — finalize with first result
    setTimeout(finalizeResult, 300)
  }
}

// Recompute responsive size on viewport changes — the canvas redraws
// reactively via the `wheelSize` watcher below.
const onViewportResize = (): void => {
  const next = computeWheelSize()
  if (next !== wheelSize.value) wheelSize.value = next
}

watch(wheelSize, () => {
  // Don't fight the spin animation — it'll redraw on its next rAF tick.
  if (!isSpinning.value) drawWheel(currentRotation.value)
})

onMounted(() => {
  window.addEventListener('resize', onViewportResize)
  // visualViewport covers iframe / mobile keyboard / address-bar resizes
  // that don't fire `resize` on `window`.
  window.visualViewport?.addEventListener('resize', onViewportResize)
  preloadImages()
  requestAnimationFrame(() => {
    drawWheel(currentRotation.value)
    setTimeout(spin, 500)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportResize)
  window.visualViewport?.removeEventListener('resize', onViewportResize)
})
</script>

<template lang="pug">
  div.flex.flex-col.items-center
    div.relative
      canvas(
        ref="canvasRef"
        :style="{ width: wheelSize + 'px', height: canvasHeight + 'px' }"
      )
    //- Fixed-height slot — no layout shift
    div.flex.flex-col.items-center.gap-2(class="min-h-[3rem]")
      span.text-white.font-bold.game-text.uppercase.tracking-wider.animate-pulse(
        v-if="isSpinning"
        class="text-sm"
      ) Spinning...
      //- Post-first-spin: ad respin + skip — laid out side-by-side so the
      //- "Skip" link sits inline with the "Spin Again" CTA instead of
      //- stacking under it.
      div.flex.items-center.gap-3(v-if="showAdButton")
        button.cursor-pointer.rounded-lg.border-2.font-bold.flex.items-center.gap-2.transition-transform(
          class="px-3 py-1.5 text-sm bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] text-white hover:scale-105 active:scale-95"
          @click="onAdRespin"
        )
          img.object-contain(
            src="/images/icons/movie_128x96.webp"
            class="h-5 w-5"
          )
          span.game-text Spin Again
        button.text-white.font-bold.game-text.uppercase.tracking-wider.cursor-pointer.underline.opacity-60(
          class="text-xs hover:opacity-100"
          @click="onSkipAd"
        ) Skip
</template>

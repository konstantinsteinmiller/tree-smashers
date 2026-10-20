<script setup lang="ts">
import { displayDiamondReward } from '@/use/useCurrency'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SKINS_PER_TOP, SPECIAL_SKINS, isModelFullyOwned, buySkin, modelImgPath } from '@/use/useModels'
import { isEarnOnlySkin } from '@/data/skinCatalog'
import type { SpinnerModelId } from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import { resourceCache, getCachedImage } from '@/use/useAssets'
import { getCoinImage, coinImageReady } from '@/use/coinArt'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { flushSaveNow } from '@/use/persistedState'
import { isNative } from '@/use/useUser'
import { isLowQuality } from '@/use/useQuality'
import { preloadRouletteArt, rouletteArtReady as art, rouletteArtSrc as artSrc } from '@/use/useRouletteArt'
import { prependBaseUrl } from '@/utils/function'

export interface RouletteResult {
  type: 'multiplier' | 'skin' | 'diamonds'
  multiplier?: number
  /** `isSpecial` is only set by the skin roulette (`mode="skins"`). */
  skin?: { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial?: boolean }
  diamonds?: number
}

interface Segment {
  kind: 'multiplier' | 'skin' | 'diamonds'
  color: string
  result: RouletteResult
  imgSrc?: string
  label: string
  weight: number
}

// `result` fires ONCE PER SPIN, the moment that spin stops — the parent grants
// it right there. The first spin is therefore paid (and flushed to the save)
// BEFORE the "Spin Again" ad is even offered, and the respin, when watched,
// emits a SECOND result that is paid on top: a respin adds, never replaces.
// `done` fires once, when the wheel has nothing more to give.
// `mode="skins"` turns the wheel into the Skin Chest roulette: skin segments
// only (no coins, no jackpot), the chest's `featuredSkin` on the wheel with
// FEATURED_SKIN_WEIGHT times the chance of every other skin. The default
// (boss) wheel is untouched.
const props = withDefaults(defineProps<{
  mode?: 'boss' | 'skins'
  featuredSkin?: { topPartId: TopPartId; modelId: SpinnerModelId } | null
}>(), { mode: 'boss', featuredSkin: null })

const emit = defineEmits<{
  (e: 'result', value: RouletteResult): void
  (e: 'done'): void
}>()

const { t } = useI18n()

// ─── Build segments ─────────────────────────────────────────────────────────
// REWARD LOGIC — pinned by tests/rouletteWheel.test.ts, which replays seeded
// outcomes recorded from the pre-redesign wheel. Everything from here to the
// end of `spin()`'s target maths decides WHAT the player wins, including the
// order `Math.random` is drawn in; the rest of the file only decides how it
// looks. Never add a `Math.random` call to the drawing code.
//
// 13 segments total:
//   2x 0.75x, 3x 1x, 2x 2x, 2x 3x           (9 multiplier)
//   1x 5-diamond jackpot (ultra-rare)
//   2x normal skin, 1x special skin            (3 skin)
//
// `weight` is PER SEGMENT; the multiplier weights sum to 100, so each kind's
// `count * weight` is its share of the multiplier outcomes in percent:
//   0.75x 12.5% (1/8) · 1x 27.5% · 2x 40% · 3x 20%
// Skins (5 + 5 + 1) and the jackpot sit on top of that 100.

const MULTIPLIER_DEFS: { label: string; multiplier: number; color: string; count: number; weight: number }[] = [
  { label: '0.75x', multiplier: 0.75, color: '#fdf2d8', count: 2, weight: 12.5 / 2 },
  { label: '1x', multiplier: 1, color: '#b5e67a', count: 3, weight: 27.5 / 3 },
  { label: '2x', multiplier: 2, color: '#c4ebff', count: 2, weight: 40 / 2 },
  { label: '3x', multiplier: 3, color: '#ff9e93', count: 2, weight: 20 / 2 }
]

/** Diamonds granted by the jackpot segment. */
const DIAMOND_JACKPOT = 5

/** Currency + amount the jackpot segment should DISPLAY. Diamonds on a
 *  normal build; coins at the diamond rate on a single-currency one. */
const jackpotDisplay = displayDiamondReward(DIAMOND_JACKPOT)
// Weight tuned so the jackpot is ~0.25% of the wheel (total weight ≈ 111) —
// it occupies a visible slice but practically never lands.
const DIAMOND_JACKPOT_WEIGHT = 0.26

const getUnownedSkins = (): { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial: boolean }[] => {
  const result: { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial: boolean }[] = []
  const seen = new Set<string>()
  for (const [topPartId, skins] of Object.entries(SKINS_PER_TOP)) {
    for (const modelId of skins) {
      if (seen.has(modelId)) continue
      seen.add(modelId)
      // Boss trophies are earn-only: never a wheel segment.
      if (isEarnOnlySkin(modelId)) continue
      if (!isModelFullyOwned(modelId)) {
        result.push({ topPartId: topPartId as TopPartId, modelId, isSpecial: SPECIAL_SKINS.has(modelId) })
      }
    }
  }
  return result
}

/** Skin-roulette tuning: the chest's previewed skin vs each other skin. */
const FEATURED_SKIN_WEIGHT = 3
/** Other unowned skins drawn onto the skin roulette next to the featured one. */
const SKIN_ROULETTE_OTHERS = 7
// Cozy palette (tailwind.css tokens): leaf-300, cream-200, sky-200, berry-300, wood-300, plum-300, sun-200.
const SKIN_ROULETTE_COLORS = ['#b5e67a', '#f7e3b8', '#c4ebff', '#ff9e93', '#deb07a', '#d7b0ff', '#fff0a8']

const skinSegment = (skin: { topPartId: TopPartId; modelId: SpinnerModelId; isSpecial: boolean }, color: string, weight: number): Segment => ({
  kind: 'skin',
  label: '',
  color,
  result: { type: 'skin', skin: { topPartId: skin.topPartId, modelId: skin.modelId, isSpecial: skin.isSpecial } },
  imgSrc: modelImgPath(skin.modelId),
  weight
})

/** Skin Chest roulette: unowned skins only, the featured one weighted up.
 *  A featured skin that got owned in the meantime simply isn't on the wheel. */
const buildSkinSegments = (): Segment[] => {
  const unowned = getUnownedSkins()
  const featuredId = props.featuredSkin?.modelId
  const featured = unowned.find(s => s.modelId === featuredId) ?? null
  const others = unowned.filter(s => s.modelId !== featuredId).sort(() => Math.random() - 0.5)
    .slice(0, SKIN_ROULETTE_OTHERS)
  const segs = others.map((s, i) => skinSegment(s, SKIN_ROULETTE_COLORS[i % SKIN_ROULETTE_COLORS.length]!, 1))
  if (featured) segs.push(skinSegment(featured, '#ffc933', FEATURED_SKIN_WEIGHT))
  return segs.sort(() => Math.random() - 0.5)
}

const buildSegments = (): Segment[] => {
  if (props.mode === 'skins') return buildSkinSegments()
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

  // Ultra-rare diamond jackpot.
  //
  // On a single-currency build (Poki) it pays coins at the diamond rate —
  // 5 diamonds becomes 15 000 coins, which reads as a jackpot against a
  // campaign that pays 100–3 500 per stage. `addDiamonds` performs the
  // conversion, so the segment keeps its diamond-denominated `result` and
  // only the LABEL and the drawn icon change.
  segments.push({
    kind: 'diamonds',
    label: String(jackpotDisplay.amount),
    color: '#ffc933',
    result: { type: 'diamonds', diamonds: DIAMOND_JACKPOT },
    weight: DIAMOND_JACKPOT_WEIGHT
  })

  const unowned = getUnownedSkins()
  const normalSkins = unowned.filter(s => !s.isSpecial).sort(() => Math.random() - 0.5)
  const specialSkins = unowned.filter(s => s.isSpecial).sort(() => Math.random() - 0.5)

  const skinColors = ['#d7b0ff', '#d7b0ff']
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
      color: '#d7b0ff',
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

const faceRef = ref<HTMLCanvasElement | null>(null)
const rotorRef = ref<HTMLElement | null>(null)
const pointerRef = ref<HTMLElement | null>(null)
const isSpinning = ref(false)
const spinCount = ref(0)
/** Wheel rotation in radians. Deliberately NOT bound in the template: the spin
 *  loop writes the rotor's transform directly, so a frame of the spin costs one
 *  compositor transform and no Vue render. */
const currentRotation = ref(0)
const showAdButton = ref(false)
const lastResult = ref<RouletteResult | null>(null)
/** The wheel has come to rest on a result (highlight + burst + bulb flash). */
const showWin = ref(false)

// ─── Sizing ─────────────────────────────────────────────────────────────────
// Responsive. The first version used a fixed 240px wheel + 24px arrow +
// result text + ribbon + spin-again/skip buttons, which exceeded short
// viewports (CG iframe in landscape with the portal chrome bar visible) and
// pushed the buttons below the fold. CG QA reported it 2026-05-05.
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
//
// `wheelSize` is now the WHOLE wheel — rim, bulbs and pointer included (the
// pointer overlaps the rim instead of sitting above the canvas). The old wheel
// was `size + 10 %` tall because of its arrow, so the floor moved from 160 to
// 176 to keep the same total height on the shortest screens, and the height
// term no longer overshoots the budget by that 10 %. The cap went from 240 to
// 300 because the rim now takes the outer quarter of the radius; where the
// height budget allows it, the prize face keeps its old size.
const MAX_WHEEL_SIZE = 300
const MIN_WHEEL_SIZE = 176
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

// ─── Geometry ───────────────────────────────────────────────────────────────
// Fractions of `wheelSize`, REGISTERED TO THE SHIPPED RIM PAINTING
// (public/images/roulette/rim_560x560.webp, measured on its keyed alpha):
//   opening (inner lip) r 0.351–0.366 (median 0.357) · bevel to 0.39 ·
//   ruby pinstripe ≈ 0.40 · filigree band 0.412–0.46 · outer ink 0.498.
// The reference sheet in art/roulette/ asked for an opening of 0.40 and the
// painter returned 0.357, so the face was fitted to the painting rather than
// the other way round. A re-paint must be re-measured and these re-registered.
const GEO = {
  /** Radius of the turning segment face: just past the lip's widest point, so
   *  the canvas edge is always tucked under the rim. */
  disk: 0.372,
  /** Radius the bulbs sit on — the middle of the rim's filigree band. */
  bulbRing: 0.436,
  /** Bulb diameter (the band is 0.048 wide). */
  bulb: 0.052,
  /** Hub diameter. */
  hub: 0.21
} as const
const BULB_COUNT = 20
const TAU = Math.PI * 2

const pct = (n: number) => `${(n * 100).toFixed(3)}%`

/** Box of the turning face (and of every overlay that registers with it). */
const diskBox = {
  left: pct(0.5 - GEO.disk),
  top: pct(0.5 - GEO.disk),
  width: pct(GEO.disk * 2),
  height: pct(GEO.disk * 2)
}

/** Bulb positions never change with the wheel size — they are percentages of
 *  the stage — so this is computed once, not per resize. */
const BULBS = Array.from({ length: BULB_COUNT }, (_, i) => {
  // Offset half a step so no bulb sits under the pointer's cap at 12 o'clock.
  const a = -Math.PI / 2 + ((i + 0.5) / BULB_COUNT) * TAU
  return {
    i,
    style: {
      left: pct(0.5 + Math.cos(a) * GEO.bulbRing),
      top: pct(0.5 + Math.sin(a) * GEO.bulbRing),
      width: pct(GEO.bulb),
      height: pct(GEO.bulb)
    }
  }
})

/** The lit state is animated per GROUP (every 4th bulb), not per bulb: four
 *  opacity animations on four layers instead of twenty. Every running CSS
 *  animation is re-resolved on each main-thread frame, and the spin loop makes
 *  a main-thread frame every vsync — measured, the per-bulb version cost about
 *  2 ms of style recalc per frame at 4x CPU throttle. Four groups also give the
 *  classic marquee "theatre chase" for free. */
const BULB_GROUPS = 4
const BULBS_BY_GROUP = Array.from({ length: BULB_GROUPS }, (_, g) => BULBS.filter(b => b.i % BULB_GROUPS === g))

/** Result burst — deterministic fan (no Math.random, see the note at the top). */
const SPARK_COUNT = 12
const sparks = computed(() => {
  const s = wheelSize.value
  return Array.from({ length: SPARK_COUNT }, (_, i) => {
    const a = (i / SPARK_COUNT) * TAU + 0.26
    const dist = s * (i % 2 === 0 ? 0.3 : 0.21)
    return {
      i,
      style: {
        '--dx': `${(Math.cos(a) * dist).toFixed(1)}px`,
        '--dy': `${(Math.sin(a) * dist).toFixed(1)}px`,
        animationDelay: `${(i % 3) * 45}ms`
      }
    }
  })
})

/** The winning wedge, drawn in the face's own unit circle: it always sits at
 *  12 o'clock because that is where the pointer stops the winner. */
const winWedgePath = computed(() => {
  const arc = TAU / Math.max(1, segments.value.length)
  const a0 = -Math.PI / 2 - arc / 2
  const a1 = -Math.PI / 2 + arc / 2
  const r0 = GEO.hub / 2 / GEO.disk
  const r1 = 0.985
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(4)} ${(r * Math.sin(a)).toFixed(4)}`
  return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`
})

// ─── Image cache ────────────────────────────────────────────────────────────

let faceQueued = false
/** Coalesce redraw requests (image/font arrivals, resize) into one per frame.
 *  The face is only ever drawn when its CONTENT changes — never per spin frame. */
const queueFaceDraw = () => {
  if (faceQueued) return
  faceQueued = true
  requestAnimationFrame(() => {
    faceQueued = false
    drawFace()
  })
}

const whenLoaded = (img: HTMLImageElement) => {
  if (!img.complete) img.addEventListener('load', queueFaceDraw, { once: true })
}

const skinImages = new Map<string, HTMLImageElement>()
const preloadImages = () => {
  for (const seg of segments.value) {
    if (seg.imgSrc && !skinImages.has(seg.imgSrc)) {
      const cached = resourceCache.images.get(seg.imgSrc)
      if (cached) {
        skinImages.set(seg.imgSrc, cached)
        whenLoaded(cached)
      } else {
        const img = new Image()
        img.src = seg.imgSrc
        skinImages.set(seg.imgSrc, img)
        whenLoaded(img)
      }
    }
  }
}

// The shipped diamond painting, same file every other diamond in the UI uses.
const diamondImg = jackpotDisplay.currency === 'diamonds'
  ? getCachedImage(prependBaseUrl('images/icons/diamond_256x256.webp'))
  : null
if (diamondImg) whenLoaded(diamondImg)
// The currency coin painting (`@/use/coinArt`); `drawCoin` is its fallback.
const coinImg = getCoinImage()
if (coinImg) whenLoaded(coinImg)

// ─── Face drawing (static — runs when the segments/size change, not per frame)

// ─── Cozy palette (mirrors the @theme tokens in tailwind.css; canvas cannot
// read CSS variables cheaply, so the hexes are repeated here). Flat fills only:
// no gradients, no shadowBlur, no ctx.filter.
const C = {
  ink: '#3a2314',
  wood700: '#6e4527',
  wood600: '#8c5a32',
  wood300: '#deb07a',
  cream50: '#fffaf0',
  cream200: '#f7e3b8',
  leaf300: '#b5e67a',
  sun200: '#fff0a8',
  sun400: '#ffc933',
  sun600: '#c98208',
  sky200: '#c4ebff',
  berry300: '#ff9e93',
  plum300: '#d7b0ff'
} as const

/** Rotation the multiplier wedges cycle through: leaf / cream / sun / sky /
 *  berry-light / wood-light. */
const FACE_CYCLE = [C.leaf300, C.cream200, C.sun200, C.sky200, C.berry300, C.wood300]

/** Face colour per segment, by position: the boss wheel's jackpot is sun gold
 *  and its skins plum-light; every other wedge takes the next colour of the
 *  cycle that differs from both neighbours (the wheel wraps round). The skin
 *  roulette keeps each segment's own colour (featured = sun gold). Pure
 *  function of the segment list — no Math.random. */
const faceColors = (segs: Segment[], skinMode: boolean): string[] => {
  const n = segs.length
  const fixed = segs.map(seg => {
    if (skinMode) return seg.color
    if (seg.kind === 'diamonds') return C.sun400
    if (seg.kind === 'skin') return C.plum300
    return null
  })
  const out: string[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const f = fixed[i]
    if (f) {
      out.push(f)
      continue
    }
    const prev = i > 0 ? out[i - 1] : null
    const next = fixed[(i + 1) % n] ?? (i === n - 1 ? out[0] : null)
    let c = FACE_CYCLE[k % FACE_CYCLE.length]!
    for (let tries = 0; tries < FACE_CYCLE.length && (c === prev || c === next); tries++) {
      k++
      c = FACE_CYCLE[k % FACE_CYCLE.length]!
    }
    k++
    out.push(c)
  }
  return out
}

const LABEL_FONT = "Nunito, 'Arial Rounded MT Bold', 'Arial Black', sans-serif"

const drawCoin = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = C.ink
  ctx.fill()
  // Flat concentric discs (no gradient): rim, face, highlight.
  ctx.beginPath()
  ctx.arc(x, y, r * 0.84, 0, TAU)
  ctx.fillStyle = C.sun600
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x - r * 0.06, y - r * 0.06, r * 0.66, 0, TAU)
  ctx.fillStyle = C.sun400
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.2, 0, TAU)
  ctx.fillStyle = C.sun200
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.62, 0, TAU)
  ctx.strokeStyle = C.sun600
  ctx.lineWidth = Math.max(1, r * 0.1)
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.font = `900 ${Math.round(r * 1.15)}px ${LABEL_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$', x, y + r * 0.06)
}

const drawDiamondFallback = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(size * 0.8, -size * 0.15)
  ctx.lineTo(0, size)
  ctx.lineTo(-size * 0.8, -size * 0.15)
  ctx.closePath()
  ctx.fillStyle = C.plum300
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

/** Four-point glint, for the rare segments. */
const drawGlint = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fillStyle = C.cream50
  ctx.fill()
  ctx.strokeStyle = C.ink
  ctx.lineWidth = Math.max(1, r * 0.18)
  ctx.stroke()
}


const drawFace = () => {
  const canvas = faceRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const D = Math.round(wheelSize.value * GEO.disk * 2)
  const R = D / 2
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const px = Math.round(D * dpr)
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px
    canvas.height = px
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, px, px)
  // Centre origin, CSS-pixel units.
  ctx.setTransform(dpr, 0, 0, dpr, R * dpr, R * dpr)

  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, TAU)
  ctx.clip()

  const segCount = segments.value.length
  const arcSize = TAU / segCount
  const hubR = (GEO.hub / 2 / GEO.disk) * R

  // Segment faces: one flat fill per wedge (cozy palette, see faceColors).
  const colors = faceColors(segments.value, props.mode === 'skins')
  for (let i = 0; i < segCount; i++) {
    const a0 = i * arcSize
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, R + 1, a0, a0 + arcSize)
    ctx.closePath()
    ctx.fillStyle = colors[i]!
    ctx.fill()
  }

  // Ink dividers, each ending in a little wooden peg the pointer ticks against.
  for (let i = 0; i < segCount; i++) {
    ctx.save()
    ctx.rotate(i * arcSize)
    ctx.beginPath()
    ctx.moveTo(hubR * 0.95, 0)
    ctx.lineTo(R, 0)
    ctx.strokeStyle = C.ink
    ctx.lineWidth = Math.max(2, R * 0.026)
    ctx.lineCap = 'round'
    ctx.stroke()

    const pr = Math.max(2, R * 0.036)
    ctx.beginPath()
    ctx.arc(R * 0.925, 0, pr, 0, TAU)
    ctx.fillStyle = C.wood600
    ctx.fill()
    ctx.lineWidth = Math.max(1, pr * 0.4)
    ctx.strokeStyle = C.ink
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(R * 0.925, 0, pr * 0.35, 0, TAU)
    ctx.fillStyle = C.cream200
    ctx.fill()
    ctx.restore()
  }

  // Ink outline where the face meets the rim and the hub (circular, so baking
  // them into the turning layer is invisible).
  ctx.strokeStyle = C.ink
  ctx.lineWidth = Math.max(2, R * 0.03)
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.985, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, hubR * 1.02, 0, TAU)
  ctx.stroke()

  // Segment content: labels, currency icons, skins. Laid out TANGENTIALLY —
  // "up" points out of the wheel — so whichever segment the pointer stops on
  // reads upright at 12 o'clock, which is the only place a player reads it.
  const halfChord = (r: number) => Math.sin(arcSize / 2) * r
  const labelR = R * 0.7
  for (let i = 0; i < segCount; i++) {
    const seg = segments.value[i]!
    ctx.save()
    ctx.rotate(i * arcSize + arcSize / 2)

    if (seg.kind === 'skin' && seg.imgSrc) {
      const mx = R * 0.63
      const mr = Math.min(R * 0.17, halfChord(mx) * 0.9)
      ctx.save()
      ctx.translate(mx, 0)
      ctx.rotate(Math.PI / 2)
      ctx.beginPath()
      ctx.arc(0, 0, mr, 0, TAU)
      ctx.fillStyle = C.cream50
      ctx.fill()
      ctx.lineWidth = Math.max(1.5, R * 0.02)
      ctx.strokeStyle = C.ink
      ctx.stroke()
      const img = skinImages.get(seg.imgSrc)
      if (img?.complete && img.naturalWidth > 0) {
        const s = mr * 2.05
        ctx.drawImage(img, -s / 2, -s / 2, s, s)
      }
      if (seg.weight <= 1) {
        // The special skin: the rarest face on the wheel gets a sparkle.
        drawGlint(ctx, mr * 0.8, -mr * 0.95, R * 0.05)
        drawGlint(ctx, -mr * 0.9, mr * 0.7, R * 0.035)
      }
      ctx.restore()
    } else {
      // Label on the outside, currency icon under it towards the hub.
      // Font sized to the chord so "2x" never spills into a neighbour; the
      // maxWidth squeezes the longer "0.75x" into the same chord.
      const fs = Math.max(10, Math.min(Math.round(R * 0.18), Math.floor(halfChord(labelR) * 0.85)))
      const labelMaxW = halfChord(labelR) * 1.7
      ctx.save()
      ctx.translate(labelR, 0)
      ctx.rotate(Math.PI / 2)
      ctx.font = `900 ${fs}px ${LABEL_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(2.5, fs * 0.22)
      ctx.strokeStyle = C.cream50
      ctx.strokeText(seg.label, 0, 1, labelMaxW)
      ctx.fillStyle = C.ink
      ctx.fillText(seg.label, 0, 1, labelMaxW)
      ctx.restore()

      // The jackpot segment keeps `kind: 'diamonds'` (that is what the result
      // handler and `addDiamonds` key off); only the drawn icon follows the
      // DISPLAY currency, which is coins on a single-currency build.
      const iconR = R * 0.46
      ctx.save()
      ctx.translate(iconR, 0)
      ctx.rotate(Math.PI / 2)
      if (seg.kind === 'diamonds' && jackpotDisplay.currency === 'diamonds') {
        if (diamondImg?.complete && diamondImg.naturalWidth > 0) {
          const s = R * 0.2
          ctx.drawImage(diamondImg, -s / 2, -s / 2, s, s)
        } else {
          drawDiamondFallback(ctx, 0, 0, R * 0.075)
        }
        drawGlint(ctx, R * 0.07, -R * 0.06, R * 0.035)
      } else {
        const coinR = Math.min(R * 0.08, halfChord(iconR) * 0.8)
        if (coinImageReady(coinImg)) ctx.drawImage(coinImg, -coinR, -coinR, coinR * 2, coinR * 2)
        else drawCoin(ctx, 0, 0, coinR)
      }
      ctx.restore()
    }
    ctx.restore()
  }

  ctx.restore()
}

// ─── Rotation + pointer ticker (the only per-frame work) ────────────────────

const applyRotation = (rad: number) => {
  const el = rotorRef.value
  if (el) el.style.transform = `rotate(${rad}rad)`
}

// The pointer is knocked sideways by each divider peg as it passes and springs
// back. Driven analytically from the wheel angle, so it can never drift out of
// step with the segments, and written as a transform on its own layer.
const POINTER_MAX_DEG = 16
let tickBoundary = 0
let tickAt = -1e9
let tickPrevAt = -1e9
let pointerDeg = 0
let frameParity = false

const setPointerDeg = (deg: number) => {
  if (Math.abs(deg - pointerDeg) < 0.05) return
  pointerDeg = deg
  const el = pointerRef.value
  if (el) el.style.transform = `rotate(${deg.toFixed(2)}deg)`
}

const resetTicker = (rotation: number, arc: number) => {
  tickBoundary = Math.floor((rotation + Math.PI / 2) / arc)
  tickAt = -1e9
  tickPrevAt = -1e9
}

const tickPointer = (rotation: number, arc: number, now: number) => {
  // Wheel-space progress through the segment under the pointer: 0 just after a
  // peg went by, → 1 as the next peg arrives (the wheel turns clockwise).
  const pos = (rotation + Math.PI / 2) / arc
  const boundary = Math.floor(pos)
  if (boundary !== tickBoundary) {
    tickBoundary = boundary
    tickPrevAt = tickAt
    tickAt = now
  }
  const v = pos - boundary
  const push = v > 0.7 ? -POINTER_MAX_DEG * ((v - 0.7) / 0.3) : 0
  const since = now - tickAt
  const back = since < 400 ? -POINTER_MAX_DEG * Math.exp(-since / 50) * Math.cos(since / 30) : 0
  let deg = Math.abs(push) > Math.abs(back) ? push : back
  // Pegs arriving faster than the pointer can spring back: it rattles, held
  // over, instead of strobing between two poses.
  frameParity = !frameParity
  if (tickAt - tickPrevAt < 45) deg = -POINTER_MAX_DEG * (frameParity ? 0.9 : 0.72)
  setPointerDeg(deg)
}

// ─── Spin logic ─────────────────────────────────────────────────────────────

const canShowAd = () => isRewardedReady.value

/** Pause between the wheel stopping and the result being handed over — long
 *  enough for the win highlight and burst to register. */
const RESULT_HOLD_MS = 1000

/** Grant a landed spin: the skin through `buySkin` (the save path), the rest
 *  by the parent on `result`. Called exactly once per spin. */
const grantResult = (result: RouletteResult) => {
  if (result.type === 'skin' && result.skin) {
    buySkin(result.skin.topPartId, result.skin.modelId)
  }
  emit('result', result)
}

let finished = false
/** The wheel is done — hand over to the celebration. Idempotent. */
const finish = () => {
  if (finished) return
  finished = true
  emit('done')
}

const spin = () => {
  if (isSpinning.value) return
  isSpinning.value = true
  showAdButton.value = false
  showWin.value = false

  const outcomeIndex = pickOutcomeIndex()
  const segCount = segments.value.length
  const arcSize = (Math.PI * 2) / segCount

  const segCenter = outcomeIndex * arcSize + arcSize / 2
  const fullSpins = 5 + Math.floor(Math.random() * 3)
  const targetRotation = -Math.PI / 2 - segCenter + fullSpins * Math.PI * 2

  // Start from the rest angle folded into one turn. Without this a respin
  // started from the first spin's accumulated 5–7 turns, so its delta to a new
  // 5–7-turn target could be tiny or negative — the wheel crawled or ran
  // BACKWARDS. The winning segment depends on the target alone, so this changes
  // how the wheel travels, never where it stops.
  const startRotation = ((currentRotation.value % TAU) + TAU) % TAU
  const totalDelta = targetRotation - startRotation
  const duration = 3500 + Math.random() * 1000
  const startTime = performance.now()
  resetTicker(startRotation, arcSize)

  const animate = (now: number) => {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    const eased = 1 - Math.pow(1 - progress, 3)

    currentRotation.value = startRotation + totalDelta * eased
    applyRotation(currentRotation.value)
    tickPointer(currentRotation.value, arcSize, now)

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      setPointerDeg(0)
      isSpinning.value = false
      spinCount.value++
      const landed = segments.value[outcomeIndex]!.result
      lastResult.value = landed
      showWin.value = true

      // Paid NOW, before any ad is offered — see the note on `emit`.
      grantResult(landed)

      // After the first spin, offer the ad respin if an ad is ready.
      // (A skin roulette that just won the last unowned skin has nothing
      // left to put on a second wheel.)
      if (spinCount.value === 1 && canShowAd()
        && (props.mode !== 'skins' || getUnownedSkins().length > 0)) {
        showAdButton.value = true
      } else {
        // Last spin (the first with no ad on offer, or the respin) — hand
        // over after the win highlight has registered.
        setTimeout(finish, RESULT_HOLD_MS)
      }
    }
  }

  requestAnimationFrame(animate)
}

/** User declines the respin — the first reward is already granted. */
const onSkipAd = () => {
  showAdButton.value = false
  setTimeout(finish, 300)
}

let respinRequested = false
/** User watches an ad — respin the wheel with fresh segments for a SECOND,
 *  additional reward. The first spin was granted when it landed; its skin is
 *  now owned, so the rebuilt wheel no longer offers it (skin segments are only
 *  ever drawn from unowned skins — the wheel's duplicate rule). */
const onAdRespin = async () => {
  // One respin per boss win, and a double tap must not start two ads.
  if (respinRequested || !showAdButton.value) return
  respinRequested = true
  showAdButton.value = false
  // The first reward is already in localStorage; push it to the platform's
  // cloud store too before the ad, so a crash or reload during the ad
  // cannot lose it.
  await flushSaveNow()
  const ok = await showRewardedAd({ kind: 'respin' })
  if (ok) {
    segments.value = buildSegments()
    preloadImages()
    showWin.value = false
    requestAnimationFrame(() => {
      drawFace()
      setTimeout(spin, 300)
    })
  } else {
    // Skipped / unfilled / declined — no second reward; keep the first.
    setTimeout(finish, 300)
  }
}

// Recompute responsive size on viewport changes — the face redraws via the
// `wheelSize` watcher below; the spin itself never needs a redraw.
const onViewportResize = (): void => {
  const next = computeWheelSize()
  if (next !== wheelSize.value) wheelSize.value = next
}

watch(wheelSize, queueFaceDraw)

preloadRouletteArt()

onMounted(() => {
  window.addEventListener('resize', onViewportResize)
  // visualViewport covers iframe / mobile keyboard / address-bar resizes
  // that don't fire `resize` on `window`.
  window.visualViewport?.addEventListener('resize', onViewportResize)
  preloadImages()
  applyRotation(currentRotation.value)
  // The labels are set in the game's display face; redraw once it is ready if
  // the first draw had to fall back.
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts?.load) {
    fonts.load(`900 16px ${LABEL_FONT}`).then(queueFaceDraw).catch(() => {
    })
  }
  requestAnimationFrame(() => {
    drawFace()
    setTimeout(spin, 500)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportResize)
  window.visualViewport?.removeEventListener('resize', onViewportResize)
})
</script>

<template lang="pug">
  div.flex.flex-col.items-center(
    data-roulette
    :data-spinning="isSpinning ? 'true' : 'false'"
  )
    div.wheel-stage.relative.shrink-0(
      :class="{ 'is-spinning': isSpinning, 'is-won': showWin, 'is-low': isLowQuality }"
      :style="{ width: wheelSize + 'px', height: wheelSize + 'px', '--ws': wheelSize + 'px' }"
    )
      //- Soft sunny halo + slow rays behind the wheel (CSS only, flat fills).
      div.wheel-backdrop(aria-hidden="true")
        div.wheel-halo
        div.wheel-rays
      //- The ONLY element that turns during the spin: one composited layer
      //- holding the face canvas, which is painted once per set of segments.
      div.wheel-rotor(ref="rotorRef" :style="diskBox")
        canvas.wheel-face(ref="faceRef")
      svg.wheel-win(
        v-if="showWin"
        :style="diskBox"
        viewBox="-1 -1 2 2"
        aria-hidden="true"
      )
        path.win-glow(:d="winWedgePath")
        path.win-edge(:d="winWedgePath")
      //- Rim: flat wooden ring (CSS). A painted rim is used only if one is
      //- listed in useRouletteArt (none is, since the cozy restyle).
      img.wheel-rim(
        v-if="art.rim"
        :src="artSrc.rim"
        alt=""
        draggable="false"
      )
      div.wheel-rim-fallback(v-else aria-hidden="true")
      //- Cream bolts on the wooden rim; four group layers (every 4th bolt)
      //- turn sun-yellow in a chase / flash as a whole.
      div.wheel-bulbs(aria-hidden="true")
        span.wheel-bulb(
          v-for="b in BULBS"
          :key="b.i"
          :style="b.style"
        )
          img.bulb-img(
            v-if="art.bulbOff"
            :src="artSrc.bulbOff"
            alt=""
            draggable="false"
          )
          span.bulb-fallback(v-else)
        div.bulb-group(
          v-for="(group, g) in BULBS_BY_GROUP"
          :key="g"
          :class="`g${g}`"
          :style="{ '--g': String(g) }"
        )
          span.wheel-bulb(
            v-for="b in group"
            :key="b.i"
            :style="b.style"
          )
            span.bulb-lit
              img.bulb-lit-img(
                v-if="art.bulbOn"
                :src="artSrc.bulbOn"
                alt=""
                draggable="false"
              )
      img.wheel-hub(
        v-if="art.hub"
        :src="artSrc.hub"
        alt=""
        draggable="false"
      )
      div.wheel-hub(v-else aria-hidden="true")
        div.wheel-hub-fallback
      //- Pointer, pivoting on its cap; the spin loop knocks it per peg.
      div.wheel-pointer(ref="pointerRef" aria-hidden="true")
        img.pointer-img(
          v-if="art.pointer"
          :src="artSrc.pointer"
          alt=""
          draggable="false"
        )
        svg.pointer-img(v-else viewBox="0 0 100 154")
          //- Flat wooden ticker with ink outline: plank tip + round cap + cream bolt.
          path(
            d="M20 55 L80 55 L50 148 Z"
            fill="#a9733f"
            stroke="#3a2314"
            stroke-width="6"
            stroke-linejoin="round"
          )
          path(d="M50 70 L50 128" stroke="#c89058" stroke-width="5" stroke-linecap="round")
          circle(cx="50" cy="44" r="38" fill="#8c5a32" stroke="#3a2314" stroke-width="6")
          circle(cx="50" cy="44" r="26" fill="none" stroke="#fdf2d8" stroke-width="3" stroke-dasharray="7 6")
          circle(cx="50" cy="44" r="11" fill="#fdf2d8" stroke="#3a2314" stroke-width="4")
      //- One-shot burst when the wheel stops.
      div.wheel-burst(v-if="showWin && !isLowQuality" aria-hidden="true")
        span.burst-ring
        span.burst-spark(
          v-for="s in sparks"
          :key="s.i"
          :style="s.style"
        )

    //- Fixed-height slot — no layout shift
    div.flex.flex-col.items-center.justify-center.gap-2(class="min-h-[3rem] mt-1")
      span.spin-label.ui-outline-sm.animate-pulse(
        v-if="isSpinning"
        class="text-sm tracking-[0.06em]"
      ) {{ t('spinner.spinning') }}
      //- Post-first-spin: ad respin + skip — laid out side-by-side so the
      //- "Skip" link sits inline with the "Spin Again" CTA instead of
      //- stacking under it.
      div.flex.items-center.gap-4(v-if="showAdButton")
        button.respin-btn.ui-btn.ui-btn--ad(
          class="text-sm sm:text-base"
          @click="onAdRespin"
        )
          span(v-if="isNative") {{ t('spinner.ad') }}
          img.object-contain(
            :src="prependBaseUrl('images/icons/movie_128x96.webp')"
            alt=""
            class="h-5 w-5"
          )
          span {{ t('spinner.spinAgain') }}
        button.skip-btn.ui-outline-sm.font-black.cursor-pointer.underline(
          class="text-xs min-h-[44px] px-2 opacity-80 hover:opacity-100"
          @click="onSkipAd"
        ) {{ t('spinner.skip') }}
</template>

<style scoped lang="sass">
// Layer order, back to front: backdrop → rotor (face) → win wedge → rim →
// bolts → hub → pointer → burst. Everything that ANIMATES animates only
// `transform` or `opacity`, so the spin and the bolts run on the compositor.
// Cozy flat style: wood, cream, ink outlines — no filter, no blur, no radial
// gradients, every shadow 0-blur.

// ─── Backdrop ───────────────────────────────────────────────────────────────

.wheel-backdrop
  position: absolute
  inset: -16%
  overflow: hidden
  pointer-events: none

.wheel-halo, .wheel-rays
  position: absolute
  inset: 0

.wheel-halo
  opacity: 0.85
  border-radius: 50%
  background: rgba(255, 240, 168, 0.22)

.wheel-rays
  background: repeating-conic-gradient(from 0deg, rgba(255, 240, 168, 0.28) 0deg 6deg, rgba(255, 240, 168, 0) 6deg 22.5deg)
  // clipped to the halo disc instead of a radial mask
  clip-path: circle(50%)
  opacity: 0.7
  animation: rays-turn 36s linear infinite

.is-spinning .wheel-rays
  animation-duration: 12s

.is-won .wheel-halo
  animation: halo-pulse 0.5s ease-in-out 4 alternate

@keyframes rays-turn
  to
    transform: rotate(360deg)

@keyframes halo-pulse
  to
    opacity: 1

// ─── Face ───────────────────────────────────────────────────────────────────

.wheel-rotor
  position: absolute
  border-radius: 50%
  will-change: transform

.wheel-face
  display: block
  width: 100%
  height: 100%

.wheel-win
  position: absolute
  overflow: visible
  pointer-events: none
  animation: win-pulse 0.55s ease-in-out infinite alternate

.win-glow
  fill: rgba(255, 250, 240, 0.35)
  stroke: var(--color-sun-400)
  stroke-width: 0.07
  stroke-linejoin: round

.win-edge
  fill: none
  stroke: var(--color-ink)
  stroke-width: 0.022
  stroke-linejoin: round

@keyframes win-pulse
  from
    opacity: 0.55
  to
    opacity: 1

// ─── Rim ────────────────────────────────────────────────────────────────────

.wheel-rim, .wheel-rim-fallback
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  pointer-events: none
  user-select: none

// Flat wooden ring from the face lip (r 0.36) to the outer edge (r 0.5), ink
// outlines on both edges and a darker inner lip; the face canvas (r 0.372)
// tucks under it. A stitched cream dash runs round the outer band.
.wheel-rim-fallback
  border-radius: 50%
  border: calc(var(--ws) * 0.14) solid var(--color-wood-600)
  box-shadow: inset 0 0 0 3px var(--color-ink), inset 0 0 0 calc(3px + var(--ws) * 0.012) var(--color-wood-700), 0 0 0 3px var(--color-ink), 0 4px 0 3px var(--color-ink)

  &::after
    content: ''
    position: absolute
    inset: calc(var(--ws) * -0.122)
    border-radius: 50%
    border: 2px dashed var(--color-cream-200)
    opacity: 0.7

// ─── Bolts (the former marquee bulbs) ───────────────────────────────────────

.wheel-bulbs
  position: absolute
  inset: 0
  pointer-events: none

.wheel-bulb
  position: absolute
  transform: translate(-50%, -50%)

.bulb-img, .bulb-fallback
  position: absolute
  inset: 0
  width: 100%
  height: 100%

// Flat cream bolt with ink outline.
.bulb-fallback
  border-radius: 50%
  background: var(--color-cream-200)
  box-shadow: 0 0 0 1.5px var(--color-ink)

// Lit state: a sun-yellow bolt laid over the cream one. Static — the GROUP
// layer around it is what animates.
.bulb-lit
  position: absolute
  inset: 0
  border-radius: 50%
  background: var(--color-sun-300)
  box-shadow: 0 0 0 1.5px var(--color-ink)

.bulb-lit-img
  position: absolute
  inset: 0
  width: 100%
  height: 100%

// Four group layers (bolts i % 4 === g); only their opacity animates.
// Idle: even and odd bolts alternate (groups 0 + 2 against 1 + 3).
.bulb-group
  position: absolute
  inset: 0
  opacity: 0
  animation: bulb-idle 1.4s steps(1, end) infinite

  &.g1, &.g3
    animation-delay: -0.7s

@keyframes bulb-idle
  0%
    opacity: 1
  50%
    opacity: 0

// Spinning: chase — one group lit at a time, stepping clockwise.
.is-spinning .bulb-group
  animation: bulb-chase 0.36s steps(1, end) infinite
  animation-delay: calc((var(--g) - 4) * 0.09s)

@keyframes bulb-chase
  0%
    opacity: 1
  25%
    opacity: 0
  100%
    opacity: 0

// Stopped on a result: every bolt flashes together, then back to idle.
.is-won .bulb-group
  animation: bulb-flash 0.24s steps(1, end) 6, bulb-idle 1.4s steps(1, end) 1.44s infinite

.is-won .g1, .is-won .g3
  animation-delay: 0s, 2.14s

@keyframes bulb-flash
  0%
    opacity: 1
  50%
    opacity: 0

// ─── Hub ────────────────────────────────────────────────────────────────────

.wheel-hub
  position: absolute
  left: 39.5%
  top: 39.5%
  width: 21%
  height: 21%
  pointer-events: none
  user-select: none

// Flat wooden hub: wood disc, ink outline, stitched cream ring, cream bolt.
.wheel-hub-fallback
  position: relative
  width: 100%
  height: 100%
  border-radius: 50%
  background: var(--color-wood-500)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -4px 0 var(--color-wood-700), 0 3px 0 var(--color-ink)

  &::before
    content: ''
    position: absolute
    inset: 16%
    border-radius: 50%
    border: 2px dashed var(--color-cream-200)

  &::after
    content: ''
    position: absolute
    inset: 38%
    border-radius: 50%
    background: var(--color-cream-100)
    box-shadow: 0 0 0 2px var(--color-ink)

// ─── Pointer ────────────────────────────────────────────────────────────────

// Box 0.13 × 0.20 of the wheel, overlapping the rim at 12 o'clock with its tip
// into the face. It pivots on its cap — centre at 28.3 % of its height — so a
// peg knocks the tip sideways.
.wheel-pointer
  position: absolute
  left: 43.5%
  top: -2%
  width: 13%
  height: 20%
  transform-origin: 50% 28.3%
  will-change: transform
  pointer-events: none

.pointer-img
  display: block
  width: 100%
  height: 100%
  user-select: none
  overflow: visible

// ─── Result burst ───────────────────────────────────────────────────────────

// Centred on the winning wedge (12 o'clock, ~62 % of the face radius out).
.wheel-burst
  position: absolute
  left: 50%
  top: 27%
  width: 0
  height: 0
  pointer-events: none

.burst-ring
  position: absolute
  left: 0
  top: 0
  width: 120px
  height: 120px
  margin: -60px 0 0 -60px
  border-radius: 50%
  border: 3px dashed var(--color-cream-50)
  opacity: 0
  animation: burst-ring 0.6s ease-out forwards

.burst-spark
  position: absolute
  left: 0
  top: 0
  width: 18px
  height: 18px
  margin: -9px 0 0 -9px
  opacity: 0
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)
  background: var(--color-sun-300)
  animation: burst-spark 0.75s ease-out forwards

@keyframes burst-ring
  0%
    opacity: 0.95
    transform: scale(0.15)
  100%
    opacity: 0
    transform: scale(1.5)

@keyframes burst-spark
  0%
    opacity: 1
    transform: translate(0, 0) scale(0.3) rotate(0deg)
  70%
    opacity: 1
  100%
    opacity: 0
    transform: translate(var(--dx), var(--dy)) scale(1) rotate(120deg)

// ─── Labels + buttons ───────────────────────────────────────────────────────

.spin-label
  font-weight: 900

.skip-btn:focus-visible
  outline: 3px solid var(--ui-focus)
  outline-offset: 2px
  border-radius: 6px

// ─── Low quality tier / reduced motion ──────────────────────────────────────
// Static bolts (alternate lit), no turning rays. The spin itself and the
// pointer are the game, so they stay.

.is-low
  .wheel-rays, .wheel-halo, .bulb-group, .wheel-win
    animation: none !important

  .bulb-group
    opacity: 0

  .g1, .g3
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .wheel-rays, .bulb-group
    animation: none !important

  .g1, .g3
    opacity: 1
</style>

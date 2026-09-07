// Substantiates the "visually identical" claim behind the aura sprite cache.
//
//   node perf/aura-equivalence.mjs
//
// In a real Chrome (real canvas rasteriser), draws the SAME aura twice over the
// same background:
//
//   A  the original path — createRadialGradient with every stop's alpha
//      pre-multiplied by `pulse`, filled into an arc
//   B  the shipped path — one gradient sprite baked at pulse = 1, blitted with
//      globalAlpha = pulse
//
// and reports the per-channel difference. Both paths are driven from the same
// stop tables and the same geometry the game uses, at several pulse values and
// blade radii, so a regression in the equivalence shows up here rather than in
// a screenshot where animation phase drowns it out.

import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()

const results = await page.evaluate(() => {
  const SPRITE_R = 128

  const bakeSprite = (innerRatio, stops) => {
    const c = document.createElement('canvas')
    c.width = c.height = SPRITE_R * 2
    const x = c.getContext('2d')
    const g = x.createRadialGradient(
      SPRITE_R, SPRITE_R, SPRITE_R * innerRatio,
      SPRITE_R, SPRITE_R, SPRITE_R
    )
    for (const [o, col] of stops) g.addColorStop(o, col)
    x.fillStyle = g
    x.beginPath()
    x.arc(SPRITE_R, SPRITE_R, SPRITE_R, 0, Math.PI * 2)
    x.fill()
    return c
  }

  // Alpha in the stop tables is the pulse = 1 value; the original path scales
  // each one by `pulse`, exactly as the game's renderAura did.
  const scaleAlpha = (rgba, pulse) =>
    rgba.replace(/rgba\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map((s) => s.trim())
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Number(parts[3]) * pulse})`
    })

  const CASES = [
    {
      name: 'team/player',
      radiusOf: (r) => r * 1.8 + 4,
      innerOf: (r, aura) => (r * 0.3) / aura,
      stops: [
        [0, 'rgba(120, 210, 255, 0.55)'],
        [0.5, 'rgba(80, 150, 240, 0.3)'],
        [1, 'rgba(60, 120, 220, 0)']
      ]
    },
    {
      name: 'team/npc',
      radiusOf: (r) => r * 1.8 + 4,
      innerOf: (r, aura) => (r * 0.3) / aura,
      stops: [
        [0, 'rgba(255, 80, 80, 0.75)'],
        [0.5, 'rgba(240, 55, 55, 0.45)'],
        [1, 'rgba(220, 40, 40, 0)']
      ]
    },
    {
      name: 'boss',
      radiusOf: (r) => r * 2.2,
      innerOf: () => 0.4 / 2.2,
      stops: [
        [0, 'rgba(255, 80, 20, 0.8)'],
        [0.3, 'rgba(255, 40, 10, 0.5)'],
        [0.6, 'rgba(180, 20, 5, 0.3)'],
        [1, 'rgba(120, 10, 0, 0)']
      ]
    }
  ]

  const out = []
  for (const c of CASES) {
    for (const bladeR of [18.6, 30, 36]) {
      for (const pulse of [0.25, 0.5, 0.85, 1]) {
        const auraR = c.radiusOf(bladeR)
        const exactInner = c.innerOf(bladeR, auraR)
        // The shipped code quantises the inner-stop ratio into 0.005 buckets
        // so a handful of sprites serve every blade size.
        const bucketInner = Math.round(exactInner * 200) / 200

        const size = Math.ceil(auraR * 2) + 8
        const mk = () => {
          const el = document.createElement('canvas')
          el.width = el.height = size
          const x = el.getContext('2d', { willReadFrequently: true })
          // Same dark arena floor under both, so the source-over composite is
          // exercised rather than a blend against transparent black.
          x.fillStyle = '#0d1117'
          x.fillRect(0, 0, size, size)
          return [el, x]
        }
        const mid = size / 2

        const [, xa] = mk()
        const g = xa.createRadialGradient(mid, mid, auraR * exactInner, mid, mid, auraR)
        for (const [o, col] of c.stops) g.addColorStop(o, scaleAlpha(col, pulse))
        xa.fillStyle = g
        xa.beginPath()
        xa.arc(mid, mid, auraR, 0, Math.PI * 2)
        xa.fill()

        const [, xb] = mk()
        const sprite = bakeSprite(bucketInner, c.stops)
        xb.globalAlpha = pulse
        xb.drawImage(sprite, mid - auraR, mid - auraR, auraR * 2, auraR * 2)
        xb.globalAlpha = 1

        const da = xa.getImageData(0, 0, size, size).data
        const db = xb.getImageData(0, 0, size, size).data
        let diffPx = 0
        let sum = 0
        let max = 0
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2])
          )
          if (d === 0) continue
          diffPx++
          sum += d
          if (d > max) max = d
        }
        out.push({
          case: `${c.name} r=${bladeR} pulse=${pulse}`,
          px: (size * size),
          changedPct: +((diffPx / (size * size)) * 100).toFixed(1),
          meanDiff: diffPx ? +(sum / diffPx).toFixed(2) : 0,
          maxDiff: max
        })
      }
    }
  }
  return out
})

await browser.close()

console.log('aura sprite vs original gradient — per-channel difference (0-255)\n')
console.log(`${'case'.padEnd(30)}${'changed%'.padStart(10)}${'mean'.padStart(8)}${'max'.padStart(6)}`)
console.log('─'.repeat(54))
let worst = 0
for (const r of results) {
  console.log(
    `${r.case.padEnd(30)}${String(r.changedPct).padStart(10)}${String(r.meanDiff).padStart(8)}${String(r.maxDiff).padStart(6)}`
  )
  if (r.maxDiff > worst) worst = r.maxDiff
}
console.log('─'.repeat(54))
console.log(`worst single-channel difference anywhere: ${worst}/255`)

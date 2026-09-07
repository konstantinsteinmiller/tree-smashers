import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const [aPath, bPath, region] = process.argv.slice(2)
// Optional `x,y,w,h` to diff one rectangle — e.g. a background-only patch,
// so animated HUD chrome cannot drown out what you are actually checking.
const RECT = region ? region.split(',').map(Number) : null
const toUrl = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const res = await page.evaluate(async ([aUrl, bUrl, rect]) => {
  const load = (src) => new Promise((r, j) => {
    const i = new Image()
    i.onload = () => r(i)
    i.onerror = j
    i.src = src
  })
  const [a, b] = await Promise.all([load(aUrl), load(bUrl)])
  const ox = rect ? rect[0] : 0
  const oy = rect ? rect[1] : 0
  const w = rect ? rect[2] : Math.min(a.width, b.width)
  const h = rect ? rect[3] : Math.min(a.height, b.height)
  const grab = (img) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })
    x.drawImage(img, -ox, -oy)
    return x.getImageData(0, 0, w, h).data
  }
  const da = grab(a), db = grab(b)
  let diffPx = 0, sum = 0, max = 0
  let minX = w, minY = h, maxX = 0, maxY = 0
  const hist = { '1-4': 0, '5-16': 0, '17-48': 0, '49+': 0 }
  for (let i = 0, p = 0; i < da.length; i += 4, p++) {
    const d = Math.max(
      Math.abs(da[i] - db[i]),
      Math.abs(da[i + 1] - db[i + 1]),
      Math.abs(da[i + 2] - db[i + 2])
    )
    if (d === 0) continue
    diffPx++
    sum += d
    if (d > max) max = d
    if (d <= 4) hist['1-4']++
    else if (d <= 16) hist['5-16']++
    else if (d <= 48) hist['17-48']++
    else hist['49+']++
    const x = p % w, y = (p / w) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return {
    w, h, totalPx: w * h, diffPx,
    diffPct: +((diffPx / (w * h)) * 100).toFixed(2),
    meanDiffOverChanged: diffPx ? +(sum / diffPx).toFixed(2) : 0,
    maxChannelDiff: max, hist,
    bbox: diffPx ? { minX, minY, maxX, maxY } : null
  }
}, [toUrl(aPath), toUrl(bPath), RECT])
console.log(JSON.stringify(res, null, 2))
await browser.close()

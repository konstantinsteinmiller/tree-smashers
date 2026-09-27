/**
 * ─── A canvas to decode / key / encode on ───────────────────────────────────
 *
 * Node has no image codec in its standard library and this project ships no
 * `sharp`, so pixels go through the Chrome that is already installed: a
 * HEADLESS instance on a throwaway profile Playwright creates and deletes
 * (never the Gemini profile, never anybody's own browser). One per process.
 */
import { imageSize } from './jobs.mjs'
import { findChrome, loadPlaywright } from './gemini.mjs'

export const MIME_OF = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export const openCanvas = async (root, chromePath = null) => {
  const { chromium } = loadPlaywright(root)
  const browser = await chromium.launch({
    executablePath: findChrome(chromePath),
    headless: true,
    args: ['--disable-gpu', '--disable-extensions', '--no-first-run']
  })
  const page = await browser.newPage()
  await page.goto('about:blank')
  return {
    page, close: () => browser.close().catch(() => {
    })
  }
}

/** Any PNG/JPEG/WebP bytes → PNG bytes at the same pixel size (lossless re-container). */
export const toPng = async (page, bytes) => {
  const size = imageSize(bytes)
  if (!size) throw new Error('not a PNG, JPEG or WebP image')
  if (size.type === 'png') return bytes
  const b64 = await page.evaluate(async ({ b64, mime }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bin], { type: mime }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none'
    })
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    cv.getContext('2d').drawImage(bmp, 0, 0)
    const out = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let s = ''
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000))
    return btoa(s)
  }, { b64: bytes.toString('base64'), mime: MIME_OF[size.type] })
  const png = Buffer.from(b64, 'base64')
  const got = imageSize(png)
  if (!got || got.w !== size.w || got.h !== size.h) throw new Error('PNG conversion changed the image size')
  return png
}

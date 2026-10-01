/**
 * The ONE currency coin: `public/images/icons/coin_128x128.webp`.
 *
 * Every coin in the game — the `IconCoin` atom (HUD, prices, rewards), the
 * coin-explosion particles and the roulette wheel's canvas face — renders this
 * file. The old drawn coin (SVG / canvas) survives only as the fallback for a
 * failed load: the first error flips `coinArtFailed` and every coin switches to
 * the drawing at once, without another request and without throwing.
 */
import { ref } from 'vue'
import { prependBaseUrl } from '@/utils/function'

export const COIN_ART_PATH = 'images/icons/coin_128x128.webp'

export const coinArtSrc = (): string => prependBaseUrl(COIN_ART_PATH)

/** The coin painting failed to load (404, decode error): draw the fallback. */
export const coinArtFailed = ref(false)

export const markCoinArtFailed = (): void => {
  coinArtFailed.value = true
}

let coinImg: HTMLImageElement | null = null

/** The shared decoded coin bitmap for canvas callers (null in a non-DOM
 *  environment). Draw it only when `coinImageReady` says so. */
export const getCoinImage = (): HTMLImageElement | null => {
  if (coinImg) return coinImg
  if (typeof Image === 'undefined') return null
  try {
    coinImg = new Image()
    coinImg.addEventListener('error', markCoinArtFailed, { once: true })
    coinImg.src = coinArtSrc()
  } catch {
    markCoinArtFailed()
    coinImg = null
  }
  return coinImg
}

export const coinImageReady = (img: HTMLImageElement | null): img is HTMLImageElement =>
  !!img && !coinArtFailed.value && img.complete && img.naturalWidth > 0

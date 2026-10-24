// Lazy, no-pop-in preload of the NEXT campaign stage's arena art (backdrop
// tile + prop atlas, floor variant, wall border) while the game's own network
// is quiet. The current stage's art is loaded by the splash / initGame; this
// only ever warms the one after it, so the next battle's static layer bakes
// dressed from its first frame. Each file is fetched AND decoded (arenaImage
// loaders decode before they settle), so nothing is decoded on first draw.
import useSpinnerCampaign, { getStageById } from '@/use/useSpinnerCampaign'
import { preloadBackdropArt } from '@/use/arenaBackdrop'
import { preloadFloorArt } from '@/use/arenaFloorArt'
import { borderKeyFor, preloadBorderArt } from '@/use/arenaBorderArt'
import { floorKeyFor, themeFor } from '@/use/arenaThemes'
import { layoutForStage } from '@/use/arenaTerrain'

/** No resource finished downloading within this window = the network is quiet. */
export const QUIET_MS = 1200
const POLL_MS = 1500
const MAX_POLLS = 40

interface NetInfo { saveData?: boolean, effectiveType?: string }

/** Pure: is it polite to start a background fetch now? */
export const networkIsQuiet = (
  now: number, resourceEnds: readonly number[], hidden: boolean, conn?: NetInfo
): boolean => {
  if (hidden) return false
  if (conn?.saveData) return false
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return false
  for (const end of resourceEnds) if (end > 0 && now - end < QUIET_MS) return false
  return true
}

const recentResourceEnds = (): number[] => {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return []
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const out: number[] = []
  for (let i = entries.length - 1; i >= 0 && out.length < 24; i--) out.push(entries[i]!.responseEnd)
  return out
}

const warmed = new Set<number>()
let pending: number | null = null
let timer = 0

const jobsFor = (stageId: number): Promise<void>[] => {
  const stage = getStageById(stageId)
  const arenaType = stage.arenaType ?? 'default'
  const layout = layoutForStage(stage.id)
  const theme = themeFor(arenaType, layout)
  return [
    preloadBackdropArt(theme),
    preloadFloorArt(floorKeyFor(theme, layout)),
    preloadBorderArt(borderKeyFor(arenaType, theme))
  ]
}

/** Warm the art of the stage after the one being played, once the network is
 *  quiet (polls every 1.5 s for ~1 min, then gives up until the next call). */
export const warmNextStageArt = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let next: number
  try { next = useSpinnerCampaign().currentStageId.value + 1 } catch { return }
  if (warmed.has(next) || pending === next) return
  pending = next
  window.clearTimeout(timer)
  let polls = 0
  const tick = (): void => {
    if (pending !== next) return
    const conn = (navigator as Navigator & { connection?: NetInfo }).connection
    if (networkIsQuiet(performance.now(), recentResourceEnds(), document.visibilityState === 'hidden', conn)) {
      warmed.add(next)
      pending = null
      try { void Promise.all(jobsFor(next)) } catch { /* decorative */ }
      return
    }
    if (++polls >= MAX_POLLS) { pending = null; return }
    timer = window.setTimeout(tick, POLL_MS)
  }
  timer = window.setTimeout(tick, POLL_MS)
}

/** Resolves true once the network has been quiet (polls every `pollMs`, up to `maxPolls`), false if it never was. */
export const whenNetworkQuiet = (pollMs = 600, maxPolls = 60): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
  return new Promise(resolve => {
    let polls = 0
    const tick = (): void => {
      const conn = (navigator as Navigator & { connection?: NetInfo }).connection
      if (networkIsQuiet(performance.now(), recentResourceEnds(), document.visibilityState === 'hidden', conn)) return resolve(true)
      if (++polls >= maxPolls) return resolve(false)
      window.setTimeout(tick, pollMs)
    }
    tick()
  })
}

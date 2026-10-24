// Menu pre-warm: once a stage is under way and the network is quiet, fetch what the Team / upgrade
// modal needs (painted smasher sheets + hi-res portraits, the skill-icon component and its icons) a
// few smashers at a time, so opening it later is instant instead of a ~2 s pop-in (measured: 56
// requests incl. ~48 sheets/portraits fired at open). Never competes with the stage's own loading —
// every batch waits for a quiet network — and gives up silently on save-data / 2g / hidden tabs.
import { RELEASED_SMASHER_IDS } from '@/data/smasherCatalog'
import { preloadPaintedSmashers } from '@/smashers/smasherAtlas'
import { paintedSkillIconUrl, SMASHER_SKILL_ART } from '@/use/skills/smasherSkillArt'
import { SKILLS_BUILD } from '@/skills/skillsGate'
import { whenNetworkQuiet } from '@/use/nextStageArt'

const BATCH = 4
let started = false

/** The 128 px skill icons (a few KB each) — all of them in one go before the sheets. */
const warmSkillIcons = (): void => {
  for (const key of Object.keys(SMASHER_SKILL_ART)) {
    const url = paintedSkillIconUrl(key)
    if (url) new Image().src = url
  }
}

/** Idempotent; call when the player is ready to play (first player turn). `first` = smashers to warm first. */
export const warmMenusWhenIdle = (first: readonly string[] = []): void => {
  if (started || typeof window === 'undefined') return
  started = true
  const order = [...new Set([...first, ...RELEASED_SMASHER_IDS])] as typeof RELEASED_SMASHER_IDS[number][]
  void (async () => {
    if (!(await whenNetworkQuiet())) { started = false; return }
    if (SKILLS_BUILD) void import('@/components/atoms/SkillIcon.vue').catch(() => { /* decorative */ })
    if (SKILLS_BUILD) warmSkillIcons()
    for (let i = 0; i < order.length; i += BATCH) {
      const batch = order.slice(i, i + BATCH)
      preloadPaintedSmashers(batch)
      if (!(await whenNetworkQuiet())) return
    }
  })()
}

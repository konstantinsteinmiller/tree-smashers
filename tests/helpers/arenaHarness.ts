// ─── Mount the real SpinnerArena in jsdom ───────────────────────────────────
//
// For the skills flag tests (on / off). The caller's test file must mock the
// static `/images/…` template srcs Vitest's Vue plugin turns into imports it
// cannot resolve (see tests/skillsFlagOff.test.ts), and seed storage BEFORE
// any module reads it (vi.hoisted) — composables read their state at import.

import { vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

export interface ArenaHarness {
  wrapper: VueWrapper
  /** Every storage key written while mounted (any storage instance). */
  written: string[]
  /** Every fetch URL and every `new Audio(src)` src. */
  requested: string[]
  /** Let lazy chunks / timers settle. */
  settle: (ms?: number) => Promise<void>
  /** Poll until `selector` is in the DOM (lazy chunks compile on first use
   *  under Vitest); false on timeout. */
  waitFor: (selector: string, ms?: number) => Promise<boolean>
  /** Click the Team button and let the modal open. */
  openTeam: () => Promise<void>
  unmount: () => void
}

export async function mountArena(seed: Record<string, string>): Promise<ArenaHarness> {
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  // The setup file swaps in a fresh storage before every test, so a composable
  // imported earlier read an EMPTY storage. Re-read the seed the way a
  // cloud-save hydrate does (the team modal then shows the seeded smashers,
  // not the default pair).
  const { refreshSaveBackedState } = await import('@/use/useSaveStatus')
  refreshSaveBackedState()
  const written: string[] = []
  const requested: string[] = []
  const proto = Object.getPrototypeOf(localStorage) as Storage
  const realSet = proto.setItem
  proto.setItem = function(this: Storage, k: string, v: string) {
    written.push(k)
    return realSet.call(this, k, v)
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {
  })
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    requested.push(String(url))
    return new Response(new ArrayBuffer(8), { status: 200 })
  }))
  const RealAudio = window.Audio
  vi.stubGlobal('Audio', function(this: unknown, src?: string) {
    if (src) requested.push(src)
    return new RealAudio(src)
  })
  const SpinnerArena = (await import('@/views/SpinnerArena.vue')).default
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en } as never
  })
  const wrapper = mount(SpinnerArena, { global: { plugins: [i18n] }, attachTo: document.body })
  const settle = async (ms = 50) => {
    await flushPromises()
    await new Promise(r => setTimeout(r, ms))
    await flushPromises()
  }
  await settle()
  return {
    wrapper,
    written,
    requested,
    settle,
    waitFor: async (selector: string, ms = 15_000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) {
        if (document.querySelector(selector)) return true
        await settle(50)
      }
      return false
    },
    openTeam: async () => {
      const img = document.querySelector('[data-testid="hud-team"]') as HTMLElement | null
      if (!img) throw new Error('no Team button on screen')
        ;
      (img.closest('button') ?? img).click()
      await settle(30)
    },
    unmount: () => {
      wrapper.unmount()
      proto.setItem = realSet
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  }
}

/** Selectors of every skill surface the arena / Team modal can show. */
export const SKILL_DOM = [
  '[data-testid="smasher-skills"]', '.blade-skill-row'
] as const

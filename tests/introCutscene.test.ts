// useUser FIRST: importing useModels (via the cutscene component) before it
// trips the useMatch ↔ useModels ↔ useUser import cycle under Vitest.
import useUser from '@/use/useUser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@/i18n/locales/en'
import { hydrateState } from '@/use/useSaveStatus'
import {
  introPhase,
  armIntro,
  noteIntroBattleStarted,
  finishIntro,
  __resetIntroState
} from '@/use/useIntroCutscene'
import { INTRO_SEEN_KEY, INTRO_DECISION_BUDGET_MS } from '@/use/introGate'
import { SaveManager } from '@/utils/save/SaveManager'
import type { LocalStorageAccessor, SaveStrategy } from '@/utils/save/types'
import { resetAllProgress } from '@/use/useResetProgress'
import IntroCutscene from '@/components/organisms/IntroCutscene.vue'

void useUser

const snapshot = (): Record<string, string> => {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

beforeEach(() => {
  localStorage.clear()
  __resetIntroState()
  hydrateState.value = 'success-empty'
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── The controller: when does it play? ────────────────────────────────────

describe('useIntroCutscene — first-timer detection, live', () => {
  it('plays for a first-timer once armed, and marks itself seen at once', () => {
    armIntro()
    expect(introPhase.value).toBe('playing')
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
  })

  it('never replays for a player who has seen it', () => {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    armIntro()
    expect(introPhase.value).toBe('done')
  })

  it('a returning player whose cloud save lands late is NOT shown the intro', async () => {
    hydrateState.value = 'failed-retrying'
    await nextTick()
    armIntro()
    expect(introPhase.value).toBe('waiting')
    // The cloud save arrives: it brings progress and the seen state.
    localStorage.setItem('smashers_campaign_stage', '23')
    localStorage.setItem('smashers_last_result', 'win')
    hydrateState.value = 'success-with-data'
    await nextTick()
    expect(introPhase.value).toBe('done')
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeNull()
  })

  it('a new player on a cloud portal gets it once the cloud confirms it is empty', async () => {
    hydrateState.value = 'pending'
    // Let the watcher observe 'pending' first, as the real boot does.
    await nextTick()
    armIntro()
    expect(introPhase.value).toBe('waiting')
    hydrateState.value = 'success-empty'
    await nextTick()
    expect(introPhase.value).toBe('playing')
  })

  it('an undecided intro gives up when the player starts a fight', () => {
    hydrateState.value = 'pending'
    armIntro()
    noteIntroBattleStarted()
    expect(introPhase.value).toBe('done')
    hydrateState.value = 'success-empty'
    expect(introPhase.value).toBe('done')
  })

  it('an unsettled read that never settles gives up after the budget', () => {
    vi.useFakeTimers()
    hydrateState.value = 'failed-retrying'
    armIntro()
    expect(introPhase.value).toBe('waiting')
    vi.advanceTimersByTime(INTRO_DECISION_BUDGET_MS + 100)
    expect(introPhase.value).toBe('done')
  })
})

// ─── The reset ─────────────────────────────────────────────────────────────

const makeSpyStrategy = (): SaveStrategy & { onLocalRemove: ReturnType<typeof vi.fn> } => ({
  name: 'spy',
  hydrateState: 'success-empty',
  hydrate: vi.fn(async (_l: LocalStorageAccessor) => {
  }),
  onLocalSet: vi.fn(),
  onLocalRemove: vi.fn(),
  flush: vi.fn(async () => {
  })
})

describe('resetAllProgress — the intro comes back', () => {
  afterEach(() => {
    delete (window as unknown as { __saveManager?: unknown }).__saveManager
  })

  it('clears the seen flag (through the save layer, so the cloud hears it) and replays the intro', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy, window.localStorage, { blob: { persistToRaw: false } })
    ;(window as unknown as { __saveManager: SaveManager }).__saveManager = manager
    await manager.init()
    localStorage.setItem('smashers_campaign_stage', '12')
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    armIntro()
    expect(introPhase.value).toBe('done')
    strategy.onLocalRemove.mockClear()

    await resetAllProgress()

    const removed = strategy.onLocalRemove.mock.calls.map(([k]) => k as string)
    expect(removed).toContain(INTRO_SEEN_KEY)
    expect(introPhase.value).toBe('playing')
    // Seen again the moment the replay starts.
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    finishIntro()
    expect(introPhase.value).toBe('done')
  })
})

// ─── The cutscene touches nothing but its own flag ─────────────────────────

/** A 2D context that accepts every call — enough to run the real renderer in
 *  jsdom, which has no canvas implementation. */
const fakeCtx = (): CanvasRenderingContext2D => {
  const grad = {
    addColorStop: () => {
    }
  }
  const target: Record<string, unknown> = {
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    createPattern: () => ({}),
    measureText: () => ({ width: 50 }),
    getLineDash: () => [],
    canvas: null
  }
  return new Proxy(target, {
    get: (t, p: string) => (p in t ? t[p] : () => {
    }),
    set: (t, p: string, v) => {
      t[p] = v
      return true
    }
  }) as unknown as CanvasRenderingContext2D
}

describe('IntroCutscene — side-effect free', () => {
  const FIXTURE: Record<string, string> = {
    smashers_owned_skins: JSON.stringify(['star:ice', 'round:turtle']),
    smashers_selected_skins: JSON.stringify({ 'star:0': 'ice', star: 'ice' }),
    smashers_player_team: JSON.stringify([{ topPartId: 'star', bottomPartId: 'speedy' }, {
      topPartId: 'round',
      bottomPartId: 'tanky'
    }]),
    smashers_coins: '1234',
    smashers_diamonds: '7',
    smashers_campaign_stage: '9',
    smashers_player_max_stage: '9',
    smashers_upgrades: JSON.stringify({ tops: { star: 3 }, bottoms: { speedy: 2 } }),
    smashers_battle_pass: JSON.stringify({ xp: 120 }),
    smashers_pvp_stats: JSON.stringify({ wins: 2, losses: 1 }),
    smashers_leaderboard: '[]',
    smashers_last_result: 'win'
  }

  it('plays start to finish at 60 fps, emits done, and writes NOTHING', async () => {
    for (const [k, v] of Object.entries(FIXTURE)) localStorage.setItem(k, v)
    const before = snapshot()

    const getCtx = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeCtx as never)
    const rafQueue: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    })
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(IntroCutscene, { global: { plugins: [i18n] }, attachTo: document.body })
    // onMounted awaits the (already-settled) skin decodes.
    for (let i = 0; i < 10 && rafQueue.length === 0; i++) await new Promise(r => setTimeout(r, 5))
    expect(rafQueue.length).toBeGreaterThan(0)

    let now = 1000
    for (let f = 0; f < 60 * 16 && !wrapper.emitted('done'); f++) {
      const cbs = rafQueue.splice(0)
      for (const cb of cbs) cb(now)
      now += 1000 / 60
    }
    expect(wrapper.emitted('done')).toBeTruthy()
    // ~14 s of screen time at 60 fps.
    const seconds = (now - 1000) / 1000
    expect(seconds).toBeGreaterThan(12)
    expect(seconds).toBeLessThan(16)
    wrapper.unmount()
    getCtx.mockRestore()
    raf.mockRestore()
    caf.mockRestore()

    // Owned/selected skins, currency, progress, stats: byte-for-byte unchanged.
    expect(snapshot()).toEqual(before)

    // And the whole lifecycle around it adds exactly one key: the seen flag.
    localStorage.removeItem('smashers_last_result')
    localStorage.removeItem('smashers_campaign_stage')
    localStorage.removeItem('smashers_player_max_stage')
    localStorage.removeItem('smashers_coins')
    localStorage.removeItem('smashers_diamonds')
    localStorage.removeItem('smashers_upgrades')
    localStorage.removeItem('smashers_battle_pass')
    localStorage.removeItem('smashers_pvp_stats')
    localStorage.removeItem('smashers_owned_skins')
    const pre = snapshot()
    armIntro()
    expect(introPhase.value).toBe('playing')
    finishIntro()
    const post = snapshot()
    expect(Object.keys(post).filter(k => pre[k] !== post[k])).toEqual([INTRO_SEEN_KEY])
  })

  it('no cutscene module touches storage or the economy (source scan)', () => {
    const files = [
      'src/use/introFight.ts', 'src/use/introTimeline.ts', 'src/use/introRender.ts',
      'src/use/introAudio.ts', 'src/components/organisms/IntroCutscene.vue'
    ]
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/localStorage|sessionStorage|setItem\(|indexedDB/)
      expect(src, f).not.toMatch(/useSpinnerConfig|useCurrency|useBattlePass|useLeaderboard|useCombatLog|buySkin|selectSkin|addCoins/)
    }
  })
})

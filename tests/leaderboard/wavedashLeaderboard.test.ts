// ─── The Wavedash leaderboard (mirror + modal tab) ──────────────────────────
//
// Wavedash keeps its own leaderboard, tied to Wavedash accounts. The Wavedash
// build mirrors every run it reports to our Cloudflare board into that one
// (`reportRun` → `mirrorScore` → `uploadLeaderboardScore`), and the
// leaderboard modal shows the Wavedash board as a second tab.
//
// Everything below runs against a MOCKED SDK shaped like the documented one
// (docs.wavedash.com/sdk/leaderboards): `{ success, data, message }`
// envelopes, `getOrCreateLeaderboard(name, sortOrder, displayType)`,
// `uploadLeaderboardScore(id, score, keepBest, ugcId, metadata)`.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import {
  BOARD_TTL_MS,
  LOOKUP_RETRY_MS,
  createWavedashLeaderboard,
  installWavedashLeaderboard,
  type WavedashLeaderboardSdk
} from '@/platforms/wavedash/wavedashLeaderboard'
import { mirrorScore, platformBoard, setPlatformBoard, setScoreMirror } from '@/use/platformBoard'

beforeAll(async () => {
  // useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle) — the modal
  // test below pulls in FModal.
  await import('@/use/useUser')
})

const ok = <T>(data: T) => ({ success: true, data, message: '' })
const fail = (message = 'nope') => ({ success: false, data: null, message })

interface MockOpts {
  /** The player's saved Wavedash entry, if any. */
  saved?: { score: number; globalRank: number } | null
  me?: string
}

/** A documented-shape SDK whose every method is a spy. */
const mockSdk = (o: MockOpts = {}) => {
  const uploads: { id: string; score: number; keepBest: boolean; ugcId: unknown; metadata: unknown }[] = []
  let saved = o.saved ?? null
  const sdk = {
    LeaderboardSortOrder: { ASC: 0, DESC: 1 },
    LeaderboardDisplayType: { NUMERIC: 0 },
    getOrCreateLeaderboard: vi.fn(async (_name: string) => ok({ id: 'lb_1', name: 'highest-stage', totalEntries: 3 })),
    uploadLeaderboardScore: vi.fn(async (id: string, score: number, keepBest: boolean, ugcId?: unknown, metadata?: unknown) => {
      uploads.push({ id, score, keepBest, ugcId, metadata })
      const best = Math.max(saved?.score ?? 0, score)
      saved = { score: best, globalRank: 2 }
      return ok({ score: best, globalRank: 2, submittedScore: score, submittedRank: 2 })
    }),
    listLeaderboardEntries: vi.fn(async () => ok([
      { userId: 'u_a', username: 'Ace', score: 80, globalRank: 1, metadata: { power: 1200 } },
      { userId: o.me ?? 'u_me', username: 'Me', score: 40, globalRank: 2, metadata: { power: 900 } },
      { userId: 'u_c', username: 'Cee', score: 12, globalRank: 3 }
    ])),
    getMyLeaderboardEntries: vi.fn(async () => ok(saved ? [{ userId: o.me ?? 'u_me', username: 'Me', ...saved }] : [])),
    getLeaderboardEntryCount: vi.fn(() => 57),
    getUserId: vi.fn(() => o.me ?? 'u_me')
  }
  return { sdk, uploads }
}

const make = (sdk: unknown, now: () => number = Date.now) => createWavedashLeaderboard({
  getSdk: async () => sdk as WavedashLeaderboardSdk | null,
  boardName: 'highest-stage',
  now
})

afterEach(() => {
  setScoreMirror(null)
  setPlatformBoard(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the score mirror', () => {
  it('uploads a new best once, keepBest on, with the power as metadata', async () => {
    const { sdk, uploads } = mockSdk()
    const lb = make(sdk)

    lb.mirror(14, 930)
    await lb.idle()

    expect(sdk.getOrCreateLeaderboard).toHaveBeenCalledWith('highest-stage', 1, 0)
    expect(uploads).toEqual([{ id: 'lb_1', score: 14, keepBest: true, ugcId: undefined, metadata: { power: 930 } }])
    expect(lb.board.ownRank.value).toBe(2)
  })

  it('never submits the same score twice, and coalesces a burst into one upload of the highest', async () => {
    const { sdk, uploads } = mockSdk()
    const lb = make(sdk)

    lb.mirror(5, 100)
    lb.mirror(6, 110) // lands while 5 is being looked up / uploaded
    lb.mirror(7, 120)
    lb.mirror(7, 120)
    lb.mirror(6, 110)
    await lb.idle()
    lb.mirror(7, 120)
    lb.mirror(3, 90)
    await lb.idle()

    // The drain reads the target when it uploads, so the first upload already
    // carries 7: every report carries the CURRENT best, nothing is lost.
    expect(uploads.map((u) => u.score)).toEqual([7])
    expect(uploads[0]!.metadata).toEqual({ power: 120 })
    expect(sdk.getOrCreateLeaderboard).toHaveBeenCalledTimes(1)
  })

  it('costs no write when the Wavedash board already holds the best', async () => {
    const { sdk, uploads } = mockSdk({ saved: { score: 10, globalRank: 4 } })
    const lb = make(sdk)

    lb.mirror(8, 1)
    await lb.idle()
    lb.mirror(10, 1)
    await lb.idle()
    expect(uploads).toEqual([])
    expect(sdk.getMyLeaderboardEntries).toHaveBeenCalledTimes(1)

    lb.mirror(11, 1)
    await lb.idle()
    expect(uploads.map((u) => u.score)).toEqual([11])
  })

  it('swallows a failed upload and retries it on the next report', async () => {
    const { sdk, uploads } = mockSdk()
    sdk.uploadLeaderboardScore
      .mockImplementationOnce(async () => { throw new Error('socket closed') })
      .mockImplementationOnce(async () => fail('rate limited') as never)
    const lb = make(sdk)

    expect(() => lb.mirror(9, 1)).not.toThrow()
    await lb.idle()
    lb.mirror(9, 1)
    await lb.idle()
    expect(uploads).toEqual([]) // both refused — nothing recorded as posted

    lb.mirror(9, 1)
    await lb.idle()
    expect(uploads.map((u) => u.score)).toEqual([9])
  })

  it('backs off after a failed board lookup instead of failing every report', async () => {
    const { sdk, uploads } = mockSdk()
    sdk.getOrCreateLeaderboard.mockImplementationOnce(async () => fail('backend not connected') as never)
    let t = 1_000_000
    const lb = make(sdk, () => t)

    lb.mirror(4, 1)
    await lb.idle()
    lb.mirror(4, 1)
    await lb.idle()
    // Each failed SDK call writes a console error line — one lookup, not two.
    expect(sdk.getOrCreateLeaderboard).toHaveBeenCalledTimes(1)
    expect(uploads).toEqual([])

    t += LOOKUP_RETRY_MS
    lb.mirror(4, 1)
    await lb.idle()
    expect(sdk.getOrCreateLeaderboard).toHaveBeenCalledTimes(2)
    expect(uploads.map((u) => u.score)).toEqual([4])
  })

  it('is inert without an SDK: no throw, no call, no rejection', async () => {
    const lb = make(null)
    lb.mirror(12, 1)
    await lb.idle()
    await lb.board.refresh()
    expect(lb.board.failed.value).toBe(true)

    const broken = make({ getOrCreateLeaderboard: () => { throw new Error('boom') } })
    expect(() => broken.mirror(3, 1)).not.toThrow()
    await broken.idle()
  })

  it('ignores scores that are not a positive stage', async () => {
    const { sdk, uploads } = mockSdk()
    const lb = make(sdk)
    lb.mirror(0, 1)
    lb.mirror(-3, 1)
    lb.mirror(Number.NaN, 1)
    await lb.idle()
    expect(uploads).toEqual([])
    expect(sdk.getOrCreateLeaderboard).not.toHaveBeenCalled()
  })
})

describe('the board read (the modal tab)', () => {
  it('maps rows, marks the player by user id and takes the population from the SDK', async () => {
    const { sdk } = mockSdk({ me: 'u_me' })
    const lb = make(sdk)
    await lb.board.refresh()

    expect(sdk.listLeaderboardEntries).toHaveBeenCalledWith('lb_1', 0, 100, false)
    expect(lb.board.rows.value).toEqual([
      { rank: 1, name: 'Ace', score: 80, power: 1200, isYou: false },
      { rank: 2, name: 'Me', score: 40, power: 900, isYou: true },
      // Posted without metadata: no power, not a zero.
      { rank: 3, name: 'Cee', score: 12, power: null, isYou: false }
    ])
    expect(lb.board.total.value).toBe(57)
    expect(lb.board.ownRank.value).toBe(2)
    expect(lb.board.failed.value).toBe(false)
  })

  it('reads the own entry for the footer when the player is below the top rows', async () => {
    const { sdk } = mockSdk({ me: 'u_nobody', saved: { score: 2, globalRank: 312 } })
    sdk.getUserId.mockReturnValue('u_elsewhere')
    const lb = make(sdk)
    await lb.board.refresh()
    expect(lb.board.rows.value.some((r) => r.isYou)).toBe(false)
    expect(lb.board.ownRank.value).toBe(312)
  })

  it('reuses a fresh read and re-reads once an upload made it stale', async () => {
    const { sdk } = mockSdk()
    let t = 5_000_000
    const lb = make(sdk, () => t)
    await lb.board.refresh()
    await lb.board.refresh()
    expect(sdk.listLeaderboardEntries).toHaveBeenCalledTimes(1)

    lb.mirror(50, 1)
    await lb.idle()
    await lb.board.refresh()
    expect(sdk.listLeaderboardEntries).toHaveBeenCalledTimes(2)

    t += BOARD_TTL_MS
    await lb.board.refresh()
    expect(sdk.listLeaderboardEntries).toHaveBeenCalledTimes(3)
  })

  it('reports a failed read without throwing', async () => {
    const { sdk } = mockSdk()
    sdk.listLeaderboardEntries.mockImplementationOnce(async () => fail() as never)
    const lb = make(sdk)
    await expect(lb.board.refresh()).resolves.toBeUndefined()
    expect(lb.board.failed.value).toBe(true)
    expect(lb.board.pending.value).toBe(false)
  })
})

describe('wiring', () => {
  it('stays switched off without a configured board name', () => {
    // No VITE_WAVEDASH_LEADERBOARD_NAME in the test env: nothing installed.
    expect(installWavedashLeaderboard(async () => null)).toBeNull()
    expect(platformBoard.value).toBeNull()
  })

  it('mirrorScore is a no-op without a mirror and swallows a throwing one', () => {
    expect(() => mirrorScore(5, 1)).not.toThrow()
    setScoreMirror(() => { throw new Error('mirror broke') })
    expect(() => mirrorScore(5, 1)).not.toThrow()
  })

  /** Fresh `useLiveLeaderboard` against a stubbed Worker. */
  const loadLive = async (url = 'https://board.example.test') => {
    vi.stubEnv('VITE_LEADERBOARD_URL', url)
    vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
    const posts: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)))
      return { ok: true, status: 200, json: async () => ({ rank: 3, best: 9, total: 10 }) } as unknown as Response
    }))
    vi.resetModules()
    const live = await import('@/use/useLiveLeaderboard')
    const pb = await import('@/use/platformBoard')
    return { live, pb, posts }
  }

  it('reportRun hands the run to the mirror at the moment it reports — synchronously, before any await', async () => {
    const { live, pb, posts } = await loadLive()
    const mirror = vi.fn()
    pb.setScoreMirror(mirror)

    const pending = live.reportRun(9, 700)
    // Same call, same tick: the Cloudflare POST has not even been sent yet.
    expect(mirror).toHaveBeenCalledWith(9, 700)
    await pending
    expect(posts).toHaveLength(1)
    pb.setScoreMirror(null)
  })

  it('mirrors even on a build without a live Worker, but never for a guest', async () => {
    const { live, pb, posts } = await loadLive('')
    const mirror = vi.fn()
    pb.setScoreMirror(mirror)

    await live.reportRun(4, 10)
    expect(mirror).toHaveBeenCalledTimes(1)
    expect(posts).toHaveLength(0)

    live.setLeaderboardAuthGate(() => false)
    await live.reportRun(5, 10)
    expect(mirror).toHaveBeenCalledTimes(1)
    pb.setScoreMirror(null)
  })
})

describe('LeaderboardModal with a portal board', () => {
  enableAutoUnmount(afterEach)
  const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })

  it('shows no tabs on a build without one, and the portal board first with one', async () => {
    // Our own board, from a stubbed Worker — never the real one.
    vi.stubEnv('VITE_LEADERBOARD_URL', 'https://board.example.test')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ updatedAt: 1, total: 2, entries: [
        { rank: 1, name: 'Zed', score: 99, power: 5 },
        { rank: 2, name: 'Yan', score: 50, power: 4 }
      ] })
    }) as unknown as Response))
    // Fresh modules, so the modal and this test share ONE platformBoard.
    vi.resetModules()
    const pb = await import('@/use/platformBoard')
    const Modal = (await import('@/components/organisms/LeaderboardModal.vue')).default
    const plain = mount(Modal, {
      props: { modelValue: true, score: 3 },
      global: { plugins: [i18n()], stubs: { teleport: true } }
    })
    await flushPromises()
    expect(plain.findAll('[role="tab"]')).toHaveLength(0)
    plain.unmount()

    const { sdk } = mockSdk({ me: 'u_me' })
    const lb = make(sdk)
    pb.setPlatformBoard(lb.board)
    const w = mount(Modal, {
      props: { modelValue: true, score: 3 },
      global: { plugins: [i18n()], stubs: { teleport: true } }
    })
    await flushPromises()
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['Wavedash', 'All players'])
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    expect(sdk.listLeaderboardEntries).toHaveBeenCalledTimes(1)
    const names = w.findAll('.board-row__name-text').map((n) => n.text())
    expect(names).toEqual(['Ace', 'Me', 'Cee'])
    expect(w.find('.board-row.is-you .board-row__name-text').text()).toBe('Me')
    expect(w.findAll('.board-row__power').map((p) => p.text())).toEqual(['1200', '900', '–'])

    await tabs[1]!.trigger('click')
    await flushPromises()
    expect(w.findAll('[role="tab"]')[1]!.attributes('aria-selected')).toBe('true')
    expect(w.findAll('.board-row__name-text').map((n) => n.text())).toEqual(['Zed', 'Yan'])
    pb.setPlatformBoard(null)
  })
})

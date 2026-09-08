import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { POSTED_NAME_KEY, PLAYER_NAME_KEY, SUBMITTED_STAGE_KEY } from '@/keys'

/**
 * ─── Guests do not touch the board ──────────────────────────────────────────
 *
 * CrazyGames QA rejected a build over this, and the sentence is worth keeping
 * verbatim because it names the failure precisely:
 *
 *   "a guest can enter the leaderboard with a random name, then after logging
 *    in, that entry changes to the account username. This can eventually create
 *    duplicate or disappearing entries when switching between guest and
 *    logged-in states."
 *
 * The row is keyed by a per-device id and labelled with whatever name the
 * session can resolve, so one person playing as a guest and then signing in
 * posts twice under one id — the row survives and is RELABELLED. From the
 * outside that is a leaderboard entry that silently changed its name.
 *
 * TWO PROPERTIES CARRY THE FIX, and they pull in opposite directions:
 *
 *   1. On a platform WITH accounts, a signed-out player reaches nothing — no
 *      read, no write, no UI.
 *   2. On a platform WITHOUT accounts (Poki, GamePix, Playgama, itch, GD, Y8,
 *      GameMonetize — nearly every build this game ships), the leaderboard is
 *      completely unaffected, because nobody there can ever sign in and gating
 *      on "logged in" would delete the feature.
 *
 * So "no gate installed" and "gate says no" must never collapse into the same
 * state. Most of what follows is pinning that distinction down.
 */

const ENDPOINT = 'https://board.example.test'

interface Sent {
  url: string
  method: string
  body: Record<string, unknown> | null
}

const sent: Sent[] = []

const reply = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response

const BOARD = {
  updatedAt: 1_700_000_000_000,
  total: 250,
  entries: [
    { rank: 1, name: 'Ace', score: 80, power: 1200 },
    { rank: 2, name: 'Bex', score: 40, power: 900 }
  ]
}

/** Same fresh-module loader the rest of the leaderboard specs use: the endpoint
 *  is read from `import.meta.env` once at module scope, so a build's "has a
 *  board at all" answer is fixed the moment the module evaluates. */
const load = async (url: string = ENDPOINT) => {
  sent.length = 0
  vi.stubEnv('VITE_LEADERBOARD_URL', url)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  vi.stubGlobal('fetch', vi.fn(async (target: string, init?: RequestInit) => {
    sent.push({
      url: target,
      method: (init?.method ?? 'GET').toUpperCase(),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null
    })
    return reply({ rank: 7, best: 42, total: 250, board: BOARD })
  }))
  vi.resetModules()
  const state = await import('@/use/persistedState')
  const board = await import('@/use/useLiveLeaderboard')
  return { ...board, state }
}

const posts = (): Sent[] => sent.filter((c) => c.method === 'POST')
const gets = (): Sent[] => sent.filter((c) => c.method === 'GET')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('a platform with no account concept is untouched', () => {
  it('is authorized by default, with no gate ever installed', async () => {
    const lb = await load()

    expect(lb.leaderboardAuthorized.value).toBe(true)
    expect(lb.leaderboardVisible.value).toBe(true)

    await lb.reportRun(42, 900)

    // The ordinary contract still holds: one write for the record, and the
    // board that came back with it.
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toMatchObject({ score: 42, power: 900 })
  })

  it('treats an explicitly cleared gate as "no accounts", not "signed out"', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => false)
    expect(lb.leaderboardAuthorized.value).toBe(false)

    // Handing back `null` is how a platform says the question does not apply.
    lb.setLeaderboardAuthGate(null)
    expect(lb.leaderboardAuthorized.value).toBe(true)
  })
})

describe('a signed-out guest reaches nothing', () => {
  it('makes no request from any entry point', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => false)

    await lb.reportRun(42, 900)
    await lb.ensureBoard()
    expect(await lb.submitScore(42, 900)).toBe(false)

    // Not one GET either. `/top` is public, so this is the quota rule rather
    // than a security boundary — but a request whose result nobody may see is
    // a request worth not making.
    expect(sent).toHaveLength(0)
  })

  it('hides every UI entry point while the build still HAS a board', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => false)

    // The build-time answer is unchanged — this build does ship a board. It is
    // the player in front of it who may not have one.
    expect(lb.leaderboardEnabled).toBe(true)
    expect(lb.leaderboardVisible.value).toBe(false)
  })

  it('leaves the local posted-record bookkeeping alone', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => false)
    lb.state.setState(PLAYER_NAME_KEY, 'GuestPlayer')

    await lb.reportRun(42, 900)

    // Nothing was posted, so nothing may be recorded as posted. Were this
    // written anyway, signing in later would look like "already on the board
    // at 42" and the player's real first record would never be sent.
    expect(lb.state.getState(SUBMITTED_STAGE_KEY, 0)).toBe(0)
    expect(lb.state.getState(POSTED_NAME_KEY, '')).toBe('')
  })

  it('refuses a direct submitScore, not just reportRun', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => false)

    // `reportRun` is the entry point the game calls, but `submitScore` is the
    // function that actually writes a name to a public board, and the mixing it
    // would cause is not repairable from the client afterwards.
    expect(await lb.submitScore(99, 100)).toBe(false)
    expect(posts()).toHaveLength(0)
  })
})

describe('signing in mid-session', () => {
  it('opens the board reactively, without a reload', async () => {
    const lb = await load()
    // CG's account prompt lives in the portal chrome, so a player can sign in
    // without the game iframe ever reloading.
    const loggedIn = ref(false)
    lb.setLeaderboardAuthGate(() => loggedIn.value)

    expect(lb.leaderboardVisible.value).toBe(false)

    loggedIn.value = true
    expect(lb.leaderboardVisible.value).toBe(true)

    await lb.reportRun(42, 900)
    expect(posts()).toHaveLength(1)
  })

  it('posts the account name once, and never replays the guest history', async () => {
    const lb = await load()
    const loggedIn = ref(false)
    lb.setLeaderboardAuthGate(() => loggedIn.value)

    // A whole guest session: several runs, several records, no writes.
    await lb.reportRun(10, 100)
    await lb.reportRun(25, 400)
    await lb.reportRun(42, 900)
    expect(sent).toHaveLength(0)

    loggedIn.value = true
    lb.state.setState(PLAYER_NAME_KEY, 'RealAccount')
    await lb.reportRun(42, 900)

    // ONE row, carrying the account's name and the player's actual best. The
    // rejected build's failure mode was this same history arriving as a guest
    // row that later changed its name.
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toMatchObject({ score: 42, name: 'RealAccount' })
  })
})

describe('a broken gate fails closed', () => {
  it('treats a throwing gate as "not authorized"', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => {
      throw new Error('SDK exploded')
    })

    // A gate that cannot answer is a broken SDK, not an authorisation. The
    // failure this exists to prevent is a guest reaching the board.
    expect(lb.leaderboardAuthorized.value).toBe(false)
    expect(lb.leaderboardVisible.value).toBe(false)

    await lb.reportRun(42, 900)
    await lb.ensureBoard()
    expect(sent).toHaveLength(0)
  })

  it('still never throws on the path that ends a run', async () => {
    const lb = await load()
    lb.setLeaderboardAuthGate(() => {
      throw new Error('SDK exploded')
    })

    // `reportRun` is called with `void` and never awaited, so a rejection here
    // surfaces as an unhandled error on a player's finished run.
    await expect(lb.reportRun(42, 900)).resolves.toBeUndefined()
  })
})

describe('the gate does not disturb a build with no endpoint', () => {
  it('stays silent whether the player is signed in or not', async () => {
    const lb = await load('')
    lb.setLeaderboardAuthGate(() => true)

    await lb.reportRun(42, 900)
    await lb.ensureBoard()

    expect(sent).toHaveLength(0)
    expect(gets()).toHaveLength(0)
  })
})

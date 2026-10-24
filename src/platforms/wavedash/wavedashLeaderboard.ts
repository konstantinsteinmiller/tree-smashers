import { ref } from 'vue'
import { sanitizeDisplayName } from '@/utils/nameDenylist'
import {
  setPlatformBoard,
  setScoreMirror,
  type PlatformBoard,
  type PlatformBoardRow
} from '@/use/platformBoard'

/**
 * ─── The Wavedash leaderboard ───────────────────────────────────────────────
 *
 * Wavedash keeps leaderboards of its own, tied to Wavedash accounts
 * (docs.wavedash.com/sdk/leaderboards). Every player is signed in before the
 * game launches (docs.wavedash.com/sdk/players), so there are no guests and no
 * auth gate is needed here.
 *
 * WHAT IS MIRRORED, AND WHAT CANNOT BE. Every run our own board is told about
 * (`reportRun`) is also handed to `mirror`, which uploads the same number to
 * the Wavedash board: the lifetime best campaign stage, with the roster power
 * as entry metadata (`{ power }`). That is client-side, from the Wavedash build
 * only, and it is the whole mirror. Wavedash's HTTP API (api.wavedash.com) can
 * only PATCH a board's settings — there is no server endpoint that writes a
 * score, and scores belong to a Wavedash user id that only the player's own
 * session can write for. Players from other portals therefore cannot appear on
 * the Wavedash board, and the Worker has nothing to push.
 *
 * DEDUPE. Only a NEW personal best is uploaded, once: the session first reads
 * the player's saved Wavedash entry (`getMyLeaderboardEntries`) and anything at
 * or below it is never sent. `keepBest: true` makes the portal ignore a worse
 * score anyway, so even a retried upload cannot lower a row. Concurrent reports
 * coalesce into one in-flight upload that always carries the highest score.
 *
 * FAILURE. Like the rest of the leaderboard: nothing throws, nothing blocks a
 * run. A failed upload is retried by the next report (the next result screen);
 * a failed board lookup backs off for `LOOKUP_RETRY_MS`, because every failed
 * SDK call writes a `[WavedashJS]` error line to the console.
 *
 * Only documented SDK calls are used: `getOrCreateLeaderboard`,
 * `uploadLeaderboardScore`, `listLeaderboardEntries`,
 * `getMyLeaderboardEntries`, `getLeaderboardEntryCount`, `getUserId`.
 */

/** Wavedash's response envelope (`{ success, data, message }`). */
interface WdResponse<T> {
  success?: boolean
  data?: T | null
  message?: string
}

interface WdEntry {
  userId?: string
  username?: string
  score?: number
  globalRank?: number
  metadata?: Record<string, string | number | boolean>
}

/** The slice of the Wavedash SDK this module touches. */
export interface WavedashLeaderboardSdk {
  getOrCreateLeaderboard: (name: string, sortOrder: number, displayType: number) =>
    Promise<WdResponse<{ id?: string; totalEntries?: number }>>
  uploadLeaderboardScore: (
    leaderboardId: string, score: number, keepBest: boolean,
    ugcId?: string, metadata?: Record<string, string | number | boolean>
  ) => Promise<WdResponse<{ score?: number; globalRank?: number }>>
  listLeaderboardEntries: (leaderboardId: string, offset: number, limit: number, friendsOnly?: boolean) =>
    Promise<WdResponse<WdEntry[]>>
  getMyLeaderboardEntries: (leaderboardId: string) => Promise<WdResponse<WdEntry[]>>
  getLeaderboardEntryCount?: (leaderboardId: string) => number
  getUserId?: () => string
  LeaderboardSortOrder?: { DESC?: number }
  LeaderboardDisplayType?: { NUMERIC?: number }
}

export interface WavedashLeaderboardOptions {
  /** Resolves the injected SDK (`window.Wavedash`), or `null` without one. */
  getSdk: () => Promise<WavedashLeaderboardSdk | null | undefined>
  /** The board's name (lowercase `a-z0-9_-`), as created on the dashboard. */
  boardName: string
  /** Injected clock, for tests. */
  now?: () => number
}

/** Back-off after a failed board lookup (missing board, SDK not connected). */
export const LOOKUP_RETRY_MS = 60_000
/** A board read is reused for this long; reopening the modal inside it is free. */
export const BOARD_TTL_MS = 30_000
/** Rows read for the modal — the same top-100 our own board publishes. */
export const TOP_LIMIT = 100

/** The documented values, used when the SDK does not expose its enums. */
const SORT_DESC = 1
const DISPLAY_NUMERIC = 0

const toInt = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0))

// A failing SDK call must be VISIBLE in the console (the board is a decoration, so nothing
// throws or blocks), but only once per distinct message — never a per-frame flood.
// ...and its progress too (info), so ONE look at the console of a `wavedash dev` run shows how far
// a reported run got: mirror → board id → upload → saved rank. Cheap: a handful of lines per session.
const note = (msg: string): void => {
  if (typeof console !== 'undefined') console.info('[Wavedash leaderboard]', msg)
}
const warned = new Set<string>()
const warnOnce = (msg: string): void => {
  if (warned.has(msg) || warned.size > 20) return
  warned.add(msg)
  console.warn('[Wavedash leaderboard]', msg)
}
const describe = (res: unknown): string => {
  if (!res || typeof res !== 'object') return String(res)
  const r = res as Record<string, unknown>
  return String(r.message ?? r.error ?? JSON.stringify(res)).slice(0, 200)
}

export const createWavedashLeaderboard = (o: WavedashLeaderboardOptions) => {
  const now = o.now ?? Date.now

  // ── Board state (what the modal's Wavedash tab shows) ─────────────────────

  const rows = ref<PlatformBoardRow[]>([])
  const ownRank = ref(0)
  const total = ref(0)
  const pending = ref(false)
  const failed = ref(false)
  let fetchedAt = Number.NEGATIVE_INFINITY

  // ── SDK plumbing ──────────────────────────────────────────────────────────

  const sdk = async (): Promise<WavedashLeaderboardSdk | null> => {
    try {
      return (await o.getSdk()) ?? null
    } catch {
      return null
    }
  }

  /** One SDK call → its `data`, or `null` for ANY failure: a throw, a
   *  `success: false`, a missing method or a non-object answer. */
  const call = async <T>(fn: () => Promise<WdResponse<T>> | WdResponse<T>): Promise<T | null> => {
    try {
      const res = await fn()
      if (!res || typeof res !== 'object' || res.success !== true) {
        warnOnce(`SDK call refused: ${describe(res)}`)
        return null
      }
      return (res.data ?? null) as T | null
    } catch (e) {
      warnOnce(`SDK call threw: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  let boardId: string | null = null
  let lookup: Promise<string | null> | null = null
  let lookupFailedAt = Number.NEGATIVE_INFINITY

  /**
   * The board's ID, resolved once per session.
   *
   * `getOrCreateLeaderboard` rather than `getLeaderboard`: a board the owner
   * created on the dashboard is simply found (its own settings win), and a
   * missing one is created DESC / NUMERIC instead of failing every upload.
   * Wavedash creates a board that a PLAYER's session asked for as Hidden, so a
   * forgotten dashboard step costs visibility on the game page, never scores.
   */
  const resolveId = async (): Promise<string | null> => {
    if (boardId) return boardId
    if (lookup) return lookup
    if (now() - lookupFailedAt < LOOKUP_RETRY_MS) return null
    lookup = (async () => {
      const s = await sdk()
      const data = s && typeof s.getOrCreateLeaderboard === 'function'
        ? await call(() => s.getOrCreateLeaderboard(
          o.boardName,
          s.LeaderboardSortOrder?.DESC ?? SORT_DESC,
          s.LeaderboardDisplayType?.NUMERIC ?? DISPLAY_NUMERIC
        ))
        : null
      const id = data && typeof data.id === 'string' && data.id.length > 0 ? data.id : null
      if (id === null) {
        lookupFailedAt = now()
        return null
      }
      boardId = id
      note(`board "${o.boardName}" resolved (id ${id}, ${toInt(data?.totalEntries)} entries)`)
      if (Number(data?.totalEntries) > 0) total.value = toInt(data?.totalEntries)
      return id
    })().finally(() => {
      lookup = null
    })
    return lookup
  }

  /** The player's saved Wavedash score; uploads at or below it are skipped. */
  let postedBest = 0
  let seeded = false

  /** Read the player's own entry: their rank for the footer, and the saved
   *  best that the dedupe compares against. */
  const readOwnEntry = async (s: WavedashLeaderboardSdk, id: string): Promise<boolean> => {
    if (typeof s.getMyLeaderboardEntries !== 'function') return false
    const mine = await call(() => s.getMyLeaderboardEntries(id))
    if (!Array.isArray(mine)) return false
    const entry = mine[0]
    if (entry) {
      postedBest = Math.max(postedBest, toInt(entry.score))
      ownRank.value = toInt(entry.globalRank)
    }
    return true
  }

  const refresh = async (): Promise<void> => {
    if (pending.value || now() - fetchedAt < BOARD_TTL_MS) return
    pending.value = true
    try {
      const id = await resolveId()
      const s = id ? await sdk() : null
      const list = s && id && typeof s.listLeaderboardEntries === 'function'
        ? await call(() => s.listLeaderboardEntries(id, 0, TOP_LIMIT, false))
        : null
      if (!s || !id || !Array.isArray(list)) {
        failed.value = true
        return
      }
      let me = ''
      try {
        me = String(s.getUserId?.() ?? '')
      } catch { /* no id: nothing highlighted */ }
      rows.value = list
        .filter((e): e is WdEntry => !!e && typeof e === 'object')
        .map((e, i) => {
          const power = e.metadata?.power
          return {
            rank: toInt(e.globalRank) || i + 1,
            // The same mask our own board applies to every name it shows.
            name: sanitizeDisplayName(typeof e.username === 'string' ? e.username : ''),
            score: toInt(e.score),
            power: typeof power === 'number' && Number.isFinite(power) ? toInt(power) : null,
            isYou: me.length > 0 && e.userId === me
          }
        })
      let count = -1
      try {
        count = Number(s.getLeaderboardEntryCount?.(id) ?? -1)
      } catch { /* cached count unavailable */ }
      // A population smaller than the rows on screen is not a population.
      total.value = Math.max(Number.isFinite(count) && count > 0 ? count : total.value, rows.value.length)
      const you = rows.value.find((r) => r.isYou)
      if (you) ownRank.value = you.rank
      else await readOwnEntry(s, id)
      fetchedAt = now()
      failed.value = false
    } finally {
      pending.value = false
    }
  }

  // ── The mirror (every reported run) ───────────────────────────────────────

  /** The highest score waiting to go out, and the power that goes with it. */
  let target = 0
  let targetPower = 0
  let draining = false

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      const id = await resolveId()
      const s = id ? await sdk() : null
      if (!id || !s || typeof s.uploadLeaderboardScore !== 'function') {
        // Retried by the next report, which re-raises the target.
        target = postedBest
        return
      }
      // Once per session: learn what the board already holds, so a player
      // whose Wavedash best is current costs no write at all.
      if (!seeded) seeded = await readOwnEntry(s, id)
      while (target > postedBest) {
        const score = target
        const res = await call(() => s.uploadLeaderboardScore(
          id, score, true, undefined, { power: targetPower }
        ))
        if (res === null) {
          target = postedBest
          return
        }
        // The SAVED standing — with keepBest it can be above what we sent.
        note(`uploaded stage ${score} (saved ${toInt(res.score)}, rank ${toInt(res.globalRank)})`)
        postedBest = Math.max(postedBest, score, toInt(res.score))
        if (toInt(res.globalRank) > 0) ownRank.value = toInt(res.globalRank)
        // The modal's copy is now behind; the next open re-reads it.
        fetchedAt = Number.NEGATIVE_INFINITY
      }
    } finally {
      draining = false
    }
  }

  /** Hand a reported run to Wavedash. Fire-and-forget; never throws. */
  const mirror = (score: number, power: number): void => {
    const s = toInt(score)
    if (s <= 0 || s <= postedBest || s <= target) return
    note(`run reported: stage ${s}, power ${toInt(power)} → uploading`)
    target = s
    targetPower = toInt(power)
    void drain().catch(() => { target = postedBest })
  }

  const board: PlatformBoard = {
    labelKey: 'leaderboard.tabWavedash',
    rows,
    ownRank,
    total,
    pending,
    failed,
    refresh
  }

  return {
    mirror,
    board,
    /** Settles once the current upload queue is empty. For tests. */
    idle: async (): Promise<void> => {
      while (draining) await new Promise((r) => setTimeout(r, 0))
    }
  }
}

/**
 * The board's name, from `.env.wavedash.local`. Empty = the Wavedash
 * leaderboard is switched off and nothing below runs.
 */
const BOARD_NAME: string = (import.meta.env.VITE_WAVEDASH_LEADERBOARD_NAME ?? '').trim()

/**
 * Wire the Wavedash board into the shared leaderboard: the score mirror that
 * `reportRun` calls, and the second tab of the leaderboard modal. Called once,
 * from the Wavedash boot branch in `main.ts` only.
 */
export const installWavedashLeaderboard = (
  getSdk: WavedashLeaderboardOptions['getSdk']
): ReturnType<typeof createWavedashLeaderboard> | null => {
  if (BOARD_NAME.length === 0) {
    note('OFF: VITE_WAVEDASH_LEADERBOARD_NAME is empty in this build (.env.wavedash.local)')
    return null
  }
  note(`mirroring runs to board "${BOARD_NAME}"`)
  const lb = createWavedashLeaderboard({ getSdk, boardName: BOARD_NAME })
  setScoreMirror(lb.mirror)
  setPlatformBoard(lb.board)
  return lb
}

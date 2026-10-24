// ─── CrazyGames multiplayer bridge (invites, rooms, join listener) ──────────
//
// The CrazyGames-full build's half of PvP invites. Everything here goes
// through documented SDK v3 calls only (docs.crazygames.com/sdk/game):
//
//   game.updateRoom({ roomId, isJoinable, inviteParams })  Room Data: what the
//        friends drawer / invite notifications use to let a friend join.
//   game.leftRoom()                     the player left the room.
//   game.showInviteButton(params)       the invite button while a private room
//   game.hideInviteButton()             waits (deprecated in favour of Room
//                                       Data, still supported; we call both).
//   game.inviteLink(params)             a shareable crazygames.com link.
//   game.inviteParams / getInviteParam  the params a friend's link opened with.
//   game.addJoinRoomListener(cb)        a friend accepted while the game runs.
//   game.isInstantMultiplayer           "launch straight into multiplayer".
//
// Inert everywhere else: `CG_MULTIPLAYER` is a build literal (crazy-web AND
// the full release), so on every other PvP build (dev, GitHub Pages, native)
// each function folds to a no-op and nothing CrazyGames-specific runs. The SDK
// handle comes from `useCrazyGames` (null until `initCrazyGames` activated it);
// every function also takes an explicit `sdk` for tests.
//
// Room lifecycle (`syncCrazyRoom`, driven by usePVP's state):
//   private host waiting for a friend  → joinable room + invite button
//   two players in a lobby / a match   → room reported full, button hidden
//   searching, a bot match, idle, error → left the room, button hidden

import { getActiveCrazySdk } from '@/use/useCrazyGames'
import { sanitizeDisplayName } from '@/utils/nameDenylist'

export const CG_MULTIPLAYER: boolean =
  import.meta.env.VITE_APP_CRAZY_WEB === 'true' && import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'

/** Invite param carrying the host's room (= its PeerJS id). */
export const INVITE_ROOM_PARAM = 'roomId'
/** Invite param carrying the host's display name ("Joining <name>'s match"). */
export const INVITE_HOST_PARAM = 'host'

/** A room id this game minted: the PeerJS id shape (`ca-xxxxxx`). */
export const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]{3,39}$/

export interface CrazyInvite {
  roomId: string
  /** The inviting player's name, cleaned; null when absent. */
  hostName: string | null
}

type Sdk = any

const resolveSdk = (sdk?: Sdk): Sdk => (sdk !== undefined ? sdk : CG_MULTIPLAYER ? getActiveCrazySdk() : null)

/** Strip controls / zero-width / bidi characters, cap, denylist-mask. */
export const cleanInviteName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, '').trim().slice(0, 20)
  return s ? sanitizeDisplayName(s) : null
}

/** Validate a raw invite-params object (from the SDK or the join listener). */
export const parseInviteParams = (raw: unknown): CrazyInvite | null => {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const room = typeof p[INVITE_ROOM_PARAM] === 'string' ? (p[INVITE_ROOM_PARAM] as string).trim().toLowerCase() : ''
  if (!ROOM_ID_RE.test(room)) return null
  return { roomId: room, hostName: cleanInviteName(p[INVITE_HOST_PARAM]) }
}

/** The invite this session was opened with, or null. Reads `inviteParams`
 *  first and falls back to `getInviteParam` (both documented). */
export const readCrazyInvite = (sdk?: Sdk): CrazyInvite | null => {
  const s = resolveSdk(sdk)
  if (!s?.game) return null
  try {
    const all = s.game.inviteParams
    const fromAll = parseInviteParams(all)
    if (fromAll) return fromAll
    if (typeof s.game.getInviteParam === 'function') {
      return parseInviteParams({
        [INVITE_ROOM_PARAM]: s.game.getInviteParam(INVITE_ROOM_PARAM),
        [INVITE_HOST_PARAM]: s.game.getInviteParam(INVITE_HOST_PARAM)
      })
    }
  } catch (e) {
    console.warn('[crazygames] invite params read failed', e)
  }
  return null
}

/** `isInstantMultiplayer` — true: put the player straight into a private room. */
export const isCrazyInstantMultiplayer = (sdk?: Sdk): boolean => {
  const s = resolveSdk(sdk)
  try {
    return s?.game?.isInstantMultiplayer === true
  } catch {
    return false
  }
}

const inviteParamsFor = (roomId: string, hostName: string | null): Record<string, string> =>
  hostName ? { [INVITE_ROOM_PARAM]: roomId, [INVITE_HOST_PARAM]: hostName } : { [INVITE_ROOM_PARAM]: roomId }

/** A crazygames.com link that opens this room for a friend; null off-platform
 *  or when the SDK refuses (the caller keeps its own link then). */
export const crazyInviteLink = async (roomId: string, hostName: string | null, sdk?: Sdk): Promise<string | null> => {
  const s = resolveSdk(sdk)
  if (typeof s?.game?.inviteLink !== 'function') return null
  try {
    const link = await s.game.inviteLink(inviteParamsFor(roomId, hostName))
    return typeof link === 'string' && link ? link : null
  } catch (e) {
    console.warn('[crazygames] inviteLink failed', e)
    return null
  }
}

/** Subscribe to "a friend accepted an invite while the game runs". */
export const onCrazyJoinRoom = (cb: (invite: CrazyInvite) => void, sdk?: Sdk): (() => void) => {
  const s = resolveSdk(sdk)
  if (typeof s?.game?.addJoinRoomListener !== 'function') return () => {}
  const listener = (params: unknown) => {
    const invite = parseInviteParams(params)
    if (invite) cb(invite)
  }
  try {
    s.game.addJoinRoomListener(listener)
  } catch (e) {
    console.warn('[crazygames] addJoinRoomListener failed', e)
    return () => {}
  }
  return () => {
    try {
      s.game.removeJoinRoomListener?.(listener)
    } catch { /* gone */ }
  }
}

// ─── Room state ──────────────────────────────────────────────────────────────

export type CrazyRoomState =
  | { kind: 'none' }
  | { kind: 'joinable'; roomId: string; hostName: string | null }
  | { kind: 'full'; roomId: string; hostName: string | null }

export interface CrazyRoomInput {
  status: string
  role: 'host' | 'guest' | null
  /** The room's id: the host's own peer id, or the host a guest joined. */
  roomId: string
  matchKind: 'private' | 'quick' | 'bot' | null
  hostName: string | null
}

/** What the platform should know about the player's room right now. */
export const crazyRoomStateFor = (i: CrazyRoomInput): CrazyRoomState => {
  if (!i.roomId || i.matchKind === 'bot' || i.matchKind === 'quick') return { kind: 'none' }
  if (i.role === 'host' && i.status === 'waiting') return { kind: 'joinable', roomId: i.roomId, hostName: i.hostName }
  if (i.status === 'lobby' || i.status === 'ready' || i.status === 'playing') {
    return { kind: 'full', roomId: i.roomId, hostName: i.hostName }
  }
  return { kind: 'none' }
}

let reported: CrazyRoomState = { kind: 'none' }
let inviteButtonShown = false

/** Test seam: whether this module last showed the invite button. */
export const isCrazyInviteButtonShown = (): boolean => inviteButtonShown
/** Test seam. */
export const __resetCrazyRoom = (): void => {
  reported = { kind: 'none' }
  inviteButtonShown = false
}

const sameState = (a: CrazyRoomState, b: CrazyRoomState): boolean =>
  a.kind === b.kind && (a.kind === 'none' || (b.kind !== 'none' && a.roomId === b.roomId && a.hostName === b.hostName))

/**
 * Report `next` to the platform — only on change. The invite button is shown
 * exactly while a private room waits for its friend, and hidden on every
 * other state (full, left, searching, bot, error).
 */
export const syncCrazyRoom = (next: CrazyRoomState, sdk?: Sdk): void => {
  const s = resolveSdk(sdk)
  if (!s?.game) return
  if (sameState(reported, next)) return
  const prev = reported
  reported = next
  const g = s.game
  try {
    if (next.kind === 'none') {
      if (prev.kind !== 'none') g.leftRoom?.()
    } else {
      g.updateRoom?.({
        roomId: next.roomId,
        isJoinable: next.kind === 'joinable',
        inviteParams: inviteParamsFor(next.roomId, next.hostName)
      })
    }
  } catch (e) {
    console.warn('[crazygames] room update failed', e)
  }
  try {
    if (next.kind === 'joinable' && !inviteButtonShown) {
      if (typeof g.showInviteButton === 'function') {
        g.showInviteButton(inviteParamsFor(next.roomId, next.hostName))
        inviteButtonShown = true
      }
    } else if (next.kind !== 'joinable' && inviteButtonShown) {
      g.hideInviteButton?.()
      inviteButtonShown = false
    }
  } catch (e) {
    console.warn('[crazygames] invite button failed', e)
  }
}

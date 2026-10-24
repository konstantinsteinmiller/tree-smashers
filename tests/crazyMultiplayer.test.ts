// ─── CrazyGames multiplayer bridge: invite params, links, room lifecycle ────
//
// src/use/crazyMultiplayer.ts talks to a MOCK SDK here (every function takes
// an explicit `sdk`). Pinned: invite params are read through the documented
// `inviteParams` / `getInviteParam` and validated; the join-room listener
// routes a friend's invite; the invite link carries the room; and the invite
// button is shown ONLY while a private room waits for its friend — hidden on
// every other lobby state — with Room Data (`updateRoom` / `leftRoom`) kept in
// step and reported only on change.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INVITE_HOST_PARAM,
  INVITE_ROOM_PARAM,
  __resetCrazyRoom,
  cleanInviteName,
  crazyInviteLink,
  crazyRoomStateFor,
  isCrazyInstantMultiplayer,
  isCrazyInviteButtonShown,
  onCrazyJoinRoom,
  parseInviteParams,
  readCrazyInvite,
  syncCrazyRoom,
  type CrazyRoomInput
} from '@/use/crazyMultiplayer'

const mockSdk = (game: Record<string, unknown> = {}) => {
  const listeners: ((p: unknown) => void)[] = []
  const g = {
    inviteParams: null as unknown,
    getInviteParam: vi.fn((_k: string): string | null => null),
    inviteLink: vi.fn((params: Record<string, string>) =>
      `https://www.crazygames.com/game/tree-smashers?${new URLSearchParams(params).toString()}`),
    showInviteButton: vi.fn(),
    hideInviteButton: vi.fn(),
    updateRoom: vi.fn(),
    leftRoom: vi.fn(),
    addJoinRoomListener: vi.fn((cb: (p: unknown) => void) => {
      listeners.push(cb)
    }),
    removeJoinRoomListener: vi.fn((cb: (p: unknown) => void) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }),
    isInstantMultiplayer: false,
    ...game
  }
  return { sdk: { game: g }, g, fireJoin: (p: unknown) => listeners.forEach(l => l(p)) }
}

describe('invite params', () => {
  it('accepts a room id this game minted, with the host name', () => {
    expect(parseInviteParams({ roomId: 'ca-abc123', host: 'TurboOtter7' })).toEqual({ roomId: 'ca-abc123', hostName: 'TurboOtter7' })
    expect(parseInviteParams({ roomId: ' CA-ABC123 ' })).toEqual({ roomId: 'ca-abc123', hostName: null })
  })

  it('refuses anything else (no room, junk, injection-shaped ids)', () => {
    for (const bad of [null, undefined, 'ca-abc', 42, {}, { roomId: '' }, { roomId: 'a' }, { roomId: 'ca abc' },
      { roomId: '<script>' }, { roomId: 'x'.repeat(80) }, { room: 'ca-abc123' }]) {
      expect(parseInviteParams(bad)).toBeNull()
    }
  })

  it('cleans the host name (controls, bidi overrides, length, denylist)', () => {
    expect(cleanInviteName('‮evil\u0000name')).toBe('evilname')
    expect(cleanInviteName('x'.repeat(40))).toHaveLength(20)
    expect(cleanInviteName('   ')).toBeNull()
    expect(cleanInviteName(7)).toBeNull()
  })

  it('reads `inviteParams` on load', () => {
    const { sdk } = mockSdk({ inviteParams: { [INVITE_ROOM_PARAM]: 'ca-room42', [INVITE_HOST_PARAM]: 'Kumo_Lynx' } })
    expect(readCrazyInvite(sdk)).toEqual({ roomId: 'ca-room42', hostName: 'Kumo_Lynx' })
  })

  it('falls back to `getInviteParam` when `inviteParams` is absent', () => {
    const { sdk, g } = mockSdk()
    g.getInviteParam.mockImplementation((k: string) => (k === INVITE_ROOM_PARAM ? 'ca-zz9911' : null))
    expect(readCrazyInvite(sdk)).toEqual({ roomId: 'ca-zz9911', hostName: null })
    expect(g.getInviteParam).toHaveBeenCalledWith(INVITE_ROOM_PARAM)
  })

  it('no invite, no SDK, a throwing SDK: null', () => {
    expect(readCrazyInvite(mockSdk().sdk)).toBeNull()
    expect(readCrazyInvite(null)).toBeNull()
    const throwing = { game: { get inviteParams () { throw new Error('boom') } } }
    expect(readCrazyInvite(throwing)).toBeNull()
  })

  it('instant multiplayer reads the documented flag', () => {
    expect(isCrazyInstantMultiplayer(mockSdk({ isInstantMultiplayer: true }).sdk)).toBe(true)
    expect(isCrazyInstantMultiplayer(mockSdk().sdk)).toBe(false)
    expect(isCrazyInstantMultiplayer(null)).toBe(false)
  })

  it('off the CrazyGames-full build every call is inert (no SDK resolved)', () => {
    // Vitest builds are not crazy-web: the default SDK resolution is null.
    expect(readCrazyInvite()).toBeNull()
    expect(isCrazyInstantMultiplayer()).toBe(false)
    expect(() => syncCrazyRoom({ kind: 'none' })).not.toThrow()
  })
})

describe('invite link + join listener', () => {
  it('asks the SDK for a link carrying the room and the host name', async () => {
    const { sdk, g } = mockSdk()
    const link = await crazyInviteLink('ca-abc123', 'TurboOtter7', sdk)
    expect(g.inviteLink).toHaveBeenCalledWith({ roomId: 'ca-abc123', host: 'TurboOtter7' })
    expect(link).toContain('roomId=ca-abc123')
  })

  it('handles an async inviteLink and a refusal', async () => {
    const asyncSdk = mockSdk({ inviteLink: vi.fn(async () => 'https://www.crazygames.com/x?roomId=ca-1') }).sdk
    expect(await crazyInviteLink('ca-11111', null, asyncSdk)).toBe('https://www.crazygames.com/x?roomId=ca-1')
    const failing = mockSdk({ inviteLink: vi.fn(() => { throw new Error('nope') }) }).sdk
    expect(await crazyInviteLink('ca-11111', null, failing)).toBeNull()
    expect(await crazyInviteLink('ca-11111', null, null)).toBeNull()
  })

  it('routes a friend accepting mid-session, ignores junk, unsubscribes', () => {
    const { sdk, g, fireJoin } = mockSdk()
    const got = vi.fn()
    const off = onCrazyJoinRoom(got, sdk)
    fireJoin({ roomId: 'ca-friend1', host: 'Sora.Panda' })
    fireJoin({ nope: true })
    expect(got).toHaveBeenCalledTimes(1)
    expect(got).toHaveBeenCalledWith({ roomId: 'ca-friend1', hostName: 'Sora.Panda' })
    off()
    expect(g.removeJoinRoomListener).toHaveBeenCalledTimes(1)
    fireJoin({ roomId: 'ca-friend2' })
    expect(got).toHaveBeenCalledTimes(1)
  })
})

describe('room state + invite button lifecycle', () => {
  const at = (over: Partial<CrazyRoomInput>): CrazyRoomInput => ({
    status: 'idle', role: null, roomId: '', matchKind: null, hostName: null, ...over
  })

  beforeEach(() => {
    __resetCrazyRoom()
  })

  it('derives the room from the lobby state', () => {
    expect(crazyRoomStateFor(at({}))).toEqual({ kind: 'none' })
    expect(crazyRoomStateFor(at({ status: 'creating', role: 'host', matchKind: 'private' })).kind).toBe('none')
    expect(crazyRoomStateFor(at({ status: 'waiting', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' })))
      .toEqual({ kind: 'joinable', roomId: 'ca-a1b2c3', hostName: 'Me' })
    for (const status of ['lobby', 'ready', 'playing']) {
      expect(crazyRoomStateFor(at({ status, role: 'guest', roomId: 'ca-a1b2c3', matchKind: 'private' })).kind).toBe('full')
    }
    // Random search and bot matches are never platform rooms.
    expect(crazyRoomStateFor(at({ status: 'searching', matchKind: 'quick', roomId: 'ts-qm5-2v-0' })).kind).toBe('none')
    expect(crazyRoomStateFor(at({ status: 'lobby', role: 'host', matchKind: 'quick', roomId: 'ts-qm5-2v-0' })).kind).toBe('none')
    expect(crazyRoomStateFor(at({ status: 'playing', role: 'host', matchKind: 'bot', roomId: 'x' })).kind).toBe('none')
    for (const status of ['error', 'expired', 'disconnected']) {
      expect(crazyRoomStateFor(at({ status, role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private' })).kind).toBe('none')
    }
  })

  it('shows the invite button only while the private room waits, hides it after', () => {
    const { sdk, g } = mockSdk()
    const flow: CrazyRoomInput[] = [
      at({}),
      at({ status: 'creating', role: 'host', matchKind: 'private' }),
      at({ status: 'waiting', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' }),
      at({ status: 'waiting', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' }),
      at({ status: 'lobby', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' }),
      at({ status: 'playing', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' }),
      at({ status: 'lobby', role: 'host', roomId: 'ca-a1b2c3', matchKind: 'private', hostName: 'Me' }),
      at({})
    ]
    const shown: boolean[] = []
    for (const s of flow) {
      syncCrazyRoom(crazyRoomStateFor(s), sdk)
      shown.push(isCrazyInviteButtonShown())
    }
    expect(shown).toEqual([false, false, true, true, false, false, false, false])
    expect(g.showInviteButton).toHaveBeenCalledTimes(1)
    expect(g.showInviteButton).toHaveBeenCalledWith({ roomId: 'ca-a1b2c3', host: 'Me' })
    expect(g.hideInviteButton).toHaveBeenCalledTimes(1)
    // Room Data: joinable once, then full once (playing → lobby is the same
    // room, still full: no repeat), then left.
    expect(g.updateRoom.mock.calls.map(c => c[0].isJoinable)).toEqual([true, false])
    expect(g.updateRoom.mock.calls[0]![0]).toEqual({ roomId: 'ca-a1b2c3', isJoinable: true, inviteParams: { roomId: 'ca-a1b2c3', host: 'Me' } })
    expect(g.leftRoom).toHaveBeenCalledTimes(1)
  })

  it('an expired / cancelled invite hides the button and leaves the room', () => {
    const { sdk, g } = mockSdk()
    syncCrazyRoom(crazyRoomStateFor(at({ status: 'waiting', role: 'host', roomId: 'ca-q1w2e3', matchKind: 'private' })), sdk)
    expect(isCrazyInviteButtonShown()).toBe(true)
    syncCrazyRoom(crazyRoomStateFor(at({ status: 'expired', role: 'host', roomId: 'ca-q1w2e3', matchKind: 'private' })), sdk)
    expect(isCrazyInviteButtonShown()).toBe(false)
    expect(g.hideInviteButton).toHaveBeenCalledTimes(1)
    expect(g.leftRoom).toHaveBeenCalledTimes(1)
  })

  it('a guest who joined reports the host\'s room as full and never shows the button', () => {
    const { sdk, g } = mockSdk()
    syncCrazyRoom(crazyRoomStateFor(at({ status: 'connecting', role: 'guest', roomId: 'ca-host01', matchKind: 'private' })), sdk)
    syncCrazyRoom(crazyRoomStateFor(at({ status: 'lobby', role: 'guest', roomId: 'ca-host01', matchKind: 'private', hostName: 'Pal' })), sdk)
    expect(g.updateRoom).toHaveBeenCalledWith({ roomId: 'ca-host01', isJoinable: false, inviteParams: { roomId: 'ca-host01', host: 'Pal' } })
    expect(g.showInviteButton).not.toHaveBeenCalled()
  })

  it('an SDK without the deprecated invite button still gets Room Data', () => {
    const { sdk, g } = mockSdk({ showInviteButton: undefined, hideInviteButton: undefined })
    syncCrazyRoom(crazyRoomStateFor(at({ status: 'waiting', role: 'host', roomId: 'ca-n0btn1', matchKind: 'private' })), sdk)
    expect(g.updateRoom).toHaveBeenCalledTimes(1)
    expect(isCrazyInviteButtonShown()).toBe(false)
  })
})

// ─── Random search, bot fill and invite joins over a fake PeerJS ────────────
//
// `usePVP` is a module singleton, so two "browsers" are two module graphs
// (`vi.resetModules()` + dynamic import) sharing one in-memory PeerJS broker
// (ids, connections, signaling disconnects, optional wire latency). Pinned:
//   • two searchers pair up: one hosts the slot, the other knocks; hellos
//     carry names + levels; both auto-ready and the host starts after the
//     found card; the slot id is given back;
//   • a lone searcher gets a bot after the rolled 15–25 s wait — the found
//     card, then the bot match (no network), then back to the start screen;
//   • a human who turns up during the wait — even mid-handshake at the
//     deadline — wins over the bot;
//   • cancel stops everything (no late bot);
//   • invite joins: "joining <friend>" state, hello names, graceful failure
//     (room gone) and a watchdog when the host never answers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { smasherConfig, SMASHER_IDS, type SmasherId } from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'
import type { BotOpponent } from '@/use/pvpBots'

// ── Fake PeerJS (shared broker across module graphs) ─────────────────────────
const fake = vi.hoisted(() => {
  type Handler = (...a: any[]) => void
  class Emitter {
    private h = new Map<string, Handler[]>()
    on (e: string, f: Handler) {
      this.h.set(e, [...(this.h.get(e) ?? []), f])
      return this
    }
    off (e: string, f: Handler) {
      this.h.set(e, (this.h.get(e) ?? []).filter(x => x !== f))
      return this
    }
    emit (e: string, ...a: any[]) {
      for (const f of [...(this.h.get(e) ?? [])]) f(...a)
    }
  }
  const broker = {
    peers: new Map<string, FakePeer>(),
    /** Delay before a connection opens (a slow handshake). */
    openLatencyMs: 0,
    /** Signaling unreachable: peers never open. */
    offline: false,
    created: [] as string[]
  }
  class FakeConn extends Emitter {
    open = false
    closed = false
    other: FakeConn | null = null
    constructor (public peer: string) {
      super()
    }
    _open () {
      if (this.closed) return
      this.open = true
      this.emit('open')
    }
    send (d: unknown) {
      if (!this.open) throw new Error('not open')
      const o = this.other
      const copy = JSON.parse(JSON.stringify(d))
      queueMicrotask(() => {
        if (o && o.open) o.emit('data', copy)
      })
    }
    close () {
      if (this.closed) return
      const was = this.open
      this.open = false
      this.closed = true
      const o = this.other
      this.other = null
      if (was) this.emit('close')
      if (o && !o.closed) queueMicrotask(() => o.close())
    }
  }
  class FakePeer extends Emitter {
    id: string
    destroyed = false
    disconnected = false
    conns: FakeConn[] = []
    constructor (id?: string) {
      super()
      this.id = id ?? `auto-${Math.random().toString(36).slice(2, 10)}`
      broker.created.push(this.id)
      queueMicrotask(() => {
        if (this.destroyed || broker.offline) return
        if (broker.peers.has(this.id)) {
          this.emit('error', { type: 'unavailable-id' })
          return
        }
        broker.peers.set(this.id, this)
        this.emit('open', this.id)
      })
    }
    connect (target: string) {
      const local = new FakeConn(target)
      this.conns.push(local)
      queueMicrotask(() => {
        const host = broker.peers.get(target)
        if (!host || host.destroyed || host.disconnected) {
          this.emit('error', { type: 'peer-unavailable' })
          return
        }
        const remote = new FakeConn(this.id)
        host.conns.push(remote)
        local.other = remote
        remote.other = local
        host.emit('connection', remote)
        const openBoth = () => {
          remote._open()
          local._open()
        }
        if (broker.openLatencyMs > 0) setTimeout(openBoth, broker.openLatencyMs)
        else queueMicrotask(openBoth)
      })
      return local
    }
    disconnect () {
      if (broker.peers.get(this.id) === this) broker.peers.delete(this.id)
      if (!this.disconnected) {
        this.disconnected = true
        this.emit('disconnected', this.id)
      }
    }
    reconnect () {
      if (this.destroyed || broker.peers.has(this.id)) return
      broker.peers.set(this.id, this)
      this.disconnected = false
    }
    destroy () {
      if (this.destroyed) return
      this.destroyed = true
      if (broker.peers.get(this.id) === this) broker.peers.delete(this.id)
      this.disconnected = true
      for (const c of this.conns) c.close()
    }
  }
  return { broker, FakePeer }
})

vi.mock('peerjs', () => ({ default: fake.FakePeer }))

type PvpModule = typeof import('@/use/usePVP')

const loadPvp = async (): Promise<PvpModule> => {
  vi.resetModules()
  // useMatch <-> useModels <-> useUser cycle: useUser first.
  await import('@/use/useUser')
  return import('@/use/usePVP')
}

const myTeam: SpinnerConfig[] = [smasherConfig(SMASHER_IDS[0] as SmasherId, 5), smasherConfig(SMASHER_IDS[1] as SmasherId, 6)]

const botOf = (name: string): BotOpponent => ({
  profile: { name, level: 6, tier: 'bronze', bot: true },
  team: [smasherConfig(SMASHER_IDS[2] as SmasherId, 5), smasherConfig(SMASHER_IDS[3] as SmasherId, 6)],
  seed: 1234,
  firstTurn: 'player',
  skill: 0.45
})

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  fake.broker.peers.clear()
  fake.broker.openLatencyMs = 0
  fake.broker.offline = false
  fake.broker.created.length = 0
  ;(window as unknown as { __i18n?: unknown }).__i18n = { global: { t: (k: string) => `T:${k}` } }
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { __i18n?: unknown }).__i18n
})

describe('random search — two humans', () => {
  it('pairs two searchers, trades hellos, auto-readies and starts; no bot', async () => {
    const A = await loadPvp()
    const B = await loadPvp()
    const a = A.default()
    const b = B.default()
    A.setLocalPvpProfile({ name: 'Alice', level: 5 })
    B.setLocalPvpProfile({ name: 'Bob', level: 7 })
    const startA = vi.fn()
    const startB = vi.fn()
    a.registerCallbacks(startA, () => {})
    b.registerCallbacks(startB, () => {})
    const botA = vi.fn(() => botOf('BotA'))
    const botB = vi.fn(() => botOf('BotB'))

    a.startQuickMatch({ teamSize: 2, teamFor: () => myTeam, createBot: botA, rand: () => 0.5 })
    expect(a.status.value).toBe('searching')
    expect(a.matchKind.value).toBe('quick')
    await tick(10_000) // A waits alone for a while (hosting slot 0)
    expect(a.searchElapsedMs.value).toBeGreaterThanOrEqual(9_750)
    expect(fake.broker.peers.has(A.quickMatchSlotId(2, 0))).toBe(true)

    b.startQuickMatch({ teamSize: 2, teamFor: () => myTeam, createBot: botB, rand: () => 0.5 })
    await tick(50)

    expect(a.role.value).toBe('host')
    expect(b.role.value).toBe('guest')
    expect(a.status.value === 'lobby' || a.status.value === 'ready').toBe(true)
    expect(a.opponentProfile.value).toMatchObject({ name: 'Bob', level: 7, tier: 'bronze' })
    expect(b.opponentProfile.value).toMatchObject({ name: 'Alice', level: 5, tier: 'bronze' })
    // The slot id went back to the broker for the next searcher.
    expect(fake.broker.peers.has(A.quickMatchSlotId(2, 0))).toBe(false)
    // Both auto-readied; the host starts after the found card.
    expect(a.hostReady.value && a.guestReady.value).toBe(true)
    expect(startA).not.toHaveBeenCalled()
    await tick(2_000)
    expect(startA).toHaveBeenCalledTimes(1)
    expect(startB).toHaveBeenCalledTimes(1)
    expect(a.status.value).toBe('playing')
    expect(b.status.value).toBe('playing')
    // Same host config on both sides.
    expect(b.gameConfig.value).toEqual(a.gameConfig.value)
    // Long past both bot deadlines: no bot.
    await tick(40_000)
    expect(botA).not.toHaveBeenCalled()
    expect(botB).not.toHaveBeenCalled()
    a.leavePvP()
    b.leavePvP()
  })

  it('prefers a human whose handshake is in flight at the bot deadline', async () => {
    const A = await loadPvp()
    const B = await loadPvp()
    const a = A.default()
    const b = B.default()
    a.registerCallbacks(() => {}, () => {})
    b.registerCallbacks(() => {}, () => {})
    const botA = vi.fn(() => botOf('BotA'))
    a.startQuickMatch({ teamSize: 1, teamFor: () => myTeam.slice(0, 1), createBot: botA, botWaitMs: 20_000 })
    await tick(19_000)
    fake.broker.openLatencyMs = 3_000 // B's connection opens 3 s later
    b.startQuickMatch({ teamSize: 1, teamFor: () => myTeam.slice(0, 1), createBot: () => botOf('BotB'), botWaitMs: 20_000 })
    await tick(1_100) // A's deadline passes with B's knock in flight
    expect(botA).not.toHaveBeenCalled()
    expect(a.status.value).toBe('searching')
    await tick(3_000)
    expect(botA).not.toHaveBeenCalled()
    expect(a.opponentProfile.value?.bot).toBeUndefined()
    expect(['lobby', 'ready', 'playing']).toContain(a.status.value)
    a.leavePvP()
    b.leavePvP()
  })

  it('a partner who leaves before the first match: search again, timer kept', async () => {
    const A = await loadPvp()
    const B = await loadPvp()
    const a = A.default()
    const b = B.default()
    a.registerCallbacks(() => {}, () => {})
    b.registerCallbacks(() => {}, () => {})
    a.startQuickMatch({ teamSize: 2, teamFor: () => myTeam, createBot: () => botOf('BotA'), botWaitMs: 20_000 })
    await tick(5_000)
    b.startQuickMatch({ teamSize: 2, teamFor: () => myTeam, createBot: () => botOf('BotB'), botWaitMs: 20_000 })
    await tick(50)
    expect(['lobby', 'ready']).toContain(a.status.value)
    b.cancelQuickMatch() // B leaves during the found card
    await tick(50)
    expect(a.status.value).toBe('searching')
    expect(a.searchElapsedMs.value).toBeGreaterThanOrEqual(5_000)
    // A's original bot deadline (20 s) still holds.
    await tick(15_200)
    expect(a.status.value).toBe('found')
    expect(a.matchKind.value).toBe('bot')
    a.leavePvP()
  })
})

describe('random search — bot fill', () => {
  it('no human in the rolled wait: found card, then a local bot match', async () => {
    const A = await loadPvp()
    const a = A.default()
    A.setLocalPvpProfile({ name: 'Solo', level: 6 })
    const onBot = vi.fn()
    a.registerBotMatchStart(onBot)
    const bot = botOf('Kumo_Lynx42')
    const createBot = vi.fn(() => bot)
    // rand 0.3 → 15 000 + 0.3 × 10 000 = 18 000 ms
    a.startQuickMatch({ teamSize: 2, teamFor: () => myTeam, createBot, rand: () => 0.3 })
    await tick(17_999)
    expect(createBot).not.toHaveBeenCalled()
    expect(a.status.value).toBe('searching')
    await tick(1)
    expect(createBot).toHaveBeenCalledTimes(1)
    expect(a.status.value).toBe('found')
    expect(a.matchKind.value).toBe('bot')
    expect(a.opponentProfile.value).toEqual(bot.profile)
    expect(a.remotePlayerName.value).toBe('Kumo_Lynx42')
    // No human can arrive into a bot match: every peer is gone.
    expect([...fake.broker.peers.keys()].filter(k => k.startsWith('ts-qm'))).toEqual([])
    expect(onBot).not.toHaveBeenCalled()
    await tick(2_000)
    expect(onBot).toHaveBeenCalledWith(bot)
    expect(a.status.value).toBe('playing')
    expect(a.role.value).toBe('host')
    expect(a.hostTeam.value).toEqual(myTeam)
    expect(a.guestTeam.value).toEqual(bot.team)
    // After the result screen: back to the start screen, not a dead lobby.
    a.returnToLobby()
    expect(a.status.value).toBe('idle')
    expect(a.matchKind.value).toBeNull()
  })

  it('offline (no signaling at all): the bot still fills in on time', async () => {
    fake.broker.offline = true
    const A = await loadPvp()
    const a = A.default()
    const createBot = vi.fn(() => botOf('Sora.Panda'))
    a.startQuickMatch({ teamSize: 1, teamFor: () => myTeam.slice(0, 1), createBot, botWaitMs: 15_000 })
    await tick(15_000)
    expect(createBot).toHaveBeenCalledTimes(1)
    expect(a.status.value).toBe('found')
    a.leavePvP()
  })

  it('cancel stops the search: no late bot, slot released', async () => {
    const A = await loadPvp()
    const a = A.default()
    const createBot = vi.fn(() => botOf('X'))
    a.startQuickMatch({ teamSize: 3, teamFor: () => myTeam, createBot, botWaitMs: 16_000 })
    await tick(3_000)
    expect(fake.broker.peers.has(A.quickMatchSlotId(3, 0))).toBe(true)
    a.cancelQuickMatch()
    expect(a.status.value).toBe('idle')
    await tick(60_000)
    expect(createBot).not.toHaveBeenCalled()
    expect(fake.broker.peers.size).toBe(0)
  })

  it('a bot factory that cannot build fails the search gracefully', async () => {
    const A = await loadPvp()
    const a = A.default()
    a.startQuickMatch({ teamSize: 2, teamFor: () => [], createBot: () => null, botWaitMs: 15_000 })
    await tick(15_000)
    expect(a.status.value).toBe('error')
    expect(a.errorMessage.value).toBe('T:pvp.searchFailed')
  })
})

describe('invite join (private room)', () => {
  it('joins a friend\'s room: joining state, then both see each other\'s names', async () => {
    const A = await loadPvp()
    const B = await loadPvp()
    const a = A.default()
    const b = B.default()
    A.setLocalPvpProfile({ name: 'HostPal', level: 9 })
    B.setLocalPvpProfile({ name: 'Friend', level: 4 })
    await a.createLobby({ arenaType: 'default', teamSize: 2, levelOne: false })
    await tick(10)
    expect(a.status.value).toBe('waiting')
    expect(a.matchKind.value).toBe('private')
    const room = a.peerId.value
    expect(room).toMatch(/^ca-/)

    fake.broker.openLatencyMs = 500
    const join = b.joinLobby(room, { friendName: 'HostPal' })
    expect(b.status.value).toBe('connecting')
    expect(b.joiningFriendName.value).toBe('HostPal')
    await join
    await tick(600)
    expect(a.status.value).toBe('lobby')
    expect(b.status.value).toBe('lobby')
    expect(a.opponentProfile.value?.name).toBe('Friend')
    expect(b.opponentProfile.value?.name).toBe('HostPal')
    a.leavePvP()
    b.leavePvP()
  })

  it('a room that is gone: a clear failure with a way back', async () => {
    const B = await loadPvp()
    const b = B.default()
    await b.joinLobby('ca-gone00', { friendName: 'Ghost' })
    await tick(10)
    expect(b.status.value).toBe('error')
    expect(b.errorMessage.value).toBe('T:pvp.joinFailed')
    b.leavePvP()
    expect(b.status.value).toBe('idle')
  })

  it('a host that never answers: the watchdog fails the join', async () => {
    fake.broker.offline = true
    const B = await loadPvp()
    const b = B.default()
    await b.joinLobby('ca-silent1', { friendName: '' })
    await tick(24_000)
    expect(b.status.value).toBe('connecting')
    await tick(1_100)
    expect(b.status.value).toBe('error')
    expect(b.errorMessage.value).toBe('T:pvp.joinFailed')
  })

  it('a queued CrazyGames invite is consumed once, with the friend\'s name', async () => {
    const A = await loadPvp()
    const a = A.default()
    expect(A.queueInvite({ roomId: 'ca-abc123', hostName: 'Pal' })).toBe(true)
    expect(A.pendingInviteHost.value).toBe('Pal')
    expect(a.checkInviteFromUrl()).toBe('ca-abc123')
    expect(A.pendingInviteHost.value).toBeNull()
    expect(a.checkInviteFromUrl()).toBeNull()
    expect(A.queueInvite(null)).toBe(false)
    // Not a CrazyGames build here: nothing to consume, nothing subscribed.
    expect(A.consumeCrazyInvite()).toBe(false)
    expect(typeof A.startCrazyMultiplayer()).toBe('function')
  })
})

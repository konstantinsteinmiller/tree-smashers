// ─── Peer-to-Peer PvP Multiplayer ──────────────────────────────────────────
//
// Uses PeerJS (WebRTC) for direct browser-to-browser connections.
// Host creates a lobby, guest joins via invite link or CrazyGames invite.
//
// Feature-gated: only active when VITE_APP_PVP_ENABLED=true.

import { ref, computed, watch, type Ref } from 'vue'
// PeerJS itself is loaded lazily — see `loadPeerCtor` below. The static
// import was bundling the entire ~50KB library into every build (including
// CrazyGames, which doesn't ship PvP) before this change. Type-only imports
// have zero runtime cost so the rest of the file compiles unchanged.
import type Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import type { SpinnerConfig } from '@/types/spinner'
import { isSdkActive } from '@/use/useCrazyGames'
import { isCrazyGamesFullRelease, isDebug } from '@/use/useMatch'
import { seedMatchRng, seedMatchRngRandom } from '@/use/useDeterministicRng'

// ─── Feature Gate ──────────────────────────────────────────────────────────

export const isPvpEnabled = import.meta.env.VITE_APP_PVP_ENABLED === 'true'

// Lazy PeerJS loader. The `import.meta.env.VITE_APP_PVP_ENABLED` ternary
// resolves to a literal at build time, so on PvP-disabled builds the
// branch containing `import('peerjs')` becomes dead code and Rollup
// eliminates BOTH the call AND the peerjs chunk emission — the ~150KB
// (obfuscated) bundle never ships. The previous `if (...)` guard inside
// the function body wasn't enough: Rollup still emitted the chunk
// because the syntactic dynamic import survived.
let PeerCtor: typeof Peer | null = null
let peerCtorPromise: Promise<typeof Peer> | null = null

const loadPeerCtor: () => Promise<typeof Peer> =
  import.meta.env.VITE_APP_PVP_ENABLED === 'true'
    ? async () => {
      if (PeerCtor) return PeerCtor
      if (peerCtorPromise) return peerCtorPromise
      peerCtorPromise = import('peerjs').then((m) => {
        PeerCtor = m.default
        return PeerCtor
      })
      return peerCtorPromise
    }
    : async () => {
      throw new Error('[PvP] feature disabled in this build (VITE_APP_PVP_ENABLED!=true)')
    }

const pvpLog = (msg: string) => {
  if (!isDebug.value || !isPvpEnabled) return
  const ts = new Date().toISOString().slice(11, 23) // HH:mm:ss.SSS
  // console.warn('[PvP]', `[${ts}] ${msg}`)
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type PvPRole = 'host' | 'guest' | null

export type PvPStatus =
  | 'idle'              // Not in PvP
  | 'creating'          // Host: creating peer
  | 'waiting'           // Host: waiting for guest to join
  | 'connecting'        // Guest: connecting to host
  | 'lobby'             // Both connected, configuring match
  | 'ready'             // Both players ready
  | 'playing'           // Match in progress
  | 'disconnected'      // Peer disconnected mid-match
  | 'expired'           // Invite expired (2 min timeout)
  | 'error'             // Connection error

export interface PvPGameConfig {
  arenaType: ArenaType
  teamSize: 1 | 2         // 1v1 or 2v2
  levelOne: boolean        // true = all parts forced to level 1
}

export type PvPMessage =
  | { type: 'game-config'; config: PvPGameConfig }
  | { type: 'player-ready'; team: SpinnerConfig[] }
  | { type: 'player-unready' }
  | { type: 'game-start'; firstTurn: 'host' | 'guest'; seed: number }
  | { type: 'launch'; bladeIndex: number; ax: number; ay: number }
  | { type: 'surrender' }
  | { type: 'state-check'; hash: string; turn: number }
  | { type: 'return-to-lobby' }
  | { type: 'ping' }
  | { type: 'pong' }

// ─── Constants ─────────────────────────────────────────────────────────────

const INVITE_EXPIRY_MS = 2 * 60 * 1000  // 2 minutes
const PING_INTERVAL_MS = 5000
const PONG_TIMEOUT_MS = 10000
const CONN_OPEN_TIMEOUT_MS = 15000       // Give up if conn never opens
const PEER_ID_PREFIX = 'ca-'

// ICE servers: STUN for direct connections + metered.ca TURN relay for
// carrier-grade NAT (mobile networks) where STUN alone fails.
// TURN credentials come from env vars (free metered.ca account).
const TURN_USER = import.meta.env.VITE_APP_TURN_USERNAME as string | undefined
const TURN_CRED = import.meta.env.VITE_APP_TURN_CREDENTIAL as string | undefined

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  // TURN relay — only included when credentials are configured
  ...(TURN_USER && TURN_CRED ? [
    { urls: 'turn:global.relay.metered.ca:80', username: TURN_USER, credential: TURN_CRED },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: TURN_USER, credential: TURN_CRED },
    { urls: 'turn:global.relay.metered.ca:443', username: TURN_USER, credential: TURN_CRED },
    { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: TURN_USER, credential: TURN_CRED }
  ] : [])
]

// ─── Composable ────────────────────────────────────────────────────────────

// Singleton state — shared across all components that call usePVP()
const status: Ref<PvPStatus> = ref('idle')
const role: Ref<PvPRole> = ref(null)
const peerId: Ref<string> = ref('')
const remotePeerId: Ref<string> = ref('')
const inviteLink: Ref<string> = ref('')
const expirySeconds: Ref<number> = ref(0)
const errorMessage: Ref<string> = ref('')
const gameConfig: Ref<PvPGameConfig> = ref({ arenaType: 'default', teamSize: 1, levelOne: false })
const hostReady: Ref<boolean> = ref(false)
const guestReady: Ref<boolean> = ref(false)
const hostTeam: Ref<SpinnerConfig[]> = ref([])
const guestTeam: Ref<SpinnerConfig[]> = ref([])
const remotePlayerName: Ref<string> = ref('')

// ─── Early Invite Capture ─────────────────────────────────────────────────
// Extract pvp= param from URL hash at module load time (before any component
// mounts) so the invite code survives code-split lazy loading.
const extractPvpFromHash = (): string | null => {
  const hash = window.location.hash
  const match = hash.match(/[?&]pvp=([^&]+)/)
  if (match && match[1] !== undefined) {
    const cleanHash = hash.replace(/[?&]pvp=[^&]+/, '').replace(/\?$/, '')
    history.replaceState(null, '', window.location.pathname + cleanHash)
    return decodeURIComponent(match[1])
  }
  return null
}

/** Invite code captured from URL before any component mounted. */
const _earlyInvite = extractPvpFromHash()
if (_earlyInvite) pvpLog(`early invite capture: ${_earlyInvite}`)
export const pendingInviteCode: Ref<string | null> = ref(_earlyInvite)

let peer: Peer | null = null
let conn: DataConnection | null = null
let expiryTimer: ReturnType<typeof setInterval> | null = null
let expiryTimeout: ReturnType<typeof setTimeout> | null = null
let connOpenTimeout: ReturnType<typeof setTimeout> | null = null
let connRetried = false
let pingInterval: ReturnType<typeof setInterval> | null = null
let lastPongAt = 0

// Callbacks for game events — set by SpinnerArena
let onGameStart: ((firstTurn: 'host' | 'guest') => void) | null = null
let onRemoteLaunch: ((bladeIndex: number, ax: number, ay: number) => void) | null = null
let onRemoteSurrender: (() => void) | null = null
let onRemoteStateCheck: ((hash: string, turn: number) => void) | null = null
let onReturnToLobby: (() => void) | null = null

/** Return both players to lobby without destroying the connection. */
const goBackToLobby = () => {
  pvpLog(`goBackToLobby: status=${status.value} role=${role.value}`)
  status.value = 'lobby'
  hostReady.value = false
  guestReady.value = false
  hostTeam.value = []
  guestTeam.value = []
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const generatePeerId = (): string =>
  PEER_ID_PREFIX + Math.random().toString(36).substring(2, 8).toLowerCase()

const buildInviteLink = (hostId: string): string => {
  const base = window.location.href.split('?')[0]!.split('#')[0]!
  return `${base}#/battle?pvp=${encodeURIComponent(hostId)}`
}

const cleanup = () => {
  if (expiryTimer) {
    clearInterval(expiryTimer)
    expiryTimer = null
  }
  if (expiryTimeout) {
    clearTimeout(expiryTimeout)
    expiryTimeout = null
  }
  if (connOpenTimeout) {
    clearTimeout(connOpenTimeout)
    connOpenTimeout = null
  }
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  if (conn) {
    try {
      conn.close()
    } catch {
    }
    conn = null
  }
  if (peer) {
    try {
      peer.destroy()
    } catch {
    }
    peer = null
  }
}

const resetState = () => {
  cleanup()
  connRetried = false
  status.value = 'idle'
  role.value = null
  peerId.value = ''
  remotePeerId.value = ''
  inviteLink.value = ''
  expirySeconds.value = 0
  errorMessage.value = ''
  hostReady.value = false
  guestReady.value = false
  hostTeam.value = []
  guestTeam.value = []
  remotePlayerName.value = ''
}

const send = (msg: PvPMessage) => {
  try {
    if (conn && conn.open) {
      conn.send(msg)
    }
  } catch (e) {
    console.warn('[PvP] Send failed:', e)
  }
}

// When the app returns from background (e.g. after sharing via WhatsApp),
// the browser may have killed the PeerJS signaling WebSocket. If the host
// is still waiting for a guest, we MUST reconnect to the signaling server
// so incoming connection offers can be relayed.
document.addEventListener('visibilitychange', () => {
  pvpLog(`visibility: hidden=${document.hidden} connOpen=${conn?.open} peerOpen=${peer?.open} peerDisconnected=${peer?.disconnected} status=${status.value}`)
  if (document.hidden) return

  // Reconnect PeerJS signaling if the peer was dropped while backgrounded
  if (peer && !peer.destroyed && peer.disconnected) {
    pvpLog('peer disconnected from signaling — reconnecting')
    try {
      peer.reconnect()
    } catch (e) {
      pvpLog(`peer.reconnect() failed: ${e}`)
    }
  }

  // Check if ICE connection died while backgrounded
  if (conn && !conn.open) {
    try {
      const pc: RTCPeerConnection | undefined =
        (conn as any).peerConnection ?? (conn as any)._peerConnection
      if (pc && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
        pvpLog(`ICE ${pc.iceConnectionState} after returning from background`)
      }
    } catch { /* ignore */
    }
  }

  if (conn?.open) {
    lastPongAt = Date.now()
    send({ type: 'ping' })
  }
})

const startPingLoop = () => {
  lastPongAt = Date.now()
  pingInterval = setInterval(() => {
    if (!conn || !conn.open) return
    // Skip ping/pong checks while the app is in the background — the
    // browser throttles timers so we'd get false positives.
    if (document.hidden) {
      lastPongAt = Date.now()
      return
    }
    send({ type: 'ping' })
    // Check if we missed pongs (in any connected state, not just playing)
    const activeStates: PvPStatus[] = ['lobby', 'ready', 'playing']
    if (Date.now() - lastPongAt > PONG_TIMEOUT_MS && activeStates.includes(status.value)) {
      status.value = 'disconnected'
      errorMessage.value = 'Connection lost — opponent not responding.'
      cleanup()
    }
  }, PING_INTERVAL_MS)
}

const startExpiryCountdown = () => {
  const start = Date.now()
  expirySeconds.value = Math.ceil(INVITE_EXPIRY_MS / 1000)

  expiryTimer = setInterval(() => {
    const elapsed = Date.now() - start
    expirySeconds.value = Math.max(0, Math.ceil((INVITE_EXPIRY_MS - elapsed) / 1000))
    if (expirySeconds.value <= 0 && expiryTimer) {
      clearInterval(expiryTimer)
      expiryTimer = null
    }
  }, 1000)

  expiryTimeout = setTimeout(() => {
    if (status.value === 'waiting') {
      status.value = 'expired'
      errorMessage.value = 'Invite expired.'
      cleanup()
    }
  }, INVITE_EXPIRY_MS)
}

// ─── Message Handler ───────────────────────────────────────────────────────

const handleMessage = (msg: PvPMessage) => {
  try {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return
    switch (msg.type) {
      case 'game-config':
        gameConfig.value = msg.config
        break

      case 'player-ready':
        if (role.value === 'host') {
          guestReady.value = true
          guestTeam.value = msg.team
        } else {
          hostReady.value = true
          hostTeam.value = msg.team
        }
        break

      case 'player-unready':
        if (role.value === 'host') {
          guestReady.value = false
        } else {
          hostReady.value = false
        }
        break

      case 'game-start':
        status.value = 'playing'
        // Host broadcasts the match seed so both peers share the same RNG
        // sequence for powerup spawns, turn-order roll, and stat picks.
        seedMatchRng(msg.seed)
        onGameStart?.(msg.firstTurn)
        break

      case 'launch':
        onRemoteLaunch?.(msg.bladeIndex, msg.ax, msg.ay)
        break

      case 'surrender':
        onRemoteSurrender?.()
        break

      case 'state-check':
        onRemoteStateCheck?.(msg.hash, msg.turn)
        break

      case 'return-to-lobby':
        pvpLog('remote requested return-to-lobby')
        goBackToLobby()
        onReturnToLobby?.()
        break

      case 'ping':
        send({ type: 'pong' })
        break

      case 'pong':
        lastPongAt = Date.now()
        break
    }
  } catch (e) {
    console.error('[PvP] Error handling message:', e)
  }
}

// ─── Connection Setup ──────────────────────────────────────────────────────

const setupConnection = (connection: DataConnection) => {
  conn = connection
  pvpLog(`setupConnection: connId=${connection.connectionId} peer=${connection.peer} type=${connection.type} reliable=${connection.reliable}`)

  // Log ICE connection state changes for debugging NAT traversal issues.
  // The underlying RTCPeerConnection may not exist immediately — PeerJS
  // creates it lazily during the signaling exchange. Poll briefly to
  // catch it once it appears.
  const hookIce = () => {
    try {
      const pc: RTCPeerConnection | undefined =
        (connection as any).peerConnection ??
        (connection as any)._peerConnection ??
        (connection as any).dataChannel?.transport?.iceTransport?.connection
      if (pc) {
        pvpLog(`ICE hooked: initialState=${pc.iceConnectionState} signalingState=${pc.signalingState}`)
        pvpLog(`ICE config: ${JSON.stringify(pc.getConfiguration()?.iceServers?.map(s => s.urls))}`)
        pc.addEventListener('iceconnectionstatechange', () => {
          pvpLog(`ICE state: ${pc.iceConnectionState}`)
          if (pc.iceConnectionState === 'failed') {
            pvpLog('ICE FAILED')
            // Dump candidate pair stats for diagnosis
            pc.getStats().then(stats => {
              stats.forEach(report => {
                if (report.type === 'candidate-pair') {
                  pvpLog(`candidate-pair: state=${report.state} local=${report.localCandidateId} remote=${report.remoteCandidateId}`)
                } else if (report.type === 'local-candidate') {
                  pvpLog(`local-candidate: ${report.candidateType} ${report.protocol} ${report.address ?? '?'}:${report.port}`)
                } else if (report.type === 'remote-candidate') {
                  pvpLog(`remote-candidate: ${report.candidateType} ${report.protocol} ${report.address ?? '?'}:${report.port}`)
                }
              })
            }).catch(() => {
            })
          }
        })
        pc.addEventListener('icegatheringstatechange', () => {
          pvpLog(`ICE gathering: ${pc.iceGatheringState}`)
        })
        pc.addEventListener('icecandidate', (e) => {
          if (e.candidate) {
            pvpLog(`ICE candidate: ${e.candidate.type ?? '?'} ${e.candidate.protocol ?? ''} ${e.candidate.address ?? 'hidden'}`)
          } else {
            pvpLog('ICE candidate gathering complete (null sentinel)')
          }
        })
        return true
      }
    } catch { /* ignore */
    }
    return false
  }
  // Try immediately, then retry a few times
  if (!hookIce()) {
    let attempts = 0
    const icePoller = setInterval(() => {
      if (hookIce() || ++attempts > 10) clearInterval(icePoller)
    }, 200)
  }

  // Timeout: if the data channel never opens, the WebRTC handshake
  // likely failed (NAT traversal / signaling issue). For guests, try
  // reconnecting once before giving up — the host may have briefly
  // lost signaling while sharing the invite link.
  connOpenTimeout = setTimeout(() => {
    if (conn && !conn.open) {
      pvpLog(`conn open timeout after ${CONN_OPEN_TIMEOUT_MS}ms — role=${role.value}`)
      if (role.value === 'guest' && peer && !peer.destroyed && !connRetried) {
        connRetried = true
        pvpLog('guest retrying connection to host')
        try {
          conn.close()
        } catch { /* ignore */
        }
        conn = null
        const hostId = remotePeerId.value
        const retryConn = peer.connect(hostId, { reliable: true, serialization: 'json' })
        setupConnection(retryConn)
      } else {
        status.value = 'error'
        errorMessage.value = 'Connection timed out — could not reach host. The host may have lost connection while sharing the invite.'
        cleanup()
      }
    }
  }, CONN_OPEN_TIMEOUT_MS)

  conn.on('open', () => {
    pvpLog(`conn.open: role=${role.value} connOpen=${conn?.open}`)
    // Cancel the open timeout — we made it
    if (connOpenTimeout) {
      clearTimeout(connOpenTimeout)
      connOpenTimeout = null
    }
    if (role.value === 'host') {
      // Stop expiry countdown
      if (expiryTimer) {
        clearInterval(expiryTimer)
        expiryTimer = null
      }
      if (expiryTimeout) {
        clearTimeout(expiryTimeout)
        expiryTimeout = null
      }
      expirySeconds.value = 0
      status.value = 'lobby'
      // Send current game config to guest
      send({ type: 'game-config', config: gameConfig.value })
    } else {
      status.value = 'lobby'
    }
    startPingLoop()
  })

  conn.on('data', (data: unknown) => {
    handleMessage(data as PvPMessage)
  })

  conn.on('close', () => {
    pvpLog(`conn.close: status=${status.value} role=${role.value}`)
    if (status.value === 'playing') {
      status.value = 'disconnected'
      errorMessage.value = 'Opponent disconnected.'
    } else if (status.value !== 'idle') {
      status.value = 'disconnected'
      errorMessage.value = 'Connection closed.'
    }
    cleanup()
  })

  conn.on('error', (err: any) => {
    pvpLog(`conn.error: type=${err?.type} msg=${err?.message}`)
    console.error('[PvP] Connection error:', err)
    status.value = 'error'
    errorMessage.value = `Connection error: ${err.type || err.message || 'unknown'}`
    cleanup()
  })
}

// ─── Public API ────────────────────────────────────────────────────────────

const usePVP = () => {
  const canShowPvP = computed(() =>
    isPvpEnabled && ((isSdkActive.value && isCrazyGamesFullRelease) || isDebug.value || window?.location.host === 'konstantinsteinmiller.github.io')
  )

  const bothReady = computed(() => hostReady.value && guestReady.value)

  /** Host: create a lobby and wait for a guest */
  const createLobby = async (config: PvPGameConfig) => {
    try {
      pvpLog(`createLobby: arena=${config.arenaType} team=${config.teamSize} lvl1=${config.levelOne}`)
      resetState()
      role.value = 'host'
      status.value = 'creating'
      gameConfig.value = config

      const id = generatePeerId()
      pvpLog(`createLobby: peerId=${id}`)
      const PeerC = await loadPeerCtor()
      peer = new PeerC(id, { config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 } })

      peer.on('open', (openId: string) => {
        pvpLog(`host peer.open: id=${openId}`)
        peerId.value = openId
        inviteLink.value = buildInviteLink(openId)
        status.value = 'waiting'
        startExpiryCountdown()
      })

      peer.on('connection', (connection: DataConnection) => {
        pvpLog(`host peer.connection: remote=${connection.peer}`)
        setupConnection(connection)
      })

      peer.on('error', (err: any) => {
        pvpLog(`host peer.error: type=${err?.type} msg=${err?.message}`)
        console.error('[PvP] Peer error:', err)
        // If ID is taken, retry with a new one
        if (err.type === 'unavailable-id') {
          cleanup()
          void createLobby(config)
          return
        }
        status.value = 'error'
        errorMessage.value = `Peer error: ${err.type || err.message || 'unknown'}`
      })

      peer.on('disconnected', () => {
        pvpLog(`host peer.disconnected: destroyed=${peer?.destroyed} status=${status.value}`)
        // Auto-reconnect to signaling server while waiting for a guest or
        // in the lobby — the browser likely killed the WebSocket while the
        // user was away sharing the invite link.
        if (peer && !peer.destroyed && (status.value === 'waiting' || status.value === 'lobby' || status.value === 'ready')) {
          pvpLog('host auto-reconnecting to signaling server')
          try {
            peer.reconnect()
          } catch (e) {
            pvpLog(`host reconnect failed: ${e}`)
          }
        }
      })

      peer.on('close', () => {
        pvpLog(`host peer.close`)
      })
    } catch (e) {
      pvpLog(`createLobby exception: ${e}`)
      console.error('[PvP] Failed to create lobby:', e)
      status.value = 'error'
      errorMessage.value = 'Failed to create lobby. Please try again.'
    }
  }

  /** Guest: join a host's lobby by their peer ID */
  const joinLobby = async (hostPeerId: string) => {
    try {
      pvpLog(`joinLobby: hostPeerId=${hostPeerId}`)
      resetState()
      role.value = 'guest'
      status.value = 'connecting'
      remotePeerId.value = hostPeerId

      const myId = generatePeerId()
      pvpLog(`joinLobby: myPeerId=${myId}`)
      const PeerC = await loadPeerCtor()
      peer = new PeerC(myId, { config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 } })

      peer.on('open', (openId: string) => {
        pvpLog(`guest peer.open: id=${openId}, connecting to host=${hostPeerId}`)
        const connection = peer!.connect(hostPeerId, { reliable: true, serialization: 'json' })
        setupConnection(connection)
      })

      peer.on('error', (err: any) => {
        pvpLog(`guest peer.error: type=${err?.type} msg=${err?.message}`)
        console.error('[PvP] Peer error:', err)
        if (err.type === 'peer-unavailable') {
          status.value = 'error'
          errorMessage.value = 'Lobby not found — invite may have expired.'
        } else {
          status.value = 'error'
          errorMessage.value = `Connection failed: ${err.type || err.message || 'unknown'}`
        }
      })

      peer.on('disconnected', () => {
        pvpLog(`guest peer.disconnected: destroyed=${peer?.destroyed} status=${status.value}`)
        if (peer && !peer.destroyed && status.value === 'connecting') {
          pvpLog('guest auto-reconnecting to signaling server')
          try {
            peer.reconnect()
          } catch (e) {
            pvpLog(`guest reconnect failed: ${e}`)
          }
        }
      })

      peer.on('close', () => {
        pvpLog(`guest peer.close`)
      })
    } catch (e) {
      pvpLog(`joinLobby exception: ${e}`)
      console.error('[PvP] Failed to join lobby:', e)
      status.value = 'error'
      errorMessage.value = 'Failed to join lobby. Please try again.'
    }
  }

  /** Mark local player as ready with their team selection */
  const setReady = (team: SpinnerConfig[]) => {
    if (role.value === 'host') {
      hostReady.value = true
      hostTeam.value = team
    } else {
      guestReady.value = true
      guestTeam.value = team
    }
    send({ type: 'player-ready', team })
  }

  /** Unmark local player as ready */
  const setUnready = () => {
    if (role.value === 'host') {
      hostReady.value = false
    } else {
      guestReady.value = false
    }
    send({ type: 'player-unready' })
  }

  /** Host only: start the match once both players are ready */
  const startMatch = () => {
    if (role.value !== 'host' || !bothReady.value) return
    const firstTurn = Math.random() < 0.5 ? 'host' : 'guest' as const
    // Seed the shared match RNG locally and broadcast so the guest's
    // mulberry32 state matches byte-for-byte.
    const seed = seedMatchRngRandom()
    status.value = 'playing'
    send({ type: 'game-start', firstTurn, seed })
    onGameStart?.(firstTurn)
  }

  /** Send a launch command to the remote peer */
  const sendSurrender = () => {
    send({ type: 'surrender' })
  }

  const sendStateCheck = (hash: string, turn: number) => {
    send({ type: 'state-check', hash, turn })
  }

  const sendLaunch = (bladeIndex: number, ax: number, ay: number) => {
    send({ type: 'launch', bladeIndex, ax, ay })
  }

  /** Host: update game config and notify guest */
  const updateGameConfig = (config: PvPGameConfig) => {
    gameConfig.value = config
    // Un-ready both players when config changes
    hostReady.value = false
    guestReady.value = false
    if (role.value === 'host') {
      send({ type: 'game-config', config })
    }
  }

  /** Register game event callbacks */
  const registerCallbacks = (
    onStart: (firstTurn: 'host' | 'guest') => void,
    onLaunch: (bladeIndex: number, ax: number, ay: number) => void,
    onSurrender?: () => void,
    onStateCheck?: (hash: string, turn: number) => void,
    onLobbyReturn?: () => void
  ) => {
    onGameStart = onStart
    onRemoteLaunch = onLaunch
    onRemoteSurrender = onSurrender ?? null
    onRemoteStateCheck = onStateCheck ?? null
    onReturnToLobby = onLobbyReturn ?? null
  }

  /** Signal both players to return to lobby (keeps connection alive). */
  const returnToLobby = () => {
    send({ type: 'return-to-lobby' })
    goBackToLobby()
  }

  /** Generate a WhatsApp share link */
  const whatsappShareLink = computed(() => {
    if (!inviteLink.value) return ''
    const text = encodeURIComponent(`Join my Chaos Arena PvP battle!\n${inviteLink.value}`)
    return `https://wa.me/?text=${text}`
  })

  /** Copy invite link to clipboard */
  const copyInviteLink = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(inviteLink.value)
      return true
    } catch {
      return false
    }
  }

  /** Try to use CrazyGames SDK invite if available */
  const sendCrazyGamesInvite = () => {
    try {
      const sdk = (window as any).CrazyGames?.SDK
      if (sdk?.game?.inviteLink) {
        sdk.game.inviteLink({ url: inviteLink.value })
      }
    } catch (e) {
      console.warn('[PvP] CrazyGames invite failed:', e)
    }
  }

  /** Check URL for incoming PvP invite on page load.
   *  Also consumes the early-captured pendingInviteCode (extracted at
   *  module load time before any component mounted). */
  const checkInviteFromUrl = (): string | null => {
    // First check the module-level early capture
    if (pendingInviteCode.value) {
      const code = pendingInviteCode.value
      pendingInviteCode.value = null
      return code
    }
    // Fallback: re-check the hash in case it was set after module init
    const hash = window.location.hash
    const match = hash.match(/[?&]pvp=([^&]+)/)
    if (match && match[1] !== undefined) {
      const cleanHash = hash.replace(/[?&]pvp=[^&]+/, '').replace(/\?$/, '')
      history.replaceState(null, '', window.location.pathname + cleanHash)
      return decodeURIComponent(match[1])
    }
    return null
  }

  /** Leave the PvP session entirely */
  const leavePvP = () => {
    resetState()
  }

  return {
    // State
    status,
    role,
    peerId,
    inviteLink,
    expirySeconds,
    errorMessage,
    gameConfig,
    hostReady,
    guestReady,
    hostTeam,
    guestTeam,
    remotePlayerName,
    canShowPvP,
    bothReady,
    whatsappShareLink,

    pendingInviteCode,
    // Actions
    createLobby,
    joinLobby,
    setReady,
    setUnready,
    startMatch,
    sendLaunch,
    sendSurrender,
    sendStateCheck,
    updateGameConfig,
    registerCallbacks,
    copyInviteLink,
    sendCrazyGamesInvite,
    checkInviteFromUrl,
    returnToLobby,
    leavePvP
  }
}

export default usePVP

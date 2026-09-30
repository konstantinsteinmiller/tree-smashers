// ─── PvP protocol version gate ───────────────────────────────────────────────
//
// Two builds that simulate the same launches differently desync silently
// mid-match. `player-ready` carries PVP_PROTOCOL_VERSION; a peer on another
// version (or an old build sending none) must never be marked ready, and the
// lobby must say why in the player's language.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import usePVP, { PVP_PROTOCOL_VERSION, receivePvpMessage } from '@/use/usePVP'
import en from '@/i18n/locales/en'
import type { SpinnerConfig } from '@/types/spinner'

const team: SpinnerConfig[] = [{ topPartId: 'star', bottomPartId: 'balanced' }]

describe('PvP protocol version gate', () => {
  const pvp = usePVP()

  beforeEach(() => {
    pvp.leavePvP()
    ;(window as unknown as { __i18n?: unknown }).__i18n = {
      global: { t: (k: string) => (k === 'pvp.versionMismatch' ? 'LOCALIZED-MISMATCH' : k) }
    }
  })

  afterEach(() => {
    delete (window as unknown as { __i18n?: unknown }).__i18n
    pvp.leavePvP()
  })

  it('marks a peer on the same protocol ready', () => {
    receivePvpMessage({ type: 'player-ready', team, proto: PVP_PROTOCOL_VERSION })
    // No role yet → handled as the guest's view of the host.
    expect(pvp.hostReady.value).toBe(true)
    expect(pvp.hostTeam.value).toEqual(team)
    expect(pvp.status.value).not.toBe('error')
  })

  it('refuses a peer on another protocol with the localized message', () => {
    receivePvpMessage({ type: 'player-ready', team, proto: PVP_PROTOCOL_VERSION + 1 })
    expect(pvp.hostReady.value).toBe(false)
    expect(pvp.hostTeam.value).toEqual([])
    expect(pvp.status.value).toBe('error')
    expect(pvp.errorMessage.value).toBe('LOCALIZED-MISMATCH')
  })

  it('refuses an old build that sends no protocol at all', () => {
    receivePvpMessage({ type: 'player-ready', team })
    expect(pvp.hostReady.value).toBe(false)
    expect(pvp.status.value).toBe('error')
  })

  it('shows the message when the other side refused OUR ready', () => {
    receivePvpMessage({ type: 'proto-mismatch', proto: PVP_PROTOCOL_VERSION - 1 })
    expect(pvp.status.value).toBe('error')
    expect(pvp.errorMessage.value).toBe('LOCALIZED-MISMATCH')
  })

  it('ships the English source string', () => {
    expect((en as { pvp: Record<string, string> }).pvp.versionMismatch).toBeTruthy()
  })
})

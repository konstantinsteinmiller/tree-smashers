// ─── PvP stubs match the modules they replace ───────────────────────────────
//
// On a PvP-disabled build (every portal build) `vite.config.ts` aliases the
// PvP composable and its components to no-op stubs, so none of the lobby /
// connection code ships. Vitest does not apply that alias, so nothing else
// exercises the stubs — this pins that they stay drop-in compatible: a name
// the real module exports and the stub does not is a build that fails to
// link, or worse, a destructure that yields `undefined` at runtime.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isRef } from 'vue'
import * as real from '@/use/usePVP'
import * as stub from '@/use/usePVP.stub'

const ROOT = path.resolve(__dirname, '..')
const read = (f: string): string => readFileSync(path.join(ROOT, f), 'utf8')

describe('usePVP stub', () => {
  it('exports every runtime name the real module does', () => {
    expect(Object.keys(stub).sort()).toEqual(Object.keys(real).sort())
  })

  it('usePVP() returns the same keys, with refs where the real one has refs', () => {
    const r = real.default() as Record<string, unknown>
    const s = stub.default() as Record<string, unknown>
    expect(Object.keys(s).sort()).toEqual(Object.keys(r).sort())
    for (const key of Object.keys(r)) {
      expect(isRef(s[key]), `${key}: ref-ness`).toBe(isRef(r[key]))
      expect(typeof s[key], `${key}: type`).toBe(typeof r[key])
    }
  })

  it('is inert: PvP reads as unavailable and no action does anything', async () => {
    const pvp = stub.default()
    expect(stub.isPvpEnabled).toBe(false)
    expect(pvp.canShowPvP.value).toBe(false)
    expect(pvp.whatsappShareLink.value).toBe('')
    expect(stub.currentPvpRole()).toBeNull()
    expect(pvp.checkInviteFromUrl()).toBeNull()
    await pvp.createLobby({ arenaType: 'default', teamSize: 1, levelOne: false })
    await pvp.joinLobby('ca-anything')
    expect(pvp.status.value).toBe('idle')
    expect(pvp.role.value).toBeNull()
  })

  it('keeps the protocol version in step (a stale constant would mislabel a build)', () => {
    expect(stub.PVP_PROTOCOL_VERSION).toBe(real.PVP_PROTOCOL_VERSION)
  })

  it('carries no connection or share-link literal', () => {
    const src = read('src/use/usePVP.stub.ts').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/wa\.me|peerjs|stun:|turn:|metered|VITE_APP_TURN/i)
  })
})

describe('PvP build alias', () => {
  const config = read('vite.config.ts')

  it('swaps all four PvP modules, gated on the PvP flag only', () => {
    const block = config.match(/\.\.\.\(env\.VITE_APP_PVP_ENABLED === 'true' \? \{\} : \{([\s\S]*?)\}\),/)
    expect(block, 'no PvP alias block in vite.config.ts').not.toBeNull()
    for (const target of ['usePVP.stub.ts', 'PvPLobbyModal.stub.vue', 'PvPButton.stub.vue', 'PvpReadySkills.stub.vue']) {
      expect(block![1], target).toContain(target)
    }
  })

  it('every aliased stub file exists, and the lobby stub keeps the real props / emits', () => {
    const lobby = read('src/components/organisms/PvPLobbyModal.stub.vue')
    expect(lobby).toContain('isOpen')
    expect(lobby).toContain("(e: 'close')")
    expect(lobby).toContain("(e: 'start-pvp')")
    expect(read('src/components/organisms/PvPButton.stub.vue')).toContain("(e: 'click')")
    expect(read('src/components/organisms/PvpReadySkills.stub.vue')).toContain('Intentionally empty')
  })
})

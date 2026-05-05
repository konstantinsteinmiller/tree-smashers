// Regression test for the mute-sync default-restoration bug CG QA
// caught in the Opera log on 2026-05-05.
//
// Symptom: cloud has `spinner_user_music_volume = 0` and
// `spinner_user_sound_volume = 0` (user deliberately muted in-game on
// another device). Player opens the iframe in a fresh browser; the CG
// SDK reports `muted=false` (player has NOT platform-muted via the CG
// chrome) and `applyMute(false)` runs. The previous implementation's
// `else if (!muted && isMuted.value)` branch fired and overwrote the
// cloud's 0/0 with stale defaults (0.5 / 0.7) on every cold launch.
//
// Fix: track whether WE were the ones who muted (snapshot non-null only
// after a platform-driven mute). On `applyMute(false)`, only restore
// from the snapshot if it exists. A cold-load `applyMute(false)` with
// no snapshot is a no-op.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

// Mock useUser so we don't drag the full composable graph into the
// test (useUser → useMatch → useModels has a circular import that
// trips the test loader). The refs MUST be real Vue refs because
// `useCrazyMuteSync.ts` builds a `computed(() => musicVol.value === 0
// && soundVol.value === 0)` over them — plain `{ value: x }` objects
// would defeat the dependency tracking and the computed would cache
// stale results.
const userMusicVolume = ref(0)
const userSoundVolume = ref(0)
const setSettingValueMock = vi.fn((name: string, value: unknown) => {
  if (name === 'music') userMusicVolume.value = +(value as number)
  if (name === 'sound') userSoundVolume.value = +(value as number)
})

vi.mock('@/use/useUser', () => ({
  default: () => ({
    userMusicVolume,
    userSoundVolume,
    setSettingValue: setSettingValueMock
  })
}))
vi.mock('@/use/useCrazyGames', () => ({
  isSdkActive: { value: false },
  onCrazyMuteChange: vi.fn(),
  setCrazyMuted: vi.fn()
}))
vi.mock('@/use/useMatch', () => ({
  isDbInitialized: { value: false }
}))

describe('useCrazyMuteSync — applyMute', () => {
  beforeEach(() => {
    vi.resetModules()
    setSettingValueMock.mockClear()
    userMusicVolume.value = 0
    userSoundVolume.value = 0
  })

  it('cold load with cloud-muted (0/0) + SDK reports not-muted → does NOT touch volumes', async () => {
    // Cloud-hydrated state: user deliberately muted everywhere.
    userMusicVolume.value = 0
    userSoundVolume.value = 0

    const { applyMute } = await import('@/use/useCrazyMuteSync')
    applyMute(false) // SDK says "platform not muted"

    // CRITICAL: must not restore stale defaults. The user's deliberate
    // 0/0 stays put, so cloud doesn't get overwritten on next flush.
    expect(setSettingValueMock).not.toHaveBeenCalled()
    expect(userMusicVolume.value).toBe(0)
    expect(userSoundVolume.value).toBe(0)
  })

  it('platform-mute → in-game-mute (snapshot taken)', async () => {
    userMusicVolume.value = 0.6
    userSoundVolume.value = 0.7

    const { applyMute } = await import('@/use/useCrazyMuteSync')
    applyMute(true) // SDK says "platform muted"

    expect(setSettingValueMock).toHaveBeenCalledWith('music', 0)
    expect(setSettingValueMock).toHaveBeenCalledWith('sound', 0)
    expect(userMusicVolume.value).toBe(0)
    expect(userSoundVolume.value).toBe(0)
  })

  it('platform-mute then platform-unmute → restores the snapshot', async () => {
    userMusicVolume.value = 0.42
    userSoundVolume.value = 0.55

    const { applyMute } = await import('@/use/useCrazyMuteSync')
    applyMute(true)  // snapshot { music: 0.42, sound: 0.55 }, volumes → 0/0
    applyMute(false) // restore snapshot

    expect(userMusicVolume.value).toBe(0.42)
    expect(userSoundVolume.value).toBe(0.55)
  })

  it('idempotent: platform-unmute when already unmuted is a no-op', async () => {
    userMusicVolume.value = 0.3
    userSoundVolume.value = 0.4

    const { applyMute } = await import('@/use/useCrazyMuteSync')
    applyMute(false) // already unmuted, no snapshot
    applyMute(false)

    expect(setSettingValueMock).not.toHaveBeenCalled()
    expect(userMusicVolume.value).toBe(0.3)
    expect(userSoundVolume.value).toBe(0.4)
  })

  it('after a snapshot is consumed, the next platform-unmute does NOT re-restore', async () => {
    userMusicVolume.value = 0.5
    userSoundVolume.value = 0.6

    const { applyMute } = await import('@/use/useCrazyMuteSync')
    applyMute(true)  // snapshot, mute
    applyMute(false) // restore (snapshot consumed)

    setSettingValueMock.mockClear()
    // User then manually sets volumes to 0/0 in-game (cloud-muted).
    userMusicVolume.value = 0
    userSoundVolume.value = 0

    applyMute(false) // SDK reports unmuted again — no snapshot, must no-op
    expect(setSettingValueMock).not.toHaveBeenCalled()
    expect(userMusicVolume.value).toBe(0)
    expect(userSoundVolume.value).toBe(0)
  })
})

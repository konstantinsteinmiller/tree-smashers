// Audio v2 switchboard (src/audio/audioVersions.ts, sounds-todo.md): every
// path the switchboard can hand out must exist, in both versions, so an
// approval flip can never point the game at a missing file.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTRO_CUE_VERSION, MUSIC_VERSION, PROPOSAL_PATHS, SFX_VERSION, UI_SFX_VERSION, musicPath, sfxPath
} from '@/audio/audioVersions'
import { V2_INTRO_GAIN, V2_UI_LEVELS } from '@/audio/uiSfxV2'

const pub = (p: string) => resolve(__dirname, '..', 'public', p)

describe('audio v2 switchboard', () => {
  it('has a v1 and a v2 file for every switchable SFX', () => {
    for (const id of Object.keys(SFX_VERSION)) {
      expect(existsSync(pub(`audio/sfx/${id}.ogg`)), `v1 ${id}`).toBe(true)
      expect(existsSync(pub(`audio/v2/sfx/${id}.ogg`)), `v2 ${id}`).toBe(true)
    }
  })

  it('has a v1 and a v2 file for every switchable music loop', () => {
    for (const id of Object.keys(MUSIC_VERSION)) {
      expect(existsSync(pub(`audio/music/${id}.ogg`)), `v1 ${id}`).toBe(true)
      expect(existsSync(pub(`audio/v2/music/${id}.ogg`)), `v2 ${id}`).toBe(true)
    }
  })

  it('resolves the path of the version that is switched on', () => {
    for (const [id, v] of Object.entries(SFX_VERSION)) {
      expect(sfxPath(id)).toBe(v === 'v2' ? `audio/v2/sfx/${id}.ogg` : `audio/sfx/${id}.ogg`)
      expect(existsSync(pub(sfxPath(id)))).toBe(true)
    }
    for (const id of Object.keys(MUSIC_VERSION)) expect(existsSync(pub(musicPath(id)))).toBe(true)
    // Unknown names keep the v1 layout (playSound is called with free strings).
    expect(sfxPath('not-a-sound')).toBe('audio/sfx/not-a-sound.ogg')
  })

  it('ships the proposal files', () => {
    for (const p of Object.values(PROPOSAL_PATHS)) expect(existsSync(pub(p)), p).toBe(true)
  })

  it('covers every live-synthesised UI sound and intro cue with a v2 recipe', () => {
    expect(Object.keys(V2_UI_LEVELS).sort()).toEqual(Object.keys(UI_SFX_VERSION).sort())
    expect(Object.keys(V2_INTRO_GAIN).sort()).toEqual(Object.keys(INTRO_CUE_VERSION).sort())
  })
})

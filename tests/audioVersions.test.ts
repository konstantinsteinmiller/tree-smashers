// Audio v2 switchboard (src/audio/audioVersions.ts, sounds-todo.md): every
// path the switchboard can hand out must exist, in both versions, so an
// approval flip can never point the game at a missing file.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTRO_CUE_VERSION, MUSIC_VERSION, NEW_SLOT_FILES, NEW_SLOT_VERSION, SFX_VERSION, TREE_HIT_HEAVY, TREE_HIT_VARIANTS,
  UI_SFX_VERSION, musicPath, newSlotOn, sfxPath, treeHitName, BALLOON_POP_SFX, isNewSlotSfx, VS_INTRO_SFX
} from '@/audio/audioVersions'
import { BOSS_TRAIT_SFX_VERSION, SKILL_SFX_VERSION, featureSfxPath } from '@/audio/featureSfxVersions'
import { V2_INTRO_GAIN, V2_UI_LEVELS } from '@/audio/uiSfxV2'

const pub = (p: string) => resolve(__dirname, '..', 'public', p)

describe('audio v2 switchboard', () => {
  it('has a v1 and a v2 file for every switchable SFX', () => {
    for (const id of [...Object.keys(SFX_VERSION), ...Object.keys(SKILL_SFX_VERSION), ...Object.keys(BOSS_TRAIT_SFX_VERSION)]) {
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
    for (const [id, v] of Object.entries({ ...SKILL_SFX_VERSION, ...BOSS_TRAIT_SFX_VERSION })) {
      expect(featureSfxPath(id)).toBe(v === 'v2' ? `audio/v2/sfx/${id}.ogg` : `audio/sfx/${id}.ogg`)
      expect(existsSync(pub(featureSfxPath(id)))).toBe(true)
    }
    for (const id of Object.keys(MUSIC_VERSION)) expect(existsSync(pub(musicPath(id)))).toBe(true)
    // Unknown names keep the v1 layout (playSound is called with free strings).
    expect(sfxPath('not-a-sound')).toBe('audio/sfx/not-a-sound.ogg')
  })

  it('ships every new-slot file and keeps the slots off until approved', () => {
    for (const files of Object.values(NEW_SLOT_FILES)) for (const p of files) expect(existsSync(pub(p)), p).toBe(true)
    expect(Object.keys(NEW_SLOT_FILES).sort()).toEqual(Object.keys(NEW_SLOT_VERSION).sort())
    // balloon-pop (#UX3) and the VS intro are the slots the owner asked to
    // have wired and on while their r1 waits for review (sounds-todo.md
    // "Wired, pending review").
    for (const slot of Object.keys(NEW_SLOT_VERSION) as (keyof typeof NEW_SLOT_VERSION)[]) {
      expect(newSlotOn(slot), slot).toBe(slot === 'balloon-pop' || slot === 'vs-intro')
    }
  })

  it('resolves the VS intro sounds under v2', () => {
    for (const name of VS_INTRO_SFX) {
      expect(isNewSlotSfx(name), name).toBe(true)
      expect(sfxPath(name)).toBe(`audio/v2/sfx/${name}.ogg`)
      expect(existsSync(pub(sfxPath(name))), name).toBe(true)
    }
    expect([...NEW_SLOT_FILES['vs-intro']].sort()).toEqual(VS_INTRO_SFX.map(n => `audio/v2/sfx/${n}.ogg`).sort())
  })

  it('resolves balloon-pop (#UX3) under v2 and routes only new-slot names there', () => {
    expect(BALLOON_POP_SFX).toBe('balloon-pop')
    expect(sfxPath(BALLOON_POP_SFX)).toBe('audio/v2/sfx/balloon-pop.ogg')
    expect(existsSync(pub(sfxPath(BALLOON_POP_SFX)))).toBe(true)
    expect(isNewSlotSfx(BALLOON_POP_SFX)).toBe(true)
    for (const id of Object.keys(SFX_VERSION)) expect(isNewSlotSfx(id), id).toBe(false)
  })

  it('keeps the feature-gated SFX names out of the hot-path switchboard', () => {
    for (const id of [...Object.keys(SKILL_SFX_VERSION), ...Object.keys(BOSS_TRAIT_SFX_VERSION)]) {
      expect(id in SFX_VERSION, id).toBe(false)
    }
  })

  it('round-robins the tree-hit variants and resolves them under v2', () => {
    expect([0, 1, 2, 3, 4, -1].map(treeHitName)).toEqual(['tree-hit-1', 'tree-hit-2', 'tree-hit-3', 'tree-hit-1', 'tree-hit-2', 'tree-hit-3'])
    for (const id of [...TREE_HIT_VARIANTS, TREE_HIT_HEAVY, 'tree-stage', 'tree-fall']) {
      expect(sfxPath(id)).toBe(`audio/v2/sfx/${id}.ogg`)
      expect(existsSync(pub(sfxPath(id))), id).toBe(true)
    }
  })

  it('covers every live-synthesised UI sound and intro cue with a v2 recipe', () => {
    expect(Object.keys(V2_UI_LEVELS).sort()).toEqual(Object.keys(UI_SFX_VERSION).sort())
    expect(Object.keys(V2_INTRO_GAIN).sort()).toEqual(Object.keys(INTRO_CUE_VERSION).sort())
  })
})

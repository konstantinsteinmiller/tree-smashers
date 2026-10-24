import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAINTED_INTRO } from '@/use/paintedIntro'
import { introArtImage, introArtUrl } from '@/use/introArt'

// ─── #Intro1 painted assets: prompts, queue, registry, fallbacks ────────────

const ROOT = resolve(__dirname, '..')
// The queue module runs only as a script; importing it is side-effect free.
const queue = await import('../tools/intro-art/paint-queue.mjs') as {
  QUEUE: { name: string; prompt: string; out: string }[]
  NO_STITCHES: string
  MAGENTA: string
}

describe('intro paint queue', () => {
  it('paints in the storyboard priority order', () => {
    expect(queue.QUEUE.map(j => j.name)).toEqual(['trail', 'hero-trees', 'canopy', 'skill-plate'])
  })

  it('every prompt is text-only scenery/UI: no stitches, magenta ground, no text', () => {
    for (const j of queue.QUEUE) {
      expect(existsSync(j.prompt), j.prompt).toBe(true)
      const p = readFileSync(j.prompt, 'utf8')
      expect(p, j.name).toContain(queue.NO_STITCHES)
      expect(p, j.name).toContain(queue.MAGENTA)
      expect(p, j.name).toMatch(/No text, no letters, no numbers/)
      expect(p, j.name).toMatch(/NO blur/)
      expect(p, j.name).toMatch(/NO radial gradients/)
    }
  })

  it('writes into art-sheets/painted/intro-<name>.png', () => {
    for (const j of queue.QUEUE) expect(j.out.replace(/\\/g, '/')).toMatch(/art-sheets\/painted\/intro-[a-z-]+\.png$/)
  })
})

describe('intro art registry', () => {
  it('only lists files that exist', () => {
    for (const art of Object.values(PAINTED_INTRO)) {
      for (const s of Object.values(art!.sprites)) {
        expect(existsSync(resolve(ROOT, 'public', 'images', 'intro', s.file)), s.file).toBe(true)
      }
    }
  })

  it('falls back (null) in jsdom and for anything not painted', () => {
    expect(introArtImage('canopy', 'corner')).toBeNull()
    expect(introArtUrl('trail', 'nope')).toBeNull()
  })
})

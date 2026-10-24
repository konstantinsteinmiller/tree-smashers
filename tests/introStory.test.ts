import { describe, expect, it } from 'vitest'
import {
  BEAT, CAST, CAMERA_KEYS, SHOWCASE, STORY_EVENTS, TREES, SMASHER_R, TREE_R, HIT_STOPS, ROCKETS,
  BRAMBLE, GRIZZLE, CHOMPER, THUMPER, VIXIE, LOG_SLAM_CONTACT, BEAR_HUG_CONTACT, SKIP_APPEARS_T, REVEAL_ARENA_T,
  TRAIL_STONES, AMBIENT_LEAVES, CAPTION_SKILLS,
  cameraAt, fxRate, overlayAt, smasherAt, treeAt,
  type CameraState, type OverlayState, type SmasherState, type TreeState
} from '@/use/introStory'
import { INTRO_SMASHER_IDS } from '@/use/introGate'
import { SMASHERS } from '@/data/smasherCatalog'
import { towerDamageStage } from '@/use/towerArt'
import { buildTerrainLayout } from '@/use/arenaTerrain'
import { isInside } from '@/use/arenaShapes'
import { INTRO_CUES, cuesFor, introSfxNames, treeFallSfx, treeHitSfx } from '@/use/introAudio'
import { newSlotOn } from '@/audio/audioVersions'

// ─── The first-launch intro's story (#Intro1, art-sheets/intro/STORYBOARD.md) ─

const sm = (): SmasherState => ({ x: 0, y: 0, h: 0, sy: 1, alpha: 0, rot: 0, yaw: 0, flash: 0, shield: 0, trail: 0, vx: 0, vy: 0 })
const tree = (): TreeState => ({ grow: 0, sx: 1, sy: 1, alpha: 0, hp: 0, flash: 0, thorns: 0, gauge: 0, wob: 0 })
const cam = (): CameraState => ({ x: 0, y: 0, z: 0, push: 1, sx: 0, sy: 0 })
const ov = (): OverlayState => ({ captionTree: 0, captionSkills: 0, card: -1, cardIn: 0, title: false, handoff: 0, stonesLit: 0, canopy: 0, iris: -1 })
const STEP = 1 / 200

describe('the beats', () => {
  it('runs 12–18 s, calmer than the old intro, Skip after ~1 s', () => {
    expect(BEAT.end).toBeGreaterThanOrEqual(12)
    expect(BEAT.end).toBeLessThanOrEqual(18)
    expect(SKIP_APPEARS_T).toBeLessThanOrEqual(1.2)
    const order = [BEAT.establish, BEAT.redTree, BEAT.blueTree, BEAT.thorns, BEAT.spinUp, BEAT.skill1, BEAT.skill2,
      BEAT.skill3, BEAT.launch, BEAT.impact, BEAT.iris, BEAT.title, BEAT.trail, BEAT.handoff, BEAT.end]
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!)
    // The live arena starts drawing under the opaque title card, before the hand-off.
    expect(REVEAL_ARENA_T).toBeGreaterThan(BEAT.title)
    expect(REVEAL_ARENA_T).toBeLessThan(BEAT.handoff)
  })

  it('has only two hit-stops and one slow-mo window in the whole film', () => {
    expect(HIT_STOPS.length).toBe(2)
    let stops = 0
    let slow = 0
    let prev = 1
    for (let T = 0; T < BEAT.end; T += STEP) {
      const r = fxRate(T)
      if (r === 0 && prev !== 0) stops++
      if (r > 0 && r < 1 && !(prev > 0 && prev < 1)) slow++
      prev = r
    }
    expect(stops).toBe(2)
    expect(slow).toBe(1)
  })

  it('keeps one action at a time: the three skill windows never overlap', () => {
    for (let i = 1; i < SHOWCASE.length; i++) expect(SHOWCASE[i]!.cardFrom).toBeGreaterThanOrEqual(SHOWCASE[i - 1]!.cardTo)
    expect(CAPTION_SKILLS.to).toBeLessThanOrEqual(SHOWCASE[1]!.cardFrom)
  })
})

describe('the cast and the skills are the real ones', () => {
  it('casts the five smashers the gate names (and preloads)', () => {
    expect(CAST.map(c => c.smasherId)).toEqual([...INTRO_SMASHER_IDS])
  })

  it('showcases three real smasher skills with their real engine effect', () => {
    for (const s of SHOWCASE) {
      const def = SMASHERS[CAST[s.cast]!.smasherId]
      const skill = def.skills.find(k => k.id === s.key)
      expect(skill, `${def.id}.${s.key}`).toBeTruthy()
      expect(skill!.effect).toBe(s.effect)
    }
    // The decisive smash is Tower Breaker — a tree skill.
    expect(SHOWCASE[SHOWCASE.length - 1]!.effect).toBe('tower_breaker')
  })
})

describe('the choreography', () => {
  const terrain = buildTerrainLayout(0)
  // Stage 1's clearing is open since obstacles became rare (solidBudgetFor);
  // the guard stays for any solid the intro layout may carry.
  const solids = [...terrain.islands, ...terrain.mushrooms]

  it('never lets two smashers overlap, except the scripted Bear Hug contact', () => {
    const s = CAST.map(sm)
    for (let T = BEAT.spinUp; T < BEAT.iris; T += STEP) {
      CAST.forEach((_, i) => smasherAt(i, T, s[i]!))
      for (let a = 0; a < CAST.length; a++) {
        for (let b = a + 1; b < CAST.length; b++) {
          if (s[a]!.alpha <= 0 || s[b]!.alpha <= 0) continue
          const d = Math.hypot(s[a]!.x - s[b]!.x, s[a]!.y - s[b]!.y)
          expect(d, `${CAST[a]!.smasherId} × ${CAST[b]!.smasherId} at T=${T.toFixed(3)}`).toBeGreaterThan(2 * SMASHER_R - 1.5)
        }
      }
    }
  })

  it('keeps every smasher inside the clearing and off the stump', () => {
    const s = sm()
    for (let i = 0; i < CAST.length; i++) {
      for (let T = CAST[i]!.dropT; T < BEAT.iris; T += STEP) {
        smasherAt(i, T, s)
        expect(isInside('clover', s.x, s.y, 200, SMASHER_R * 0.6), `${CAST[i]!.smasherId} T=${T.toFixed(3)}`).toBe(true)
        for (const stump of solids) {
          expect(Math.hypot(s.x - stump.x, s.y - stump.y), `${CAST[i]!.smasherId} on the stump T=${T.toFixed(3)}`)
            .toBeGreaterThan(stump.radius + SMASHER_R - 1)
        }
      }
    }
  })

  it('Thumper meets Grizzle exactly at the Bear Hug hit-stop', () => {
    const s = sm()
    smasherAt(THUMPER, HIT_STOPS[0]!.at, s)
    expect(s.x).toBeCloseTo(BEAR_HUG_CONTACT.x, 3)
    expect(s.y).toBeCloseTo(BEAR_HUG_CONTACT.y, 3)
    const g = sm()
    smasherAt(GRIZZLE, HIT_STOPS[0]!.at - 0.01, g)
    expect(g.shield).toBeGreaterThan(0.9)
    smasherAt(GRIZZLE, HIT_STOPS[0]!.at + 0.2, g)
    expect(g.shield).toBeLessThan(0.5)
  })

  it('Chomper hits the red tree front exactly at the impact, and flies clear of the stump', () => {
    const s = sm()
    smasherAt(CHOMPER, BEAT.impact, s)
    expect(s.x).toBeCloseTo(LOG_SLAM_CONTACT.x, 2)
    expect(s.y).toBeCloseTo(LOG_SLAM_CONTACT.y, 2)
    expect(Math.hypot(s.x - TREES.red.x, s.y - TREES.red.y)).toBeCloseTo(TREE_R + SMASHER_R, 2)
    // on the tree's front (towards the clearing)
    expect(s.y).toBeGreaterThan(TREES.red.y)
    // and it accelerates: the slow-mo window is slower than before it
    const at = (T: number) => (smasherAt(CHOMPER, T, s), { x: s.x, y: s.y })
    const v = (a: number, b: number) => { const p = at(a); const q = at(b); return Math.hypot(q.x - p.x, q.y - p.y) / (b - a) }
    expect(v(BEAT.slowFrom + 0.1, BEAT.slowFrom + 0.2)).toBeLessThan(v(BEAT.slowFrom - 0.1, BEAT.slowFrom))
  })

  it('every rocket of the Thorn Volley lands at its scripted time', () => {
    expect(ROCKETS.length).toBe(3)
    for (const r of ROCKETS) expect(r.arrive).toBeGreaterThan(r.at)
    expect(ROCKETS.filter(r => r.target === VIXIE).length).toBe(2)
    expect(ROCKETS.filter(r => r.target === -1).length).toBe(1)
  })

  it('is a pure function of T (same T, same frame)', () => {
    const a = sm()
    const b = sm()
    for (const T of [0, 5.9, 8.06, 9.5, 11.5, 12.4]) {
      for (let i = 0; i < CAST.length; i++) {
        smasherAt(i, T, a)
        smasherAt((i + 1) % CAST.length, 3, b)
        smasherAt(i, T, b)
        expect(b).toEqual(a)
      }
    }
  })
})

describe('the trees are the anchor', () => {
  it('pop up red first, then blue, and stay all film', () => {
    const t = tree()
    treeAt('red', BEAT.redTree - 0.01, t)
    expect(t.grow).toBe(0)
    treeAt('red', BEAT.redTree + 0.8, t)
    expect(t.grow).toBeCloseTo(1, 2)
    treeAt('blue', BEAT.redTree + 0.3, t)
    expect(t.grow).toBe(0)
    treeAt('blue', BEAT.blueTree + 0.8, t)
    expect(t.grow).toBeCloseTo(1, 2)
  })

  it('the red tree goes healthy → damaged (Thorn Volley) → felled (Log Slam)', () => {
    const t = tree()
    const stage = (T: number) => (treeAt('red', T, t), towerDamageStage(t.hp, 100))
    expect(stage(9.0)).toBe(0)
    expect(stage(10.0)).toBe(1)
    expect(stage(BEAT.impact - 0.01)).toBe(1)
    expect(stage(BEAT.impact)).toBe(3)
    // the blue tree is never touched
    treeAt('blue', 12.5, t)
    expect(t.hp).toBe(100)
  })

  it('wears its thorn garland from the face-off on', () => {
    const t = tree()
    treeAt('red', BEAT.thorns - 0.01, t)
    expect(t.thorns).toBe(0)
    treeAt('red', BEAT.thorns + 0.5, t)
    expect(t.thorns).toBe(1)
  })
})

describe('the camera', () => {
  it('holds exactly on WIDE or CLOSE (so the baked arena draws 1 : 1)', () => {
    const c = cam()
    for (const T of [2.0, 4.9, 6.9, 8.35, 9.75, 12.8]) {
      cameraAt(T, c)
      const exactWide = Math.abs(c.z) < 1e-9
      const exactClose = Math.abs(c.z - 1) < 1e-9
      expect(exactWide || exactClose, `z at T=${T}`).toBe(true)
      expect(c.push).toBe(1)
    }
    for (const k of CAMERA_KEYS) expect([0, 1]).toContain(k.z)
  })

  it('shakes once: on the impact', () => {
    const c = cam()
    let shaking = 0
    let was = false
    for (let T = 0; T < BEAT.iris; T += STEP) {
      cameraAt(T, c)
      const s = c.sx !== 0 || c.sy !== 0
      if (s && !was) shaking++
      was = s
    }
    expect(shaking).toBe(1)
  })

  it('reduced motion: no camera moves, no shake, no drops', () => {
    const c = cam()
    const s = sm()
    for (let T = 0; T < BEAT.iris; T += 0.05) {
      cameraAt(T, c, true)
      expect([c.x, c.y, c.z, c.sx, c.sy, c.push]).toEqual([0, 0, 0, 0, 0, 1])
      for (let i = 0; i < CAST.length; i++) {
        smasherAt(i, T, s, true)
        if (T < BEAT.impact) expect(s.h).toBe(0)
      }
    }
  })
})

describe('events, captions, the trail', () => {
  it('lists every event in time order, inside the film', () => {
    for (let i = 1; i < STORY_EVENTS.length; i++) expect(STORY_EVENTS[i]!.T).toBeGreaterThanOrEqual(STORY_EVENTS[i - 1]!.T)
    for (const e of STORY_EVENTS) expect(e.T).toBeLessThan(BEAT.end)
    expect(STORY_EVENTS.filter(e => e.kind === 'land').length).toBe(CAST.length)
    expect(STORY_EVENTS.filter(e => e.kind === 'slam').length).toBe(1)
    expect(STORY_EVENTS.filter(e => e.kind === 'stone').length).toBe(TRAIL_STONES)
    expect(AMBIENT_LEAVES.length).toBeGreaterThan(10)
  })

  it('shows two captions, three skill cards, the title card and the five stones', () => {
    const o = ov()
    expect(overlayAt(4.6, o).captionTree).toBe(1)
    expect(overlayAt(8.2, o).captionSkills).toBe(1)
    expect(overlayAt(8.2, o).card).toBe(0)
    expect(overlayAt(9.8, o).card).toBe(1)
    expect(overlayAt(11.4, o).card).toBe(2)
    expect(overlayAt(BEAT.title - 0.01, o).title).toBe(false)
    expect(overlayAt(BEAT.title, o).title).toBe(true)
    expect(overlayAt(BEAT.trail - 0.01, o).stonesLit).toBe(0)
    expect(overlayAt(BEAT.handoff, o).stonesLit).toBe(TRAIL_STONES)
    expect(overlayAt(BEAT.end, o).handoff).toBe(1)
    // the iris closes on the felled tree right before the title
    expect(overlayAt(BEAT.iris - 0.01, o).iris).toBe(-1)
    expect(overlayAt(BEAT.title, o).iris).toBe(0)
  })
})

describe('the sound', () => {
  it('cues every beat, in time order', () => {
    for (let i = 1; i < INTRO_CUES.length; i++) expect(INTRO_CUES[i]!.T).toBeGreaterThanOrEqual(INTRO_CUES[i - 1]!.T)
    for (const kind of ['treePop', 'slam', 'logo', 'stone', 'launch'] as const) {
      const e = STORY_EVENTS.find(x => x.kind === kind)!
      expect(cuesFor(e).length, kind).toBeGreaterThan(0)
    }
  })

  it('uses the #Sound1 tree slots only when approved, the match stand-ins otherwise', () => {
    expect(treeHitSfx()).toBe(newSlotOn('tree-hit') ? 'tree-hit-1' : 'clash-3')
    expect(treeFallSfx()).toBe(newSlotOn('tree-fall') ? 'tree-fall' : 'celebration-1')
    const names = introSfxNames()
    expect(names).toContain(treeFallSfx())
    expect(names).toContain('level-up')
  })

  it('a skipped / rewound clock never fires a backlog', async () => {
    const { createIntroAudio } = await import('@/use/introAudio')
    const played: string[] = []
    const a = createIntroAudio((n: string) => { played.push(n) }, { value: 1 } as never, () => false)
    // jsdom: no running AudioContext — nothing may play, nothing may throw
    a.update(0, 5)
    a.update(5, 2)
    a.update(2, 16.2)
    expect(played).toEqual([])
    expect(BRAMBLE).toBe(0)
  })
})

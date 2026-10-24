// VS intro (src/use/vsIntro.ts): the pure half — timeline, clock, skip / PvP
// rules, the tutorial rule, the per-smasher skill mapping and the layout.
// The arena integration (VS → meteor shower → 3-2-1, skip, stage 1) is in
// tests/vsIntroArena.test.ts; the screen itself is covered at the end here.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import '@/use/useUser'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import {
  VS_BEATS, VS_EXIT_MS, VS_HANDOFF_MS, VS_SKIP_FROM_MS, VS_SOUND_CUES, VS_TOTAL_MS, VS_CARD_ASPECT, VS_NAMES_MIN_W,
  buildVsSide, computeVsLayout, emptyVsSeen, fitVsGrid, newVsClock, parseVsSeen, recordVsSeen, shouldShowVsIntro, skipVsClock, stepVsClock,
  VS_SEEN_OPP_CAP,
  vsBoxesOverlap, vsCanSkipAt, vsEmblemBox, vsLevelOf, vsLookOf, vsSkillChips, vsSkippable, vsUnitPower, vsUsesWallClock,
  type VsBox, type VsIntroData, type VsMode
} from '@/use/vsIntro'
import { SKILL_SLOT_LEVELS, SMASHERS, smasherConfig, smasherForParts, smasherLoadout, smasherSkillLevel } from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'

const ALL_MODES: VsMode[] = ['campaign', 'boss', 'ghost', 'league', 'bot', 'pvp']

describe('VS intro — timeline', () => {
  it('is a 5 s screen (owner): the hand-off under the exit wipe, before the end', () => {
    expect(VS_TOTAL_MS).toBe(5000)
    expect(VS_EXIT_MS).toBeLessThan(VS_HANDOFF_MS)
    expect(VS_HANDOFF_MS).toBeLessThan(VS_TOTAL_MS)
    expect(VS_TOTAL_MS - VS_HANDOFF_MS).toBeLessThanOrEqual(250)
    expect(VS_SKIP_FROM_MS).toBe(800)
  })

  it('beats are in order: halves, cards, VS slam, skills, power, hold, exit', () => {
    const b = VS_BEATS
    const order = [b.halves, b.cardsMe, b.cardsThem, b.vsStart, b.vsLand, b.skills, b.power, b.hold, b.exit, b.handoff, b.done]
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!)
    // The slam lands after both sides' first cards have landed.
    expect(b.vsLand).toBeGreaterThan(b.cardsThem + b.cardSlide)
    // The slam-in stays punchy (everything in by ~1.4 s) and the stretch is
    // the readable hold on the full lineup (>= 3 s).
    expect(b.hold).toBeLessThanOrEqual(1400)
    expect(b.exit - b.hold).toBeGreaterThanOrEqual(3000)
  })

  it('sound cues: whoosh at 0, two card thumps, the slam on the landing, the exit whoosh', () => {
    expect(VS_SOUND_CUES.map(c => c.name)).toEqual(['vs-whoosh', 'vs-thump', 'vs-thump', 'vs-slam', 'vs-whoosh'])
    expect(VS_SOUND_CUES[0]!.at).toBe(0)
    expect(VS_SOUND_CUES.find(c => c.name === 'vs-slam')!.at).toBe(VS_BEATS.vsLand)
    expect(VS_SOUND_CUES.at(-1)!.at).toBe(VS_EXIT_MS)
    // Levels stay in the game's SFX range (a clash is 0.025).
    for (const c of VS_SOUND_CUES) expect(c.ratio).toBeGreaterThan(0.01)
    for (const c of VS_SOUND_CUES) expect(c.ratio).toBeLessThanOrEqual(0.03)
  })
})

describe('VS intro — clock', () => {
  const run = (frameMs: number, pausedFrom = -1, pausedTo = -1) => {
    const c = newVsClock()
    const played: string[] = []
    let handoffAt = -1
    let doneAt = -1
    let real = 0
    for (let f = 0; f < 2000 && !c.done; f++) {
      const paused = real >= pausedFrom && real < pausedTo
      const s = stepVsClock(c, f === 0 ? 0 : frameMs, paused)
      played.push(...s.cues.map(x => x.name))
      if (s.handoff) handoffAt = real
      if (s.done) doneAt = real
      real += frameMs
    }
    return { played, handoffAt, doneAt }
  }

  it('60 fps: hand-off at 4.8 s, gone at 5.0 s, every cue once', () => {
    const r = run(1000 / 60)
    expect(r.handoffAt).toBeGreaterThanOrEqual(VS_HANDOFF_MS - 17)
    expect(r.handoffAt).toBeLessThanOrEqual(VS_HANDOFF_MS + 17)
    expect(r.doneAt).toBeGreaterThanOrEqual(VS_TOTAL_MS - 17)
    expect(r.doneAt).toBeLessThanOrEqual(VS_TOTAL_MS + 17)
    expect(r.played).toEqual(VS_SOUND_CUES.map(c => c.name))
  })

  it('30 fps lands within a frame of the same times', () => {
    const r = run(1000 / 30)
    expect(Math.abs(r.handoffAt - VS_HANDOFF_MS)).toBeLessThanOrEqual(34)
    expect(Math.abs(r.doneAt - VS_TOTAL_MS)).toBeLessThanOrEqual(34)
  })

  it('a pause freezes the clock (single-player): the screen runs that much longer', () => {
    const r = run(1000 / 60, 1000, 2000)
    expect(r.handoffAt).toBeGreaterThanOrEqual(VS_HANDOFF_MS + 1000 - 17)
    expect(r.doneAt).toBeGreaterThanOrEqual(VS_TOTAL_MS + 1000 - 17)
  })

  it('caps one long frame (a tab back from the background)', () => {
    const c = newVsClock()
    stepVsClock(c, 0, false)
    stepVsClock(c, 10_000, false)
    expect(c.ms).toBe(250)
  })
})

describe('VS intro — skip and PvP rules', () => {
  it('single-player modes skip from 0.8 s until the exit; PvP and the bot never', () => {
    for (const m of ALL_MODES) {
      const can = vsSkippable(m)
      expect(can, m).toBe(m !== 'pvp' && m !== 'bot')
      expect(vsCanSkipAt(m, 799)).toBe(false)
      expect(vsCanSkipAt(m, 800)).toBe(can)
      expect(vsCanSkipAt(m, 2000)).toBe(can)
      expect(vsCanSkipAt(m, VS_EXIT_MS)).toBe(false)
    }
  })

  it('only human PvP runs on the wall clock (no pause — identical on both peers)', () => {
    for (const m of ALL_MODES) expect(vsUsesWallClock(m), m).toBe(m === 'pvp')
  })

  it('a skip jumps to the exit wipe, plays only the exit whoosh, still hands off', () => {
    const c = newVsClock()
    stepVsClock(c, 0, false)
    for (let i = 0; i < 30; i++) stepVsClock(c, 1000 / 60, false) // 0.5 s
    expect(skipVsClock(c, 'campaign')).toBeNull() // too early
    for (let i = 0; i < 30; i++) stepVsClock(c, 1000 / 60, false) // 1.0 s
    expect(skipVsClock(c, 'pvp')).toBeNull()
    expect(skipVsClock(c, 'bot')).toBeNull()
    const s = skipVsClock(c, 'campaign')!
    expect(c.ms).toBe(VS_EXIT_MS)
    expect(s.cues.map(x => x.name)).toEqual(['vs-whoosh'])
    let handoff = false
    let frames = 0
    while (!c.done && frames < 100) {
      handoff = stepVsClock(c, 1000 / 60, false).handoff || handoff
      frames++
    }
    expect(handoff).toBe(true)
    // From the skip to the hand-off: the 0.25 s of wipe.
    expect(frames).toBeLessThanOrEqual(Math.ceil((VS_TOTAL_MS - VS_EXIT_MS) / (1000 / 60)) + 1)
  })

  it('the tutorial (campaign stage 1) never has a VS', () => {
    expect(shouldShowVsIntro({ mode: 'campaign', stageId: 1 }, emptyVsSeen())).toBe(false)
    expect(shouldShowVsIntro({ mode: 'campaign', stageId: 2 }, emptyVsSeen())).toBe(true)
  })
})

describe('VS intro — once per matchup', () => {
  it('campaign: first attempt of a new stage only; retries and won-stage replays skip; bosses alike', () => {
    for (const mode of ['campaign', 'boss'] as const) {
      let seen = emptyVsSeen()
      const m12 = { mode, stageId: 12 }
      expect(shouldShowVsIntro(m12, seen)).toBe(true)
      seen = recordVsSeen(m12, seen)
      expect(seen.stage).toBe(12)
      // A loss / restart: the same stage again goes straight to the meteors.
      expect(shouldShowVsIntro(m12, seen)).toBe(false)
      // Won: the next stage's first attempt shows it.
      expect(shouldShowVsIntro({ mode, stageId: 13 }, seen)).toBe(true)
      seen = recordVsSeen({ mode, stageId: 13 }, seen)
      // Replaying an already-won stage later: no VS, and the mark never drops.
      expect(shouldShowVsIntro({ mode, stageId: 7 }, seen)).toBe(false)
      expect(recordVsSeen({ mode, stageId: 7 }, seen).stage).toBe(13)
    }
    // A returning player who never saw one gets it on the current stage.
    expect(shouldShowVsIntro({ mode: 'campaign', stageId: 40 }, emptyVsSeen())).toBe(true)
  })

  it('Boss Lab / cheat stages always show it and record nothing', () => {
    const seen = { stage: 50, opp: [] }
    const lab = { mode: 'boss' as const, stageId: 20, lab: true }
    expect(shouldShowVsIntro(lab, seen)).toBe(true)
    expect(recordVsSeen(lab, seen)).toBe(seen)
  })

  it('ghost and league: once per opponent (kept in the save, oldest dropped)', () => {
    let seen = emptyVsSeen()
    for (const mode of ['ghost', 'league'] as const) {
      const m = { mode, stageId: 30, opponent: `${mode}:abc` }
      expect(shouldShowVsIntro(m, seen)).toBe(true)
      seen = recordVsSeen(m, seen)
      expect(shouldShowVsIntro(m, seen)).toBe(false)
      expect(shouldShowVsIntro({ ...m, opponent: `${mode}:other` }, seen)).toBe(true)
    }
    for (let i = 0; i < VS_SEEN_OPP_CAP + 10; i++) seen = recordVsSeen({ mode: 'ghost', stageId: 1, opponent: `ghost:${i}` }, seen)
    expect(seen.opp.length).toBe(VS_SEEN_OPP_CAP)
    expect(seen.opp.at(-1)).toBe(`ghost:${VS_SEEN_OPP_CAP + 9}`)
  })

  it('bot: once per bot in the session; human PvP: the first match of a pairing only', () => {
    const met = new Set<string>(['bot:Pip'])
    expect(shouldShowVsIntro({ mode: 'bot', stageId: 1, opponent: 'bot:Pip' }, emptyVsSeen(), met)).toBe(false)
    expect(shouldShowVsIntro({ mode: 'bot', stageId: 1, opponent: 'bot:Zed' }, emptyVsSeen(), met)).toBe(true)
    expect(shouldShowVsIntro({ mode: 'pvp', stageId: 1, pairingMatches: 0 }, emptyVsSeen())).toBe(true)
    expect(shouldShowVsIntro({ mode: 'pvp', stageId: 1, pairingMatches: 1 }, emptyVsSeen())).toBe(false)
    // The PvP decision ignores the per-device save (it must match on both peers).
    expect(shouldShowVsIntro({ mode: 'pvp', stageId: 1, pairingMatches: 0 }, { stage: 999, opp: ['pvp:x'] })).toBe(true)
    expect(recordVsSeen({ mode: 'pvp', stageId: 1, opponent: 'pvp:x' }, emptyVsSeen())).toEqual(emptyVsSeen())
  })

  it('parses a stored value defensively', () => {
    expect(parseVsSeen(null)).toEqual(emptyVsSeen())
    expect(parseVsSeen('{bad')).toEqual(emptyVsSeen())
    expect(parseVsSeen('{"stage":"x","opp":[1,"a"]}')).toEqual({ stage: 0, opp: ['a'] })
    expect(parseVsSeen(JSON.stringify({ stage: 12.7, opp: ['ghost:1'] }))).toEqual({ stage: 12, opp: ['ghost:1'] })
  })

  it('the save key is a smashers_ key (rides the cloud save, cleared by a progress reset)', async () => {
    const { VS_SEEN_KEY } = await import('@/keys')
    expect(VS_SEEN_KEY).toBe('smashers_vs_seen')
  })
})

describe('VS intro — skills per smasher level', () => {
  const ids = Object.keys(SMASHERS) as (keyof typeof SMASHERS)[]

  it('three slots per smasher: open ones at their engine level, the rest locked with the opening level', () => {
    for (const id of ids) {
      for (const level of [1, 9, 10, 19, 20, 30]) {
        const chips = vsSkillChips(smasherConfig(id, level), null, true)
        expect(chips.length).toBe(3)
        chips.forEach((c, slot) => {
          const lv = smasherSkillLevel(level, slot)
          expect(c.locked).toBe(lv === 0)
          expect(c.level).toBe(lv)
          expect(c.unlockLevel).toBe(SKILL_SLOT_LEVELS[slot])
          expect(c.key).toBe(SMASHERS[id].skills[slot]!.id)
          expect(c.effect).toBe(SMASHERS[id].skills[slot]!.effect)
          expect(c.nameKey).toBe(`smasher_skill_${c.key}`)
        })
      }
    }
  })

  it('the open chips are exactly what the engine equips (smasherLoadout)', () => {
    for (const id of ids) {
      for (const level of [1, 10, 20, 30]) {
        const cfg = smasherConfig(id, level)
        const open = vsSkillChips(cfg, null, true).filter(c => !c.locked)
        expect(open.map(c => ({ id: c.effect, level: c.level, key: c.key }))).toEqual(
          smasherLoadout(cfg).map(s => ({ id: s.id, level: s.level, key: s.key }))
        )
      }
    }
  })

  it('level 1 → 1 open, level 10 → 2, level 20 → 3', () => {
    const open = (lv: number) => vsSkillChips(smasherConfig('bramble', lv), null, true).filter(c => !c.locked).length
    expect(open(1)).toBe(1)
    expect(open(9)).toBe(1)
    expect(open(10)).toBe(2)
    expect(open(20)).toBe(3)
  })

  it('every name key exists in English', () => {
    const flat = en as unknown as Record<string, unknown>
    for (const id of ids) for (const c of vsSkillChips(smasherConfig(id, 30), null, true)) expect(typeof flat[c.nameKey], c.nameKey).toBe('string')
  })

  it('part-only blades carry their side loadout; campaign NPCs none; skills-off builds none', () => {
    const part: SpinnerConfig = { topPartId: 'star', bottomPartId: 'speedy', topLevel: 4, bottomLevel: 4 }
    expect(vsSkillChips(part, null, true)).toEqual([])
    const lo = vsSkillChips(part, [{ id: 'guard_shell', level: 3 }, { id: 'momentum', level: 1 }], true)
    expect(lo.map(c => [c.effect, c.level, c.locked, c.nameKey])).toEqual([
      ['guard_shell', 3, false, 'skills.names.guard_shell'],
      ['momentum', 1, false, 'skills.names.momentum']
    ])
    expect(vsSkillChips(smasherConfig('bramble', 30), null, false)).toEqual([])
  })

  it('levels and looks follow the engine rules', () => {
    expect(vsLevelOf(smasherConfig('vixie', 17))).toBe(17)
    expect(vsLevelOf({ topPartId: 'star', bottomPartId: 'speedy', topLevel: 6, bottomLevel: 3 })).toBe(7)
    const part: SpinnerConfig = { topPartId: 'star', bottomPartId: 'speedy', modelId: 'reddragon' }
    expect(vsLookOf(part, 'npc').smasherId).toBe(smasherForParts('star', 'speedy', 'reddragon'))
    expect(vsLookOf({ topPartId: 'star', bottomPartId: 'speedy' }, 'npc').smasherId).toBe(smasherForParts('star', 'speedy', 'star_npc'))
    expect(vsLookOf(smasherConfig('grizzle', 3), 'player').smasherId).toBe('grizzle')
  })

  it('power: more HP / attack / open skills is more; the side sums its cards', () => {
    expect(vsUnitPower(100, 1, 1, 0)).toBeLessThan(vsUnitPower(120, 1, 1, 0))
    expect(vsUnitPower(100, 1, 1, 0)).toBeLessThan(vsUnitPower(100, 1.2, 1, 0))
    expect(vsUnitPower(100, 1, 1, 0)).toBeLessThan(vsUnitPower(100, 1, 1, 1))
    expect(vsUnitPower(Number.NaN, Number.NaN, 1, 0)).toBeGreaterThanOrEqual(1)
    const side = buildVsSide('YOU', 'player', [
      { config: smasherConfig('bramble', 12), maxHp: 80, damageMul: 1.1, defenseMul: 1 },
      { config: { ...smasherConfig('thumper', 3), isBoss: true }, maxHp: 60, damageMul: 1, defenseMul: 1 }
    ], { skillsOn: true })
    expect(side.power).toBe(side.units[0]!.power + side.units[1]!.power)
    expect(side.boss).toBe(true)
    expect(side.units[0]!.skills.filter(s => !s.locked).length).toBe(2)
  })
})

describe('VS intro — layout (1–3 vs 1–4, both orientations, desktop)', () => {
  const SCREENS: [number, number, string][] = [
    [390, 844, 'phone portrait'], [360, 640, 'small portrait'], [844, 390, 'phone landscape'],
    [640, 360, 'small landscape'], [768, 1024, 'tablet'], [1280, 720, 'desktop'], [1920, 1080, 'desktop hd']
  ]
  const INSETS = [{ top: 0, right: 0, bottom: 0, left: 0 }, { top: 47, right: 0, bottom: 34, left: 0 }, { top: 0, right: 47, bottom: 21, left: 47 }]

  const inside = (b: VsBox, w: number, h: number) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5

  it('no two boxes overlap and everything is inside the safe area', () => {
    for (const [w, h, name] of SCREENS) {
      for (const ins of INSETS) {
        for (let nMe = 1; nMe <= 3; nMe++) {
          for (let nThem = 1; nThem <= 4; nThem++) {
            for (const skills of [{ me: true, them: true }, { me: true, them: false }, { me: false, them: false }]) {
              const l = computeVsLayout(w, h, ins, nMe, nThem, skills)
              const tag = `${name} ${w}x${h} ${JSON.stringify(ins)} ${nMe}v${nThem} ${JSON.stringify(skills)}`
              expect(l.me.cards.length, tag).toBe(nMe)
              expect(l.them.cards.length, tag).toBe(nThem)
              const boxes: [string, VsBox][] = [
                ...l.me.cards.map((b, i) => [`me${i}`, b] as [string, VsBox]),
                ...l.them.cards.map((b, i) => [`them${i}`, b] as [string, VsBox]),
                ['meHead', l.me.header], ['themHead', l.them.header], ['emblem', vsEmblemBox(l)], ['skip', l.skip]
              ]
              const safe = { x: ins.left, y: ins.top, w: w - ins.left - ins.right, h: h - ins.top - ins.bottom }
              for (const [k, b] of boxes) {
                expect(inside(b, w, h), `${tag} ${k} off-screen`).toBe(true)
                if (k !== 'emblem') {
                  expect(b.x >= safe.x - 0.5 && b.y >= safe.y - 0.5 && b.x + b.w <= safe.x + safe.w + 0.5 && b.y + b.h <= safe.y + safe.h + 0.5, `${tag} ${k} in a notch`).toBe(true)
                }
              }
              for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                  expect(vsBoxesOverlap(boxes[i]![1], boxes[j]![1]), `${tag}: ${boxes[i]![0]} × ${boxes[j]![0]}`).toBe(false)
                }
              }
              // Cards stay readable: never tiny, and skill names only on big cards.
              for (const s of [l.me, l.them]) {
                expect(s.cardW, tag).toBeGreaterThanOrEqual(58)
                if (s.kind === 'names') expect(s.cardW).toBeGreaterThanOrEqual(VS_NAMES_MIN_W)
                for (const b of s.cards) expect(Math.abs(b.h - Math.floor(b.w * VS_CARD_ASPECT[s.kind]))).toBeLessThanOrEqual(1)
              }
            }
          }
        }
      }
    }
  })

  it('portrait puts the enemy on top, the player below; landscape player left', () => {
    const p = computeVsLayout(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }, 2, 2, { me: true, them: true })
    expect(p.portrait).toBe(true)
    expect(p.them.cards[0]!.y).toBeLessThan(p.emblem.y)
    expect(p.me.cards[0]!.y).toBeGreaterThan(p.emblem.y)
    const l = computeVsLayout(1280, 720, { top: 0, right: 0, bottom: 0, left: 0 }, 2, 2, { me: true, them: true })
    expect(l.me.cards[0]!.x).toBeLessThan(l.emblem.x)
    expect(l.them.cards[0]!.x).toBeGreaterThan(l.emblem.x)
  })

  it('a 1v1 on desktop gets big cards with skill names', () => {
    const l = computeVsLayout(1280, 720, { top: 0, right: 0, bottom: 0, left: 0 }, 1, 1, { me: true, them: true })
    expect(l.me.cardW).toBeGreaterThanOrEqual(200)
    expect(l.me.kind).toBe('names')
  })

  it('the grid fit picks the widest card', () => {
    expect(fitVsGrid(4, 400, 400, 8, 999, 1.5)).toMatchObject({ rows: 2, cols: 2 })
    expect(fitVsGrid(4, 1000, 160, 8, 999, 1.5)).toMatchObject({ rows: 1, cols: 4 })
  })
})

describe('VS intro — the screen', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en } as never })
  const data = (mode: VsMode, nThem = 4): VsIntroData => ({
    mode,
    me: buildVsSide('YOU', 'player', [3, 12, 25].map((lv, i) => ({
      config: smasherConfig((['bramble', 'thumper', 'grizzle'] as const)[i]!, lv), maxHp: 80, damageMul: 1, defenseMul: 1
    })), { skillsOn: true }),
    them: buildVsSide('Cinder Throne', 'npc', Array.from({ length: nThem }, (_, i) => ({
      config: { topPartId: 'star', bottomPartId: 'speedy', topLevel: 5, isBoss: i === 0, bossTrait: i === 0 ? 'ember' as const : undefined },
      maxHp: 120, damageMul: 1.1, defenseMul: 1
    })), { skillsOn: false }),
    kicker: 'Boss Stage'
  })

  it('renders every card, locked slots, the boss crown and the trait, and the skip pill only when skippable', async () => {
    // The lazy icon chunks resolve inside the test, not after its teardown.
    await import('@/components/atoms/SkillIcon.vue')
    await import('@/components/atoms/BossTraitGlyph.vue')
    const { default: VsIntro } = await import('@/components/organisms/VsIntro.vue')
    const w = mount(VsIntro, { props: { data: data('boss') }, global: { plugins: [i18n()] }, attachTo: document.body })
    await flushPromises()
    expect(w.findAll('.vs-card.is-me').length).toBe(3)
    expect(w.findAll('.vs-card.is-them').length).toBe(4)
    // Player: Lv 3 → 1 open + 2 locked; Lv 12 → 2 + 1; Lv 25 → 3 + 0.
    expect(w.findAll('.vs-card.is-me .vs-chip').length).toBe(9)
    expect(w.findAll('.vs-card.is-me [data-locked="1"]').length).toBe(3)
    expect(w.findAll('.vs-card.is-them .vs-chip[data-trait="ember"]').length).toBe(1)
    expect(w.findAll('.vs-card.is-boss .vs-crown').length).toBe(1)
    expect(w.text()).toContain('Boss Stage')
    expect(w.text()).toContain('Cinder Throne')
    expect(w.emitted('start')).toBeTruthy()
    w.unmount()
    const p = mount(VsIntro, { props: { data: data('pvp', 2) }, global: { plugins: [i18n()] }, attachTo: document.body })
    await flushPromises()
    expect(p.find('.vs-skip').exists()).toBe(false)
    p.unmount()
  })

  it('uses the style rules: no blur / glow / radial gradients in the VS components', () => {
    for (const f of ['src/components/organisms/VsIntro.vue', 'src/components/atoms/VsPortrait.vue']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/blur\(|backdrop-filter|radial-gradient|shadowBlur|createRadialGradient/)
    }
  })
})

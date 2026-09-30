// Skill UI components (WP5): picker order / swap / MAX / learn gating, the
// intro screen (build-up → reveal, copy, CTA, static storyboard), the helpers
// that feed their copy, and the dev preview never shipping.
//
// useSkills is a module singleton reading localStorage + the build flag at
// import time, so every mount seeds storage, stubs the flag and re-imports a
// fresh module graph (useUser first — project import-cycle rule).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/i18n/locales/en'
import { SKILLS_KEY, SKILL_LOADOUT_KEY, SKILL_UI_KEY, STAGE_KEY, COINS_KEY } from '@/keys'
import { SKILL_AUTOFILL_ORDER } from '@/data/skillCatalog'
import {
  bossDropChip,
  fmtNum,
  numberFormatFor,
  pct,
  pickerCards,
  skillDescParams,
  skillValuesText
} from '@/use/skillText'
import de from '@/i18n/locales/de'
import ru from '@/i18n/locales/ru'
import fr from '@/i18n/locales/fr'
import tr from '@/i18n/locales/tr'
import ar from '@/i18n/locales/ar'
import type { SkillId } from '@/types/skills'

const ROOT = path.resolve(__dirname, '..')

// jsdom has no media playback; the SFX themselves are not under test here.
const playSound = vi.fn()
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound }) }))

const i18n = () => createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
  missingWarn: false,
  fallbackWarn: false
})

interface Seed {
  stage: number
  coins?: number
  levels?: Partial<Record<SkillId, number>>
  slots?: (SkillId | null)[]
}

const seed = (s: Seed) => {
  localStorage.clear()
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_SKILLS', 'true')
  localStorage.setItem(STAGE_KEY, String(s.stage))
  localStorage.setItem(COINS_KEY, String(s.coins ?? 0))
  if (s.levels) localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: 1, lv: s.levels }))
  if (s.slots) localStorage.setItem(SKILL_LOADOUT_KEY, JSON.stringify({ v: 1, slots: s.slots }))
  localStorage.setItem(SKILL_UI_KEY, JSON.stringify({ v: 1, seen: [], intro: true, slot2Seen: true, filled: 2 }))
}

const mountPicker = async (s: Seed, slotIndex: number | null = 0) => {
  seed(s)
  await import('@/use/useUser')
  const skills = (await import('@/use/useSkills')).default()
  const Picker = (await import('@/components/organisms/SkillPickerModal.vue')).default
  const w = mount(Picker, {
    props: { modelValue: true, slotIndex },
    global: { plugins: [i18n()], stubs: { teleport: true } }
  })
  await flushPromises()
  return { w, skills }
}

describe('SkillPickerModal — opening it views the unlocked skills (Team NEW dot)', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('marks every unlocked skill viewed on open, persisted in the ui key', async () => {
    const { skills } = await mountPicker({ stage: 16 }, null)
    expect(skills.hasUnviewedSkill.value).toBe(false)
    expect(JSON.parse(localStorage.getItem(SKILL_UI_KEY)!).viewed).toEqual(['mirror_plate', 'phase_step'])
  })
})

const cardIds = (w: ReturnType<typeof mount>) => w.findAll('.skill-card').map(c => c.attributes('data-skill'))
const card = (w: ReturnType<typeof mount>, id: SkillId) => w.get(`.skill-card[data-skill="${id}"]`)

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  localStorage.clear()
})

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('skill copy helpers', () => {
  it('formats numbers with at most one decimal (English by default)', () => {
    expect(fmtNum(3.5)).toBe('3.5')
    expect(fmtNum(10)).toBe('10')
    expect(fmtNum(0.1 * 100)).toBe('10')
  })

  it('fills every {param} of every skills.desc message at L1 and L10', () => {
    const desc = (en as any).skills.desc as Record<string, string>
    for (const id of SKILL_AUTOFILL_ORDER) {
      const names = [...desc[id]!.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
      for (const lv of [1, 10]) {
        const p = skillDescParams(id, lv)
        expect(Object.keys(p).sort(), id).toEqual(names)
        for (const v of Object.values(p)) expect(v).toMatch(/^\d+(\.\d)?$/)
      }
    }
  })

  it('reads the catalog tables (Mirror Plate L1 5 %, Phase Step L10 10 % · 2.5 s)', () => {
    expect(skillDescParams('mirror_plate', 1)).toEqual({ chance: '5' })
    expect(skillValuesText('phase_step', 10, n => `${n}s`)).toBe('10% · 2.5s')
    expect(skillValuesText('lucky_edge', 1, n => `${n}s`)).toBe('7% · ×1.5')
  })

  it('formats decimals in the active locale (T1): en/ar "2.5", de/ru/fr/tr "2,5"', () => {
    const cases: [string, string][] = [['en', '2.5'], ['ar', '2.5'], ['de', '2,5'], ['ru', '2,5'], ['fr', '2,5'], ['tr', '2,5']]
    for (const [loc, want] of cases) {
      expect(fmtNum(2.5, loc), loc).toBe(want)
      expect(fmtNum(10, loc), loc).toBe('10')
      expect(pct(0.035, loc), loc).toBe(want.replace('2', '3'))
      expect(fmtNum(1234.56, loc), `${loc} no grouping`).toMatch(/^1234[.,]6$/)
    }
    // Registry codes that are not BCP-47 tags still resolve; unknown codes fall back.
    expect(fmtNum(2.5, 'jp')).toBe('2.5')
    expect(fmtNum(2.5, 'pt-BR')).toBe('2,5')
    expect(fmtNum(2.5, 'xx-invalid-?')).toBe('2.5')
    // Arabic keeps Latin digits like every other number the game prints.
    expect(fmtNum(12.5, 'ar')).toBe('12.5')
  })

  it('caches one Intl.NumberFormat per locale (no per-call allocation)', () => {
    expect(numberFormatFor('de')).toBe(numberFormatFor('de'))
    expect(numberFormatFor('de')).not.toBe(numberFormatFor('en'))
  })

  it('skill desc params and the value strip follow the locale (Phase Step L10 2.5 s, Lucky Edge ×1.5)', () => {
    const msgs: Record<string, any> = { en, de, ru, fr, tr, ar }
    const strip = (loc: string, id: SkillId, lv: number) => {
      const i = createI18n({
        legacy: false,
        locale: loc,
        messages: { [loc]: msgs[loc] },
        missingWarn: false,
        fallbackWarn: false
      })
      const t = (i.global as any).t
      return skillValuesText(id, lv, n => t('skills.seconds', { n }), {
        locale: loc,
        percent: n => t('skills.percent', { n })
      })
    }
    expect(skillDescParams('phase_step', 10, 'de')).toEqual({ chance: '10', cd: '2,5' })
    expect(skillDescParams('phase_step', 1, 'ru')).toEqual({ chance: '3,5', cd: '4' })
    expect(skillDescParams('lucky_edge', 1, 'fr').mult).toBe('1,5')
    expect(strip('en', 'phase_step', 10)).toBe('10% · 2.5s')
    expect(strip('de', 'phase_step', 10)).toBe('10% · 2,5 s')
    expect(strip('ru', 'phase_step', 10)).toBe('10% · 2,5 с')
    expect(strip('fr', 'phase_step', 10)).toBe('10 % · 2,5 s')
    expect(strip('tr', 'phase_step', 10)).toBe('%10 · 2,5 sn')
    expect(strip('ar', 'phase_step', 10)).toBe('10% · 2.5 ث')
    expect(strip('de', 'lucky_edge', 1)).toBe('7% · ×1,5')
    expect(strip('tr', 'momentum', 1)).toBe('%2,5')
  })

  it('skills.percent places the sign like each locale\'s own skill descriptions', () => {
    const dir = path.join(ROOT, 'src/i18n/locales')
    for (const f of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const src = readFileSync(path.join(dir, f), 'utf8')
      const percent = /'percent': '([^']*)'/.exec(src)?.[1]
      const guard = /'guard_shell': '([^']*\{pct\}[^']*)'/.exec(src)?.[1]
      expect(percent, f).toBeDefined()
      expect(guard, f).toBeDefined()
      expect(guard!.includes(percent!.replace('{n}', '{pct}')), `${f}: ${percent} vs "${guard}"`).toBe(true)
    }
  })

  it('boss-drop chip: nothing below the teaser stage, "?" for the stage-10 boss, glyph later, gone once unlocked', () => {
    expect(bossDropChip(10, 5, true, 8)).toBeNull()
    expect(bossDropChip(10, 7, true, 8)).toEqual({ id: 'mirror_plate', mystery: true })
    expect(bossDropChip(15, 12, true, 8)).toEqual({ id: 'phase_step', mystery: false })
    expect(bossDropChip(15, 15, true, 8)).toBeNull()
    expect(bossDropChip(12, 11, true, 8)).toBeNull()
    expect(bossDropChip(60, 58, true, 8)).toBeNull()
    expect(bossDropChip(15, 12, false, 8)).toBeNull()
  })
})

// ─── Picker ───────────────────────────────────────────────────────────────────

describe('pickerCards order', () => {
  it('this slot → learned & free → other slot → unlearned → locked, each group by unlock stage', () => {
    const unlocked = new Set<SkillId>(['mirror_plate', 'phase_step', 'guard_shell', 'second_wind', 'lucky_edge'])
    const learned = new Set<SkillId>(['mirror_plate', 'guard_shell', 'lucky_edge', 'phase_step'])
    const cards = pickerCards(0, ['lucky_edge', 'phase_step'], id => unlocked.has(id), id => learned.has(id))
    expect(cards.map(c => `${c.kind}:${c.id}`)).toEqual([
      'here:lucky_edge',
      'free:mirror_plate', 'free:guard_shell',
      'other:phase_step',
      'unlearned:second_wind',
      'locked:homing_rockets', 'locked:opening_salvo', 'locked:momentum', 'locked:hazard_ward', 'locked:static_charge'
    ])
  })

  it('without a slot context every equipped skill counts as "here"', () => {
    const cards = pickerCards(null, ['phase_step', 'mirror_plate'], () => true, () => true)
    expect(cards.slice(0, 2).map(c => c.id)).toEqual(['mirror_plate', 'phase_step'])
    expect(cards.slice(0, 2).every(c => c.kind === 'here')).toBe(true)
  })
})

describe('SkillPickerModal', () => {
  it('renders the cards in unlock-stage order within each group', async () => {
    const { w } = await mountPicker({
      stage: 36,
      levels: { mirror_plate: 2, phase_step: 1, guard_shell: 3 },
      slots: ['guard_shell', 'mirror_plate']
    })
    expect(cardIds(w)).toEqual([
      'guard_shell', 'phase_step', 'mirror_plate',
      'second_wind', 'lucky_edge', 'homing_rockets',
      'opening_salvo', 'momentum', 'hazard_ward', 'static_charge'
    ])
    // Locked cards keep the skill a secret.
    const locked = card(w, 'momentum')
    expect(locked.text()).not.toContain('Momentum')
    expect(locked.text()).toContain('Stage 45')
    w.unmount()
  })

  it('tapping the other slot\'s skill swaps the two slots', async () => {
    const { w, skills } = await mountPicker({
      stage: 21,
      levels: { mirror_plate: 1, phase_step: 1 },
      slots: ['mirror_plate', 'phase_step']
    }, 0)
    expect(card(w, 'phase_step').attributes('data-kind')).toBe('other')
    await card(w, 'phase_step').get('[data-action="equip"]').trigger('click')
    expect(skills.slots.value).toEqual(['phase_step', 'mirror_plate'])
    await nextTick()
    expect(card(w, 'phase_step').attributes('data-kind')).toBe('here')
    expect(card(w, 'phase_step').find('[data-action="remove"]').exists()).toBe(true)
    w.unmount()
  })

  it('shows MAX (and no buy button) at level 10', async () => {
    const { w } = await mountPicker({ stage: 16, coins: 99999, levels: { mirror_plate: 10, phase_step: 4 } })
    const max = card(w, 'mirror_plate')
    expect(max.find('[data-action="max"]').text()).toBe('MAX')
    expect(max.find('[data-action="upgrade"]').exists()).toBe(false)
    expect(card(w, 'phase_step').find('[data-action="upgrade"]').exists()).toBe(true)
    w.unmount()
  })

  it('learn is disabled while unaffordable and learns once the coins are there', async () => {
    const { w, skills } = await mountPicker({ stage: 11, coins: 149 })
    const learn = () => card(w, 'mirror_plate').get('[data-action="learn"]')
    expect(learn().attributes('disabled')).toBeDefined()
    await learn().trigger('click')
    expect(skills.levelOf('mirror_plate')).toBe(0)

    const config = (await import('@/use/useSpinnerConfig')).default()
    config.addCoins(1)
    await nextTick()
    expect(learn().attributes('disabled')).toBeUndefined()
    await learn().trigger('click')
    expect(skills.levelOf('mirror_plate')).toBe(1)
    expect(config.coins.value).toBe(0)
    expect(playSound).toHaveBeenCalledWith('level-up')
    // Learning auto-fills the empty slot 1.
    expect(skills.slots.value[0]).toBe('mirror_plate')
    w.unmount()
  })

  it('upgrade button shows the catalog cost and is greyed when short', async () => {
    const { w } = await mountPicker({
      stage: 11,
      coins: 50,
      levels: { mirror_plate: 1 },
      slots: ['mirror_plate', null]
    })
    const up = card(w, 'mirror_plate').get('[data-action="upgrade"]')
    expect(up.text()).toContain('100')
    expect(up.attributes('disabled')).toBeDefined()
    expect(up.classes()).toContain('is-short')
    w.unmount()
  })
})

// ─── Intro screen ─────────────────────────────────────────────────────────────

const mountIntro = async (opts: { reduced?: boolean; low?: boolean; staticMode?: boolean | null } = {}) => {
  vi.resetModules()
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? !!opts.reduced : false,
    media: q,
    addEventListener: () => {
    },
    removeEventListener: () => {
    }
  })) as unknown as typeof window.matchMedia
  const quality = await import('@/use/useQuality')
  quality.setQualityPreference(opts.low ? 'low' : 'high')
  const Intro = (await import('@/components/organisms/SkillsIntroScreen.vue')).default
  const w = mount(Intro, {
    props: { modelValue: true, skillIds: ['mirror_plate'], staticMode: opts.staticMode ?? null },
    global: { plugins: [i18n()] },
    attachTo: document.body
  })
  await nextTick()
  return w
}

describe('SkillsIntroScreen', () => {
  it('drum-roll build-up first (1.2–1.5 s), then reveals copy, example and CTA', async () => {
    vi.useFakeTimers()
    const w = await mountIntro()
    const drum = w.emitted('drumroll')
    expect(drum).toHaveLength(1)
    const ms = drum![0]![0] as number
    expect(ms).toBeGreaterThanOrEqual(1200)
    expect(ms).toBeLessThanOrEqual(1500)
    expect(w.find('[data-testid="skills-intro-buildup"]').exists()).toBe(true)
    expect(w.find('[data-testid="skills-intro-panel"]').exists()).toBe(false)

    vi.advanceTimersByTime(ms - 1)
    await nextTick()
    expect(w.emitted('revealed')).toBeUndefined()
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(w.emitted('revealed')).toHaveLength(1)

    const panel = w.get('[data-testid="skills-intro-panel"]')
    const s = (en as any).skills
    for (const k of ['line1', 'line2', 'line3', 'line4', 'kicker', 'cta']) expect(panel.text()).toContain(s.intro[k])
    expect(panel.text()).toContain(s.unlockedTitle)
    expect(panel.get('[data-testid="skill-demo"]').attributes('aria-label')).toContain('Mirror Plate')
    expect(panel.find('[data-mode="animated"]').exists()).toBe(true)
    w.unmount()
  })

  it('CTA opens the picker, ✕ closes — both close the screen', async () => {
    vi.useFakeTimers()
    const w = await mountIntro()
    vi.advanceTimersByTime(1500)
    await nextTick()
    await w.get('[data-action="open-picker"]').trigger('click')
    expect(w.emitted('open-picker')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    await w.get('[data-action="close"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('clamps the build-up into 1200–1500 ms', async () => {
    vi.useFakeTimers()
    const Intro = (await import('@/components/organisms/SkillsIntroScreen.vue')).default
    for (const [asked, got] of [[200, 1200], [9000, 1500], [1400, 1400]] as const) {
      const w = mount(Intro, { props: { modelValue: true, buildUpMs: asked }, global: { plugins: [i18n()] } })
      expect(w.emitted('drumroll')![0]![0]).toBe(got)
      w.unmount()
    }
  })

  it.each([
    ['prefers-reduced-motion', { reduced: true }],
    ['FX.low', { low: true }]
  ])('%s: static storyboard instead of the animation', async (_, opts) => {
    vi.useFakeTimers()
    const w = await mountIntro(opts)
    expect(w.get('[data-testid="skills-intro"]').classes()).toContain('is-static')
    vi.advanceTimersByTime(1500)
    await nextTick()
    const demo = w.get('[data-testid="skill-demo"]')
    expect(demo.find('[data-mode="storyboard"]').exists()).toBe(true)
    expect(demo.find('[data-mode="animated"]').exists()).toBe(false)
    expect(w.text()).toContain((en as any).skills.intro.cta)
    w.unmount()
  })
})

// ─── HUD chip + slot tile ─────────────────────────────────────────────────────

describe('SkillHudIcon / SkillSlotTile', () => {
  it('HUD chip: ring, pips, spent state, localized aria-label', async () => {
    const Hud = (await import('@/components/atoms/SkillHudIcon.vue')).default
    const w = mount(Hud, {
      props: { id: 'momentum', level: 4, state: { pips: 2, pipsMax: 3, spent: true } },
      global: { plugins: [i18n()] }
    })
    expect(w.attributes('aria-label')).toBe('Momentum, level 4')
    expect(w.findAll('.skill-hud__pip')).toHaveLength(3)
    expect(w.findAll('.skill-hud__pip.is-on')).toHaveLength(2)
    expect(w.classes()).toContain('is-spent')
    w.unmount()
  })

  it('slot tile: filled / empty / locked looks and the select event', async () => {
    const Tile = (await import('@/components/molecules/SkillSlotTile.vue')).default
    const filled = mount(Tile, {
      props: { slotIndex: 0, skillId: 'guard_shell', level: 3 },
      global: { plugins: [i18n()] }
    })
    expect(filled.attributes('data-state')).toBe('filled')
    expect(filled.text()).toContain('Guard Shell')
    expect(filled.findAll('.skill-slot__seg.is-on')).toHaveLength(3)
    await filled.trigger('click')
    expect(filled.emitted('select')).toEqual([[0]])
    const locked = mount(Tile, {
      props: { slotIndex: 1, locked: true, unlockStage: 20 },
      global: { plugins: [i18n()] }
    })
    expect(locked.attributes('data-state')).toBe('locked')
    expect(locked.text()).toContain('Stage 20')
    const empty = mount(Tile, { props: { slotIndex: 1 }, global: { plugins: [i18n()] } })
    expect(empty.attributes('data-state')).toBe('empty')
    expect(empty.text()).toContain('Empty')
  })
})

// ─── The dev preview never ships ──────────────────────────────────────────────

describe('the skills UI dev preview never ships', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })

  it('is not a build input', () => {
    const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf-8')
    expect(viteConfig).not.toMatch(/skills-ui|skillsUiPreview/)
    expect(readFileSync(path.join(ROOT, 'index.html'), 'utf-8')).not.toMatch(/skills-ui|src\/dev/)
  })

  it('is not imported by anything outside src/dev', () => {
    const devDir = path.join(ROOT, 'src', 'dev')
    const offenders = walk(path.join(ROOT, 'src'))
      .filter((p) => !p.startsWith(devDir) && /\.(ts|vue|js)$/.test(p))
      .filter((p) => /SkillsUiPreview|skillsUiPreview/.test(readFileSync(p, 'utf-8')))
    expect(offenders).toEqual([])
  })
})

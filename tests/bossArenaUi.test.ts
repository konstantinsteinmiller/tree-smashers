// Bosses 100+ — arena integration (BW6) and the Boss Lab (BW7)
// (bosses-100-feature.md §3.5, §7.2, §7.3, §11).
//
//   1. Trait forwarding: the arena's enemy roster keeps bossTrait /
//      shardTrait, so an encounter stage built the way the arena builds it
//      turns the engine's traits on (it used to drop them — no trait ever
//      activated in the real campaign).
//   2. Trophies: only a real campaign WIN of an encounter stage grants, and
//      only once (idempotent grant); cheat / Boss Lab, ghost, PvP and
//      league battles never do. The arena grants on the stage just fought,
//      before advanceStage, and shows it on the roulette reward screen.
//   3. HUD: the stat-card view follows the engine's bossTraitHud rows
//      (frozen / chill pips + aria pct).
//   4. Frozen tap: a tap aimed at a frozen spinner is detected, answered with
//      the crack SFX + shake, and does not pick anything up.
//   5. Boss Lab: 10 encounters + 3 sandboxes built through the encounter
//      builder (id −1, Lab rewards 500/100, traits carried), DEV + cheat gated.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { installBossPort } from './helpers/bosses100Build'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular import.
import '@/use/useUser'
import { useSpinnerGame } from '@/use/useSpinnerGame'
import { grantTrophySkins, isSkinOwned } from '@/use/useModels'
import { getStageById, type Stage } from '@/use/useSpinnerCampaign'
import {
  BOSS_INTRO_TOTAL_MS,
  METEOR_INTRO_MS,
  bossTrophiesFor,
  frozenBladeAtTap,
  grantBossTrophies,
  stageBladeToConfig,
  stageEnemyConfigs,
  traitCardView,
  type TrophyMode
} from '@/use/bosses/bossArenaUi'
import { BOSS_ENCOUNTERS, BOSS_ENCOUNTER_SLOTS } from '@/data/bossEncounters'
import {
  BOSS_LAB_ENTRIES,
  BOSS_LAB_REWARD_LOSE,
  BOSS_LAB_REWARD_WIN,
  buildBossLabStage,
  nextBossLabIndex
} from '@/use/bosses/bossLab'
import { BOSS_TRAIT_TUNING, resetBossTraitTuning } from '@/use/bosses/bossTraits'
import { __resetBossSfx, __setBossSfxPlayer } from '@/use/bosses/bossTraitSfx'
import type { SpinnerConfig, SpinnerState } from '@/types/spinner'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')
const arenaSrc = read('src/views/SpinnerArena.vue')

beforeAll(installBossPort)

let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()
const STEP = 1000 / 60

beforeEach(() => {
  localStorage.clear()
  clock = 10_000
  rafQueue.clear()
  let nextId = 1
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  resetBossTraitTuning()
  __setBossSfxPlayer(null)
  __resetBossSfx()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const frame = () => {
  clock += STEP + 1e-6
  vi.advanceTimersByTime(STEP)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}
const until = (cond: () => boolean, max = 60 * 30) => {
  for (let i = 0; i < max; i++) {
    if (cond()) return
    frame()
  }
  throw new Error('condition never met')
}
const place = (b: SpinnerState, x: number, y: number) => {
  b.x = x
  b.y = y
  b.vx = 0
  b.vy = 0
  b.ax = 0
  b.ay = 0
  b.accelFramesLeft = 0
}
const team = (): SpinnerConfig[] => [
  { topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3 },
  { topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3 }
]

// ─── 1. Trait forwarding ───────────────────────────────────────────────────

describe('trait forwarding into the engine (BW6 blocker)', () => {
  it('every encounter stage keeps each carrier\'s bossTrait / shardTrait', () => {
    for (const slot of BOSS_ENCOUNTER_SLOTS) {
      const stage = getStageById(slot)
      const cfgs = stageEnemyConfigs(stage)
      expect(cfgs.length).toBe(stage.enemyTeam.length)
      stage.enemyTeam.forEach((e, i) => {
        expect(cfgs[i]!.bossTrait, `${slot}#${i}`).toBe(e.bossTrait)
        expect(cfgs[i]!.shardTrait, `${slot}#${i}`).toBe(e.shardTrait)
        expect(cfgs[i]!.bossAbility, `${slot}#${i}`).toBe(e.bossAbility)
      })
      expect(cfgs.some(c => c.bossTrait !== undefined), `stage ${slot}`).toBe(true)
    }
    // the Shattering Glacier hands chill to its shards
    expect(stageEnemyConfigs(getStageById(160))[0]!.shardTrait).toBe('chill')
  })

  it('a classic stage builds the same objects as before (no trait keys)', () => {
    for (const id of [5, 10, 88, 105, 150 - 45]) {
      for (const cfg of stageEnemyConfigs(getStageById(id))) {
        expect('bossTrait' in cfg).toBe(false)
        expect('shardTrait' in cfg).toBe(false)
      }
    }
  })

  it.each([110, 120, 130, 160, 200])('stage %i as the arena builds it turns the engine\'s traits on', (id) => {
    const e = useSpinnerGame()
    e.initGame(team(), stageEnemyConfigs(getStageById(id)), false, 'boss', 0, false, undefined, null, 'circle', { seed: 7 })
    expect(e.traitsActive()).toBe(true)
    e.disposePhysics()
  })

  it('a classic boss stage stays on the no-trait path', () => {
    const e = useSpinnerGame()
    e.initGame(team(), stageEnemyConfigs(getStageById(100)), false, 'boss', 0, false, undefined, null, 'circle', { seed: 7 })
    expect(e.traitsActive()).toBe(false)
    e.disposePhysics()
  })

  it('SpinnerArena\'s stageNpcTeam goes through the forwarding helper', () => {
    const m = arenaSrc.match(/const stageNpcTeam = \(\): SpinnerConfig\[\] =>([^\n]*)/)
    expect(m?.[1]).toContain('stageEnemyConfigs(currentStage.value)')
    expect(stageBladeToConfig({
      topPartId: 'round',
      bottomPartId: 'tanky',
      topLevel: 1,
      bottomLevel: 2,
      bossTrait: 'ember'
    }).bossTrait).toBe('ember')
  })
})

// ─── 2. Trophies ───────────────────────────────────────────────────────────

describe('boss trophies', () => {
  const win110 = { stage: getStageById(110), result: 'win' as const, mode: 'campaign' as TrophyMode }

  it('a real campaign win of an encounter grants its trophy skins', () => {
    expect(bossTrophiesFor(win110)).toEqual(['cinder'])
    expect(bossTrophiesFor({ ...win110, stage: getStageById(170) })).toEqual(['cinder', 'frost-vault'])
    expect(bossTrophiesFor({ ...win110, stage: getStageById(200) })).toEqual(['cinder', 'frost-vault', 'yeti'])
    // 310 = the Cinder Tyrant II
    expect(bossTrophiesFor({ ...win110, stage: getStageById(310) })).toEqual(['cinder'])
  })

  it('never on a loss, a classic stage, the Magma Titan, or outside the campaign', () => {
    expect(bossTrophiesFor({ ...win110, result: 'lose' })).toEqual([])
    expect(bossTrophiesFor({ ...win110, stage: getStageById(105) })).toEqual([])
    expect(bossTrophiesFor({ ...win110, stage: getStageById(10) })).toEqual([])
    expect(bossTrophiesFor({ ...win110, stage: getStageById(180) })).toEqual([])
    for (const mode of ['cheat', 'ghost', 'pvp', 'league'] as TrophyMode[]) {
      expect(bossTrophiesFor({ ...win110, mode }), mode).toEqual([])
    }
    // a Boss Lab stage (id −1) carries the encounter id but never grants
    const lab = buildBossLabStage('cinder_tyrant', {
      levelMode: 'campaign',
      arena: 'authored',
      peakTop: 0,
      peakBottom: 0
    })
    expect(bossTrophiesFor({ ...win110, stage: lab })).toEqual([])
  })

  it('grants once: the second win of the same boss unlocks nothing', () => {
    expect(isSkinOwned('round', 'cinder')).toBe(false)
    expect(grantBossTrophies(win110, grantTrophySkins)).toEqual(['cinder'])
    expect(grantBossTrophies(win110, grantTrophySkins)).toEqual([])
    // 140 wears the same skin — already owned, nothing new to show
    expect(grantBossTrophies({ ...win110, stage: getStageById(140) }, grantTrophySkins)).toEqual([])
    // 170 adds only the Frost Vault
    expect(grantBossTrophies({ ...win110, stage: getStageById(170) }, grantTrophySkins)).toEqual(['frost-vault'])
    expect(isSkinOwned('round', 'cinder')).toBe(true)
    expect(isSkinOwned('quadratic', 'frost-vault')).toBe(true)
  })

  it('the grant function is not even called for a non-granting battle', () => {
    const grant = vi.fn((ids: readonly string[]) => [...ids])
    grantBossTrophies({ ...win110, mode: 'cheat' }, grant)
    grantBossTrophies({ ...win110, result: 'lose' }, grant)
    expect(grant).not.toHaveBeenCalled()
  })

  it('the arena grants on the stage just fought, before advanceStage, and shows it on the roulette reward', () => {
    const i = arenaSrc.indexOf('const isBossWin = ')
    const branch = arenaSrc.slice(i, arenaSrc.indexOf('stopBattleMusic()\n      return', i))
    const grantAt = branch.indexOf('trophyGrants.value = grantBossTrophies(')
    expect(grantAt).toBeGreaterThan(0)
    expect(grantAt).toBeLessThan(branch.indexOf('advanceStage()'))
    expect(branch).toContain('mode: battleModeOf({ ghost: ghostMode.value, cheat: !!cheatStage.value })')
    // the Daily Challenge was removed: no daily branch is left
    expect(arenaSrc).not.toContain('dailyChallengeMode')
    // shown inside the roulette reward overlay; cleared on its Continue,
    // which starts the next campaign game (the team skill-system intro was
    // removed with the reskin: smashers carry their skills)
    const reward = arenaSrc.slice(arenaSrc.indexOf('v-model="showRouletteReward"'), arenaSrc.indexOf('//- 20h Skin Chest reward'))
    expect(reward).toContain('v-for="(id, ti) in trophyGrants"')
    expect(reward).toContain('component(:is="BossTrophyCardUi" :skin-id="id")')
    const cont = arenaSrc.slice(arenaSrc.indexOf('const onRouletteRewardContinue'), arenaSrc.indexOf('// The roulette only opens after a BOSS win'))
    expect(cont).toContain('trophyGrants.value = []')
    expect(cont).toContain('initCampaignGame()')
    expect(cont).not.toContain('queueIntro(')
  })
})

// ─── 3 + 4. HUD and the frozen tap ─────────────────────────────────────────

describe('trait HUD on the stat cards', () => {
  it('traitCardView mirrors the engine rows', () => {
    expect(traitCardView(undefined)).toEqual({ frozen: false, chill: 0, chillPct: 0 })
    expect(traitCardView({ frozen: true, chill: 0 })).toEqual({ frozen: true, chill: 0, chillPct: 0 })
    expect(traitCardView({ frozen: false, chill: 3 })).toEqual({ frozen: false, chill: 3, chillPct: 30 })
    expect(traitCardView({ frozen: false, chill: 9 }).chill).toBe(BOSS_TRAIT_TUNING.CHILL_MAX)
    // a dead spinner shows nothing
    expect(traitCardView({ frozen: true, chill: 2 }, true)).toEqual({ frozen: false, chill: 0, chillPct: 0 })
  })

  it('the stat card binds frozen / chill state, aria and pips', () => {
    const card = arenaSrc.slice(arenaSrc.indexOf('class="blade-stat-card relative"'), arenaSrc.indexOf('div.blade-skill-row'))
    expect(card).toContain('\'blade-stat-frozen\': bs.trait.frozen')
    expect(card).toContain('t(\'bosses.frozenAria\')')
    expect(card).toContain('t(\'bosses.chillAria\', { pct: bs.trait.chillPct })')
    expect(card).toContain('v-for="n in bs.trait.chill"')
    expect(arenaSrc).toContain('trait: traitCardView(traitRows[i], b.hp <= 0)')
  })
})

describe('Frost Lock: HUD row + refused tap on the frozen spinner', () => {
  it('a Warden ram shows the frozen card; a tap on it cracks + shakes and picks nothing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const played: string[] = []
    __resetBossSfx()
    __setBossSfxPlayer((name) => {
      played.push(name)
      return null
    })
    const e = useSpinnerGame()
    const warden = stageEnemyConfigs(getStageById(120))
    // Unseeded: the scripted Math.random drives the Warden's aim (a seeded
    // match would roll its AI on the seed's aux stream — LG-DET).
    e.initGame(team(), warden, false, 'boss', 0, false, undefined, null, 'circle')
    e.startPhysics()
    const [a, b] = e.playerBlades.value as [SpinnerState, SpinnerState]
    const w = e.npcBlades.value[0]!
    place(w, 0, -90)
    place(a, 0, 20)
    place(b, 160, 80)
    e.phase.value = 'npc_turn'
    until(() => e.phase.value === 'npc_launched')
    until(() => e.phase.value === 'player_turn')
    expect(a.lockKind).toBe('frost')

    const rows = e.bossTraitHud.value
    expect(traitCardView(rows[0]).frozen).toBe(true)
    expect(traitCardView(rows[1]).frozen).toBe(false)

    // the tap the arena routes: nearest living blade in reach is the frozen one
    place(b, 160, 80)
    expect(frozenBladeAtTap(e.playerBlades.value, rows, a.x, a.y)).toBe(0)
    expect(frozenBladeAtTap(e.playerBlades.value, rows, b.x, b.y)).toBe(-1)
    expect(frozenBladeAtTap(e.playerBlades.value, rows, 400, 400)).toBe(-1)

    const selected = e.selectedBladeId.value
    played.length = 0
    e.refuseFrozenTap(a)
    expect(played).toContain('boss-crack')
    expect(e.isDragging.value).toBe(false)
    expect(e.selectedBladeId.value).toBe(selected)
    // render-only: the lock and the pickability are untouched
    expect(a.lockKind).toBe('frost')
    expect(e.isBladePickable(a)).toBe(false)
    e.disposePhysics()
  })

  it('the arena answers a frozen tap before beginDrag and swaps the drag hint', () => {
    const down = arenaSrc.slice(arenaSrc.indexOf('const onPointerDown'), arenaSrc.indexOf('const isHoveringBlade'))
    expect(down.indexOf('frozenBladeAtTap(')).toBeGreaterThan(0)
    expect(down.indexOf('frozenBladeAtTap(')).toBeLessThan(down.indexOf('beginDrag(coords.x, coords.y)'))
    const handler = arenaSrc.slice(arenaSrc.indexOf('const onFrozenTap'), arenaSrc.indexOf('// ─── Boss intro card'))
    expect(handler).toContain('refuseFrozenTap(blade)')
    expect(arenaSrc).toContain('t(\'bosses.frozenHint\')')
  })

  it('a tap on the free blade is not treated as frozen', () => {
    const blades = [
      { id: 1, x: 0, y: 0, radius: 20, hp: 10 },
      { id: 2, x: 50, y: 0, radius: 20, hp: 10 }
    ]
    const hud = [{ frozen: true }, { frozen: false }]
    expect(frozenBladeAtTap(blades, hud, 5, 0)).toBe(0)
    expect(frozenBladeAtTap(blades, hud, 45, 0)).toBe(-1)
    // a dead frozen blade is skipped
    blades[0]!.hp = 0
    expect(frozenBladeAtTap(blades, hud, 5, 0)).toBe(-1)
  })
})

describe('boss intro card', () => {
  it('fits inside the meteor intro and is only shown on encounter stages', () => {
    expect(BOSS_INTRO_TOTAL_MS).toBeLessThanOrEqual(METEOR_INTRO_MS)
    expect(arenaSrc).toContain('if (!BOSSES100_BUILD || !stage.bossEncounterId) return null')
    expect(read('src/components/atoms/BossIntroCard.vue')).toContain('createPausableTimer(BOSS_INTRO_TOTAL_MS')
  })
})

// ─── 5. Boss Lab ───────────────────────────────────────────────────────────

describe('Boss Lab', () => {
  const opts = { levelMode: 'campaign' as const, arena: 'authored' as const, peakTop: 30, peakBottom: 28 }

  it('lists the ten encounters in slot order, then the three sandboxes', () => {
    expect(BOSS_LAB_ENTRIES).toHaveLength(13)
    expect(BOSS_LAB_ENTRIES.slice(0, 10).map(e => e.id)).toEqual(BOSS_ENCOUNTERS.map(e => e.id))
    expect(BOSS_LAB_ENTRIES.slice(10).map(e => e.id)).toEqual(['sandbox_ember', 'sandbox_frost', 'sandbox_chill'])
  })

  it('builds every entry as a cheat stage with the Lab rewards and its traits', () => {
    for (const entry of BOSS_LAB_ENTRIES) {
      const stage: Stage = buildBossLabStage(entry.id, opts)
      expect(stage.id).toBe(-1)
      expect(stage.isBoss).toBe(true)
      expect(stage.rewardWin).toBe(BOSS_LAB_REWARD_WIN)
      expect(stage.rewardLose).toBe(BOSS_LAB_REWARD_LOSE)
      const traits = new Set(stage.enemyTeam.flatMap(b => [b.bossTrait, b.shardTrait]).filter(Boolean))
      for (const tr of entry.traits) expect(traits.has(tr), `${entry.id} ${tr}`).toBe(true)
      expect(bossTrophiesFor({ stage, result: 'win', mode: 'campaign' })).toEqual([])
    }
    expect(BOSS_LAB_REWARD_WIN).toBe(500)
    expect(BOSS_LAB_REWARD_LOSE).toBe(100)
  })

  it('encounters come from the shared builder (same roster as the campaign stage)', () => {
    const lab = buildBossLabStage('frostfire_pact', opts)
    const camp = getStageById(170)
    expect(lab.bossEncounterId).toBe('frostfire_pact')
    expect(lab.enemyTeam).toEqual(camp.enemyTeam)
    expect(lab.arenaType).toBe(camp.arenaType)
  })

  it('matched levels = the player\'s peak; the arena can be forced', () => {
    const m = buildBossLabStage('elemental_court', { ...opts, levelMode: 'matched', arena: 'ice' })
    for (const b of m.enemyTeam) {
      expect(b.topLevel).toBe(30)
      expect(b.bottomLevel).toBe(28)
    }
    expect(m.arenaType).toBe('ice')
    const sb = buildBossLabStage('sandbox_chill', opts)
    expect(sb.enemyTeam).toHaveLength(1)
    expect(sb.enemyTeam[0]).toMatchObject({ topPartId: 'quadratic', bossTrait: 'chill', isBoss: true })
  })

  it('every Lab stage turns the engine traits on', () => {
    for (const entry of BOSS_LAB_ENTRIES) {
      const e = useSpinnerGame()
      e.initGame(team(), stageEnemyConfigs(buildBossLabStage(entry.id, opts)), false, 'boss', 0, false, undefined, null, 'circle', { seed: 3 })
      expect(e.traitsActive(), entry.id).toBe(true)
      e.disposePhysics()
    }
  })

  it('next wraps round after the last entry', () => {
    expect(nextBossLabIndex(-1)).toBe(0)
    expect(nextBossLabIndex(0)).toBe(1)
    expect(nextBossLabIndex(12)).toBe(0)
  })

  it('is gated: ctrl+shift+9 only on DEV builds inside the cheat gate, the modal a DEV-only async chunk', () => {
    const cheats = read('src/use/useCheats.ts')
    expect(cheats).toContain('if (!isCheat.value) return {}')
    expect(cheats.indexOf('if (!isCheat.value) return {}')).toBeLessThan(cheats.indexOf('\'ctrl+shift+9\''))
    expect(cheats).toMatch(/if \(import.meta.env.DEV\) \{\n\s+cheatsMap\['ctrl\+shift\+9'\]/)
    expect(cheats).toContain('export const BOSS_LAB_BUILD = import.meta.env.DEV')
    // The handle lives in the bosses gate: DEV-only AND bosses100-only.
    const gate = read('src/bosses/bosses100Gate.ts')
    expect(gate).toMatch(/export const BossLabUi = import\.meta\.env\.DEV && BOSSES100_BUILD\s+\? defineAsyncComponent\(\(\) => import\('@\/components\/organisms\/BossLabModal\.vue'\)\)\s+: null/)
    expect(arenaSrc).toMatch(/import \{[^}]*\bBossLabUi\b[^}]*\} from '@\/bosses\/bosses100Gate'/)
    expect(arenaSrc).not.toMatch(/^import BossLabModal/m)
    expect(arenaSrc).toContain('v-if="BossLabUi && cheatsOn && bossLabOpen"')
    // re-opens after the result screen closes (win, loss, surrender)
    expect(arenaSrc.match(/maybeReopenBossLab\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

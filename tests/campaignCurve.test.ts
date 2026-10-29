// ─── Campaign difficulty curve (balance pass 2026-10-28) ────────────────────
//
// Pure rules of the stage fit: every stage's `hp` / `dmg` scale stays in its
// band, reaches every enemy of its stage and nothing else (cycle copies, league
// gatekeepers, PvP keep their own tuning), and the first stage stays a gift. The
// win rates themselves come from `scripts/balance-sim.mjs camp` against
// tools/balance-sim/targets.mjs (numbers: roadmap.md, "Campaign balance pass").

import { describe, expect, it } from 'vitest'
import { BASE_CAMPAIGN_LENGTH, campaignFirstTurn, getStageById } from '@/use/useSpinnerCampaign'
import { firstFightBoostFor } from '@/use/battleOnboarding'
import { stageEnemyConfigs } from '@/use/stageBladeConfig'
import { gatekeeperStageFor, GATE_TIERS } from '@/league/leagueGatekeepers'
// @ts-ignore — plain ESM from the balance simulator, no .d.ts
import { isBossStage, stageWinTarget } from '../tools/balance-sim/targets.mjs'

const base = Array.from({ length: BASE_CAMPAIGN_LENGTH }, (_, i) => getStageById(i + 1))
const dmgOf = (id: number): number => getStageById(id).enemyTeam[0]!.stageDmgScale ?? 1

describe('stage HP / damage scale', () => {
  it('stays inside its fitted range and is the same on every enemy of a stage', () => {
    for (const st of base) {
      const hp = st.enemyTeam.map(b => b.stageHpScale ?? 1)
      const dmg = st.enemyTeam.map(b => b.stageDmgScale ?? 1)
      expect(new Set(hp).size, `stage ${st.id}`).toBe(1)
      expect(new Set(dmg).size, `stage ${st.id}`).toBe(1)
      expect(hp[0]!, `stage ${st.id}`).toBeGreaterThanOrEqual(0.4)
      expect(hp[0]!, `stage ${st.id}`).toBeLessThanOrEqual(3)
      expect(dmg[0]!, `stage ${st.id}`).toBeGreaterThanOrEqual(0.5)
      expect(dmg[0]!, `stage ${st.id}`).toBeLessThanOrEqual(1.4)
    }
  })

  it('reaches the engine config of every enemy', () => {
    for (const st of base) {
      for (const [i, cfg] of stageEnemyConfigs(st).entries()) {
        expect(cfg.stageHpScale, `stage ${st.id} #${i}`).toBe(st.enemyTeam[i]!.stageHpScale)
        expect(cfg.stageDmgScale, `stage ${st.id} #${i}`).toBe(st.enemyTeam[i]!.stageDmgScale)
      }
    }
  })

  it('stays on the base campaign: cycle copies and league gates carry none', () => {
    for (let id = BASE_CAMPAIGN_LENGTH + 1; id <= 3 * BASE_CAMPAIGN_LENGTH; id++) {
      for (const b of getStageById(id).enemyTeam) {
        expect(b.stageHpScale, `stage ${id}`).toBeUndefined()
        expect(b.stageDmgScale, `stage ${id}`).toBeUndefined()
      }
    }
    for (const tier of GATE_TIERS) {
      for (const b of gatekeeperStageFor(tier).enemyTeam) expect(b.stageHpScale ?? b.stageDmgScale, tier).toBeUndefined()
    }
  })

  it('stage 1 is a sure, quick first win: a soft, gentle enemy, the player opens with the ×2 assist', () => {
    const one = getStageById(1).enemyTeam[0]!
    expect(one.stageHpScale!).toBeLessThanOrEqual(0.6)
    expect(one.stageDmgScale!).toBeLessThanOrEqual(0.5)
    for (let id = 2; id <= BASE_CAMPAIGN_LENGTH; id++) expect(dmgOf(1), `stage ${id}`).toBeLessThanOrEqual(dmgOf(id))
    expect(campaignFirstTurn(1)).toBe('player')
    expect(firstFightBoostFor(false, 1)).toBe(true)
  })
})

describe('target curve (tools/balance-sim/targets.mjs)', () => {
  it('a saw-tooth: every boss is the hardest stage of its block', () => {
    for (let id = 6; id <= 100; id++) {
      if (!isBossStage(id)) continue
      const prev = isBossStage(id - 1) ? id - 2 : id - 1
      expect(stageWinTarget(id), `boss ${id}`).toBeLessThan(stageWinTarget(prev))
    }
  })

  it('stage 1 is a sure win and no boss target drops below 55 %', () => {
    expect(stageWinTarget(1)).toBe(1)
    for (let id = 1; id <= 100; id++) expect(stageWinTarget(id), `stage ${id}`).toBeGreaterThanOrEqual(0.55)
  })
})

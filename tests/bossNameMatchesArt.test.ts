// #playtest-1-23: a boss's stage title names the animal its art shows. Boss 40
// was "The Ghostly Squirrel" while the smasher drawn for it (seeded from its
// fxSkin) is Prickles the porcupine — testers read the ghost as a bear.
import { describe, expect, it } from 'vitest'
import { smasherForParts } from '@/data/smasherCatalog'
import { STAGES } from '@/use/useSpinnerCampaign'
import en from '@/i18n/locales/en'

const bossSmasher = (id: number) => {
  const b = STAGES.find(s => s.id === id)!.enemyTeam[0]!
  return smasherForParts(b.topPartId, b.bottomPartId, b.fxSkin ?? b.modelId)
}

describe('boss names match their art', () => {
  it('boss 40 is drawn as Prickles and named after a porcupine', () => {
    expect(bossSmasher(40)).toBe('prickles')
    expect(en.stages.stage_40).toMatch(/porcupine/i)
  })
})

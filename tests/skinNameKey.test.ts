import { describe, expect, it } from 'vitest'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular import.
import '@/use/useUser'
import { skinNameKey } from '@/use/useModels'
import { SPINNER_MODEL_IDS, isEarnOnlySkin } from '@/data/skinCatalog'

// #playtest-1-1: skinNameKey threw (missing import) and killed the Battle Pass and daily gift.
describe('skinNameKey', () => {
  it('names every skin without throwing', () => {
    for (const id of SPINNER_MODEL_IDS) {
      const key = skinNameKey(id)
      expect(key).toMatch(isEarnOnlySkin(id) ? /^skins\./ : /^smasher_\w+$/)
    }
  })
})

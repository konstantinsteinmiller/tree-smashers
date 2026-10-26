// PvP honour counts the smashers' own skill levels (not just a side loadout).
import { describe, it, expect } from 'vitest'
import { ref, shallowRef, effectScope } from 'vue'
import { useArenaSkills } from '@/use/skills/arenaSkills'
import { smasherConfig, smasherLoadout } from '@/data/smasherCatalog'
import { skillLevelSum } from '@/use/loadoutSanitizer'

const arena = () => {
  const scope = effectScope()
  const a = scope.run(() => useArenaSkills({
    pvpRole: ref('host'), pvpHostSkills: ref([]), pvpGuestSkills: ref([]),
    skillHud: shallowRef([] as never), isBattleActive: ref(false)
  }))!
  return { a, stop: () => scope.stop() }
}

describe('pvpHonorSkillLevels', () => {
  it('sums each blade\'s smasher skill levels per side', () => {
    const { a, stop } = arena()
    const mine = [smasherConfig('bramble', 20), smasherConfig('bramble', 1)]
    const theirs = [smasherConfig('bramble', 5)]
    const r = a.pvpHonorSkillLevels(mine, theirs)
    expect(r.mine).toBe(mine.reduce((s, c) => s + skillLevelSum(smasherLoadout(c)), 0))
    expect(r.theirs).toBe(skillLevelSum(smasherLoadout(theirs[0]!)))
    expect(r.mine).toBeGreaterThan(r.theirs)
    stop()
  })

  it('is 0 for level-1 smashers with no open slot and no teams', () => {
    const { a, stop } = arena()
    expect(a.pvpHonorSkillLevels([], [])).toEqual({ mine: 0, theirs: 0 })
    stop()
  })
})

import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { TERRAIN_LAYOUT_COUNT, buildTerrainLayout } from '@/use/arenaTerrain'
it('count', () => {
  const o: string[] = []
  for (let i = 0; i < TERRAIN_LAYOUT_COUNT; i++) {
    const l = buildTerrainLayout(i, false)
    const n = l.islands.length + l.mushrooms.length + l.logs.length
    o.push(`${i}: ${n} = ${l.islands.length}i ${l.mushrooms.length}m ${l.logs.length}l r=${[...l.islands, ...l.mushrooms].map(c => c.radius).join(',')}`)
  }
  writeFileSync('tests/tmp/over.txt', o.join('\n'))
})

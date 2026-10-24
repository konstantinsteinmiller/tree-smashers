// Toy-box repaints of the boss badges, the level-up arrow and the movie icon
// (tools/badge-icons) — registry, old-file fallback, prompt contract, wiring.

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAINTED_BADGE_ICONS, type BadgeIconName } from '@/use/paintedBadgeIcons'
import { MOVIE_ICON_FALLBACK, badgeIconPath, movieIconPath } from '@/use/badgeIconArt'
import { BOSS_ART, bossBadgeFile, type BadgedBossId } from '@/data/bossArt'
// @ts-expect-error — plain .mjs tool module, no types
import { ICONS, promptFor } from '../tools/badge-icons/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const NAMES = Object.keys(ICONS) as BadgeIconName[]

describe('badge icon registry (tools/badge-icons/pack.mjs output)', () => {
  it('names exactly the icons the prompts define, one per boss badge', () => {
    const union = read('src/use/paintedBadgeIcons.ts').match(/export type BadgeIconName = (.*)/)?.[1] ?? ''
    expect(union.split('|').map(s => s.trim().replace(/'/g, ''))).toEqual(NAMES)
    for (const b of Object.values(BOSS_ART)) expect(NAMES).toContain(`boss-${b.badgeFile}`)
  })

  it('points every painted entry at a webp of the shipped box size, with a hash', () => {
    for (const [name, p] of Object.entries(PAINTED_BADGE_ICONS)) {
      const [w, h] = ICONS[name].size
      expect(p!.file, name).toBe(`images/${ICONS[name].file}/painted-${name}_${w}x${h}.webp`)
      expect(p!.v, name).toMatch(/^[0-9a-f]{8}$/)
      const abs = path.join(ROOT, 'public', p!.file)
      expect(existsSync(abs), p!.file).toBe(true)
      expect(statSync(abs).size, p!.file).toBeGreaterThan(500)
    }
  })
})

describe('fallback to the old files', () => {
  it('an unpainted icon resolves to its old file; a painted one to the repaint, cache-keyed', () => {
    for (const name of NAMES) {
      const p = PAINTED_BADGE_ICONS[name]
      expect(badgeIconPath(name, 'old.webp')).toBe(p ? `${p.file}?v=${p.v}` : 'old.webp')
    }
  })

  it('boss badges, the movie icon and the old files they fall back to all exist', () => {
    for (const boss of Object.keys(BOSS_ART) as BadgedBossId[]) {
      const f = bossBadgeFile(boss)
      expect(existsSync(path.join(ROOT, 'public', f.split('?')[0]!)), f).toBe(true)
      expect(existsSync(path.join(ROOT, 'public/images/boss-badges', `${BOSS_ART[boss].badgeFile}_256x256.webp`))).toBe(true)
    }
    expect(existsSync(path.join(ROOT, 'public', movieIconPath().split('?')[0]!))).toBe(true)
    expect(existsSync(path.join(ROOT, 'public', MOVIE_ICON_FALLBACK))).toBe(true)
  })

  it('no component hard-codes the movie icon any more', () => {
    for (const f of ['src/components/organisms/AdRewardButton.vue', 'src/components/organisms/RewardedAdButton.vue',
      'src/components/organisms/BattlePassResetAdButton.vue', 'src/components/organisms/RouletteWheel.vue',
      'src/components/organisms/SmasherTeamModal.vue', 'src/league/ui/LeagueFightsTopUp.vue', 'src/views/SpinnerArena.vue']) {
      const s = read(f)
      expect(s, f).not.toContain('movie_128x96')
      expect(s, f).toContain('movieIconSrc()')
    }
  })
})

describe('badge icon prompts', () => {
  it('are text-only on flat magenta, navy outline, no stitches / metal / brown', () => {
    for (const name of NAMES) {
      const p = promptFor(name)
      expect(p, name).toMatch(/#FF00FF/)
      expect(p, name).toMatch(/navy \(#161a40\)/)
      expect(p, name).toMatch(/NO stitches/)
      expect(p, name).toMatch(/NO metal/)
      expect(p, name).toMatch(/NO brown/)
    }
  })

  it('the movie icon (a rewarded-ad CTA glyph) is never green', () => {
    expect(ICONS.movie.what).toMatch(/NO green/)
    expect(ICONS.movie.what).not.toMatch(/leaf green|lime/)
  })
})

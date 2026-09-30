// @vitest-environment node
// The shared player-name denylist — variants it must catch, normal names it must
// leave alone, and every place a name is generated or baked.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SAFE_NAME_WORDS, isDenylistedName, normalizeName, safeNameFor, sanitizeDisplayName
} from '@/utils/nameDenylist'
import { FAKE_NAMES, NAME_PREFIXES, NAME_SUFFIXES, scrubNpcNames } from '@/use/leaderboardNames'
// @ts-expect-error — plain .mjs build script, no types
import { buildSnapshot, sanitizeEntries } from '../scripts/leaderboard-snapshot.mjs'

const ROOT = path.resolve(__dirname, '..')
const readJson = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf-8'))

describe('isDenylistedName catches variants', () => {
  const OFFENSIVE = [
    // the live-board cases that started this
    'Jeffreyespsteinf', 'MeinKampf123', 'Dipshit', 'Focker', 'DipshitBladeKingFock', 'WTF', 'WtfBro',
    // case, separators, repeats, leetspeak, symbols
    'FUCK', 'f.u.c.k', 'f_u-c k', 'fuuuuuck', 'Shiiiit', '5h1t', 'sh!t', 'B00bs', 'BlueStar.S3x0',
    'n1gga', '@sshole', 'a$$hole', 'Bi7ch', 'H1tler', 'Sieg_Heil', 'Epstein', 'jeffrey.epstein',
    // diacritics / look-alikes
    'Fück', 'Hürensohn', 'Cabrón', 'Maricón', 'Enculé', 'Cuzão',
    // de / es / fr / pt / ru / tr
    'Hurensohn', 'Wichser99', 'Arschloch', 'HijoDePuta', 'Pendejo', 'Gilipollas', 'Putain', 'Salope', 'Merde', 'Merda',
    'Caralho', 'Viado', 'Blyat', 'suka', 'Pizdec', 'хуй', 'Хуй123', 'xуй', 'Сука', 'пиздец', 'бля.дь',
    'Orospu', 'Siktir', 'Amk',
    // token-strength words as their own word
    'Ass', 'AssMan', 'Big_Dick', 'KKK', 'Nazi', 'Sam1488', 'Rape'
  ]
  for (const name of OFFENSIVE) {
    it(`flags "${name}"`, () => expect(isDenylistedName(name), normalizeName(name)).toBe(true))
  }

  it('ignores non-strings and empty names', () => {
    for (const v of [undefined, null, 0, {}, '', '   ']) expect(isDenylistedName(v)).toBe(false)
  })
})

describe('isDenylistedName leaves normal names alone', () => {
  // The Scunthorpe set: every one of these contains a denylisted string.
  const CLEAN = [
    'Peacock', 'Hancock', 'Cocktail', 'AmazingCocktail.', 'Classy', 'Assassin', 'Bassist', 'Grasshopper',
    'Computation', 'Reputation', 'Therapist', 'Grapefruit', 'Drape', 'Thorny', 'Debate', 'Rebate',
    'Fickle', 'Nutter', 'Dickson', 'Dickens', 'Raccoon', 'SpicyTaco', 'FrostBite', 'IGotIt', 'Sushi',
    'Amina', 'Fukuda', 'Nazim', 'Analyst', 'Janus',
    'Weedle', 'Hoedown', 'Pedal', 'Titan', 'Arsenal', 'Scrap', 'Skunk', 'Spinner717500', 'Rusty_1',
    'SummerDelight', 'HammerDash', 'Sam.Menzel', 'GamingOllie', 'Peerderbaer', 'Lavakilla2524', 'HairyDoctor.mwvS', 'Vantablack'
  ]
  for (const name of CLEAN) {
    it(`does not flag "${name}"`, () => expect(isDenylistedName(name), normalizeName(name)).toBe(false))
  }
})

describe('the generated-name spaces are clean', () => {
  it('every fake-board prefix × name × suffix passes', () => {
    const prefixes = [...new Set(NAME_PREFIXES)]
    const suffixes = [...new Set(NAME_SUFFIXES)]
    const hits: string[] = []
    let n = 0
    for (const p of prefixes) {
      for (const b of FAKE_NAMES) {
        for (const s of suffixes) {
          n++
          const name = `${p}${b}${s}`
          if (isDenylistedName(name)) hits.push(name)
        }
      }
    }
    expect(n).toBeGreaterThan(50_000)
    expect(hits).toEqual([])
  })

  it('no pool keeps a retired word', () => {
    const all = [...NAME_PREFIXES, ...NAME_SUFFIXES, ...FAKE_NAMES]
    for (const w of ['Dipshit', 'Focker', 'Fock', 'Kack', 'WTF', 'Lick', 'Pipi', 'Chang', 'Ching', 'Pig', 'Lame', 'AllKiller']) {
      expect(all, w).not.toContain(w)
    }
  })

  it('every anonymous / replacement name passes, whatever its number', () => {
    // A 3+ digit run is read as a number, never as leetspeak, so `Word + six
    // digits` normalises to the word alone — sweep every number to prove it.
    for (const w of SAFE_NAME_WORDS) expect(isDenylistedName(w), w).toBe(false)
    const word = normalizeName('Spinner')
    for (let n = 100000; n < 1000000; n++) {
      if (normalizeName(`Spinner${n}`) !== word) throw new Error(`Spinner${n} normalised to letters`)
    }
    // The identity generator mints from the same words.
    const identity = readFileSync(path.join(ROOT, 'src/use/usePlayerIdentity.ts'), 'utf-8')
    for (const w of SAFE_NAME_WORDS) expect(identity).toContain(`'${w}'`)
  })

  it('the synthetic seed board is clean', () => {
    const seed = readJson('data/leaderboard-seed.json')
    expect(seed.entries.filter((e: { name: string }) => isDenylistedName(e.name))).toEqual([])
  })

  it('the baked live snapshot contains no denylisted name and keeps its ranks', () => {
    const snap = readJson('data/leaderboard-snapshot.json')
    const names: string[] = snap.entries.map((e: { name: string }) => e.name)
    expect(names.filter((n) => isDenylistedName(n))).toEqual([])
    for (const bad of ['Jeffreyespsteinf', 'MeinKampf123', 'BlueStar.S3x0']) expect(names).not.toContain(bad)
    // Renamed, not dropped: the published slice is still complete and ranked.
    expect(snap.entries).toHaveLength(100)
    expect(snap.entries[0].rank).toBe(1)
    // Re-sanitising is a no-op — i.e. every surviving real name is a non-hit.
    expect(sanitizeEntries(snap.entries)).toEqual(snap.entries)
  })
})

describe('replacement names', () => {
  it('are deterministic, clean, short and shaped like a guest name', () => {
    for (const bad of ['MeinKampf123', 'Jeffreyespsteinf', 'fuck', 'хуй']) {
      const a = safeNameFor(bad)
      expect(a).toBe(safeNameFor(bad))
      expect(a).toMatch(/^[A-Z][a-z]+\d{6}$/)
      expect(a.length).toBeLessThanOrEqual(16)
      expect(isDenylistedName(a)).toBe(false)
      expect(sanitizeDisplayName(bad)).toBe(a)
    }
    expect(sanitizeDisplayName('Rusty_1')).toBe('Rusty_1')
  })

  it('the snapshot baker renames offenders in place, keeping rank, score and power', () => {
    const snap = buildSnapshot({
      entries: [
        { rank: 1, name: 'MeinKampf123', score: 50, power: 40 },
        { rank: 2, name: 'Ace', score: 30, power: 20 }
      ],
      dist: [[50, 1], [30, 1]]
    }, 'test')
    expect(snap.entries).toEqual([
      { rank: 1, name: safeNameFor('MeinKampf123'), score: 50, power: 40 },
      { rank: 2, name: 'Ace', score: 30, power: 20 }
    ])
  })

  it('a persisted fake board built from retired pool words is re-rolled on load', () => {
    const row = (name: string, isPlayer = false) => ({ id: name, name, isPlayer })
    const out = scrubNpcNames([row('DipshitBladeKing'), row('NovaStrikeFock'), row('ChingTacoTornado'),
      row('AllKillerPro'), row('BladeKing'), row('', true)])
    expect(out.slice(0, 4).map((e) => e.name).filter((n) => /Dipshit|Fock|Ching|AllKiller/.test(n))).toEqual([])
    expect(out[4]!.name).toBe('BladeKing')
    expect(out[5]!.name).toBe('')
  })
})

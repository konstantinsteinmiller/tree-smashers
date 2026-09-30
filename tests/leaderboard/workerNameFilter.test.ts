// @vitest-environment node
// The Worker masks denylisted names on write (POST /score) and again when it
// publishes the board, so a row written before the denylist existed is masked
// too. Driven through the Worker's real `fetch` against an in-memory D1 double.

import { describe, expect, it } from 'vitest'
import worker from '../../worker/src/index'
import { safeNameFor } from '@/utils/nameDenylist'

interface Row {
  id: string;
  name: string;
  score: number;
  power: number;
  updated_at: number
}

/** Just enough of D1 for the /score path: the `scores` table and `board_cache`. */
const fakeDb = (seed: Row[] = []) => {
  const scores = new Map(seed.map((r) => [r.id, { ...r }]))
  const writes: { sql: string; args: unknown[] }[] = []
  const prepare = (sql: string) => {
    let args: unknown[] = []
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a
        return stmt
      },
      first: async () => {
        if (sql.includes('FROM scores WHERE id')) return scores.get(args[0] as string) ?? null
        return null // board_cache: always cold, forcing a rebuild
      },
      all: async () => ({
        results: [...scores.values()]
          .sort((a, b) => b.score - a.score || a.updated_at - b.updated_at)
          .map(({ name, score, power }) => ({ name, score, power }))
      }),
      run: async () => {
        writes.push({ sql, args })
        if (sql.startsWith('INSERT INTO scores')) {
          const [id, name, score, power, updated_at] = args as [string, string, number, number, number]
          scores.set(id, { id, name, score, power, updated_at })
        } else if (sql.startsWith('UPDATE scores SET name = ?, score')) {
          const [name, score, power, updated_at, id] = args as [string, number, number, number, string]
          scores.set(id, { ...scores.get(id)!, name, score, power, updated_at })
        } else if (sql.startsWith('UPDATE scores SET name = ? WHERE')) {
          const [name, id] = args as [string, string]
          scores.set(id, { ...scores.get(id)!, name })
        }
        return {}
      }
    }
    return stmt
  }
  return { db: { prepare } as unknown as D1Database, scores, writes }
}

const post = (body: Record<string, unknown>) =>
  new Request('https://lb.test/score', { method: 'POST', body: JSON.stringify(body) })

describe('worker /score name filter', () => {
  it('stores a generated stand-in for a denylisted name and keeps the score', async () => {
    const { db, scores } = fakeDb()
    const res = await worker.fetch(post({ id: 'player-0001', name: 'MeinKampf123', score: 12, power: 9 }), { DB: db })
    expect(res.status).toBe(200)
    const stored = scores.get('player-0001')!
    expect(stored.name).toBe(safeNameFor('MeinKampf123'))
    expect(stored.score).toBe(12)
    const body = await res.json() as { rank: number; board: { entries: { name: string }[] } }
    expect(body.rank).toBe(1)
    expect(body.board.entries.map((e) => e.name)).toEqual([safeNameFor('MeinKampf123')])
  })

  it('masks leetspeak / separator variants the same way', async () => {
    const { db, scores } = fakeDb()
    await worker.fetch(post({ id: 'player-0002', name: 'f.u.c.k_y0u', score: 3, power: 1 }), { DB: db })
    expect(scores.get('player-0002')!.name).toBe(safeNameFor('f.u.c.k_y0u'))
  })

  it('leaves a clean name untouched', async () => {
    const { db, scores } = fakeDb()
    await worker.fetch(post({ id: 'player-0003', name: 'Rusty_1', score: 3, power: 1 }), { DB: db })
    expect(scores.get('player-0003')!.name).toBe('Rusty_1')
  })

  it('masks legacy rows already in D1 when it publishes the board', async () => {
    const { db } = fakeDb([
      { id: 'legacy-0001', name: 'Jeffreyespsteinf', score: 40, power: 30, updated_at: 1 },
      { id: 'legacy-0002', name: 'Ace', score: 20, power: 10, updated_at: 2 }
    ])
    const res = await worker.fetch(post({ id: 'player-0004', name: 'Bex', score: 5, power: 2 }), { DB: db })
    const body = await res.json() as { board: { entries: { name: string }[] } }
    expect(body.board.entries.map((e) => e.name)).toEqual([safeNameFor('Jeffreyespsteinf'), 'Ace', 'Bex'])
  })
})

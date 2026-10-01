// In-memory D1 double for driving the leaderboard Worker's real `fetch` in
// tests. Just enough SQL for the routes it serves: the `scores` table (point
// lookup, column-generic INSERT / `UPDATE … SET a = ?, b = ? WHERE id = ?`,
// the ordered top-N and the score histogram) and `board_cache`, which always
// reads COLD so every request rebuilds the board from `scores`.
//
// Shared by workerNameFilter.test.ts and workerBuild.test.ts. Every executed
// write is recorded in `writes` so a test can assert exactly which columns a
// request touched.

export interface ScoreRow {
  id: string
  name: string
  score: number
  power: number
  updated_at: number
  build?: string | null
  build_at?: number | null
  lpower?: number | null
}

export interface FakeD1 {
  db: D1Database
  scores: Map<string, ScoreRow>
  writes: { sql: string; args: unknown[] }[]
}

const insertColumns = (sql: string): string[] => {
  const m = /INSERT INTO scores \(([^)]+)\)/.exec(sql)
  return m ? m[1]!.split(',').map((c) => c.trim()) : []
}

const setColumns = (sql: string): string[] => {
  const m = /UPDATE scores SET (.+) WHERE id = \?/.exec(sql.replace(/\s+/g, ' '))
  return m ? m[1]!.split(',').map((c) => c.split('=')[0]!.trim()) : []
}

export const fakeD1 = (seed: ScoreRow[] = []): FakeD1 => {
  const scores = new Map<string, ScoreRow>(seed.map((r) => [r.id, { ...r }]))
  const writes: { sql: string; args: unknown[] }[] = []

  const prepare = (sql: string) => {
    let args: unknown[] = []
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a
        return stmt
      },
      first: async () => {
        if (sql.includes('FROM scores WHERE id')) {
          const row = scores.get(args[0] as string)
          return row ? { build: null, build_at: null, lpower: null, ...row } : null
        }
        return null // board_cache: always cold, forcing a rebuild
      },
      all: async () => {
        if (sql.includes('GROUP BY score')) {
          const counts = new Map<number, number>()
          for (const r of scores.values()) counts.set(r.score, (counts.get(r.score) ?? 0) + 1)
          return {
            results: [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([score, n]) => ({ score, n }))
          }
        }
        const limit = typeof args[0] === 'number' ? args[0] : Infinity
        return {
          results: [...scores.values()]
            .sort((a, b) => b.score - a.score || a.updated_at - b.updated_at)
            .slice(0, limit)
            .map(({ name, score, power }) => ({ name, score, power }))
        }
      },
      run: async () => {
        writes.push({ sql, args })
        if (sql.startsWith('INSERT INTO scores')) {
          const cols = insertColumns(sql)
          const row: Record<string, unknown> = {}
          cols.forEach((c, i) => { row[c] = args[i] })
          scores.set(row.id as string, row as unknown as ScoreRow)
        } else if (sql.startsWith('UPDATE scores SET')) {
          const cols = setColumns(sql)
          const id = args[args.length - 1] as string
          const prev = scores.get(id)
          if (prev) {
            const next: Record<string, unknown> = { ...prev }
            cols.forEach((c, i) => { next[c] = args[i] })
            scores.set(id, next as unknown as ScoreRow)
          }
        }
        return {}
      }
    }
    return stmt
  }

  return { db: { prepare } as unknown as D1Database, scores, writes }
}

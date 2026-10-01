// A D1 double backed by a REAL SQLite (Node's built-in `node:sqlite`), for the
// league routes (workerLeague.test.ts). The regex double in fakeD1.ts is enough
// for /score's handful of point queries; the league runs joins, UNION ALL range
// scans, conditional updates and GROUP BY over `worker/schema.sql`, and only a
// real engine proves that SQL and that schema actually work.
//
// Loaded with the Worker's own schema.sql (or any SQL the test passes), it
// implements the slice of the D1 API the Worker uses — prepare / bind / first
// / all / run (with meta.changes) — records every statement (so a test can
// count reads and writes per request), and can be told to fail like a D1
// outage.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// `createRequire` rather than `import`: node:sqlite is a prefix-only builtin
// that some bundler/transform layers do not recognise as external.
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

export const WORKER_DIR = path.resolve(__dirname, '../../worker')

export interface SqliteD1 {
  db: D1Database
  sql: import('node:sqlite').DatabaseSync
  /** Every statement executed, in order. */
  log: { sql: string; args: unknown[]; kind: 'read' | 'write' }[]
  /** Throw from every statement while true (a D1 outage / exhausted quota). */
  fail: { on: boolean }
  exec: (sql: string) => void
}

const norm = (a: unknown): unknown => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a)

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T

export const sqliteD1 = (schemaFiles: string[] = [path.join(WORKER_DIR, 'schema.sql')]): SqliteD1 => {
  const sql = new DatabaseSync(':memory:')
  for (const f of schemaFiles) sql.exec(readFileSync(f, 'utf8'))
  const log: SqliteD1['log'] = []
  const fail = { on: false }

  const prepare = (text: string) => {
    let args: unknown[] = []
    const kind: 'read' | 'write' = /^\s*(SELECT|WITH)\b/i.test(text) ? 'read' : 'write'
    const exec = () => {
      if (fail.on) throw new Error('D1_ERROR: simulated outage')
      log.push({ sql: text, args, kind })
      return sql.prepare(text)
    }
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a.map(norm)
        return stmt
      },
      first: async <T>() => {
        const row = exec().get(...(args as never[]))
        return row === undefined ? null : plain<T>(row)
      },
      all: async <T>() => ({ results: exec().all(...(args as never[])).map((r) => plain<T>(r)), success: true }),
      run: async () => {
        const r = exec().run(...(args as never[]))
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }
      }
    }
    return stmt
  }

  return {
    db: { prepare } as unknown as D1Database,
    sql,
    log,
    fail,
    exec: (text: string) => sql.exec(text)
  }
}

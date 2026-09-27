/**
 * ─── The generation ledger ──────────────────────────────────────────────────
 *
 * How many images have been asked of Gemini, kept in ONE file for every
 * project on this machine (`~/.art-desk/usage.json` unless
 * `gemini.usageFile` says otherwise), in the shape the skill's desks write:
 * day-keyed counts plus `_sinceAccountSwitch`.
 *
 * Both paint.mjs and the desk server count through here, so the two never
 * drift apart. The read-modify-write is not locked, but every writer in this
 * project holds the paint lock (lock.mjs) while it counts, and other projects'
 * desks write the same file at most once a generation.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const USAGE = join(homedir(), '.art-desk', 'usage.json')
export const ACCOUNT_KEY = '_sinceAccountSwitch'

export const today = () => new Date().toISOString().slice(0, 10)

export const ledger = (file = USAGE) => {
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      return {}
    }
  }
  const write = (u) => {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(u, null, 2))
    // Windows refuses the replace while another process has the file open.
    try {
      renameSync(tmp, file)
    } catch {
      writeFileSync(file, JSON.stringify(u, null, 2))
      try {
        unlinkSync(tmp)
      } catch {
      }
    }
  }
  return {
    file,
    usedToday: () => read()[today()] ?? 0,
    usedOnAccount: () => {
      const u = read()
      return u[ACCOUNT_KEY] ?? u[today()] ?? 0
    },
    countGeneration: () => {
      const u = read()
      u[today()] = (u[today()] ?? 0) + 1
      u[ACCOUNT_KEY] = (u[ACCOUNT_KEY] ?? 0) + 1
      write(u)
    }
  }
}

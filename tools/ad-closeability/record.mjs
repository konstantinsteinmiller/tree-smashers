// ─── The proof a closeability check leaves behind ───────────────────────────
//
// `measure.mjs --record` writes it after a full pass; `scripts/
// native-ads-gate.mjs` reads it before a store build with ads enabled. Kept in
// its own module so the gate can import it without starting a measurement.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERIFIED_FILE = join(dirname(fileURLToPath(import.meta.url)), 'verified.json')

/** One lucky impression proves nothing: the template is picked per impression. */
export const RECORD_MIN_RUNS = 5

/** Google changes what it serves into a unit without telling anyone, so a pass
 *  goes stale. Re-measuring takes five minutes. */
export const RECORD_MAX_AGE_DAYS = 14

/** @returns the parsed record, or null when there is none / it is unreadable. */
export const readVerified = () => {
  if (!existsSync(VERIFIED_FILE)) return null
  try {
    return JSON.parse(readFileSync(VERIFIED_FILE, 'utf8'))
  } catch {
    return null
  }
}

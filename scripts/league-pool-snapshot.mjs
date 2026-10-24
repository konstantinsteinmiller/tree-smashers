/**
 * ─── The baked league opponent pool (LG1) ───────────────────────────────────
 *
 * Writes `data/league-pool.json`, which `vite.config.ts` (leaguePoolPlugin)
 * ships as `virtual:league-pool` — the third rung of the league's opponent
 * ladder (live /league/pool → device cache → THIS → seeded generator).
 *
 * LEAGUE BUILDS ONLY. The plugin runs this script (and reads the file) only
 * when `VITE_APP_FEATURE_LEAGUE` is 'true'; a league-off build logs "skipped"
 * and neither fetches nor bakes anything.
 *
 * Sources, in order:
 *   1. the Worker's `GET /league/pool-export` (LG4): `{ entries: [{ build }] }`
 *      (a bare array, or `{ builds: [...] }`, is accepted too);
 *   2. builds carried by `data/leaderboard-snapshot.json` rows (`entries[].build`),
 *      if a snapshot with builds exists;
 *   3. nothing — `builds: []`, and the game falls through to the generator.
 *
 * PRIVACY: only the BUILDS are kept — ids and names are stripped here, and the
 * client generates a name per build (`leagueNpc.generatedOpponentName`).
 *
 * SIZE: at most POOL_MAX builds, spread evenly over the power range, trimmed
 * until the baked module is ≤ GZIP_BUDGET bytes gzipped.
 *
 *     pnpm league:pool           (or: node scripts/league-pool-snapshot.mjs)
 *     --soft                     never fail (what the build uses)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
// A .ts import from a .mjs: Node (>= 22.18) strips the types natively; the
// module is worker-shared and written in erasable-only TypeScript.
import { buildDigest, buildPower, validatePlayerBuildShape } from '../src/utils/playerBuild.ts'

export const DEFAULT_SOURCE = 'https://leaderboard-tree-smashers.hyperg8.workers.dev'

export const POOL_FILE = resolve(fileURLToPath(new URL('../data/league-pool.json', import.meta.url)))
const LEADERBOARD_FILE = resolve(fileURLToPath(new URL('../data/leaderboard-snapshot.json', import.meta.url)))

export const POOL_MAX = 240
export const GZIP_BUDGET = 10 * 1024
const TIMEOUT_MS = 10_000

/** The module body the plugin bakes: `{ v: 1, builds }`, or null when empty. */
export const bakedModuleValue = (file) =>
  file && Array.isArray(file.builds) && file.builds.length > 0 ? { v: 1, builds: file.builds } : null

const gzBytes = (value) => gzipSync(Buffer.from(`export default ${JSON.stringify(value)}`)).length

/** Keep `n` of `list`, evenly spaced (list sorted by power). */
const spread = (list, n) => {
  if (list.length <= n) return list
  const out = []
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)])
  return out
}

/**
 * Normalise raw builds into the baked list: validated, deduplicated, sorted by
 * power, spread to POOL_MAX, trimmed to the gzip budget.
 */
export const selectBuilds = (rawBuilds, { max = POOL_MAX, budget = GZIP_BUDGET } = {}) => {
  const seen = new Set()
  const valid = []
  for (const raw of Array.isArray(rawBuilds) ? rawBuilds : []) {
    const b = validatePlayerBuildShape(raw)
    if (!b) continue
    const d = buildDigest(b)
    if (seen.has(d)) continue
    seen.add(d)
    valid.push(b)
  }
  valid.sort((a, b) => buildPower(a) - buildPower(b) || (buildDigest(a) < buildDigest(b) ? -1 : 1))
  let n = Math.min(max, valid.length)
  let picked = spread(valid, n)
  while (picked.length > 0 && gzBytes({ v: 1, builds: picked }) > budget) {
    n = Math.floor(n * 0.9)
    picked = spread(valid, n)
  }
  return picked
}

/** Builds out of a /league/pool-export body. */
export const buildsFromExport = (body) => {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? Array.isArray(body.entries) ? body.entries : Array.isArray(body.builds) ? body.builds : null
      : null
  if (!list) throw new Error('/league/pool-export had no entries')
  return list.map((e) => (e && typeof e === 'object' && 'build' in e ? e.build : e))
}

/** Builds carried by the leaderboard snapshot rows, or []. */
export const buildsFromLeaderboard = (file = LEADERBOARD_FILE) => {
  try {
    if (!existsSync(file)) return []
    const snap = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(snap?.entries) ? snap.entries.map((e) => e?.build).filter(Boolean) : []
  } catch {
    return []
  }
}

const fetchExport = async (origin) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${origin}/league/pool-export`, { signal: controller.signal })
    if (!res.ok) {
      await res.arrayBuffer().catch(() => {})
      throw new Error(`/league/pool-export → HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** Fetch (or fall back), select and write the file. Returns the written object. */
export const refreshPool = async (source = process.env.LEAGUE_POOL_SNAPSHOT_URL || DEFAULT_SOURCE) => {
  const origin = source.replace(/\/+$/, '')
  let origin_ = 'none'
  let builds = []
  let why = null
  try {
    builds = selectBuilds(buildsFromExport(await fetchExport(origin)))
    origin_ = 'worker'
  } catch (err) {
    why = err instanceof Error ? err.message : String(err)
    // A pool the Worker already exported beats any fallback: keep it as is.
    const onDisk = readPool()
    if (onDisk && onDisk.origin === 'worker' && onDisk.builds.length > 0) return { file: onDisk, why }
    builds = selectBuilds(buildsFromLeaderboard())
    origin_ = builds.length > 0 ? 'leaderboard' : 'none'
  }
  const file = { v: 1, source: origin, origin: origin_, fetchedAt: Date.now(), builds }
  mkdirSync(dirname(POOL_FILE), { recursive: true })
  writeFileSync(POOL_FILE, JSON.stringify(file) + '\n', 'utf-8')
  return { file, why }
}

/** The file on disk, or null. */
export const readPool = (file = POOL_FILE) => {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return parsed && parsed.v === 1 && Array.isArray(parsed.builds) ? parsed : null
  } catch {
    return null
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const soft = process.argv.includes('--soft')
  try {
    const { file, why } = await refreshPool()
    const value = bakedModuleValue(file)
    console.log(
      `[league-pool] ${file.builds.length} builds from ${file.origin}`
      + (why ? ` (export unavailable: ${why})` : '')
      + ` — ${value ? gzBytes(value) : 0} B gzipped`
    )
    console.log(`[league-pool] wrote ${POOL_FILE}`)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    if (soft) console.warn(`[league-pool] refresh skipped (${why}) — keeping the committed pool.`)
    else {
      console.error(`[league-pool] refresh FAILED: ${why}`)
      process.exitCode = 1
    }
  }
}

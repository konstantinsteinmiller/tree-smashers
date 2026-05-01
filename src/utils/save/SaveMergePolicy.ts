// ─── Save merge policy ────────────────────────────────────────────────────
//
// Decides what to do when a hydrate brings back remote data that disagrees
// with the local snapshot. Pure module — no Vue, no I/O, no side effects.
// Strategies call into this; the SaveManager wires the result back into
// localStorage via the LocalStorageAccessor it owns.
//
// Each persisted save now carries a meta blob (`__save_meta__`) alongside
// the player's actual keys. The blob lets the next hydrate score local vs.
// remote and pick a winner deterministically without prompting.
//
// Score formula (locked with product):
//   stage              × 500
// + totalUpgradeLevels × 150
// + ownedNormalSkins   × 250
// + ownedSpecialSkins  × 1500
//
// Conflict policy:
//   - higher score wins
//   - tie on score → newer savedAt wins
//   - same time too → keep local (no needless writes)
//   - if remote wins and local had ANY progress (score > 0), the player
//     gets bonus coins = winner.maxStage × 50 to soften the loss

import { STAGE_KEY, COINS_KEY, UPGRADES_KEY, SKINS_KEY } from '@/keys'

/** Where the meta blob is stored in localStorage / on the remote backend.
 *  NOT prefixed with `__save_internal__` — this key needs to round-trip
 *  through the strategy's mirror just like player data. */
export const META_KEY = '__save_meta__'

/** Bumped when the meta blob's shape changes in a non-additive way. */
export const SCHEMA_VERSION = 1

// ─── Game-specific keys the score formula needs to read ────────────────────
//
// Sourced from `src/keys.ts` (single source of truth shared with the
// composables that own these keys). Importing keeps this module pure (no
// Vue imports — `keys.ts` is a flat constants file) AND eliminates the
// drift risk the previous duplicated declaration had.

/** Special skins (1500-coin / unique-VFX). MUST stay in sync with
 *  SPECIAL_SKINS in src/use/useModels.ts — kept inline so this module
 *  has no Vue dependency. If a new special skin is added there without
 *  updating this set, scoring under-counts that player's progress. */
const SPECIAL_SKIN_IDS: ReadonlySet<string> = new Set([
  'rainbow', 'dark', 'tornado', 'diamond', 'thunderstorm',
  'boulder', 'teleporter', 'sandstorm', 'forest-dragon'
])

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SaveMeta {
  /** ISO timestamp of when this save was generated. */
  savedAt: string
  /** Output of the score formula above. */
  progressScore: number
  schemaVersion: number
  /** Highest stage the save represents — used to compute conflict bonus. */
  maxStage: number
  /**
   * Cloud `savedAt` for which this client already received the conflict
   * bonus. Prevents repeat farming: if a player force-closes and reopens
   * (cloud unchanged, local possibly cleared), the strategy still sees
   * `remote-wins` would award `+N coins` — but if `bonusReceivedFor`
   * matches the cloud's `savedAt`, the bonus is suppressed because we
   * already paid it out. The flag is written into the META blob and
   * round-trips through cloud + IDB backup, so it survives whichever
   * partition the OS happens to clear.
   *
   * Optional for back-compat with legacy save blobs that predate this
   * field — `parseMeta` accepts records without it.
   */
  bonusReceivedFor?: string
}

/** Narrow read-only view over a localStorage snapshot. */
export interface SnapshotReader {
  get(key: string): string | null
}

/**
 * Hydrate-time merge resolution. The SaveManager's job is to:
 *   - apply the chosen side's keys to local
 *   - if `bonusCoins > 0`, add that to the merged COINS_KEY value
 *   - schedule a flush back to remote when the chosen side is local
 */
export type MergeResolution =
/** Remote had higher progress; overwrite local. Bonus may be 0 if local was empty. */
  | { kind: 'remote-wins'; bonusCoins: number }
  /** Local had higher progress; keep local and push it to remote on next flush. */
  | { kind: 'local-wins' }
  /** Local was empty; remote is the seed. Same as remote-wins but no bonus and no "loss". */
  | { kind: 'remote-only' }
  /** Remote returned no data; nothing to merge. */
  | { kind: 'local-only' }
  /** Both sides identical; keep local, skip the rewrite. */
  | { kind: 'tie-keep-local' }

// ─── Helpers ──────────────────────────────────────────────────────────────

const safeInt = (v: string | null, fallback: number): number => {
  if (v == null) return fallback
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

const safeJson = <T>(v: string | null, fallback: T): T => {
  if (v == null) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute a fresh meta blob from the current localStorage snapshot.
 * Pure — no side effects.
 */
export const computeMeta = (
  read: SnapshotReader,
  savedAt: string = new Date().toISOString()
): SaveMeta => {
  const stage = Math.max(1, safeInt(read.get(STAGE_KEY), 1))

  const upgrades = safeJson<{ tops?: Record<string, number>; bottoms?: Record<string, number> }>(
    read.get(UPGRADES_KEY),
    {}
  )
  const sumLevels = (group: Record<string, number> | undefined): number => {
    if (!group) return 0
    let sum = 0
    for (const v of Object.values(group)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) sum += v
    }
    return sum
  }
  const upgradeLevels = sumLevels(upgrades.tops) + sumLevels(upgrades.bottoms)

  const ownedSkins = safeJson<unknown[]>(read.get(SKINS_KEY), [])
  let normalSkins = 0
  let specialSkins = 0
  if (Array.isArray(ownedSkins)) {
    for (const entry of ownedSkins) {
      if (typeof entry !== 'string') continue
      // Stored as `${topPartId}:${modelId}` (see useModels.ts buySkin).
      const sep = entry.indexOf(':')
      const modelId = sep >= 0 ? entry.slice(sep + 1) : entry
      if (SPECIAL_SKIN_IDS.has(modelId)) specialSkins++
      else normalSkins++
    }
  }

  const progressScore =
    stage * 500
    + upgradeLevels * 150
    + normalSkins * 250
    + specialSkins * 1500

  return { savedAt, progressScore, schemaVersion: SCHEMA_VERSION, maxStage: stage }
}

/**
 * Parse a meta blob from a stored value. Returns null for missing /
 * malformed blobs (treat as "no prior meta exists" — typically a save
 * that predates this layer or a value the SDK never wrote).
 */
export const parseMeta = (raw: string | null | undefined): SaveMeta | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Partial<SaveMeta>
  if (
    typeof m.savedAt !== 'string' ||
    typeof m.progressScore !== 'number' || !Number.isFinite(m.progressScore) ||
    typeof m.schemaVersion !== 'number' || !Number.isFinite(m.schemaVersion) ||
    typeof m.maxStage !== 'number' || !Number.isFinite(m.maxStage)
  ) return null
  const out: SaveMeta = {
    savedAt: m.savedAt,
    progressScore: m.progressScore,
    schemaVersion: m.schemaVersion,
    maxStage: m.maxStage
  }
  if (typeof m.bonusReceivedFor === 'string') {
    out.bonusReceivedFor = m.bonusReceivedFor
  }
  return out
}

export const serializeMeta = (meta: SaveMeta): string => JSON.stringify(meta)

/**
 * Compare local and remote metas, return the resolution.
 *
 * Rules (in order):
 *   1. No remote → 'local-only'
 *   2. No local  → 'remote-only'  (nothing to lose; no bonus needed)
 *   3. remote.score > local.score → 'remote-wins' with bonus = remote.maxStage * 50 if local had any progress
 *   4. local.score > remote.score → 'local-wins'
 *   5. Equal scores → newer savedAt wins (no bonus on score-tie wins)
 *   6. Equal everything → 'tie-keep-local'
 */
export const decideMerge = (
  localMeta: SaveMeta | null,
  remoteMeta: SaveMeta | null
): MergeResolution => {
  if (!remoteMeta) return { kind: 'local-only' }
  if (!localMeta) return { kind: 'remote-only' }

  if (remoteMeta.progressScore > localMeta.progressScore) {
    const bonus = localMeta.progressScore > 0 ? remoteMeta.maxStage * 50 : 0
    return { kind: 'remote-wins', bonusCoins: bonus }
  }
  if (localMeta.progressScore > remoteMeta.progressScore) {
    return { kind: 'local-wins' }
  }

  // Equal scores → newer timestamp wins. No bonus on a score-tie win
  // because no progress was actually surpassed.
  const lt = Date.parse(localMeta.savedAt)
  const rt = Date.parse(remoteMeta.savedAt)
  if (Number.isFinite(rt) && Number.isFinite(lt) && rt > lt) {
    return { kind: 'remote-wins', bonusCoins: 0 }
  }
  return { kind: 'tie-keep-local' }
}

/**
 * Add the bonus to the local coin total. Returns the new value as a
 * string ready to be written back to COINS_KEY. Caller does the write.
 */
export const applyBonusCoins = (read: SnapshotReader, bonus: number): string => {
  const current = safeInt(read.get(COINS_KEY), 0)
  return String(current + Math.max(0, bonus))
}

/**
 * Allowlist of keys that participate in the persisted payload.
 *
 * Replacing the old "anything not internal" rule because that let
 * unrelated localStorage entries — vConsole layout, ad-tech experiment
 * flags (`prebid11_*`, `dummy_*_exp`, `li-module-enabled`, `bid_pf_*`),
 * dev toggles, and whatever the next library decides to scribble — get
 * mirrored to the cloud. The CrazyGames Data Module then included all
 * of that in its upload, ballooning the POST body and giving QA a
 * misleading picture of what the game stores.
 *
 * Composables ALL store under one of two prefixes (`src/keys.ts` plus
 * the one-off `ca_battles_since_ad` in `SpinnerArena.vue`), and the
 * save-meta blob has its own well-known literal. That's the entire
 * surface the cloud should ever see — anything else is by definition
 * not our state.
 */
const PAYLOAD_PREFIXES = ['spinner_', 'ca_'] as const

export const isPayloadKey = (key: string): boolean => {
  if (key === META_KEY) return true
  for (const prefix of PAYLOAD_PREFIXES) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

// Re-exported so tests / other modules don't have to re-declare them.
export const SAVE_KEYS = {
  STAGE: STAGE_KEY,
  COINS: COINS_KEY,
  UPGRADES: UPGRADES_KEY,
  SKINS: SKINS_KEY
} as const

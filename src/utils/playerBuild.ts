// ─── Player build: the team a leaderboard row fights with ────────────────────
//
// WORKER-SHARED (league plan F5). The Cloudflare Worker bundles this file
// straight from `src/`, so it must stay pure: relative imports only (none at
// all today), no `@/` alias, no `import.meta.env`, no DOM, no Vue.
//
// A `POST /score` may carry the player's build — both spinners (top + bottom
// part ids and upgrade levels, the selected skin) and the equipped skill
// loadout — so the row can later stand in as a league opponent ghost. The
// Worker validates it STRUCTURALLY only (shape, id charset, level bounds); the
// client that fights the ghost re-sanitises it against its own catalogue
// (`skillLoadoutSanitizer`), because the Worker deploys on its own schedule and
// must never reject a build over a part or skill id it has not heard of yet.
//
// Short keys on purpose: this rides every build-carrying POST, and the whole
// body is budgeted at 600 bytes.

/** One spinner of the build. */
export interface PlayerBuildSpinner {
  /** Top part id. */
  t: string
  /** Bottom part id. */
  b: string
  /** Top upgrade level. */
  tl: number
  /** Bottom upgrade level. */
  bl: number
  /** Model / skin id. */
  m: string
}

/** One equipped skill. */
export interface PlayerBuildSkill {
  id: string
  lv: number
}

export interface PlayerBuildV1 {
  v: 1
  /** Exactly two spinners, in slot order. */
  team: PlayerBuildSpinner[]
  /** Up to two skills, in slot order; empty on a skills-off build. */
  sk: PlayerBuildSkill[]
}

/** Structural input — `SpinnerConfig` is assignable (kept local so this file
 *  imports nothing). */
export interface BuildSpinnerInput {
  topPartId: string
  bottomPartId: string
  topLevel?: number
  bottomLevel?: number
  modelId?: string
}

/** Structural input — a `SkillLoadout` entry is assignable. */
export interface BuildSkillInput {
  id: string
  level: number
}

export const BUILD_TEAM_SIZE = 2
export const BUILD_MAX_SKILLS = 2
export const BUILD_MAX_PART_LEVEL = 200
export const BUILD_MIN_SKILL_LEVEL = 1
export const BUILD_MAX_SKILL_LEVEL = 10
/**
 * League team power of skills (LG-PWR, tools/skills-sim/leagueSkillPower.mjs,
 * 360 000 league battles; README "LG-PWR"). An equipped skill at level lv adds
 * BUILD_SKILL_POWER_PERMILLE[lv - 1] ‰ of (Σ part levels + BUILD_SKILL_POWER_BASE):
 * skills scale off the team's stats (base stats included), so their worth
 * grows with the parts, and the first level of a skill is worth the most
 * (front-loaded: 5 ‰ for level 1, ~1 ‰ per level after). The linear
 * 0.8 × Σ skill levels it replaces over-priced every skill above level 2 —
 * by up to 15 win points for two maxed skills on low parts.
 */
export const BUILD_SKILL_POWER_BASE = 124
export const BUILD_SKILL_POWER_PERMILLE: readonly number[] = Object.freeze([5, 7, 9, 10, 11, 12, 13, 14, 15, 16])

/**
 * A build-only refresh (same score, same name, different team) goes out — and
 * is stored — at most this often per row. Client and Worker share the clock;
 * the Worker's copy is what stops a hand-rolled loop turning the build columns
 * into a write-per-request.
 */
export const BUILD_REFRESH_MS = 6 * 60 * 60_000

const ID_RE = /^[a-z0-9_-]{1,32}$/

const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Structural validation of an untrusted build (a request body, a stored row,
 * a cloud blob). Returns a FRESH normalised object carrying only the known
 * keys, or `null` when anything is off — never throws.
 */
export const validatePlayerBuildShape = (raw: unknown): PlayerBuildV1 | null => {
  try {
    if (!isRecord(raw) || raw.v !== 1) return null
    const { team, sk } = raw
    if (!Array.isArray(team) || team.length !== BUILD_TEAM_SIZE) return null
    const outTeam: PlayerBuildSpinner[] = []
    for (const s of team) {
      if (!isRecord(s)) return null
      if (!isId(s.t) || !isId(s.b) || !isId(s.m)) return null
      if (!intIn(s.tl, 0, BUILD_MAX_PART_LEVEL) || !intIn(s.bl, 0, BUILD_MAX_PART_LEVEL)) return null
      outTeam.push({ t: s.t, b: s.b, tl: s.tl, bl: s.bl, m: s.m })
    }
    if (!Array.isArray(sk) || sk.length > BUILD_MAX_SKILLS) return null
    const outSk: PlayerBuildSkill[] = []
    const seen = new Set<string>()
    for (const k of sk) {
      if (!isRecord(k) || !isId(k.id)) return null
      if (!intIn(k.lv, BUILD_MIN_SKILL_LEVEL, BUILD_MAX_SKILL_LEVEL)) return null
      if (seen.has(k.id)) return null
      seen.add(k.id)
      outSk.push({ id: k.id, lv: k.lv })
    }
    return { v: 1, team: outTeam, sk: outSk }
  } catch {
    return null
  }
}

const level = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0))

/**
 * The build the game is fighting with right now, or `null` when it cannot be
 * expressed (wrong team size, an id outside the charset, a level out of range)
 * — the caller then posts its score without a build, which the Worker accepts.
 */
export const encodePlayerBuild = (
  configs: readonly BuildSpinnerInput[] | null | undefined,
  skills: readonly BuildSkillInput[] | null | undefined
): PlayerBuildV1 | null => {
  try {
    if (!Array.isArray(configs)) return null
    return validatePlayerBuildShape({
      v: 1,
      team: configs.map((c) => ({
        t: c.topPartId,
        b: c.bottomPartId,
        tl: level(c.topLevel),
        bl: level(c.bottomLevel),
        m: c.modelId ?? ''
      })),
      sk: (Array.isArray(skills) ? skills : []).map((s) => ({ id: s.id, lv: level(s.level) }))
    })
  } catch {
    return null
  }
}

/**
 * Canonical, order-preserving string for a VALIDATED build. Signed into the
 * v2 score signature and compared to decide whether a stored build changed,
 * so client and Worker must produce it byte for byte — hence no JSON (key
 * order) and no hashing (no async crypto needed to compare).
 */
export const buildDigest = (build: PlayerBuildV1): string =>
  'v1|' +
  build.team.map((s) => `${s.t},${s.b},${s.tl},${s.bl},${s.m}`).join('|') +
  '|sk:' +
  build.sk.map((k) => `${k.id}.${k.lv}`).join(',')

/**
 * Team power the skills add on top of `parts` (Σ part levels):
 * round((parts + BUILD_SKILL_POWER_BASE) × Σ permille(lv) / 1000). Integer in,
 * integer out, 0 without skills; levels are truncated and clamped to 1…10
 * (a level below 1 adds nothing). Shared by buildPower, the NPC generator and
 * the opponent picker so every power in the league is the same number.
 */
export const buildSkillPower = (parts: number, levels: readonly number[]): number => {
  let permille = 0
  for (const raw of levels) {
    const lv = Math.min(BUILD_MAX_SKILL_LEVEL, Math.trunc(Number(raw) || 0))
    if (lv >= BUILD_MIN_SKILL_LEVEL) permille += BUILD_SKILL_POWER_PERMILLE[lv - 1] as number
  }
  if (permille === 0) return 0
  return Math.round(((Math.max(0, parts) + BUILD_SKILL_POWER_BASE) * permille) / 1000)
}

/** League team power: Σ part levels + buildSkillPower (skill-less = Σ part levels). */
export const buildPower = (build: PlayerBuildV1): number => {
  let parts = 0
  for (const s of build.team) parts += s.tl + s.bl
  return parts + buildSkillPower(parts, build.sk.map((k) => k.lv))
}

// Generate the SYNTHETIC leaderboard baked into builds that can never reach the
// Worker.
//
//   node scripts/generate-leaderboard-seed.mjs
//
// ─── Why this exists ────────────────────────────────────────────────────────
//
// Poki forbids every external runtime request, and YouTube Playables forbids
// external server calls. Those builds therefore ship with `VITE_LEADERBOARD_URL`
// empty: they never fetch a board and can never POST a score. Whatever is baked
// into the bundle is the board those players see, permanently.
//
// Baking the LIVE board there does not work. It is a real board of real players
// — but one that can never grow from those platforms, so every Poki player would
// be ranked against however many people happened to exist on the day the package
// was cut. At the time of writing that is seven, most of them test accounts, and
// the result screen reads "#1 of 7" for everybody forever.
//
// So this file is openly synthetic: a plausible player population, shaped like a
// real casual-game funnel, that gives a Poki player a rank which MOVES as they
// progress and sits where a comparable player would actually sit. The output is
// marked `"synthetic": true` and carries its generator in `source`, so nobody
// downstream mistakes it for measured data.
//
// It is deterministic — a fixed PRNG seed — so re-running produces a
// byte-identical file. That keeps it reviewable in a diff and stops it churning
// the repo on every build.
//
// ─── The shape ──────────────────────────────────────────────────────────────
//
// Modelled as a per-stage QUIT HAZARD rather than by writing counts out by hand,
// because the thing that has to look right is the curve, not any one bucket:
//
//   • stages 1-2   a few players bounce immediately
//   • stages 3-4   the peak — where most players stop
//   • stages 5-20  the long shoulder most of the rest reach
//   • past 40      ~5% of the population
//   • the tail     a handful of players past 150
//
// The constraints above are ASSERTED at the end of this script, so a tweak to
// the hazard curve that breaks the intended shape fails loudly instead of
// quietly shipping a different game's funnel.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SEED_FILE = resolve(
  fileURLToPath(new URL('../data/leaderboard-seed.json', import.meta.url))
)

/** Rows the Worker publishes, so the baked board matches its shape exactly. */
const TOP_N = 100
/** Population size. */
const POPULATION = 1789
/**
 * Hard ceiling, set well ABOVE where anyone is expected to land.
 *
 * The loop lumps everyone still playing at the cap into that one bucket, so a
 * cap the population has not thinned out by is an obvious artifact: at 257k
 * players a cap of 190 left ~500 people tied on the last stage, which would
 * have published a hundred-way tie for #1. The tail steepening in `hazard`
 * exhausts the population before this, so the branch is a guard rather than a
 * shaping tool — the `topBucket` check below fails if that stops being true.
 */
const MAX_STAGE = 320

/** mulberry32 — deterministic, so the generated file never churns. */
const rng = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = rng(20260907)

/**
 * Probability that a player who REACHED stage `s` stops there.
 *
 * Low at the very start (almost everyone tries a few stages), peaking at 3-4
 * where the game first asks something of them, then decaying towards a small
 * constant — the players still going at stage 60 are the ones who will mostly
 * keep going.
 */
const hazard = (s) => {
  if (s === 1) return 0.028
  if (s === 2) return 0.05
  if (s === 3) return 0.17
  if (s === 4) return 0.175
  // Three terms, because two could not satisfy both "only ~5% get past 40" and
  // "the best reach 150+" at once: thinning the mid-game to hit the first also
  // starved the tail and capped the top player around 148.
  //
  //   wall  — what is left of the stage-3/4 cliff, decaying fast
  //   floor — the baseline churn, which itself FALLS with depth: a player still
  //           going at stage 80 is self-selected and far less likely to stop
  //           than one at stage 20. This is what lets the mid-game be lossy
  //           while the tail still runs long.
  //   tail  — a late steepening, so the population exhausts before MAX_STAGE
  //           instead of piling up in the cap bucket
  const wall = 0.145 * Math.exp(-(s - 4) / 7.5)
  const floor = 0.012 + 0.032 * Math.exp(-Math.max(0, s - 45) / 25)
  const tail = s > 110 ? (s - 110) * 0.010 : 0
  return Math.min(0.9, wall + floor + tail)
}

// ─── Build the histogram ────────────────────────────────────────────────────
//
// `counts[s]` = players whose lifetime best is exactly stage `s`.
const counts = new Map()
let remaining = POPULATION
for (let s = 1; s <= MAX_STAGE && remaining > 0; s++) {
  // Everyone still playing at the cap stops there, so the tail is closed and
  // the histogram sums to exactly POPULATION.
  const quitting = s === MAX_STAGE
    ? remaining
    : Math.min(remaining, Math.round(remaining * hazard(s)))
  if (quitting > 0) counts.set(s, quitting)
  remaining -= quitting
}

const dist = [...counts.entries()].sort((a, b) => b[0] - a[0])
const total = dist.reduce((sum, [, n]) => sum + n, 0)

// ─── Names ──────────────────────────────────────────────────────────────────
//
// A real board is a mix: handles people chose, and the generated names the game
// mints for anonymous players (see `ANON_WORDS` in `usePlayerIdentity`). All
// invented; none is a real player's handle.
const ANON_WORDS = [
  'Spinner', 'Blader', 'Striker', 'Ripper', 'Vortex',
  'Cyclone', 'Blazer', 'Talon', 'Havoc', 'Rogue'
]
const HANDLES = [
  'Kx_Ronin', 'blaze_', 'M4verick', 'nova.', 'Zeph', 'TopHeavy', 'aeon',
  'Drexl', 'Q_Bit', 'sundown', 'Ikaru', 'Vantablack', 'mote', 'Halcyon',
  'r1ptide', 'Grendel', 'Sable', 'oni_', 'Kestrel', 'Vex', 'Lumen',
  'starfall', 'Nyx', 'Ashen', 'Ovid', 'jetlag', 'Corvus', 'Pike',
  'Moth', 'Salt', 'Hex', 'Wren', 'Odd', 'Cinder', 'Palefire', 'Tundra',
  'Quill', 'Rune', 'Onyx', 'Fable'
]
const NAME_MAX = 16

const usedNames = new Set()
const mintName = () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = rand() < 0.45
      ? HANDLES[Math.floor(rand() * HANDLES.length)]
      : ANON_WORDS[Math.floor(rand() * ANON_WORDS.length)]
      + String(100000 + Math.floor(rand() * 900000))
    if (name.length <= NAME_MAX && !usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
  }
  // Fall back to a guaranteed-unique generated name rather than loop forever.
  const unique = `Spinner${100000 + usedNames.size}`
  usedNames.add(unique)
  return unique
}

// ─── The published rows ─────────────────────────────────────────────────────
//
// The top `TOP_N` players, densest-first, with ties SHARING a rank — the same
// standard-competition ranking the Worker's `rebuildBoard` produces, so a baked
// board and a live one are indistinguishable in shape.
const entries = []
let placed = 0
for (const [score, n] of dist) {
  for (let i = 0; i < n && entries.length < TOP_N; i++) {
    entries.push({
      rank: placed + 1,
      name: mintName(),
      score,
      // Team power tracks progression with noise — the real board shows stage 16
      // at power 19 and stage 42 at power 36, so a little under 1:1.
      score_: undefined,
      power: Math.max(0, Math.round(score * 0.85 + (rand() - 0.5) * 6))
    })
  }
  placed += n
  if (entries.length >= TOP_N) break
}
for (const e of entries) delete e.score_

const cut = entries.at(-1)?.score ?? 0

// ─── Verify the intended shape, loudly ──────────────────────────────────────
const share = (predicate) =>
  dist.filter(([s]) => predicate(s)).reduce((sum, [, n]) => sum + n, 0) / total

const modeStage = dist.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0]
const past40 = share((s) => s > 40)
const early = share((s) => s <= 2)
const midBand = share((s) => s >= 10 && s <= 20)
const topStage = dist[0][0]

const checks = [
  ['histogram sums to the population', total === POPULATION, `${total} vs ${POPULATION}`],
  ['most players quit on stage 3-4', modeStage === 3 || modeStage === 4, `mode = ${modeStage}`],
  ['only a few stop on stage 1-2', early > 0.02 && early < 0.12, `${(early * 100).toFixed(1)}%`],
  ['~5% get past stage 40', past40 > 0.03 && past40 < 0.08, `${(past40 * 100).toFixed(1)}%`],
  ['the best reach stage 150+', topStage >= 150, `top = ${topStage}`],
  // Guards against the cap becoming the shape: if the population has not
  // thinned by MAX_STAGE, everyone left is dumped in one bucket and the board
  // publishes a mass tie at #1.
  ['the top is a thin tail, not a pile-up', dist[0][1] <= 5, `${dist[0][1]} at the top`],
  ['a real band sits in stages 10-20', midBand > 0.1, `${(midBand * 100).toFixed(1)}%`]
]

let failed = 0
for (const [label, ok, detail] of checks) {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  (${detail})`)
}
if (failed > 0) {
  console.error(`\n[leaderboard-seed] ${failed} shape check(s) failed — not written.`)
  process.exitCode = 1
} else {
  const snapshot = {
    // Deliberately NOT a URL. Anything reading this file can tell at a glance
    // that it did not come off the Worker.
    source: 'synthetic — scripts/generate-leaderboard-seed.mjs',
    synthetic: true,
    fetchedAt: Date.now(),
    updatedAt: Date.now(),
    total,
    entries,
    dist
  }
  mkdirSync(dirname(SEED_FILE), { recursive: true })
  writeFileSync(SEED_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8')
  console.log(
    `\n[leaderboard-seed] ${total} players, ${entries.length} published rows, `
    + `top ${topStage}, cut at ${cut}`
  )
  console.log(`[leaderboard-seed] wrote ${SEED_FILE}`)
}

// ─── Gift reveal: fit N skin prizes on screen (claim-all, #UX1b) ────────────
//
// A battle-pass claim-all can hand out one skin or ten. The reveal shows them
// side by side, as big as the viewport allows: ONE row while the plates stay
// a comfortable size, otherwise balanced rows (7 → 4 + 3, never 6 + 1).
// Pure arithmetic on the viewport size so it is unit-testable and re-runs on
// resize / rotation.

export interface PrizeGrid {
  cols: number
  rows: number
  /** Plate (portrait disc) size in CSS px. */
  plate: number
}

/** Space between plates (px). Matches `.reveal__skins` gap. */
export const PRIZE_GAP = 10
/** Never smaller than this: a skin portrait must still read. */
export const MIN_PLATE = 40
/** Never larger than this, however few skins. */
export const MAX_PLATE = 128

/** Label under a plate (rarity tag + up to two name lines), as a function of the plate. */
const labelH = (plate: number): number => 20 + 0.34 * plate

/**
 * Columns / rows / plate size for `n` skin prizes in a `vw` × `vh` viewport.
 * `hasCurrencyRow`: the summed coins / diamonds row sits above and takes its
 * share of the height.
 */
export const fitPrizeGrid = (n: number, vw: number, vh: number, hasCurrencyRow: boolean): PrizeGrid => {
  if (n <= 0) return { cols: 0, rows: 0, plate: 0 }
  const availW = Math.max(120, Math.min(vw - 32, 760))
  // Ribbon + "continue" + paddings + the "NEW SMASHERS" kicker, then the
  // currency row when there is one.
  // (#UX1c: +12 for the FRibbon tails under the title and the kicker.)
  const reserved = 212 + (hasCurrencyRow ? Math.min(120, Math.max(70, vh * 0.16)) : 0)
  const availH = Math.max(90, vh - reserved)
  const maxPlate = Math.min(MAX_PLATE, Math.max(64, Math.min(vw, vh) * 0.26))

  const plateFor = (cols: number): number => {
    const rows = Math.ceil(n / cols)
    const w = (availW - (cols - 1) * PRIZE_GAP) / cols
    // Solve rows * (plate + labelH(plate)) + (rows - 1) * gap <= availH.
    const h = ((availH - (rows - 1) * PRIZE_GAP) / rows - 20) / 1.34
    return Math.min(maxPlate, w, h)
  }

  let best = { cols: 1, plate: -Infinity }
  for (let cols = 1; cols <= n; cols++) {
    const plate = plateFor(cols)
    // Ties (within a pixel) go to more columns: fewer rows read as "a row".
    if (plate > best.plate + 0.5 || (Math.abs(plate - best.plate) <= 0.5 && cols > best.cols)) best = { cols, plate }
  }
  // Balance the rows: the same row count with as few columns as it needs.
  const rows = Math.ceil(n / best.cols)
  const cols = Math.ceil(n / rows)
  const plate = Math.max(MIN_PLATE, Math.floor(Math.max(best.plate, plateFor(cols))))
  return { cols, rows, plate }
}

/** Total height of a grid (for tests / sanity checks). */
export const gridHeight = (g: PrizeGrid): number =>
  g.rows * (g.plate + labelH(g.plate)) + Math.max(0, g.rows - 1) * PRIZE_GAP

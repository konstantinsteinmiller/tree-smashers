// Pure helpers for the portrait registry (portraits.mjs + tests): the portrait
// list is DERIVED from the shipped sheet registry (paintedSmashers.ts), so a
// sheet that is unshipped or re-cut takes its portrait with it.

/** `"id": { … },` lines of a generated registry → Map(id → body text). */
export const parseRegistry = (text) => {
  const m = new Map()
  for (const l of text.split('\n')) {
    const r = l.match(/^\s*"([a-z0-9-]+)":\s*\{(.*)\},?\s*$/)
    if (r) m.set(r[1], r[2])
  }
  return m
}

/** One string field (`file`, `v`, `sheet`) of a registry body. */
export const registryField = (body, k) => body.match(new RegExp(`\\b${k}: (?:"|')([^"']*)`))?.[1]

/** Sheet registry text → Map(id → sheet hash). */
export const shippedSheets = (sheetRegText) =>
  new Map([...parseRegistry(sheetRegText)].map(([id, b]) => [id, registryField(b, 'v')]))

/** Portrait entries that still match a shipped sheet (same id, same sheet hash). */
export const livePortraits = (portraitRegText, sheets) =>
  new Map([...parseRegistry(portraitRegText)].filter(([id, b]) => sheets.get(id) === registryField(b, 'sheet')))

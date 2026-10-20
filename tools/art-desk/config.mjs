/**
 * Where things are. Adapted from the art-generation-pipeline skill's Art Desk
 * template for tree-smashers. Anything that differs goes in
 * `art-desk.config.json` at the project root, e.g.
 *
 *   {
 *     "gemini": { "gapSeconds": 30, "jitterSeconds": 20 }
 *   }
 *
 * tree-smashers differences from the template defaults:
 *
 *   · gemini.profileDir is THIS project's own Chrome profile
 *     (~/.art-desk/profiles/tree-smashers), not the shared
 *     ~/.art-desk/gemini-chrome. Other projects' desks and sessions keep using
 *     theirs; nothing here ever opens, closes or writes into another profile.
 *   · port 5183 — 5178 and 5179 are held by other projects' desks.
 *   · compress: null — the project has no compress-images script yet; the
 *     slicer (slice.mjs) writes finished WebP directly.
 *
 * Commands are argv arrays run from the project root. `node` means the Node
 * running the desk. Placeholders: {painting} is the painted file, {files} the
 * comma-joined list of files the slicer just wrote, {compressRoot} the folder
 * the compressor keys its backups by. A command set to null is skipped.
 *
 * ART_DESK_PROFILE_DIR (env) overrides gemini.profileDir for one process —
 * for driver tests on a throwaway profile only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULTS = {
  sheetsDir: 'art-sheets',
  paintedDir: 'art-sheets/painted',
  indexFile: 'art-sheets/sheet-index.json',
  // Where the slicer's `target` paths are relative to.
  outDir: 'public',
  slice: ['node', 'tools/slice-sheets.mjs', '{painting}'],
  compressRoot: 'public/images',
  compress: null,
  // Where a manual Gemini download lands; the desk files it under the job it
  // was armed for.
  watchDir: join(homedir(), 'Downloads'),
  port: 5183,
  gemini: {
    url: 'https://gemini.google.com/app',
    // tree-smashers's OWN profile (see the header). Sign in to Google once, in
    // the plain window `node tools/art-desk/paint.mjs --sign-in` opens.
    profileDir: join(homedir(), '.art-desk', 'profiles', 'tree-smashers'),
    chrome: null,
    // Extra Chrome switches for that window, e.g. ["--window-position=2000,0"].
    chromeArgs: [],
    // Between two generations: gapSeconds plus up to jitterSeconds at random.
    // Enforced ACROSS processes by lock.mjs (paint.mjs and the desk's queue).
    gapSeconds: 90,
    jitterSeconds: 60,
    // Generations per calendar day on this ledger. Off by default: what runs
    // out is the account's allowance, and Gemini says so (→ QUOTA).
    dailyCap: Infinity,
    // Where generations are counted. null = the shared ~/.art-desk/usage.json,
    // the ledger every desk on this machine keeps (usage.mjs).
    usageFile: null,
    // Per attempt (the first ask, and again for the one "generate it now" nudge).
    timeoutSeconds: 300,
    // Re-rolls when a return comes back unusable (desk queue only).
    retries: 1,
    // Stop the queue after this many failures in a row (desk queue only).
    maxConsecutiveFailures: 3
  }
}

export const loadConfig = (root) => {
  const file = join(root, 'art-desk.config.json')
  let user = {}
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (e) {
      throw new Error(`${file} is not valid JSON: ${e.message}`)
    }
  }
  const c = { ...DEFAULTS, ...user, gemini: { ...DEFAULTS.gemini, ...(user.gemini ?? {}) } }
  if (c.gemini.dailyCap == null) c.gemini.dailyCap = Infinity
  const abs = (p) => (p ? resolve(root, p) : p)
  const home = (p) => resolve(p.replace(/^~(?=$|[\\/])/, homedir()))
  const profileDir = home(process.env.ART_DESK_PROFILE_DIR || c.gemini.profileDir)
  const usageFile = c.gemini.usageFile ? home(c.gemini.usageFile) : join(homedir(), '.art-desk', 'usage.json')
  return {
    ...c,
    root,
    project: (() => {
      try {
        return JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).name
      } catch {
        return 'project'
      }
    })(),
    sheetsDir: abs(c.sheetsDir),
    paintedDir: abs(c.paintedDir),
    indexFile: abs(c.indexFile),
    outDir: abs(c.outDir),
    compressRoot: abs(c.compressRoot),
    watchDir: c.watchDir ? resolve(c.watchDir.replace(/^~(?=$|[\\/])/, homedir())) : null,
    gemini: { ...c.gemini, profileDir, usageFile }
  }
}

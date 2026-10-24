// The version the uploaded build is NAMED after.
//
// Poki's Versions list is a flat list of names with no ordering guarantee other
// than upload time, so the name is the only thing that ties a live version back
// to a commit. `package.json` is the single source of that name: bump the patch,
// build, upload under the new number. Never upload two different builds under
// one name — see `p4d.mjs`, which refuses to.

import { readFileSync, writeFileSync } from 'node:fs'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(.*)$/

export const readVersion = pkgPath => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (typeof pkg.version !== 'string') throw new Error(`${pkgPath} has no "version"`)
  return pkg.version
}

export const bumpPatch = version => {
  const m = SEMVER.exec(version)
  if (!m) throw new Error(`version "${version}" is not x.y.z — bump it by hand or pass --version`)
  const [, maj, min, patch, rest] = m
  return `${maj}.${min}.${Number(patch) + 1}${rest}`
}

/** Rewrite ONLY the version line. A JSON round-trip would reformat the whole
 *  file — key order survives `JSON.parse`, but indentation, blank lines and the
 *  trailing newline do not, and this file sits in every diff the user reads. */
export const writeVersion = (pkgPath, next) => {
  const raw = readFileSync(pkgPath, 'utf8')
  const replaced = raw.replace(/("version"\s*:\s*")([^"]+)(")/, `$1${next}$3`)
  if (replaced === raw) throw new Error(`could not rewrite the version in ${pkgPath}`)
  writeFileSync(pkgPath, replaced)
}

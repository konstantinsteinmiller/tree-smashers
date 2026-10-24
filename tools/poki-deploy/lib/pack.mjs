// Pack the built Poki artifact, and prove the result is what P4D can read.
//
// Shared by `deploy.mjs` (its Pack step) and `pack.mjs` (the tail of
// `pnpm build:poki`), so a hand-built zip and a pipeline-built zip are the same
// bytes from the same rules. See zip.mjs for why no shell `tar` is involved.

import { join } from 'node:path'

import { inspectZip, listZip, zipDir } from './zip.mjs'

/** Files that must never ride along in the upload: an older archive sitting in
 *  `dist/` (the build script's own, or a previous run's), and the
 *  `*-original.*` backups the image compressor keeps next to each file. */
export const packExclude = cfg => name =>
  name.endsWith('.zip')
  || /-original\.(png|jpe?g|webp)$/i.test(name)
  || (cfg.zipExclude?.(name) ?? false)

/**
 * Zip `cfg.dist` into `cfg.zip` and verify it structurally.
 *
 * @returns {{ ok: boolean, why?: string, zip: string, entries: number, bytes: number, sha1: string, names: string[] }}
 */
export const packArtifact = ({ root, cfg }) => {
  const zipPath = join(root, cfg.zip)
  const packed = zipDir(join(root, cfg.dist), zipPath, { exclude: packExclude(cfg) })
  const z = inspectZip(zipPath)
  if (!z.ok) return { ...packed, ok: false, zip: zipPath, why: z.why }
  const names = listZip(zipPath)
  if (!names.includes('index.html')) {
    return { ...packed, ok: false, zip: zipPath, why: `index.html is not at the archive root (root holds: ${names.slice(0, 5).join(', ')})` }
  }
  return { ...packed, ok: true, zip: zipPath }
}

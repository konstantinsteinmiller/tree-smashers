#!/usr/bin/env node
/**
 * The Art Desk's slice command (art-desk.config.json): routes a painting to
 * its kind's slicer by name — `ui-*` → art/ui/slice-return.mjs, everything
 * else → art/bosses/slice-return.mjs. Arguments pass through.
 */
import { spawnSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const stem = basename(args[0] ?? '').toLowerCase()
const script = stem.startsWith('ui-') ? 'art/ui/slice-return.mjs' : 'art/bosses/slice-return.mjs'
const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' })
process.exit(r.status ?? 1)

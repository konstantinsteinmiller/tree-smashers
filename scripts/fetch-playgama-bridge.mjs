// ─── Vendor the Playgama Bridge for the YouTube Playables build ────────────
//
// YouTube Playables forbids external server calls, and Playgama's own YouTube
// requirements repeat it ("your game must not make external calls, all assets
// bundled"). Every other Playgama build loads the Bridge from
// `https://bridge.playgama.com/...` via a <script> tag in index.html; on the
// YouTube channel that tag is rewritten by `vite.config.ts` to point at the
// copy this script downloads.
//
//   pnpm fetch:playgama-bridge          → pins the version in BRIDGE_VERSION
//   pnpm fetch:playgama-bridge v2/stable
//
// The version is pinned rather than tracking `stable` silently: the Bridge is
// third-party code that ends up inside our shipped bundle, and a build should
// not change behaviour because someone else pushed to a CDN. Re-run this
// deliberately when you want a newer Bridge, and diff the result.
//
// NOTE: `playgamaPlugin.ts` targets the v1 API surface (`window.bridge`,
// `bridge.storage`, `bridge.platform.language`). Do not jump to v2 here
// without checking that plugin.

import { writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BRIDGE_VERSION = process.argv[2] ?? 'v1/stable'
const SRC = `https://bridge.playgama.com/${BRIDGE_VERSION}/playgama-bridge.js`

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../public/js')
const OUT = path.join(OUT_DIR, 'playgama-bridge.js')

const res = await fetch(SRC)
if (!res.ok) {
  console.error(`[fetch:playgama-bridge] ${SRC} -> HTTP ${res.status}`)
  process.exit(1)
}
const body = await res.text()

// A CDN that answers with an HTML error page instead of JS would otherwise
// produce a build that fails only at runtime, on YouTube, in front of QA.
if (!body.includes('bridge') || body.trimStart().startsWith('<')) {
  console.error('[fetch:playgama-bridge] response does not look like the Bridge SDK — refusing to write')
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT, body, 'utf8')

const sha = createHash('sha256').update(body).digest('hex').slice(0, 16)
console.log(`[fetch:playgama-bridge] ${SRC}`)
console.log(`  -> public/js/playgama-bridge.js  (${body.length} bytes, sha256:${sha})`)
console.log('')
console.log('  Verify before shipping: open the file and confirm it does NOT fetch')
console.log('  further platform adapters at runtime — YouTube forbids external calls,')
console.log('  and the CDN build is documented as loading "only the adapter of the')
console.log('  platform the game actually runs on".')

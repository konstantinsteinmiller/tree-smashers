// @vitest-environment node
// (vite.config.ts pulls in esbuild, which refuses to load under jsdom.)
// ─── Forced dark-mode opt-outs survive every build ──────────────────────────
//
// `index.html` carries two metas that switch off the dark-mode overriders that
// CAN be switched off: `color-scheme: dark only` (Chromium force-dark on a dark
// OS) and `darkreader-lock` (Dark Reader's default mode). They sit in <head>
// next to the portal SDK tags, and `vite.config.ts` strips those tags per build
// with regexes. A regex that crosses an HTML comment has already eaten the
// YouTube SDK tag and the storage shim in this repo once — so run the real
// index.html through the real transforms of EVERY build mode and check that
// what must stay, stays.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8')

const MODES = [
  'production', 'crazy-web', 'wavedash', 'itch', 'glitch', 'game-distribution', 'y8',
  'gamepix', 'playgama', 'youtube', 'poki', 'gamemonetize'
]

// `loadEnv` lets process.env VITE_* values override `.env.<mode>.local`, and
// `vi.stubEnv` in other suites writes through to process.env. Clear every flag
// the config branches on so each mode is read from its own env file.
const FLAGS = [
  'VITE_APP_CRAZY_WEB', 'VITE_APP_WAVEDASH', 'VITE_APP_ITCH', 'VITE_APP_GLITCH',
  'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_Y8', 'VITE_APP_GAMEPIX', 'VITE_APP_PLAYGAMA',
  'VITE_APP_POKI', 'VITE_APP_GAME_MONETIZE', 'VITE_APP_YOUTUBE', 'VITE_ENABLE_OBFUSCATION',
  'VITE_NODE_ENV', 'VITE_APP_FEATURE_SKILLS', 'VITE_APP_FEATURE_BOSSES100',
  'VITE_APP_FEATURE_LEAGUE', 'VITE_APP_KIDS', 'VITE_APP_LEAGUE_UNLOCK_STAGE', 'VITE_LEADERBOARD_URL'
]

type HtmlTransform = (html: string, ctx: unknown) => unknown

const transformFor = async (mode: string): Promise<string> => {
  const { default: configFn } = await import('../vite.config')
  const config = await (configFn as (env: { mode: string; command: string }) => unknown)({ mode, command: 'build' })
  const plugins = ((config as { plugins?: unknown[] }).plugins ?? []).flat(Infinity) as Array<{
    transformIndexHtml?: HtmlTransform | { handler?: HtmlTransform }
  } | null>
  let html = HTML
  for (const plugin of plugins) {
    const hook = plugin?.transformIndexHtml
    const fn = typeof hook === 'function' ? hook : hook?.handler
    if (!fn) continue
    const out = await fn(html, { path: '/index.html', filename: path.join(ROOT, 'index.html') })
    if (typeof out === 'string') html = out
  }
  return html
}

describe('forced dark-mode opt-outs survive the build transforms', () => {
  beforeAll(() => {
    for (const k of FLAGS) vi.stubEnv(k, undefined)
    vi.spyOn(console, 'log').mockImplementation(() => {
    })
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('the source index.html declares both opt-outs before any script', () => {
    const head = HTML.slice(0, HTML.indexOf('<script'))
    expect(head).toMatch(/<meta name="color-scheme" content="dark only">/)
    expect(head).toMatch(/<meta name="darkreader-lock">/)
  })

  for (const mode of MODES) {
    it(`[${mode}] keeps color-scheme, darkreader-lock, the favicon and the storage shim`, async () => {
      const html = await transformFor(mode)
      expect(html).toMatch(/<meta name="color-scheme" content="dark only">/)
      expect(html).toMatch(/<meta name="darkreader-lock">/)
      expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32">')
      expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
      expect(html).toContain('<script src="/js/storage-shim.js"></script>')
      expect(html).toContain('<meta charset="UTF-8">')
    })
  }
})

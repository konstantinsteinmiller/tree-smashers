#!/usr/bin/env node
/**
 * ─── paint.mjs — one Gemini painting, blocking, serialised ──────────────────
 *
 *   node tools/art-desk/paint.mjs --prompt-file <abs .txt> --out <abs .png> [--ref <abs .png|.webp|.jpg>]...
 *   node tools/art-desk/paint.mjs --sign-in     # open the profile PLAIN to sign in to Google
 *   node tools/art-desk/paint.mjs --status      # lock holder, queue, throttle, window
 *
 * What one call does:
 *   1. waits its turn on the cross-process paint lock (lock.mjs) — FIFO, never
 *      fails for being busy — then waits out the throttle gap since the
 *      previous generation (gapSeconds + up to jitterSeconds, art-desk config);
 *   2. reuses the Gemini Chrome on chaos-arena's own profile, or launches it;
 *   3. opens a NEW chat, attaches the --ref images (first --ref = the LAYOUT
 *      sheet, the rest = style refs; the layout sheet is attached LAST, because
 *      Gemini takes the output's shape from the last image), types
 *      the prompt, sends, waits for the image — a words-only reply gets ONE
 *      "generate the image now" nudge in the same chat;
 *   4. downloads the full-size original with Gemini's own download button,
 *      converts it to PNG (the free app serves JPEG) and writes --out;
 *   5. counts the generation in ~/.art-desk/usage.json.
 *
 * Output contract:
 *   stdout gets exactly ONE line: the --out path on success, or
 *   `<CODE>: <detail>` on failure. Progress goes to stderr.
 *
 *   exit 0   ok
 *   exit 2   BAD_ARGS
 *   exit 10  SIGNED_OUT              (also: the cookie-consent dialog is up)
 *   exit 11  QUOTA                   (Gemini refused; or Flash-Lite AND uploads refused)
 *   exit 12  TEXT_ONLY_AFTER_RETRY   (words twice, no image)
 *   exit 13  TIMEOUT
 *   exit 14  BROWSER                 (anything else about the window/page)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.mjs'
import { Gemini } from './gemini.mjs'
import { openCanvas, toPng } from './imaging.mjs'
import { imageSize } from './jobs.mjs'
import { holderState, lockDir, throttleState, withPaintLock } from './lock.mjs'
import { ledger } from './usage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const EXIT = { BAD_ARGS: 2, SIGNED_OUT: 10, QUOTA: 11, TEXT_ONLY_AFTER_RETRY: 12, TIMEOUT: 13, BROWSER: 14 }
const t0 = Date.now()
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`
const log = (msg) => process.stderr.write(`[paint ${secs()}] ${msg}\n`)

let finished = false
const finish = (code, line) => {
  if (finished) return
  finished = true
  process.stdout.write(`${line}\n`)
  process.exitCode = code
}
const die = (codeName, detail) => {
  const code = EXIT[codeName] ?? EXIT.BROWSER
  finish(code, `${EXIT[codeName] ? codeName : 'BROWSER'}: ${String(detail).replace(/\s+/g, ' ').trim().slice(0, 400)}`)
  process.exit(code)
}

// ─── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const refs = []
let promptFile = null
let out = null
let mode = 'paint'
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const val = () => {
    const v = argv[++i]
    if (v === undefined || v.startsWith('--')) die('BAD_ARGS', `${a} needs a value`)
    return v
  }
  if (a === '--prompt-file') promptFile = val()
  else if (a === '--out') out = val()
  else if (a === '--ref') refs.push(val())
  else if (a === '--sign-in') mode = 'sign-in'
  else if (a === '--status') mode = 'status'
  else if (a === '-h' || a === '--help') mode = 'help'
  else die('BAD_ARGS', `unknown argument ${a} — see tools/art-desk/READY.md`)
}

const cfg = loadConfig(ROOT)
const g = cfg.gemini

if (mode === 'help') {
  process.stderr.write(readFileSync(fileURLToPath(import.meta.url), 'utf-8').split('\n */')[0].split('\n').slice(2).map((l) => l.replace(/^ \*\/?\s?/, '')).join('\n') + '\n')
  process.exit(0)
}

const gemini = new Gemini({
  root: ROOT,
  profileDir: g.profileDir,
  url: g.url,
  chrome: g.chrome,
  chromeArgs: g.chromeArgs,
  log
})

if (mode === 'status') {
  const dir = lockDir(g.profileDir)
  const h = holderState(dir)
  const last = throttleState(dir)
  let queue = []
  try {
    queue = readdirSync(join(dir, 'queue')).filter((f) => f.endsWith('.json'))
  } catch {
  }
  const st = await gemini.status()
  const ledgerNow = ledger(g.usageFile)
  process.stdout.write(`${JSON.stringify({
    profileDir: g.profileDir,
    window: st,
    lock: h.held ? { ...h.owner, stale: h.stale, why: h.why || undefined } : null,
    waiting: queue.length,
    nextAllowedInSeconds: last?.nextAt ? Math.max(0, Math.round((last.nextAt - Date.now()) / 1000)) : 0,
    gap: `${g.gapSeconds}s + up to ${g.jitterSeconds}s`,
    usedToday: ledgerNow.usedToday(),
    usageFile: ledgerNow.file
  }, null, 2)}\n`)
  process.exit(0)
}

if (mode === 'sign-in') {
  const r = await gemini.signInWindow()
  process.stdout.write(r.opened
    ? `opened ${g.url} PLAIN (no automation port) on ${g.profileDir} — sign in to Google, accept the cookie prompt, then CLOSE that window\n`
    : `a window on ${g.profileDir} is already open — sign in there, then close it\n`)
  process.exit(0)
}

// ─── Validate a paint call before queueing it ────────────────────────────────
if (!promptFile) die('BAD_ARGS', '--prompt-file is required')
if (!out) die('BAD_ARGS', '--out is required')
for (const [name, p] of [['--prompt-file', promptFile], ['--out', out], ...refs.map((r) => ['--ref', r])]) {
  if (!isAbsolute(p)) die('BAD_ARGS', `${name} must be an absolute path: ${p}`)
}
if (!existsSync(promptFile)) die('BAD_ARGS', `no such prompt file: ${promptFile}`)
const prompt = readFileSync(promptFile, 'utf-8').replace(/^﻿/, '').trim()
if (!prompt) die('BAD_ARGS', `the prompt file is empty: ${promptFile}`)
const outExt = extname(out).toLowerCase()
if (!['.png', '.jpg', '.jpeg'].includes(outExt)) die('BAD_ARGS', `--out must end in .png (or .jpg to keep Gemini's JPEG as-is): ${out}`)
for (const r of refs) {
  if (!existsSync(r)) die('BAD_ARGS', `no such --ref file: ${r}`)
  if (!imageSize(readFileSync(r))) die('BAD_ARGS', `--ref is not a PNG, JPEG or WebP image: ${r}`)
}

// ─── A hard ceiling on the whole call, lock wait excluded ────────────────────
let watchdog = null
const armWatchdog = () => {
  const limit = (g.timeoutSeconds * 2 + 180) * 1000
  watchdog = setTimeout(() => die('TIMEOUT', `the job did not finish within ${Math.round(limit / 1000)} s`), limit)
  watchdog.unref?.()
}

const usage = ledger(g.usageFile)
const label = `paint.mjs pid ${process.pid} on ${hostname()} → ${out}`
log(`queued: ${refs.length} ref(s), ${prompt.length} prompt chars → ${out}`)

let result
try {
  result = await withPaintLock(g.profileDir, {
    gapSeconds: g.gapSeconds,
    jitterSeconds: g.jitterSeconds,
    label,
    log
  }, async ({ markSpent }) => {
    if (usage.usedToday() >= g.dailyCap) {
      throw Object.assign(new Error(`daily cap reached (${usage.usedToday()}/${g.dailyCap} in ${usage.file})`), { code: 'QUOTA' })
    }
    armWatchdog()
    const tJob = Date.now()
    try {
      const r = await gemini.paint({
        // Caller order: first --ref = the layout sheet, the rest = style refs.
        // Gemini takes the output SHAPE from the LAST attachment
        // (PROMPT-ANATOMY §12), so the layout sheet is attached last.
        files: refs.length > 1 ? [...refs.slice(1), refs[0]] : refs,
        prompt,
        timeoutMs: g.timeoutSeconds * 1000,
        onPhase: (p) => log(p),
        onSent: () => markSpent()
      })
      usage.countGeneration()
      log(`Gemini answered in ${((Date.now() - tJob) / 1000).toFixed(0)} s — ${r.chatUrl}`)
      return r
    } catch (e) {
      if (e.counted) usage.countGeneration()
      throw e
    }
  })
} catch (e) {
  const code = e.code === 'CONSENT' ? 'SIGNED_OUT' : e.code === 'NO_IMAGE' ? 'TEXT_ONLY_AFTER_RETRY' : e.code
  log(`✗ ${e.code ?? 'ERROR'}: ${e.message}`)
  die(EXIT[code] ? code : 'BROWSER', e.message)
}

// ─── Write the return (the lock is already free for the next caller) ────────
try {
  let bytes = result.bytes
  const got = imageSize(bytes)
  if (outExt === '.png' && got.type !== 'png') {
    const canvas = await openCanvas(ROOT, g.chrome)
    try {
      bytes = await toPng(canvas.page, bytes)
    } finally {
      await canvas.close()
    }
    log(`converted Gemini's ${got.type.toUpperCase()} to PNG (same ${got.w}x${got.h} pixels)`)
  } else if (outExt !== '.png' && got.type !== 'jpg') {
    die('BAD_ARGS', `Gemini returned ${got.type.toUpperCase()}, not JPEG — ask for a .png --out`)
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  if (!result.fullRes) log('! WARNING: the download button failed; this is the on-page image and may be downscaled')
  log(`saved ${out}  ${got.w}x${got.h}, ${(bytes.length / 1024).toFixed(0)} kB, total ${secs()}`)
  clearTimeout(watchdog)
  finish(0, out)
} catch (e) {
  if (finished) throw e
  die('BROWSER', `could not write ${out}: ${e.message}`)
}
// Nothing may keep the process alive once the line is out (a CDP socket, a timer).
process.exit(0)

#!/usr/bin/env node
// Render the live-synthesised sounds (UI + intro cues), OLD and NEW, to WAV
// through a real Web Audio OfflineAudioContext in headless Chrome — so the
// review files are exactly what the game's code produces.
//
//   node tools/audio-v2/render-procedural.mjs --out <dir>
//
// OLD UI  = src/use/uiSfx.ts `renderUiSfx` (transpiled as-is, imports stubbed)
// NEW UI  = src/audio/uiSfxV2.ts `renderUiSfxV2`
// OLD intro cues = the four `tone()` recipes of src/use/introAudio.ts fire()
//                  (re-stated below: they live inside a closure)
// NEW intro cues = src/audio/uiSfxV2.ts `renderIntroCueV2`
//
// Each sound is rendered as a short scene (a count-up run for `tick`, a
// slider drag for `slide`, the countdown for the intro tick, lub-dub for the
// heartbeat) and measured; the loudness table is what V2_UI_LEVELS /
// V2_INTRO_GAIN were calibrated with. Chrome runs on a private profile and a
// random port and is killed (process tree) at the end.

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { measure, writeWav, readJson } from './lib/master.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const require = createRequire(join(ROOT, 'package.json'))
const ts = require('typescript')
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SR = 44100

const outIdx = process.argv.indexOf('--out')
const OUT = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : join(HERE, '.procedural')
mkdirSync(OUT, { recursive: true })

const transpile = (file, stubs) => {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return stubs + js.split('\n').filter((l) => !/^import\s/.test(l)).join('\n')
}

const oldUi = transpile('src/use/uiSfx.ts', 'const getAudioContext = () => null; const isGamePaused = { value: false }; const useUser = () => ({});\n')
const newUi = transpile('src/audio/uiSfxV2.ts', '')

const UI_NAMES = ['press', 'pressHero', 'release', 'toggleOn', 'toggleOff', 'tab', 'open', 'close', 'tick', 'reward', 'deny', 'slide']
const UI_PEAK = 0.35

const page = `<!doctype html><meta charset="utf-8"><title>procedural-render</title><script type="module">
const oldUi = await import(URL.createObjectURL(new Blob([${JSON.stringify(oldUi)}], { type: 'text/javascript' })))
const newUi = await import(URL.createObjectURL(new Blob([${JSON.stringify(newUi)}], { type: 'text/javascript' })))
const SR = ${SR}
const UI_PEAK = ${UI_PEAK}

// introAudio.ts fire() → tone(ctx, type, f0, f1, dur, peak), gain = volume * peak.
const oldTone = (ctx, at, type, f0, f1, dur, peak) => {
  const osc = ctx.createOscillator(), amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur)
  amp.gain.setValueAtTime(0.0001, at)
  amp.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur * 0.2))
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(at); osc.stop(at + dur + 0.02)
}
const oldCue = (ctx, kind, at, { gain = 1, pitchHz = 1000 } = {}) => {
  if (kind === 'tick') oldTone(ctx, at, 'triangle', pitchHz, pitchHz * 0.92, 0.05, 0.06)
  if (kind === 'thud') oldTone(ctx, at, 'sine', 110, 38, 0.42, 0.5)
  if (kind === 'heart') oldTone(ctx, at, 'sine', 70, 45, 0.18, 0.45 * gain)
  if (kind === 'whoosh') oldTone(ctx, at, 'sawtooth', 90, 420, 0.36, 0.035)
}

// Scenes: [time, options] per hit.
const uiScene = (name) => {
  if (name === 'tick') return Array.from({ length: 10 }, (_, k) => [0.02 + k * 0.06, { pitch: 1 + (k / 9) * 0.5 }])
  if (name === 'slide') return Array.from({ length: 6 }, (_, k) => [0.02 + k * 0.07, { pitch: 0.8 + (k / 5) * 0.6 }])
  return [[0.02, { pitch: 1 }]]
}
const introScene = (kind) => {
  if (kind === 'tick') return Array.from({ length: 9 }, (_, k) => [0.02 + k * 0.1, { pitchHz: 260 + ((9 - k) / 9) * 1100 }])
  if (kind === 'heart') return [[0.02, { gain: 1 }], [0.26, { gain: 0.7 }], [0.74, { gain: 1 }], [0.98, { gain: 0.7 }]]
  return [[0.02, {}]]
}

const render = async (sec, fn) => {
  const ctx = new OfflineAudioContext(1, Math.ceil(sec * SR), SR)
  fn(ctx)
  const buf = await ctx.startRendering()
  const d = buf.getChannelData(0)
  const bytes = new Uint8Array(d.buffer.slice(0))
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

window.renderAll = async () => {
  const out = {}
  for (const name of ${JSON.stringify(UI_NAMES)}) {
    const scene = uiScene(name)
    const sec = scene[scene.length - 1][0] + 0.45
    out['ui-' + name + '|old'] = await render(sec, (ctx) => scene.forEach(([t, o]) => oldUi.renderUiSfx(ctx, ctx.destination, name, UI_PEAK, t, o.pitch)))
    out['ui-' + name + '|new'] = await render(sec, (ctx) => scene.forEach(([t, o]) => newUi.renderUiSfxV2(ctx, ctx.destination, name, UI_PEAK, t, o.pitch)))
  }
  for (const kind of ['tick', 'thud', 'heart', 'whoosh']) {
    const scene = introScene(kind)
    const sec = scene[scene.length - 1][0] + 0.6
    out['intro-' + kind + '|old'] = await render(sec, (ctx) => scene.forEach(([t, o]) => oldCue(ctx, kind, t, o)))
    out['intro-' + kind + '|new'] = await render(sec, (ctx) => scene.forEach(([t, o]) => newUi.renderIntroCueV2(ctx, ctx.destination, kind, 1, t, o)))
  }
  return out
}
window.ready = true
</script>`

const work = mkdtempSync(join(tmpdir(), 'ts-proc-'))
const htmlPath = join(work, 'render.html')
writeFileSync(htmlPath, page)
const profile = join(work, 'profile')
const port = 20000 + Math.floor(Math.random() * 30000)
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: 'ignore' })

const killChrome = () => {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
    else chrome.kill('SIGKILL')
  } catch { /* already gone */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page')
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('chrome did not come up')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) => new Promise((r) => {
    const mid = ++id
    pending.set(mid, r)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  await send('Page.enable')
  await send('Page.navigate', { url: pathToFileURL(htmlPath).href })
  for (let i = 0; i < 80; i++) {
    await sleep(150)
    const r = await send('Runtime.evaluate', { expression: 'window.ready === true', returnByValue: true })
    if (r.result?.result?.value === true) break
  }
  const res = await send('Runtime.evaluate', { expression: 'window.renderAll()', awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
  const data = res.result.result.value
  ws.close()

  const report = readJson(join(HERE, 'report.json'), { items: {} })
  const rows = []
  const ids = [...new Set(Object.keys(data).map((k) => k.split('|')[0]))]
  for (const sid of ids) {
    const m = {}
    for (const ver of ['old', 'new']) {
      const b = Buffer.from(data[`${sid}|${ver}`], 'base64')
      const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4)
      writeWav(join(OUT, `${sid}.${ver}.wav`), [Float32Array.from(f)], SR)
      m[ver] = measure([f], SR)
    }
    const d = Math.round((m.new.momentaryMax - m.old.momentaryMax) * 10) / 10
    rows.push(`${sid.padEnd(16)} old M ${String(m.old.momentaryMax).padStart(6)} TP ${String(m.old.truePeak).padStart(6)} | new M ${String(m.new.momentaryMax).padStart(6)} TP ${String(m.new.truePeak).padStart(6)} | diff ${d > 0 ? '+' : ''}${d} dB`)
    report.items[sid] = {
      kind: 'procedural', file: null,
      target: { momentary: 'old sound ±1 dB at the same call-site gain' },
      qa: { old: m.old, new: m.new, loudnessDiffDb: d }
    }
  }
  report.generated = new Date().toISOString()
  writeFileSync(join(HERE, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(rows.join('\n'))
  console.log(`WAVs → ${OUT}`)
} finally {
  killChrome()
  for (let i = 0; i < 20; i++) {
    await sleep(250)
    try {
      rmSync(work, { recursive: true, force: true })
      break
    } catch { /* profile still locked by the exiting browser */ }
  }
}

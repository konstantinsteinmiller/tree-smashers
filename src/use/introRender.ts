// ─── First-launch intro: the renderer ───────────────────────────────────────
//
// Draws one frame of the film for director time T onto the cutscene canvas.
// Everything comes from the game's own art and draw modules:
//
//   • the arena: the baked stage-1 clearing (introArena.ts — painted backdrop,
//     props, floor, rim, terrain), drawn 1 : 1 on whole device pixels on every
//     hold (two bakes: WIDE and CLOSE — the only two zooms a hold may use);
//   • the trees: drawPaintedTower (healthy → damaged → felled, white flash),
//     the thorn garland (drawTowerThorns), the HP gauges (drawHpGauge);
//   • the smashers: drawSmasherDisc + drawSmasherFrame (painted sheets / rig);
//   • VFX: the tree-hit pool (towerHitFx: splinters, thorn shards, leaf
//     cascades), the skill layer (via the skills gate: shield arc, rockets,
//     bursts, flavour, callout pills).
//
// Determinism: positions are pure functions of T (introStory.ts). The particle
// pools are stepped on a FIXED 120 Hz FX clock from the story's timed events,
// with a seeded random stream; a backwards seek resets them and replays from
// 0. So any frame rate draws the same film.
//
// Perf: no shadowBlur, no gradients, no filters; one or two full-screen blits
// + ~10 sprites + pooled particles per frame. FX.low: WIDE only, no tower /
// skill particles (the game's low-tier rules), no ambient leaves.

import { drawSmasherDisc, drawSmasherFrame, preloadPaintedSmashers } from '@/smashers/smasherAtlas'
import { YAW_FRAMES, YAW_STEP } from '@/smashers/smasherRig'
import { TOWER_FRONT_HALF_ARC, towerFrontAngle } from '@/use/arenaTerrain'
import { THEME_LOOK } from '@/use/arenaThemes'
import { drawHpGauge, newHpGaugeState, type HpGaugeState } from '@/use/hpGauge'
import { introArtImage } from '@/use/introArt'
import { arenaArtKey, bakeArena, preloadIntroArena, THEME, type ArenaBake } from '@/use/introArena'
import {
  AMBIENT_LEAVES, ARENA_R, BEAT, CAST, CHOMPER, GRIZZLE, BRAMBLE, RIM, ROCKETS, SEED, THUMPER,
  SMASHER_R, STORY_EVENTS, TREE_MAX_HP, TREES, VIXIE, cameraAt, fxRate, hash01, overlayAt, smasherAt, treeAt,
  INTRO_SMASHER_IDS, TREE_ROCKET_POINT, LOG_SLAM_BONUS, SLAM_CALLOUT_SPOT,
  type CameraState, type OverlayState, type SmasherState, type StoryEvent, type TreeState
} from '@/use/introStory'
import type { IntroSkillFx, SkillRocketView, SkillVfxBlade, CalloutAnchor } from '@/use/skills/introSkills'
import { drawPaintedTower, preloadTowerArt } from '@/use/towerArt'
import {
  createTowerFx, drawTowerFx, leafCascadeCount, resetTowerFx, spawnLeaves, spawnSplinters, spawnThornShards,
  tickTowerFx, type TowerFx
} from '@/use/towerHitFx'
import { preloadHitFxArt } from '@/use/towerHitFxArt'
import { drawTowerThorns, preloadThornArt } from '@/use/towerThorns'
import { PAINTED_TOWERS } from '@/use/paintedTowers'
import { PAINTED_FLOORS } from '@/use/paintedFloors'
import { FLOOR_KEY } from '@/use/introArena'
import { createRng } from '@/use/useDeterministicRng'

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface IntroDrawOptions {
  /** FX.low — the game's low tier. */
  low: boolean
  /** prefers-reduced-motion. */
  still: boolean
}

export interface IntroRenderer {
  resize: (w: number, h: number, dpr: number, safe: SafeInsets) => void
  /** Draw director time T. `sound`: may skill SFX start this frame. */
  draw: (T: number, sound: boolean) => void
  /** Install / replace the skill layer (null on a skills-off build). */
  setSkillFx: (fx: IntroSkillFx | null) => void
  /** Screen position (css px) of a world point at the current camera. */
  toScreen: (x: number, y: number) => { x: number; y: number }
  /** The CLOSE zoom chosen for this screen (1 = no close shots). */
  readonly closeZoom: number
  dispose: () => void
}

/** Start every request the intro canvas needs (idempotent). */
export const preloadIntroCanvasArt = (): void => {
  preloadIntroArena()
  preloadTowerArt()
  preloadThornArt()
  preloadHitFxArt()
  preloadPaintedSmashers(INTRO_SMASHER_IDS, false)
}

/** Tree team colours of the vector fallback (useSpinnerGame TOWER_TEAM_COLORS). */
const TREE_COLOURS = {
  player: { leaf: '#5fc36a', leafDark: '#2f7d43' },
  npc: { leaf: '#e3664f', leafDark: '#9c3328' }
} as const
const OUTLINE = '#2c2116'
const INK = '#161a40'
const SUN = '#ffd21a'
const CREAM = '#fff4dc'

/** Fixed FX step. */
const FX_HZ = 120
const FX_DT = 1 / FX_HZ
/** The CLOSE zoom never exceeds this (storyboard). */
const CLOSE_MAX = 1.35
/** Painted-sprite upscale limits (towerArt MAX_UPSCALE, arenaFloorArt). */
const TREE_MAX_UPSCALE = 1.02
/** The painted floor is 1024 px for the whole clearing. A match allows it
 *  1.5× (arenaFloorArt); the intro's holds must measure SHARP (blur-probe
 *  ≥ 0.18), which a 1.34× floor did not on a 3× phone (0.17). So the WIDE fit
 *  never upscales it and CLOSE stops at 1.12×. */
const FLOOR_WIDE_UPSCALE = 1
const FLOOR_MAX_UPSCALE = 1.12
/** Props are laid out to here (arenaProps FIELD_HALF). */
const FIELD_HALF = 600
/** What every shot keeps in frame where it can: the clearing, both trees
 *  with their crowns and gauges. WIDE fits this box (a little tighter than a
 *  match's fit, so the trees read big on a phone); the camera is clamped so a
 *  view never leaves it on an axis it can cover. */
const CONTENT = { x0: -215, x1: 215, y0: -268, y1: 262 } as const

type C2D = CanvasRenderingContext2D

export const createIntroRenderer = (ctx: C2D, opts: IntroDrawOptions): IntroRenderer => {
  let W = 1
  let H = 1
  let dpr = 1
  /** css px per world unit at WIDE. */
  let fitCss = 1
  let closeZoom = 1
  let wide: ArenaBake | null = null
  let close: ArenaBake | null = null
  let bakeKey = ''
  let skill: IntroSkillFx | null = null

  // ── VFX state (reset on a backwards seek) ──
  const towerFx: TowerFx = createTowerFx()
  const ambient: TowerFx = createTowerFx(60)
  let rand = createRng(SEED)
  let fxT = 0 // director time the pools are at
  let fxMs = 0 // accumulated FX time (ms)
  let evIdx = 0
  let leafIdx = 0
  let gaugeRed: HpGaugeState = newHpGaugeState(TREE_MAX_HP)
  let gaugeBlue: HpGaugeState = newHpGaugeState(TREE_MAX_HP)

  const cam: CameraState = { x: 0, y: 0, z: 0, push: 1, sx: 0, sy: 0 }
  const ov: OverlayState = {
    captionTree: 0, captionSkills: 0, card: -1, cardIn: 0, title: false, handoff: 0, stonesLit: 0, canopy: 0, iris: -1
  }
  const trees: Record<'red' | 'blue', TreeState> = {
    red: { grow: 0, sx: 1, sy: 1, alpha: 0, hp: TREE_MAX_HP, flash: 0, thorns: 0, gauge: 0, wob: 0 },
    blue: { grow: 0, sx: 1, sy: 1, alpha: 0, hp: TREE_MAX_HP, flash: 0, thorns: 0, gauge: 0, wob: 0 }
  }
  const sm: SmasherState[] = CAST.map(() => ({
    x: 0, y: 0, h: 0, sy: 1, alpha: 0, rot: 0, yaw: 0, flash: 0, shield: 0, trail: 0, vx: 0, vy: 0
  }))
  const anchors: CalloutAnchor[] = CAST.map(c => ({ id: c.id + 1, x: c.home.x, y: c.home.y, radius: SMASHER_R }))
  /** The Log Slam pill's own spot beside the felled tree (camera-relative). */
  const slamAnchor: CalloutAnchor = { id: 98, x: 0, y: 0, radius: SMASHER_R }
  const blades: SkillVfxBlade[] = CAST.map(c => ({
    id: c.id + 1, x: 0, y: 0, radius: SMASHER_R, hp: 1, owner: c.side,
    skills: { has: 0, shield: 0, shieldMax: 1, phasedUntil: 0 }
  }))
  const rocketTargets = ROCKETS.map(() => ({ x: 0, y: 0 }))
  const rockets: SkillRocketView[] = ROCKETS.map((r, i) => ({
    active: false, owner: 'player' as const, x0: 0, y0: 0, target: rocketTargets[i]!, startAt: r.at * 1000, arriveAt: r.arrive * 1000
  }))
  /** Landing / pop rings: start time + place (stateless draw by age). */
  const rings: { T: number; x: number; y: number; r: number; tone: string }[] = []
  for (const e of STORY_EVENTS) {
    if (e.kind === 'land') rings.push({ T: e.T, x: e.x, y: e.y + SMASHER_R * 0.35, r: SMASHER_R * 1.25, tone: CREAM })
    if (e.kind === 'treePop') rings.push({ T: e.T + 0.12, x: e.x, y: e.y + TREES.red.r * 1.1, r: TREES.red.r * 1.5, tone: CREAM })
  }
  /** Impact stars (flat four-point stars). */
  const stars: { T: number; x: number; y: number; s: number }[] = []
  for (const e of STORY_EVENTS) {
    if (e.kind === 'shieldAbsorb') stars.push({ T: e.T, x: e.x, y: e.y, s: 18 })
    if (e.kind === 'rocketTree') stars.push({ T: e.T, x: e.x, y: e.y, s: 16 })
    if (e.kind === 'slam') stars.push({ T: e.T, x: e.x, y: e.y, s: 34 })
  }

  const resetFx = (): void => {
    resetTowerFx(towerFx)
    resetTowerFx(ambient)
    skill?.reset()
    rand = createRng(SEED)
    fxT = 0
    fxMs = 0
    evIdx = 0
    leafIdx = 0
    gaugeRed = newHpGaugeState(TREE_MAX_HP)
    gaugeBlue = newHpGaugeState(TREE_MAX_HP)
  }

  // ── Camera → device transform ──
  const zoomOf = (c: CameraState): number => (1 + (closeZoom - 1) * c.z) * c.push
  const devPerUnit = (z: number): number => fitCss * dpr * z

  /** Keep the view inside CONTENT on each axis it can (centre it on an axis
   *  it cannot). Shake (sx, sy) is applied on top. */
  const clampCam = (c: CameraState): void => {
    const u = devPerUnit(zoomOf(c))
    const hw = (W * dpr) / 2 / u
    const hh = (H * dpr) / 2 / u
    c.x = 2 * hw >= CONTENT.x1 - CONTENT.x0 ? (CONTENT.x0 + CONTENT.x1) / 2 : Math.max(CONTENT.x0 + hw, Math.min(CONTENT.x1 - hw, c.x))
    c.y = 2 * hh >= CONTENT.y1 - CONTENT.y0 ? (CONTENT.y0 + CONTENT.y1) / 2 : Math.max(CONTENT.y0 + hh, Math.min(CONTENT.y1 - hh, c.y))
  }

  const pickCloseZoom = (): number => {
    if (opts.low || opts.still) return 1
    const dev = fitCss * dpr
    let zc = CLOSE_MAX
    if (PAINTED_TOWERS) zc = Math.min(zc, (PAINTED_TOWERS.ref.halfW * TREE_MAX_UPSCALE) / (TREES.red.r * 1.2) / dev)
    const floor = PAINTED_FLOORS[FLOOR_KEY]
    if (floor) zc = Math.min(zc, (floor.size * FLOOR_MAX_UPSCALE) / (2 * ARENA_R) / dev)
    return zc < 1.06 ? 1 : zc
  }

  /** World rect each bake must cover: the union of what the camera sees
   *  while it uses that bake, sampled over the film. */
  const bakeRects = () => {
    const zMid = 1 + (closeZoom - 1) * 0.5
    const r = {
      wide: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      close: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    }
    const c: CameraState = { x: 0, y: 0, z: 0, push: 1, sx: 0, sy: 0 }
    for (let T = 0; T <= BEAT.title + 1e-9; T += 0.02) {
      cameraAt(T, c, opts.still)
      clampCam(c)
      const z = zoomOf(c)
      const u = devPerUnit(z)
      const hw = (W * dpr) / 2 / u + 10
      const hh = (H * dpr) / 2 / u + 10
      const box = closeZoom > 1 && z >= zMid ? r.close : r.wide
      box.x0 = Math.min(box.x0, c.x - hw)
      box.x1 = Math.max(box.x1, c.x + hw)
      box.y0 = Math.min(box.y0, c.y - hh)
      box.y1 = Math.max(box.y1, c.y + hh)
    }
    const clampBox = (b: typeof r.wide) => ({
      x0: Math.max(-FIELD_HALF, b.x0), y0: Math.max(-FIELD_HALF, b.y0),
      x1: Math.min(FIELD_HALF, b.x1), y1: Math.min(FIELD_HALF, b.y1)
    })
    return { wide: clampBox(r.wide), close: Number.isFinite(r.close.x0) ? clampBox(r.close) : null }
  }

  const ensureBakes = (): void => {
    const key = `${W}x${H}@${dpr}:${closeZoom}:${arenaArtKey()}`
    if (key === bakeKey) return
    bakeKey = key
    const rects = bakeRects()
    const uw = devPerUnit(1)
    wide = bakeArena(uw, rects.wide.x0, rects.wide.y0, rects.wide.x1, rects.wide.y1, wide)
    if (rects.close && closeZoom > 1) {
      const uc = devPerUnit(closeZoom)
      close = bakeArena(uc, rects.close.x0, rects.close.y0, rects.close.x1, rects.close.y1, close)
    } else if (close) {
      close.canvas.width = 1
      close.canvas.height = 1
      close = null
    }
  }

  /** Does bake `b` cover everything the camera sees at `u`? */
  const covers = (b: ArenaBake, c: CameraState, u: number): boolean => {
    const hw = (W * dpr) / 2 / u
    const hh = (H * dpr) / 2 / u
    const x = c.x + c.sx
    const y = c.y + c.sy
    return x - hw >= b.x0 && y - hh >= b.y0 && x + hw <= b.x0 + b.w / b.u && y + hh <= b.y0 + b.h / b.u
  }

  const blit = (b: ArenaBake, u: number, ox: number, oy: number): void => {
    if (Math.abs(b.u - u) < 1e-6) {
      // 1 : 1 on whole device pixels (x0 · u is a whole number).
      ctx.drawImage(b.canvas as CanvasImageSource, ox + Math.round(b.x0 * u), oy + Math.round(b.y0 * u))
      return
    }
    const k = u / b.u
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(b.canvas as CanvasImageSource, ox + b.x0 * u, oy + b.y0 * u, b.w * k, b.h * k)
  }

  // ── VFX clock ──
  const towerHitNormal = (x: number, y: number) => {
    const d = Math.hypot(x - TREES.red.x, y - TREES.red.y) || 1
    return { nx: (x - TREES.red.x) / d, ny: (y - TREES.red.y) / d }
  }

  const fireEvent = (e: StoryEvent, sound: boolean): void => {
    const low = opts.low
    const nowMs = e.T * 1000
    switch (e.kind) {
      case 'treePop':
        if (!low) spawnLeaves(towerFx, e.x, e.y, TREES.red.r, 9, 0, rand)
        break
      case 'shieldAbsorb':
        skill?.fire({
          kind: 'shield_absorb', effect: 'guard_shell', key: 'bear_hug', owner: 'player',
          bladeId: GRIZZLE + 1, x: e.x, y: e.y, value: e.value
        }, anchors[GRIZZLE]!, nowMs, sound)
        break
      case 'volley':
        skill?.fire({
          kind: 'rocket_volley', effect: 'homing_rockets', key: 'thorn_volley', owner: 'player',
          bladeId: BRAMBLE + 1, x: e.x, y: e.y, value: e.value
        }, anchors[BRAMBLE]!, nowMs, sound)
        break
      case 'rocketHit':
        skill?.fire({
          kind: 'rocket_hit', effect: 'homing_rockets', key: 'thorn_volley', owner: 'player',
          bladeId: VIXIE + 1, x: sm[VIXIE]!.x, y: sm[VIXIE]!.y, value: e.value
        }, anchors[VIXIE]!, nowMs, sound)
        break
      case 'rocketTree': {
        skill?.fire({
          kind: 'rocket_hit', effect: 'homing_rockets', key: 'thorn_volley', owner: 'player',
          bladeId: 99, x: e.x, y: e.y, value: e.value
        }, anchors[BRAMBLE]!, nowMs, false)
        if (!low) {
          const n = towerHitNormal(TREE_ROCKET_POINT.x, TREE_ROCKET_POINT.y)
          spawnSplinters(towerFx, e.x, e.y, n.nx, n.ny, TREES.red.r, 12, rand)
          spawnLeaves(towerFx, TREES.red.x, TREES.red.y, TREES.red.r, leafCascadeCount(1), 0.1, rand)
        }
        break
      }
      case 'slam': {
        skill?.fire({
          kind: 'tower', effect: 'tower_breaker', key: 'log_slam', owner: 'player',
          bladeId: CHOMPER + 1, x: e.x, y: e.y, value: LOG_SLAM_BONUS
        }, slamAnchor, nowMs, sound)
        if (!low) {
          const n = towerHitNormal(e.x, e.y)
          spawnSplinters(towerFx, e.x, e.y, n.nx, n.ny, TREES.red.r, 24, rand)
          spawnThornShards(towerFx, e.x, e.y, n.nx, n.ny, TREES.red.r, 10, rand)
          spawnLeaves(towerFx, TREES.red.x, TREES.red.y, TREES.red.r, leafCascadeCount(3), 0.45, rand)
        }
        break
      }
      default:
        break
    }
  }

  /** Step the pools from fxT to T on the fixed clock, firing the events. */
  const stepFx = (T: number, sound: boolean): void => {
    if (T < fxT - 1e-6) resetFx()
    // A long jump (seek) replays silently.
    const catchingUp = T - fxT > 0.3
    while (fxT < T - 1e-9) {
      const next = Math.min(T, fxT + FX_DT)
      while (evIdx < STORY_EVENTS.length && STORY_EVENTS[evIdx]!.T <= next + 1e-9) {
        const e = STORY_EVENTS[evIdx]!
        // Positions this event reads (Vixie on a rocket hit) at its own time.
        if (e.kind === 'rocketHit') smasherAt(VIXIE, e.T, sm[VIXIE]!, opts.still)
        fireEvent(e, sound && !catchingUp)
        evIdx++
      }
      while (!opts.low && leafIdx < AMBIENT_LEAVES.length && AMBIENT_LEAVES[leafIdx]!.T <= next + 1e-9) {
        const l = AMBIENT_LEAVES[leafIdx]!
        spawnLeaves(ambient, l.x, l.y, 26, 1, hash01(SEED + 7, leafIdx) < 0.25 ? 1 : 0, rand)
        leafIdx++
      }
      const ms = (next - fxT) * 1000 * fxRate(fxT)
      if (ms > 0) {
        tickTowerFx(towerFx, ms)
        tickTowerFx(ambient, ms)
        skill?.tick(ms)
        fxMs += ms
      }
      fxT = next
    }
  }

  // ── Drawing helpers (world units) ──
  const vectorTree = (side: 'player' | 'npc', r: number, hp: number): void => {
    const c = TREE_COLOURS[side]
    ctx.strokeStyle = OUTLINE
    if (hp <= 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.beginPath()
      ctx.arc(3, 4, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#8a5a35'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#e8c48a'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.beginPath()
    ctx.arc(3, 5, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.fillStyle = '#7a4f2c'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = c.leafDark
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, r * 0.42, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillStyle = c.leaf
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.beginPath()
    ctx.arc(-r * 0.22, -r * 0.24, r * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawTree = (key: 'red' | 'blue', nowMs: number): void => {
    const tr = TREES[key]
    const s = trees[key]
    if (s.grow <= 0 || s.alpha <= 0) return
    const groundY = tr.y + tr.r * 1.2
    ctx.save()
    ctx.globalAlpha = s.alpha
    ctx.translate(tr.x + s.wob, groundY)
    ctx.scale(s.grow * s.sx, s.grow * s.sy)
    ctx.translate(-tr.x, -groundY)
    if (!drawPaintedTower(ctx, tr.side, tr.x, tr.y, tr.r, s.hp, TREE_MAX_HP, s.flash)) {
      ctx.save()
      ctx.translate(tr.x, tr.y)
      vectorTree(tr.side, tr.r, s.hp)
      if (s.flash > 0.05 && s.hp > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(s.flash * 0.45).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(0, 0, tr.r * 0.95, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    if (s.thorns > 0 && s.hp > 0) {
      ctx.save()
      ctx.translate(tr.x, tr.y)
      drawTowerThorns(ctx, tr.r, towerFrontAngle(tr), TOWER_FRONT_HALF_ARC * s.thorns)
      ctx.restore()
    }
    ctx.restore()
    if (s.gauge > 0.01) {
      ctx.save()
      ctx.globalAlpha = s.gauge
      const r = tr.r * 1.42
      drawHpGauge(ctx, key === 'red' ? gaugeRed : gaugeBlue, tr.x, tr.y, r, r, s.hp, TREE_MAX_HP,
        tr.side === 'player', tr.y > 0 ? -1 : 1, nowMs)
      ctx.restore()
    }
  }

  const drawSmasher = (i: number, devScale: number): void => {
    const c = CAST[i]!
    const s = sm[i]!
    if (s.alpha <= 0.001) return
    const r = SMASHER_R
    ctx.save()
    ctx.globalAlpha = s.alpha
    // Motion trail: three ghost discs behind the dash (flat, no blur).
    if (s.trail > 0 && !opts.low) {
      const d = Math.hypot(s.vx, s.vy) || 1
      const ux = s.vx / d
      const uy = s.vy / d
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = s.alpha * s.trail * (0.34 - k * 0.08)
        drawSmasherDisc(ctx, s.x - ux * k * r * 0.55, s.y - uy * k * r * 0.55, r, s.rot, RIM[c.side], devScale, false)
      }
      ctx.globalAlpha = s.alpha
    }
    // Ground shadow while airborne (the disc draws its own once landed).
    const air = s.h > 0.5
    if (air) {
      const k = Math.max(0.45, 1 - s.h / 120)
      ctx.fillStyle = 'rgba(20, 12, 6, 0.24)'
      ctx.beginPath()
      ctx.ellipse(s.x + r * 0.1, s.y + r * 0.22, r * 1.02 * k, r * 0.56 * k, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const y = s.y - s.h
    ctx.translate(s.x, y)
    if (s.sy !== 1) ctx.scale(2 - s.sy, s.sy)
    drawSmasherDisc(ctx, 0, 0, r, s.rot, RIM[c.side], devScale, !air)
    const frame = ((Math.round(s.yaw / YAW_STEP) % YAW_FRAMES) + YAW_FRAMES) % YAW_FRAMES
    drawSmasherFrame(ctx, c.smasherId, undefined, false, frame, 0, 0, r, devScale)
    if (s.flash > 0.02) {
      ctx.globalAlpha = s.alpha * s.flash * 0.6
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.55, r * 0.9, r * 1.15, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const drawRings = (T: number): void => {
    for (const g of rings) {
      const age = T - g.T
      if (age < 0 || age > 0.42) continue
      const u = age / 0.42
      ctx.globalAlpha = (1 - u) * 0.85
      ctx.strokeStyle = g.tone
      ctx.lineWidth = 3 * (1 - u) + 1
      ctx.beginPath()
      ctx.ellipse(g.x, g.y, g.r * (0.5 + u * 0.8), g.r * 0.42 * (0.5 + u * 0.8), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const drawStars = (T: number): void => {
    for (const s of stars) {
      const age = T - s.T
      if (age < 0 || age > 0.3) continue
      const u = age / 0.3
      const k = s.s * (0.6 + 0.6 * Math.sin(Math.min(1, u * 2) * Math.PI * 0.5)) * (1 - u * 0.4)
      ctx.globalAlpha = 1 - u * u
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(u * 0.6)
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const rr = i % 2 === 0 ? k : k * 0.32
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.lineWidth = 2.2
      ctx.strokeStyle = INK
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const rr = (i % 2 === 0 ? k : k * 0.32) * 0.55
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fillStyle = SUN
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  /** The game's aim dots, during Chomper's pull-back. */
  const drawAim = (T: number): void => {
    const a = Math.min((T - (BEAT.skill3 + 0.05)) / 0.3, 1 - (T - BEAT.launch) / 0.12)
    if (a <= 0) return
    const s = sm[CHOMPER]!
    const tx = TREES.red.x
    const ty = TREES.red.y + TREES.red.r
    const dx = tx - s.x
    const dy = ty - s.y
    const d = Math.hypot(dx, dy) || 1
    const n = 7
    ctx.globalAlpha = Math.min(1, a)
    for (let k = 1; k <= n; k++) {
      const f = (k / (n + 1)) * Math.min(1, (d - SMASHER_R * 1.4) / d)
      const x = s.x + dx * f
      const y = s.y + dy * f
      const rr = 3.4 - k * 0.22
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(x, y, rr + 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Rockets without the skill module (skills-off build): flat darts. */
  const drawFallbackRockets = (T: number): void => {
    for (const r of rockets) {
      if (!r.active || !r.target) continue
      const u = (T * 1000 - r.startAt) / (r.arriveAt - r.startAt)
      const x = r.x0 + (r.target.x - r.x0) * u
      const y = r.y0 + (r.target.y - r.y0) * u - Math.sin(u * Math.PI) * 24
      ctx.fillStyle = SUN
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // ── Screen-space layers (css px) ──
  /** Beat 1: the leafy canopy corners parting outward. */
  const drawCanopy = (): void => {
    const p = ov.canopy
    if (p >= 1) return
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const diag = Math.hypot(W, H)
    const img = introArtImage('canopy', 'corner')
    const size = Math.max(W, H) * 0.62
    ctx.globalAlpha = 1 - p * p * p
    for (let c = 0; c < 4; c++) {
      const fx = c % 2 === 0 ? -1 : 1
      const fy = c < 2 ? -1 : 1
      const off = p * diag * 0.45
      const cx = (fx < 0 ? 0 : W) + fx * off * 0.7
      const cy = (fy < 0 ? 0 : H) + fy * off * 0.7
      ctx.save()
      ctx.translate(Math.round(cx), Math.round(cy))
      ctx.scale(-fx, -fy)
      if (img) {
        // never upscaled: at most the file's own pixels
        const k = Math.min(size / img.naturalWidth, img.naturalWidth / dpr / img.naturalWidth)
        ctx.drawImage(img, 0, 0, img.naturalWidth * k, img.naturalHeight * k)
      } else {
        vectorCanopy(size, c)
      }
      ctx.restore()
    }
    ctx.restore()
  }

  /** Vector canopy corner: overlapping flat leaves, navy outline, three greens. */
  const LEAF_TONES = ['#2f7d43', '#3f9a4c', '#5fc36a'] as const
  const vectorCanopy = (size: number, corner: number): void => {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = INK
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = LEAF_TONES[layer]!
      const n = 7 - layer
      for (let i = 0; i < n; i++) {
        const h1 = hash01(corner * 31 + layer, i)
        const h2 = hash01(corner * 17 + layer + 5, i)
        const a = (i / n) * (Math.PI / 2) + (h1 - 0.5) * 0.3
        const dist = size * (0.08 + 0.42 * (1 - layer * 0.28) * (0.5 + h2 * 0.5))
        const x = Math.cos(a) * dist
        const y = Math.sin(a) * dist
        const len = size * (0.2 - layer * 0.035) * (0.8 + h1 * 0.4)
        const rot = a + (h2 - 0.5) * 0.8
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.moveTo(-len * 0.5, 0)
        ctx.quadraticCurveTo(0, -len * 0.42, len * 0.5, 0)
        ctx.quadraticCurveTo(0, len * 0.42, -len * 0.5, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        // midrib
        ctx.beginPath()
        ctx.moveTo(-len * 0.42, 0)
        ctx.lineTo(len * 0.4, 0)
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.lineWidth = 2.5
        ctx.restore()
      }
    }
  }

  /** The cartoon iris closing on the felled tree. */
  const drawIris = (): void => {
    if (ov.iris < 0) return
    const p = toScreen(TREES.red.x, TREES.red.y)
    const far = Math.hypot(Math.max(p.x, W - p.x), Math.max(p.y, H - p.y))
    const r = Math.max(0, ov.iris * far)
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    if (r > 0.5) ctx.arc(p.x, p.y, r, 0, Math.PI * 2, true)
    ctx.fillStyle = INK
    ctx.fill('evenodd')
    if (r > 0.5) {
      ctx.lineWidth = 6
      ctx.strokeStyle = SUN
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ── Frame ──
  let curU = 1
  let curOx = 0
  let curOy = 0

  const toScreen = (x: number, y: number) => ({ x: (curOx + x * curU) / dpr, y: (curOy + y * curU) / dpr })

  const draw = (T: number, sound: boolean): void => {
    const nowMs = T * 1000
    overlayAt(T, ov)
    // From the title card on, the canvas is clear (the DOM card and then the
    // live arena show).
    if (T >= BEAT.title) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, Math.round(W * dpr), Math.round(H * dpr))
      return
    }
    ensureBakes()
    cameraAt(T, cam, opts.still)
    clampCam(cam)
    // State of the scene at T (positions are pure functions of T).
    treeAt('red', T, trees.red, opts.still)
    treeAt('blue', T, trees.blue, opts.still)
    for (let i = 0; i < CAST.length; i++) smasherAt(i, T, sm[i]!, opts.still)
    // Callout anchors are CAMERA-relative: the pills are drawn around the
    // camera centre, so their on-screen clamp (renderSkillCallouts) holds.
    for (let i = 0; i < CAST.length; i++) {
      const a = anchors[i]!
      a.x = sm[i]!.x - cam.x
      a.y = sm[i]!.y - sm[i]!.h - cam.y
    }
    slamAnchor.x = SLAM_CALLOUT_SPOT.x - cam.x
    slamAnchor.y = SLAM_CALLOUT_SPOT.y - cam.y
    stepFx(T, sound)
    // These may have been moved by the event replay — re-sample.
    smasherAt(VIXIE, T, sm[VIXIE]!, opts.still)

    const z = zoomOf(cam)
    const u = devPerUnit(z)
    const ox = Math.round((W * dpr) / 2 - (cam.x + cam.sx) * u)
    const oy = Math.round((H * dpr) / 2 - (cam.y + cam.sy) * u)
    curU = u
    curOx = ox
    curOy = oy

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = THEME_LOOK[THEME].backdrop
    ctx.fillRect(0, 0, Math.round(W * dpr), Math.round(H * dpr))
    const useClose = close !== null && z >= 1 + (closeZoom - 1) * 0.5 - 1e-6
    if (wide && (!useClose || !covers(close!, cam, u))) blit(wide, u, ox, oy)
    if (useClose) blit(close!, u, ox, oy)

    ctx.setTransform(u, 0, 0, u, ox, oy)
    // trees (behind everything that moves), then rings on the ground
    drawTree('red', nowMs)
    drawTree('blue', nowMs)
    drawRings(T)
    drawAim(T)
    // smashers, back to front
    const order = [THUMPER, VIXIE, GRIZZLE, BRAMBLE, CHOMPER].sort((a, b) => (sm[a]!.y - sm[b]!.y))
    for (const i of order) {
      drawSmasher(i, u)
      if (skill && i === GRIZZLE) {
        const s = sm[GRIZZLE]!
        const b = blades[GRIZZLE]!
        b.x = s.x
        b.y = s.y - s.h
        b.skills!.has = s.shield > 0 ? 2 : 0
        b.skills!.shield = s.shield
        ctx.globalAlpha = 1
        skill.drawShield(ctx, b, nowMs)
      }
    }
    // tree-hit particles + ambient leaves
    drawTowerFx(ctx, towerFx)
    drawTowerFx(ctx, ambient)
    // rockets (Thorn Volley)
    const br = sm[BRAMBLE]!
    for (let k = 0; k < ROCKETS.length; k++) {
      const r = ROCKETS[k]!
      const rv = rockets[k]!
      rv.active = T >= r.at && T < r.arrive
      rv.x0 = br.x
      rv.y0 = br.y - SMASHER_R * 0.6
      const tgt = rocketTargets[k]!
      if (r.target >= 0) {
        tgt.x = sm[r.target]!.x
        tgt.y = sm[r.target]!.y
      } else {
        tgt.x = TREE_ROCKET_POINT.x
        tgt.y = TREE_ROCKET_POINT.y
      }
    }
    for (let i = 0; i < CAST.length; i++) {
      const b = blades[i]!
      b.x = sm[i]!.x
      b.y = sm[i]!.y - sm[i]!.h
      b.hp = sm[i]!.alpha > 0 ? 1 : 0
    }
    if (skill) skill.drawLayer(ctx, rockets, blades, nowMs)
    else drawFallbackRockets(T)
    drawStars(T)
    if (skill) {
      const px = dpr / u
      ctx.setTransform(u, 0, 0, u, ox + cam.x * u, oy + cam.y * u)
      skill.drawCallouts(ctx, nowMs, px, (W / 2) * px, (H / 2) * px)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    drawCanopy()
    drawIris()
  }

  const resize = (w: number, h: number, d: number, s: SafeInsets): void => {
    W = Math.max(1, w)
    H = Math.max(1, h)
    dpr = d
    void s
    fitCss = Math.min(W / (CONTENT.x1 - CONTENT.x0), H / (CONTENT.y1 - CONTENT.y0))
    const floor = PAINTED_FLOORS[FLOOR_KEY]
    if (floor) fitCss = Math.min(fitCss, (floor.size * FLOOR_WIDE_UPSCALE) / (2 * ARENA_R) / dpr)
    closeZoom = pickCloseZoom()
    bakeKey = ''
  }

  return {
    resize,
    draw,
    setSkillFx: (fx) => {
      skill = fx
      resetFx()
    },
    toScreen,
    get closeZoom() {
      return closeZoom
    },
    dispose: () => {
      for (const b of [wide, close]) {
        if (b) {
          b.canvas.width = 1
          b.canvas.height = 1
        }
      }
      wide = null
      close = null
    }
  }
}

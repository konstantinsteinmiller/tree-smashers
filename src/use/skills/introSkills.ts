// ─── First-launch intro: the skill showcase adapter ─────────────────────────
//
// The intro shows three real smasher skills with the battle's OWN skill VFX
// (skillVfx: shield arc, rockets, impact bursts, the smasher's flavour
// particles), its callout pills (skillCallouts) and its skill sounds
// (skillSfx). Reached ONLY through the skills gate (loadIntroSkills in
// src/skills/skillsGate.ts): a skills-off build never loads it and the intro
// plays without the skill layer.
//
// Determinism: the VFX pools take their randomness from Math.random (it is
// never gameplay). The intro is a deterministic film, so every spawn runs with
// Math.random swapped for the intro's seeded stream for exactly that
// synchronous call. Time is the intro's own FX clock in ms (never
// performance.now), so a seek / replay draws the same pills and particles.
//
// Sound: the skill SFX player is swapped for a gated one while the intro
// lives — no cue is ever started on a suspended AudioContext.

import type { SkillId } from '@/types/skills'
import {
  createSkillVfx,
  renderBladeSkillFx,
  renderSkillFlavour,
  renderSkillLayer,
  resetSkillVfx,
  skillVfxEvent,
  tickSkillVfx,
  type SkillEvent,
  type SkillEventKind,
  type SkillRocketView,
  type SkillVfxBlade
} from '@/use/skills/skillVfx'
import {
  createSkillCallouts,
  pushSkillCallout,
  renderSkillCallouts,
  resetSkillCallouts,
  type CalloutAnchor,
  type Translate
} from '@/use/skills/skillCallouts'
import { drawSmasherSkillIcon } from '@/use/skills/smasherSkillArt'
import { requestSkillBattleSfx, setSkillSfxPlayer } from '@/use/skills/skillSfx'
import type { SoundHandle } from '@/use/useSound'

export type { SkillRocketView, SkillVfxBlade, CalloutAnchor }

export interface IntroSkillFire {
  kind: SkillEventKind
  effect: SkillId
  key: string
  owner: 'player' | 'npc'
  bladeId: number
  x: number
  y: number
  value: number
  mult?: number
}

export interface IntroSkillFx {
  /** Drop every live effect and pill (a seek back replays from 0). */
  reset: () => void
  /** Advance the pools by `dtMs` of FX time. */
  tick: (dtMs: number) => void
  /** A skill proc: VFX + its sound (when `sound`) + its callout pill. */
  fire: (e: IntroSkillFire, anchor: CalloutAnchor, nowMs: number, sound: boolean) => void
  /** Guard Shell arc (call after the smasher is drawn). */
  drawShield: (ctx: CanvasRenderingContext2D, blade: SkillVfxBlade, nowMs: number) => void
  /** Rings, shards, bursts, rockets + the flavour particles. */
  drawLayer: (ctx: CanvasRenderingContext2D, rockets: readonly SkillRocketView[], blades: readonly SkillVfxBlade[], nowMs: number) => void
  /** Callout pills; world transform, `px` = world units per css px. */
  drawCallouts: (ctx: CanvasRenderingContext2D, nowMs: number, px: number, halfW: number, halfH: number) => void
  /** The skill's medallion (DOM card fallback uses SkillIcon). */
  drawIcon: (ctx: CanvasRenderingContext2D, key: string, effect: SkillId, x: number, y: number, size: number) => void
  setLabels: (t: Translate, locale: string) => void
  dispose: () => void
}

type Player = (name: string, ratio: number, offsetSec?: number, rate?: number) => SoundHandle | null

const notStunned = (): boolean => false

export const createIntroSkillFx = (opts: {
  t: Translate
  locale: string
  rand: () => number
  low: boolean
  /** May a sound start right now (AudioContext running, not muted)? */
  soundOk: () => boolean
  playSound: Player
}): IntroSkillFx => {
  const fx = createSkillVfx()
  const callouts = createSkillCallouts()
  let t = opts.t
  let locale = opts.locale
  let soundNow = false
  let seq = 0
  const ev: SkillEvent = {
    seq: 0, t: 0, kind: 'momentum', skill: 'momentum', bladeId: 0, syncKey: 0,
    owner: 'player', x: 0, y: 0, value: 0, key: ''
  }
  // Skill sounds only when this call allows it AND the context runs.
  setSkillSfxPlayer((name, ratio, offsetSec, rate) =>
    soundNow && opts.soundOk() ? opts.playSound(name, ratio, offsetSec ?? 0, rate ?? 1) : null)
  requestSkillBattleSfx()

  const withRand = <R>(fn: () => R): R => {
    const real = Math.random
    Math.random = opts.rand
    try {
      return fn()
    } finally {
      Math.random = real
    }
  }

  return {
    reset: () => {
      resetSkillVfx(fx)
      resetSkillCallouts(callouts)
    },
    tick: (dtMs) => {
      if (dtMs > 0) tickSkillVfx(fx, dtMs)
    },
    fire: (e, anchor, nowMs, sound) => {
      seq++
      ev.seq = seq
      ev.t = nowMs
      ev.kind = e.kind
      ev.skill = e.effect
      ev.bladeId = e.bladeId
      ev.syncKey = e.bladeId
      ev.owner = e.owner
      ev.x = e.x
      ev.y = e.y
      ev.value = e.value
      ev.key = e.key
      soundNow = sound
      try {
        withRand(() => skillVfxEvent(fx, ev, opts.low))
      } finally {
        soundNow = false
      }
      pushSkillCallout(callouts, {
        kind: e.kind, effect: e.effect, key: e.key, value: e.value, mult: e.mult, side: e.owner
      }, anchor, nowMs, t, locale)
    },
    drawShield: (ctx, blade, nowMs) => renderBladeSkillFx(ctx, fx, blade, nowMs, opts.low),
    drawLayer: (ctx, rockets, blades, nowMs) => {
      renderSkillLayer(ctx, fx, rockets, blades, notStunned, nowMs, opts.low)
      renderSkillFlavour(ctx, fx)
    },
    drawCallouts: (ctx, nowMs, px, halfW, halfH) =>
      renderSkillCallouts(ctx, callouts, nowMs, px, halfW, halfH, opts.low),
    drawIcon: (ctx, key, effect, x, y, size) => drawSmasherSkillIcon(ctx, key, effect, x, y, size),
    setLabels: (nt, nl) => {
      t = nt
      locale = nl
    },
    dispose: () => {
      setSkillSfxPlayer(null)
      resetSkillVfx(fx)
      resetSkillCallouts(callouts)
    }
  }
}

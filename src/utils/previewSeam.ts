// ─── window.__chaos — the preview recorder's scripting seam ─────────────────
//
// `tools/preview-video/` drives a real match from Node to produce portal
// preview clips. It needs to put the game in an exact state, fire exact
// launches, and read back what happened — the same seam an e2e suite would
// want. That is all this file is.
//
// DEV-ONLY, TWICE OVER. `SpinnerArena.vue` installs it from inside an
// `if (import.meta.env.DEV)` block via a DYNAMIC import, so a production
// build neither calls it nor pulls the module into the entry graph — Vite
// replaces the literal with `false` and Rollup drops the whole branch,
// import included. (A static import would keep this in every portal bundle
// even though nothing ever calls it; see the provider static-import trap
// this project has been bitten by before.)
//
// ── Coordinates are GAME UNITS, never pixels ──
//
// The arena is a fixed -ARENA_RADIUS..+ARENA_RADIUS box that the renderer
// scales to fit the short side of whatever viewport it gets. Scripting in
// game units means ONE beat sheet plays identically at 720x1280 and at
// 1920x1080; scripting in pixels would need a different script per
// orientation and would drift the moment a layout constant changed.
//
// ── The launch is a slingshot ──
//
// `releaseDrag` fires the blade OPPOSITE the drag vector, at a force of
// `|drag| / MAX_PULL_DISTANCE` (clamped to 1, and boosted near a wall). So
// to send a blade along `angle` at `power`, the pointer has to be dragged
// from the blade to `blade - dir * power * MAX_PULL_DISTANCE`. `aim()` does
// that arithmetic; `fire()` releases.
//
// Aiming is deliberately split into aim/fire rather than one `launch()`
// call, because the pull-back is the only thing on screen between two
// collisions and the clip needs to SHOW it. A scenario aims, waits ~600 ms
// of virtual time so the slingshot line is visible, then fires.

import { watch, type Ref } from 'vue'
import type { GamePhase, GameResult, SpinnerState } from '@/types/spinner'

/** Everything `SpinnerArena.vue` has to hand the seam. Passing it in keeps
 *  this module free of composable imports, so it pulls nothing else into the
 *  graph and cannot cause an import cycle with `useMatch`/`useModels`. */
export interface PreviewSeamDeps {
  phase: Ref<GamePhase>
  gameResult: Ref<GameResult>
  playerBlades: Ref<SpinnerState[]>
  npcBlades: Ref<SpinnerState[]>
  currentStageId: Ref<number>
  stageReinitSignal: Ref<number>
  arenaRadius: number
  maxPullDistance: number
  beginDrag: (x: number, y: number) => void
  updateDrag: (x: number, y: number) => void
  releaseDrag: () => void
  beginBattle: () => void | Promise<void>
  reinit: () => void
  seedRng: (seed: number) => void
  startPhysics: () => void
  stopPhysics: () => void
  stageKey: string
}

export interface BladeSnapshot {
  id: number
  owner: 'player' | 'npc'
  x: number
  y: number
  hp: number
  maxHp: number
  dead: boolean
  isBoss: boolean
}

export interface PreviewSnapshot {
  phase: GamePhase
  result: GameResult
  stage: number
  player: BladeSnapshot[]
  npc: BladeSnapshot[]
  /** Living blades per side — the whole "who is winning" read in one line. */
  alive: { player: number; npc: number }
}

const snap = (b: SpinnerState): BladeSnapshot => ({
  id: b.id,
  owner: b.owner,
  x: Math.round(b.x * 10) / 10,
  y: Math.round(b.y * 10) / 10,
  hp: Math.round(b.hp * 10) / 10,
  maxHp: Math.round(b.maxHp * 10) / 10,
  dead: b.hp <= 0,
  isBoss: !!b.isBoss
})

export const installPreviewSeam = (deps: PreviewSeamDeps): (() => void) => {
  const living = (list: SpinnerState[]) => list.filter(b => b.hp > 0)

  /** Resolve a blade by side + index among the LIVING blades of that side.
   *  Indexing the living subset (not the raw array) is what lets a beat sheet
   *  say "the front blade" and keep meaning it after one of them dies. */
  const pick = (side: 'player' | 'npc', index: number): SpinnerState | null => {
    const list = living(side === 'player' ? deps.playerBlades.value : deps.npcBlades.value)
    return list[index] ?? null
  }

  const api = {
      // ── Read ────────────────────────────────────────────────────────────
      snapshot(): PreviewSnapshot {
        return {
          phase: deps.phase.value,
          result: deps.gameResult.value,
          stage: deps.currentStageId.value,
          player: deps.playerBlades.value.map(snap),
          npc: deps.npcBlades.value.map(snap),
          alive: {
            player: living(deps.playerBlades.value).length,
            npc: living(deps.npcBlades.value).length
          }
        }
      },

      constants: {
        arenaRadius: deps.arenaRadius,
        maxPullDistance: deps.maxPullDistance
      },

      // ── Stage the match ─────────────────────────────────────────────────

      /** Jump to a campaign stage and rebuild the match on it. */
      setStage(id: number) {
        deps.currentStageId.value = id
        try {
          localStorage.setItem(deps.stageKey, String(id))
        } catch { /* private mode */
        }
        // Bump the signal SpinnerArena already watches for cheat-stage loads —
        // it re-runs `initGame` with whatever `currentStage` now resolves to,
        // which is exactly what a stage change needs.
        deps.stageReinitSignal.value++
      },

      /** Rebuild the current stage from scratch (fresh blades, full HP). */
      reinit() {
        deps.reinit()
      },

      /** Reseed the gameplay RNG.
       *
       *  Load-bearing and easy to get wrong: `initGame` calls
       *  `seedMatchRngRandom()` itself for every non-PvP match, so a seed set
       *  BEFORE a stage change or a reinit is thrown away. Always seed AFTER
       *  the match exists and before the first launch. */
      seed(n: number) {
        deps.seedRng(n)
      },

      /** Start the fight — the meteor-shower intro and the first turn. */
      begin() {
        return deps.beginBattle()
      },

      /**
       * Stop / restart the physics tick. Rendering keeps running either way
       * (SpinnerArena draws on its own rAF), so a frozen game still paints.
       *
       * This is what keeps the match intro out of the clip. `startMatch` costs
       * 1600 ms of meteor shower plus a 500 ms turn announcement before the
       * first `player_turn` — 2.1 s, or a fifth of a 10 s preview, spent on a
       * curtain. So `setup()` starts the match, waits out the intro in real
       * time, and freezes on the first playable frame; `record()` unfreezes as
       * its first act and the clip opens mid-fight.
       */
      freeze() {
        deps.stopPhysics()
      },
      unfreeze() {
        deps.startPhysics()
      },

      /** Force a blade's HP, in absolute points or as a fraction of max.
       *
       *  This is how a beat sheet guarantees its verdict without faking the
       *  fight: the exchanges are real physics, but the HP they start from is
       *  authored so the last one lands where the story needs it. */
      setHp(side: 'player' | 'npc', index: number, value: number, asFraction = false) {
        const blade = pick(side, index)
        if (!blade) return false
        blade.hp = asFraction ? blade.maxHp * value : value
        return true
      },

      /** Set every blade on one side to the same fraction of max HP. */
      setSideHp(side: 'player' | 'npc', fraction: number) {
        const list = living(side === 'player' ? deps.playerBlades.value : deps.npcBlades.value)
        for (const b of list) b.hp = b.maxHp * fraction
        return list.length
      },

    /** Move a living blade to a point in GAME units and stop it dead.
     *
     *  Composition, not outcome: the showreel scenes need the target of a
     *  shot sitting where the camera shows its signature moment (an enemy
     *  one bounce from the lava wall, a boss mid-arena so its split has
     *  room). Clamped inside the arena so a bad coordinate cannot park a
     *  blade in the wall. Call it in setup, while frozen. */
    place(side: 'player' | 'npc', index: number, x: number, y: number) {
      const blade = pick(side, index)
      if (!blade) return false
      const lim = deps.arenaRadius - blade.radius - 2
      const r = Math.hypot(x, y)
      const k = r > lim ? lim / r : 1
      blade.x = x * k
      blade.y = y * k
      blade.vx = 0
      blade.vy = 0
      return true
    },

    /** Stop the physics tick the instant `target` is entered — synchronously,
     *  inside the tick that enters it, so no think-time elapses first.
     *
     *  This is how a scene opens on the ENEMY's turn: the player's shot
     *  resolves in unrecorded setup, the game freezes on the first frame of
     *  `npc_turn`, and the recording then sees the full think delay and the
     *  enemy's launch (the ghost boss's split into two halves happens on
     *  that launch). Resolves with the phase once frozen. */
    freezeOnPhase(target: GamePhase) {
      return new Promise<GamePhase>((resolve) => {
        if (deps.phase.value === target) {
          deps.stopPhysics()
          resolve(target)
          return
        }
        const stop = watch(deps.phase, (p) => {
          if (p !== target) return
          deps.stopPhysics()
          stop()
          resolve(p)
        }, { flush: 'sync' })
      })
    },

      // ── Drive the input ─────────────────────────────────────────────────

      /**
       * Pull a blade back along `angle` at `power` — the shot is NOT taken
       * until `fire()`.
       *
       * @param index  index among this side's LIVING blades
       * @param angle  radians, the direction the blade will TRAVEL
       *               (0 = +x/right, PI/2 = +y/down — canvas convention,
       *               so the NPC half is negative y)
       * @param power  0..1 of MAX_PULL_DISTANCE
       */
      aim(index: number, angle: number, power = 1) {
        const blade = pick('player', index)
        if (!blade) return false
        const p = Math.max(0, Math.min(1, power))
        // beginDrag snaps to the nearest living player blade within radius*3,
        // so starting exactly on the blade centre always selects this one.
        deps.beginDrag(blade.x, blade.y)
        // Slingshot: pull AWAY from the travel direction.
        const dist = p * deps.maxPullDistance
        deps.updateDrag(blade.x - Math.cos(angle) * dist, blade.y - Math.sin(angle) * dist)
        return true
      },

      /** Aim at a point in game coordinates instead of an angle. */
      aimAt(index: number, targetX: number, targetY: number, power = 1) {
        const blade = pick('player', index)
        if (!blade) return false
        return api.aim(index, Math.atan2(targetY - blade.y, targetX - blade.x), power)
      },

      /** Aim at another blade — the shot a beat sheet actually wants to describe. */
      aimAtBlade(index: number, targetSide: 'player' | 'npc', targetIndex: number, power = 1) {
        const target = pick(targetSide, targetIndex)
        if (!target) return false
        return api.aimAt(index, target.x, target.y, power)
      },

      /** Release the pull — the blade launches. */
      fire() {
        deps.releaseDrag()
      }
    }

  ;(window as unknown as { __chaos?: typeof api }).__chaos = api
  return () => {
    delete (window as unknown as { __chaos?: typeof api }).__chaos
  }
}

// ─── First-launch intro: live state ─────────────────────────────────────────
//
// Leaf module (vue + the save-status bridge + the pure gate). `SpinnerArena`
// reads it to mount the lazily-loaded cutscene and to pause its own render
// loop underneath; `useResetProgress` calls `requestIntroReplay()`. Keeping it
// this small is what lets the arena import it eagerly while the cutscene's
// renderer and fight track stay in their own chunk, downloaded only by the
// players who will actually see it.
//
// Lifecycle:
//
//   idle ──armIntro()──▶ (decide) ──play──▶ playing ──finishIntro()──▶ done
//                          │  └─wait──▶ waiting ──(hydrate settles / budget)──▶ …
//                          └─skip──▶ done
//
// `armIntro()` is called by the arena once the loader has finished and the
// stage-1 board is built — the cutscene never starts under the splash, and
// never after the player has started a fight (`noteIntroBattleStarted`).

import { computed, ref, watch, type Ref } from 'vue'
import { hydrateState, saveDataVersion } from '@/use/useSaveStatus'
import {
  decideIntro,
  readIntroFlags,
  INTRO_DECISION_BUDGET_MS,
  INTRO_SEEN_KEY
} from '@/use/introGate'

export type IntroPhase = 'idle' | 'waiting' | 'playing' | 'done'

export const introPhase: Ref<IntroPhase> = ref('idle')
export const introPlaying = computed(() => introPhase.value === 'playing')
/**
 * True while the cutscene is crossfading back into the live game (the reclaim
 * beat, or a skip). The arena keeps its render loop parked for the rest of the
 * cutscene — the overlay is opaque, so drawing the board underneath would be
 * pure cost on exactly the low-end devices this game struggles on.
 */
export const introRevealArena: Ref<boolean> = ref(false)

let armedAt = -1
let replayRequested = false
let battleStarted = false
let budgetTimer: ReturnType<typeof setTimeout> | null = null

const now = (): number => Date.now()

const clearBudgetTimer = (): void => {
  if (budgetTimer !== null) {
    clearTimeout(budgetTimer)
    budgetTimer = null
  }
}

/** Persist "seen". Written when the cutscene STARTS (and again when it ends),
 *  so a reload mid-cutscene never replays it. Through the patched
 *  localStorage, i.e. into the cloud save like every other `spinner_` key. */
export const markIntroSeen = (): void => {
  try {
    if (window.localStorage.getItem(INTRO_SEEN_KEY) !== '1') {
      window.localStorage.setItem(INTRO_SEEN_KEY, '1')
    }
  } catch { /* storage blocked — the intro simply may replay next time */
  }
}

const startIntro = (): void => {
  clearBudgetTimer()
  replayRequested = false
  markIntroSeen()
  introRevealArena.value = false
  introPhase.value = 'playing'
}

/** Ask the gate again. Safe to call any time; a no-op unless armed and idle /
 *  waiting (or a replay was requested). */
export const evaluateIntro = (): void => {
  if (armedAt < 0) return
  if (introPhase.value === 'playing') return
  if (introPhase.value === 'done' && !replayRequested) return

  const flags = readIntroFlags((k) => window.localStorage.getItem(k))
  const decision = decideIntro({
    ...flags,
    hydrate: hydrateState.value,
    replayRequested,
    battleStarted,
    waitedMs: now() - armedAt
  })

  if (decision === 'play') {
    startIntro()
  } else if (decision === 'skip') {
    clearBudgetTimer()
    replayRequested = false
    introPhase.value = 'done'
  } else {
    introPhase.value = 'waiting'
    // Re-ask when the budget runs out, so an unsettled read that never
    // settles resolves to 'skip' instead of hanging in 'waiting'.
    if (budgetTimer === null) {
      budgetTimer = setTimeout(() => {
        budgetTimer = null
        evaluateIntro()
      }, Math.max(0, INTRO_DECISION_BUDGET_MS - (now() - armedAt)) + 20)
    }
  }
}

/** DEV only: `?intro=force` replays the intro on any save (authoring loop). */
const devForce = (): boolean =>
  import.meta.env.DEV && typeof location !== 'undefined' && /[?&]intro=force\b/.test(location.search)

/** The arena is live and the loader is gone: the intro may start now. */
export const armIntro = (): void => {
  if (armedAt < 0) {
    armedAt = now()
    if (devForce()) replayRequested = true
  }
  evaluateIntro()
}

/** The player started a fight — from here on the intro can only get in the
 *  way. Resolves a pending 'wait' to 'done'. */
export const noteIntroBattleStarted = (): void => {
  battleStarted = true
  if (introPhase.value === 'waiting' || introPhase.value === 'idle') {
    clearBudgetTimer()
    introPhase.value = 'done'
  }
}

/** Called by the cutscene when it has handed over (end or skip). */
export const finishIntro = (): void => {
  markIntroSeen()
  introPhase.value = 'done'
  introRevealArena.value = false
}

/**
 * The full-progress reset deleted `spinner_intro_seen` along with the rest of
 * the progress keys. Play the intro again right away — the reset is a "start
 * over", which is exactly what the cutscene stages — rather than waiting for a
 * reload the reset deliberately no longer does.
 */
export const requestIntroReplay = (): void => {
  replayRequested = true
  battleStarted = false
  if (armedAt < 0) return // not armed yet: armIntro() will pick it up
  if (introPhase.value === 'playing') return
  introPhase.value = 'idle'
  evaluateIntro()
}

// A recovered cloud hydrate (or the boot-complete bump) can settle a 'wait'
// either way — a returning player's save arrives and the answer becomes
// 'skip', or the cloud confirms it is empty and it becomes 'play'.
watch([hydrateState, saveDataVersion], () => {
  if (introPhase.value === 'waiting') evaluateIntro()
})

/** Test seam. */
export const __resetIntroState = (): void => {
  clearBudgetTimer()
  armedAt = -1
  replayRequested = false
  battleStarted = false
  introPhase.value = 'idle'
  introRevealArena.value = false
}

import { ref } from 'vue'

/**
 * ─── HUD toast (#UX1c) ──────────────────────────────────────────────────────
 *
 * One short confirmation line that drops in at the top of the screen and
 * leaves on its own ("Rewards claimed: 7" after a battle-pass Claim all).
 * One at a time: a newer toast replaces the one on screen. Rendered by
 * `HudToast.vue` (mounted once in the arena), announced politely to AT.
 * The text must already be translated by the caller.
 */
export interface HudToast {
  id: number
  text: string
  tone: 'leaf' | 'sun' | 'royal'
}

export const HUD_TOAST_MS = 2400

export const hudToast = ref<HudToast | null>(null)
let seq = 0
let timer = 0

export const showHudToast = (text: string, tone: HudToast['tone'] = 'leaf', ms = HUD_TOAST_MS): void => {
  if (!text) return
  hudToast.value = { id: ++seq, text, tone }
  if (typeof window === 'undefined') return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { hudToast.value = null }, ms)
}

export const clearHudToast = (): void => {
  if (typeof window !== 'undefined') window.clearTimeout(timer)
  hudToast.value = null
}

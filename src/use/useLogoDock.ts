import { ref } from 'vue'

/**
 * The loader → HUD logo hand-off. FLogoProgress flies its emblem to the
 * element marked `[data-hud-logo]` (HudLogo.vue, under the battle HUD's stage
 * badge) and flips this once it has landed (or at once when there is no
 * flight: reduced motion, no HUD on screen). HudLogo stays invisible until
 * then, so the emblem is never shown twice.
 */
export const logoDocked = ref(false)

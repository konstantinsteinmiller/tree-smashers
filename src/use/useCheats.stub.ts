import { ref } from 'vue'

// Release stub of src/use/useCheats.ts, swapped in by vite.config.ts (resolve.alias) on the Poki release build:
// Poki asks for "no debug code, no dev artifacts", so the cheat module (its "[CHEAT]" logs, keyboard shortcuts
// and typed debug toggle) never enters the bundle. Same exports, all inert.
export const cheatRouletteSignal = ref(0)
export const bossLabSignal = ref(0)
export const BOSS_LAB_BUILD = false
export const cheatsEnabled = (): boolean => false

const useCheats = () => ({})

export default useCheats

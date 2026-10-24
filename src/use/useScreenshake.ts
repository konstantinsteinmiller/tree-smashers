import { ref, type CSSProperties } from 'vue'

export type ShakeIntensity = 'small' | 'strong' | 'big'

// Global state to ensure all components/composables see the same values
const shakeStyle = ref<CSSProperties>({
  transform: 'translate(0px, 0px)',
  transition: 'none' // We don't want transitions during the shake, it makes it "mushy"
})

export const useScreenshake = () => {
  const triggerShake = (intensity: ShakeIntensity = 'small') => {
    // Adjusted these: 200px is too much! 20px is already a very strong shake.
    const duration = intensity === 'big' ? 700 : intensity === 'strong' ? 500 : 300
    const force = intensity === 'big' ? 22 : intensity === 'strong' ? 14 : 5
    const startTime = performance.now()

    const shake = (currentTime: number) => {
      const elapsed = currentTime - startTime

      if (elapsed < duration) {
        // Calculate a "decay" so the shake gets weaker at the end
        const progress = elapsed / duration
        const currentForce = (force * (1 - progress)) + 4

        // Whole CSS px only: a fractional translate makes the compositor
        // resample the canvas, and every hit's shake reads soft / doubled
        // (render-sharpness rule — blur-probe flagged it on a tree hit).
        const x = Math.round((Math.random() - 0.5) * currentForce) // vfx-rng
        const y = Math.round((Math.random() - 0.5) * currentForce) // vfx-rng

        shakeStyle.value = {
          transform: `translate(${x}px, ${y}px)`,
          transition: 'none'
        }

        requestAnimationFrame(shake)
      } else {
        // Snap back (an eased return would pass through fractional px).
        shakeStyle.value = {
          transform: 'translate(0px, 0px)',
          transition: 'none'
        }
      }
    }

    requestAnimationFrame(shake)
  }

  return {
    shakeStyle,
    triggerShake
  }
}

export default useScreenshake
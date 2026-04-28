import { ref, computed, type ComputedRef } from 'vue'
import useModels, { modelImgPath } from '@/use/useModels'
import { useRouter } from 'vue-router'
import useSound from '@/use/useSound.ts'

const debugSaved = localStorage.getItem('debug') || 'false'
const campaignTestSaved = localStorage.getItem('campaign-test') || 'false'
const envDebug = import.meta.env.VITE_APP_DEBUG === 'true'
// In production-mode builds, IGNORE the localStorage `debug` key. It's
// useful during dev (`localStorage.setItem('debug', 'true')` + reload),
// but a stale `true` set during testing on a wrapper webview (CrazyGames
// mobile app, GameDistribution iframe, etc.) would otherwise expose
// debug-only UI to real users. The env flag stays effective in production
// for emergency on-device diagnostics — it requires a rebuild and
// redeploy, which is the desired barrier.
const isProductionBuild = import.meta.env.VITE_NODE_ENV === 'production'
export const isDebug = ref(envDebug || (!isProductionBuild && !!JSON.parse(debugSaved)))
export const isCrazyGamesFullRelease = import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'
export const isCampaignTest = ref(!!JSON.parse(campaignTestSaved))

export const isSplashScreenVisible = ref<boolean>(false)
export const isDbInitialized = ref<boolean>(false)

export const useMatch = () => {
  const turn = ref<'player' | 'npc'>('player')
  const isThinking = ref(false)
  const {} = useModels()
  const router = useRouter()
  const { playSound } = useSound()

  const resetGame = () => {
  }

  return {
    turn,
    resetGame,
    isThinking
  }
}

export default useMatch
import { onMounted, onUnmounted, ref } from 'vue'
import useModels from '@/use/useModels'
import useUser, { isDemo } from '@/use/useUser'
import useSpinnerCampaign, { STAGES, type ArenaType } from '@/use/useSpinnerCampaign'
import useLeaderboard from '@/use/useLeaderboard'
import { arenaType, resetGameStartCount } from '@/use/useSpinnerGame'
import type { BossAbility } from '@/types/spinner'
import useSpinnerConfig from '@/use/useSpinnerConfig.ts'
import { STAGE_KEY } from '@/keys'

const storedCheat = localStorage.getItem('cheat') || 'false'
const isCheat = ref<boolean>(JSON.parse(storedCheat))

/** Incremented by cheat shortcut — SpinnerArena watches this to open roulette. */
export const cheatRouletteSignal = ref(0)


const useCheats = () => {
  if (!isCheat.value) return {}

  const { allModels } = useModels()
  const { setSettingValue } = useUser()

  /**
   * ACTIONS
   */
  const setSpinnerStage = (stageId: number) => {
    console.log('stageId: ', stageId)
    if (stageId < 1 || stageId > STAGES.length) {
      console.warn(`[CHEAT] Invalid stage ${stageId}. Must be 1-${STAGES.length}.`)
      return
    }
    const { currentStageId } = useSpinnerCampaign()
    currentStageId.value = stageId
    localStorage.setItem(STAGE_KEY, stageId.toString())
    console.warn(`[CHEAT] Spinner stage set to ${stageId} (${STAGES[stageId - 1]?.name}).`)
  }

  const resetChestCooldown = () => {
    localStorage.setItem('spinner_chest_ready_at', '0')
    localStorage.setItem('spinner_mini_chest_ready_at', '0')
    console.warn('[CHEAT] All chest cooldowns reset to 00:00.')
  }

  const resetGameStartCounter = () => {
    resetGameStartCount()
    console.warn('[CHEAT] Game-start counter armed. Next match start will trigger the countdown.')
  }

  const simulateLeaderboardUpdate = () => {
    const { forceLeaderboardTick } = useLeaderboard()
    const { currentStageId } = useSpinnerCampaign()
    forceLeaderboardTick(currentStageId.value)
    console.warn('[CHEAT] Leaderboard updated (one hourly tick).')
  }

  const setArenaType = (type: ArenaType) => {
    arenaType.value = type
    console.warn(`[CHEAT] Arena type set to '${type}'.`)
  }

  /**
   * Spawn a custom boss-ability test stage scaled to the player's current
   * upgrade levels. Lets you exercise ghost / split / partners / healers in
   * isolation without grinding the campaign.
   */
  const spawnCheatBoss = (ability: BossAbility) => {
    const { buildCheatBossStage, loadCheatStage } = useSpinnerCampaign()
    const stage = buildCheatBossStage(ability)
    loadCheatStage(stage)
    console.warn(`[CHEAT] Loaded '${ability}' boss test stage (scaled to your upgrades).`)
  }

  /** Clear any active cheat-stage override and return to the campaign stage. */
  const clearCheatStage = () => {
    const { loadCheatStage } = useSpinnerCampaign()
    loadCheatStage(null)
    console.warn('[CHEAT] Cheat stage cleared — back to campaign.')
  }

  /** Jump forward/backward by 10 stages */
  const shiftSpinnerStage = (delta: number) => {
    const { currentStageId } = useSpinnerCampaign()
    const newStage = Math.max(1, Math.min(STAGES.length, currentStageId.value + delta))
    setSpinnerStage(newStage)
  }

  const resetCampaign = () => {
    setSettingValue('campaign', [])
    setSettingValue('quest-campaign', false)
    console.warn('[CHEAT] Campaign progress reset.')
  }
  const { addCoins } = useSpinnerConfig()

  /**
   * CHEAT MAPPING
   * Define your shortcuts here.
   * Format: 'ctrl+shift+key' or just 'key'
   * Note: 'ctrl' also catches 'meta' (Cmd on Mac) for better UX.
   */
  const cheatsMap: Record<string, () => void> = {
    'ctrl+shift+j': resetCampaign,
    'ctrl+shift+d': () => console.log('[DEBUG] Models:', allModels),
    // Spinner stage shortcuts: Ctrl+Shift+1..9 for stages 1-9, Ctrl+Shift+0 for stage 10
    'ctrl+shift+1': () => setSpinnerStage(1),
    'ctrl+shift+2': () => setSpinnerStage(2),
    'ctrl+shift+3': () => setSpinnerStage(3),
    'ctrl+shift+4': () => setSpinnerStage(4),
    'ctrl+shift+5': () => setSpinnerStage(5),
    'ctrl+shift+6': () => setSpinnerStage(6),
    'ctrl+shift+7': () => setSpinnerStage(7),
    'ctrl+shift+8': () => setSpinnerStage(8),
    'ctrl+shift+o': () => setSpinnerStage(9),
    'ctrl+shift+p': () => setSpinnerStage(10),
    'ctrl+shift+alt+1': () => setSpinnerStage(11),
    'ctrl+shift+alt+2': () => setSpinnerStage(12),
    'ctrl+shift+alt+3': () => setSpinnerStage(13),
    'ctrl+shift+alt+4': () => setSpinnerStage(14),
    'ctrl+shift+alt+5': () => setSpinnerStage(15),
    'ctrl+shift+alt+6': () => setSpinnerStage(16),
    'ctrl+shift+alt+7': () => setSpinnerStage(17),
    'ctrl+shift+alt+8': () => setSpinnerStage(18),
    'ctrl+shift+alt+9': () => setSpinnerStage(19),
    'ctrl+shift+alt+0': () => setSpinnerStage(20),
    'ctrl+shift+alt+t': resetChestCooldown,
    'ctrl+shift+alt+g': resetGameStartCounter,
    'ctrl+shift+alt+u': simulateLeaderboardUpdate,
    // Arena type shortcuts
    'ctrl+shift+alt+l': () => setArenaType('lava'),
    'ctrl+shift+alt+i': () => setArenaType('ice'),
    'ctrl+shift+alt+f': () => setArenaType('forest'),
    'ctrl+shift+alt+d': () => setArenaType('default'),
    'ctrl+shift+alt+b': () => setArenaType('boss'),
    'ctrl+shift+alt+h': () => setArenaType('thunder'),
    'ctrl+shift+alt+s': () => setArenaType('shock'),
    // Boss-ability test stages (scaled to player upgrades for a fair fight)
    'ctrl+shift+alt+q': () => spawnCheatBoss('ghost'),
    'ctrl+shift+alt+w': () => spawnCheatBoss('split'),
    'ctrl+shift+alt+e': () => spawnCheatBoss('partners'),
    'ctrl+shift+alt+r': () => spawnCheatBoss('healers'),
    'ctrl+shift+alt+z': () => spawnCheatBoss('child-emitter'),
    'ctrl+shift+alt+x': () => spawnCheatBoss('stat-switch'),
    'ctrl+shift+alt+v': () => spawnCheatBoss('life-leech'),
    'ctrl+shift+alt+n': () => spawnCheatBoss('thunder'),
    'ctrl+shift+alt+m': () => {
      setSpinnerStage(88)
      console.warn('[CHEAT] Jumped to stage 88 (sandstorm boss).')
    },
    'ctrl+shift+alt+k': () => addCoins(3000),
    'ctrl+shift+alt+c': clearCheatStage,
    'ctrl+shift+alt+p': () => {
      cheatRouletteSignal.value++
      console.warn('[CHEAT] Roulette triggered.')
    },
  }

  /**
   * EVENT HANDLER
   * Supports arbitrary multi-key combos (e.g. alt+1+2).
   * Tracks all currently-held non-modifier keys and matches against cheatsMap
   * on every keydown. Keys are released on keyup / blur.
   */
  const heldKeys = new Set<string>()
  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])

  const normalizeKey = (e: KeyboardEvent): string | null => {
    const codeMatch = e.code.match(/^Digit(\d)$/)
    if (codeMatch) return codeMatch[1]!
    const k = e.key.toLowerCase()
    return MODIFIER_KEYS.has(k) ? null : k
  }

  const buildShortcut = (e: KeyboardEvent): string => {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    // Sort held keys for deterministic order
    const sorted = [...heldKeys].sort()
    parts.push(...sorted)
    return parts.join('+')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.add(key)

    const shortcut = buildShortcut(e)

    if (cheatsMap[shortcut]) {
      e.preventDefault()
      cheatsMap[shortcut]()
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.delete(key)
  }

  const handleBlur = () => {
    heldKeys.clear()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  })

  return {
    isCheat
  }
}

export default useCheats
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { type Difficulties, DIFFICULTY } from '@/utils/enums'
import { mobileCheck } from '@/utils/function'
import { isDbInitialized, isSplashScreenVisible } from '@/use/useMatch'
import { saveDataVersion } from '@/use/useSaveStatus'

export const windowWidth = ref(window.innerWidth)
export const windowHeight = ref(window.innerHeight)

export const orientation = ref(mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait')

export const isMobileLandscape = computed(() =>
  mobileCheck() && windowWidth.value > 500 && orientation.value === 'landscape'
)
export const isMobilePortrait = computed(() =>
  mobileCheck() && windowWidth.value < windowHeight.value
)

declare const APP_VERSION: string
export const isCrazyWeb = import.meta.env.VITE_APP_CRAZY_WEB === 'true'
export const isWaveDash = import.meta.env.VITE_APP_WAVEDASH === 'true'
export const isItch = import.meta.env.VITE_APP_ITCH === 'true'
export const isGlitch = import.meta.env.VITE_APP_GLITCH === 'true'
export const isGameDistribution = import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
export const isY8 = import.meta.env.VITE_APP_Y8 === 'true'
export const isGamePix = import.meta.env.VITE_APP_GAMEPIX === 'true'
export const isPlaygama = import.meta.env.VITE_APP_PLAYGAMA === 'true'
export const showMediatorAds = import.meta.env.VITE_APP_SHOW_MEDIATOR_ADS === 'true'
export const isNative = import.meta.env.VITE_APP_NATIVE === 'true'
export const isWeb = import.meta.env.VITE_APP_NATIVE !== 'true'
export const isDemo = import.meta.env.VITE_APP_DEMO === 'true'
export const version: string = APP_VERSION

// ─── Persisted settings (localStorage-backed) ──────────────────────────────
//
// Replaces the old `useUserDb` IndexedDB layer. CG QA flagged the
// `user_db` / `user_os` store as "data saved locally" — and it was
// holding a pile of CardQuest relics (userHand, userCollection,
// userCampaign, userQuestCards, etc.) that chaos-arena never reads.
//
// chaos-arena only persists FOUR user settings:
//   • difficulty / sound volume / music volume / locale
//
// They live in localStorage under the keys below. On a CrazyGames build
// these go through the patched `SaveManager.setItem` and are mirrored
// to `sdk.data` automatically — no separate persistence layer needed.
// Hydrate at boot is a synchronous read; the strategy populates
// localStorage from sdk.data BEFORE the App graph imports.

const SOUND_KEY = 'spinner_user_sound_volume'
const MUSIC_KEY = 'spinner_user_music_volume'
const LANGUAGE_KEY = 'spinner_user_language'
const DIFFICULTY_KEY = 'spinner_user_difficulty'

const readNumber = (key: string, fallback: number): number => {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}
const readString = <T extends string>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key)
  return (raw ?? fallback) as T
}

export const userDifficulty: Ref<Difficulties> = ref(readString(DIFFICULTY_KEY, DIFFICULTY.MEDIUM as Difficulties))
const userSoundVolume: Ref<number> = ref(readNumber(SOUND_KEY, 0.7))
const userMusicVolume: Ref<number> = ref(readNumber(MUSIC_KEY, 0.6))
const userLanguage: Ref<string> = ref(readString(LANGUAGE_KEY, 'en'))

// Re-read on hydrate-success bump. Module init reads these synchronously
// from localStorage, but on cloud-only builds (CrazyGames) the blob is
// in-memory only — `useUser.ts` is one of the few composables imported at
// the top of `main.ts`, so its module evaluation runs BEFORE
// `await saveManager.init()` populates the blob from `sdk.data`. Without
// this watcher the user's saved difficulty / volume / language would
// silently revert to defaults on every refresh.
//
// Settings-stranding fix: after refreshing refs from localStorage, write
// the current ref value back for any setting still null in localStorage.
// Triggers the patched setItem path → strategy.onLocalSet → sdk.data, so
// even a player who never opens OptionsModal ends up with their settings
// round-tripping through the cloud. Idempotent for returning players
// because hydrate has already populated localStorage from sdk.data.
//
// LANGUAGE is intentionally NOT seeded here: main.ts handles it
// separately so the CrazyGames portal locale (`cgLocale`) can seed
// first-time players. If we wrote the default 'en' here, main.ts's
// "is there a stored choice?" probe would always see a value and
// never apply the portal locale to a fresh player.
watch(saveDataVersion, () => {
  userDifficulty.value = readString(DIFFICULTY_KEY, userDifficulty.value)
  userSoundVolume.value = readNumber(SOUND_KEY, userSoundVolume.value)
  userMusicVolume.value = readNumber(MUSIC_KEY, userMusicVolume.value)
  userLanguage.value = readString(LANGUAGE_KEY, userLanguage.value)

  if (localStorage.getItem(DIFFICULTY_KEY) === null) {
    localStorage.setItem(DIFFICULTY_KEY, userDifficulty.value)
  }
  if (localStorage.getItem(SOUND_KEY) === null) {
    localStorage.setItem(SOUND_KEY, String(userSoundVolume.value))
  }
  if (localStorage.getItem(MUSIC_KEY) === null) {
    localStorage.setItem(MUSIC_KEY, String(userMusicVolume.value))
  }
})

// Boot signal that several composables (`main.ts`, `useCrazyMuteSync`,
// the i18n loader) wait on. Previously the IDB hydrate flipped this; with
// localStorage we have synchronous reads, so flip immediately. The
// SaveManager has already populated localStorage from the cloud strategy
// before this module evaluates (see `main.ts`: `await saveManager.init()`
// runs BEFORE `import('@/App.vue')`).
isDbInitialized.value = true
isSplashScreenVisible.value = false

// One-time legacy cleanup. CG QA's standing rule is "NO locally-saved
// data" — both localStorage AND sessionStorage count. We sweep relics
// from prior builds at module load:
//   • `user_db` IndexedDB store — held CardQuest userHand / userCollection
//     / quest-* relics nothing here references.
//   • `card*` keys (case-insensitive) — the CardQuest-era prefix that
//     produced `cardQuestUserLanguage`, `cardQuestSoundVolume`, etc.
//   • `chaosArena*` keys — the interim prefix from the
//     2026-05-04 build. We no longer mirror the locale hint to
//     sessionStorage at all (the value lives in `spinner_user_language`,
//     which flows through `sdk.data` on CG), so any existing
//     `chaosArena*` entry is also dead data.
// Fire-and-forget — errors are swallowed because there is nothing to
// recover. Runs at module load (useUser.ts is imported at the top of
// main.ts) so the data is gone before the rest of the app boots.
try {
  if (typeof window !== 'undefined' && window.indexedDB?.deleteDatabase) {
    const req = window.indexedDB.deleteDatabase('user_db')
    req.onerror = () => { /* no-op: harmless if locked / already gone */
    }
  }
} catch { /* harmless */
}
const LEGACY_KEY_RE = /^(card|chaosArena)/i
const sweepLegacyKeys = (storage: Storage) => {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && LEGACY_KEY_RE.test(k)) toRemove.push(k)
    }
    for (const k of toRemove) storage.removeItem(k)
  } catch { /* harmless */
  }
}
sweepLegacyKeys(localStorage)
sweepLegacyKeys(sessionStorage)

// ─── Composable surface ───────────────────────────────────────────────────

const useUser = () => {
  const setSettingValue = (name: string, value: unknown) => {
    switch (name) {
      case 'sound':
        userSoundVolume.value = +(value as number)
        localStorage.setItem(SOUND_KEY, String(userSoundVolume.value))
        break
      case 'music':
        userMusicVolume.value = +(value as number)
        localStorage.setItem(MUSIC_KEY, String(userMusicVolume.value))
        break
      case 'language':
        userLanguage.value = value as string
        // localStorage write goes through the patched SaveManager →
        // sdk.data on CG builds. CG QA: no sessionStorage mirror — it
        // counts as locally-saved data.
        localStorage.setItem(LANGUAGE_KEY, userLanguage.value)
        break
      case 'difficulty':
        userDifficulty.value = value as Difficulties
        localStorage.setItem(DIFFICULTY_KEY, userDifficulty.value)
        break
      // Other setting keys (skipRulesModal / hand / collection / campaign /
      // quest-* / unlocked / tutorialsDoneMap) used to be CardQuest relics
      // wired through the deleted `useUserDb`. They are intentionally
      // unhandled — `setSettingValue` is a no-op for them and any straggling
      // caller will silently do nothing rather than throw.
    }
  }

  return {
    userDifficulty,
    userSoundVolume,
    userMusicVolume,
    userLanguage,
    setSettingValue
  }
}

export default useUser

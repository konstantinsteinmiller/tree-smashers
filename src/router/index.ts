import {
  createRouter,
  createWebHashHistory,
  createMemoryHistory,
  type RouteRecordRaw,
  type RouterHistory
} from 'vue-router'
import {
  isWeb,
  isCrazyWeb,
  isWaveDash,
  isItch,
  isGlitch,
  isGameDistribution,
  isY8,
  isGamePix,
  isPlaygama,
  isPoki
} from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'

/**
 * Route table, exported so the regression spec can drive it through a real
 * navigation without pulling the view components into the test graph.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'main-menu',
    component: () => import('@/views/SpinnerArena.vue')/*, redirect: 'battle'*/,
    children: []
  },
  { path: '/battle', name: 'battle', component: () => import('@/views/SpinnerArena.vue') },
  // ...isDebug.value ? [
  //   { path: '/crit-test', name: 'crit-test', component: () => import('@/views/CritTestScene.vue') },
  //   { path: '/power-up', name: 'power-up', component: () => import('@/views/PowerupTestScene.vue') },
  //   { path: '/trailer', name: 'trailer', component: () => import('@/views/TrailerScene.vue') }
  // ] : []

  // ─── Catch-all → main menu ────────────────────────────────────────────────
  //
  // NOT boilerplate. Without it, an unmatched location leaves
  // `to.matched` empty, `<RouterView>` renders NOTHING, and the player sees
  // a black page behind a splash that has already finished — no error, no
  // warning, nothing in the console. vue-router's "No match found for
  // location" warning is compiled out of production builds, so the failure
  // is completely silent in a shipped bundle.
  //
  // That is exactly how the 2026-09 YouTube Playables submission failed.
  // Playables loads the game as
  //   .../index.html#debug&origin=https%3A%2F%2Fdevelopers.google.com...
  // and `createWebHashHistory` reads the fragment as the route path, so the
  // router resolved `/debug&origin=…`, matched nothing, and rendered an
  // empty view — while every MUST/SHOULD check in YouTube's test suite went
  // green, because the SDK handshake, gameReady and the cloud save all
  // happen outside the router.
  //
  // The history switch below is the primary fix; this record is the net that
  // catches every OTHER host that decides to append something to our URL.
  {
    path: '/:pathMatch(.*)*',
    name: 'catch-all',
    redirect: (to) => {
      // Deliberately a `console.warn` and not silence: if a portal ever
      // routes us somewhere unexpected again, this line is the whole
      // diagnosis, and it survives into production builds.
      console.warn(
        `[router] no route matched "${to.fullPath}" — redirecting to the main menu. `
        + `(history=${historyMode}, href=${window.location.href})`
      )
      return { name: 'main-menu' }
    }
  }
]

// ─── History mode ───────────────────────────────────────────────────────────
//
// Portal builds run inside an iframe whose URL the HOST owns, and several
// hosts append their own fragment to it. With a hash history that fragment IS
// our route path, which is how YouTube's `#debug&origin=…` blanked the game
// (see the catch-all record above).
//
// `createMemoryHistory` closes both halves of that hole:
//   • the route is ours, not the host's — nothing the portal appends can be
//     parsed as a path again;
//   • we never WRITE `location.hash` either. That matters on Playables
//     specifically: `ytgame.js` parses `origin` out of the fragment to
//     address its postMessage handshake to the parent frame, and a hash
//     history rewrites the whole fragment to `#/` on its first navigation.
//
// Nothing is lost: the app never calls `router.push`/`replace` — it lives on
// `/` for its entire lifetime, and `/battle` is currently unused. Deep links
// only matter off-portal, so plain-web / GitHub Pages / native builds keep
// the hash history they have always had (the PvP `?pvp=` invite link reads
// `window.location.hash` directly in `usePVP.ts`, not through the router, so
// it is unaffected either way).
const isPortalBuild =
  isCrazyWeb || isWaveDash || isItch || isGlitch || isGameDistribution
  || isY8 || isGamePix || isPlaygama || isPoki

const historyMode: 'memory' | 'hash' = isPortalBuild ? 'memory' : 'hash'

const history: RouterHistory = isPortalBuild
  ? createMemoryHistory()
  : createWebHashHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
  routes
})

/** Which history the build ended up with — surfaced in the boot diagnostics
 *  so a QA console screenshot answers "was the host's URL in play?". */
export const routerHistoryMode = historyMode

const remoteURL = import.meta.env.VITE_APP_REMOTE_URL
// --- THE ROUTER HOOK ---
router.beforeEach((to, from) => {
  // The previous version destructured `userUnlocked` + `setSettingValue`
  // here but neither was used — the real unlock check runs against
  // `localStorage.getItem('full_unlocked')` further down. Removed
  // alongside the useUserDb cleanup.

  const url = window.location.href
  const storedUnlock: string = (localStorage.getItem('full_unlocked') as string)
  const parsedStoredUnlock: boolean = typeof storedUnlock === 'string' && storedUnlock?.length ? (JSON.parse(storedUnlock) as boolean) : false
  const isUnlocked = to.query.unlock === 'true' || to.query.unlocked === 'true' || from.query.unlocked === 'true' || parsedStoredUnlock === true

  // Only apply restrictions if it's the Web version
  if (isWeb) {
    const isFullVersion = url.includes(remoteURL + '/tree-smashers/') && !url.includes('/tree-smashers/demo/') && !url.includes('/tree-smashers/develop/')
    const isDevelopVersion = url.includes(remoteURL + '/tree-smashers/develop/')
    const isDev = url.includes('localhost:5173/')

    if (isDev) {
      return true
    }

    // If user is on Full or Develop without the unlock param, boot them to Demo
    if ((isFullVersion || isDevelopVersion) && !isUnlocked) {
      window.location.href = remoteURL + '/tree-smashers/demo/'
      return false// Stop execution
    } else if (isUnlocked && (isFullVersion || isDevelopVersion)) {
      localStorage.setItem('full_unlocked', 'true')
    }
  }

  return true
})

export default router

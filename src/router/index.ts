import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { isWeb } from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'

const routes: RouteRecordRaw[] = [
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
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

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
    const isFullVersion = url.includes(remoteURL + '/chaos-arena/') && !url.includes('/chaos-arena/demo/') && !url.includes('/chaos-arena/develop/')
    const isDevelopVersion = url.includes(remoteURL + '/chaos-arena/develop/')
    const isDev = url.includes('localhost:5173/')

    if (isDev) {
      return true
    }

    // If user is on Full or Develop without the unlock param, boot them to Demo
    if ((isFullVersion || isDevelopVersion) && !isUnlocked) {
      window.location.href = remoteURL + '/chaos-arena/demo/'
      return false// Stop execution
    } else if (isUnlocked && (isFullVersion || isDevelopVersion)) {
      localStorage.setItem('full_unlocked', 'true')
    }
  }

  return true
})

export default router

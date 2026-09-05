// ─── Regression: a host-appended URL fragment must not blank the game ──────
//
// The 2026-09 YouTube Playables submission shipped a black screen. Every
// MUST/SHOULD check in YouTube's test suite passed — SDK loaded first,
// firstFrameReady, gameReady, cloud save under 3 MiB — and the console was
// completely clean. The game was simply not there.
//
// Cause: Playables loads the game as
//
//     .../index.html#debug&origin=https%3A%2F%2Fdevelopers.google.com...
//
// `createWebHashHistory` treats the fragment as the route path, so the router
// resolved `/debug&origin=…`, matched no record, and `<RouterView>` rendered
// nothing. vue-router's "No match found for location" warning is compiled out
// of production builds, which is why nothing surfaced.
//
// Two guarantees are pinned here:
//   1. an unmatched location redirects to the main menu instead of rendering
//      nothing (`catch-all`);
//   2. portal builds use a memory history, so the host's fragment is never
//      read as a path in the first place — and, just as important, the router
//      never WRITES `location.hash`, which on Playables carries the `origin`
//      param `ytgame.js` needs for its postMessage handshake.

import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw
} from 'vue-router'
import { routes, routerHistoryMode } from '@/router'

/** The exact shape Playables appends to the game URL. */
const YOUTUBE_FRAGMENT = '#debug&origin=https%3A%2F%2Fdevelopers.google.com'

const Stub = { render: () => null }

/**
 * The real route table with the view components swapped for a stub, so a
 * navigation here doesn't drag `SpinnerArena.vue` (and the whole game) into
 * the test graph. Paths, names, the catch-all and its redirect are untouched
 * — those are what is under test.
 */
const stubbedRoutes = (): RouteRecordRaw[] =>
  routes.map((route) =>
    'component' in route && route.component
      ? ({ ...route, component: Stub } as RouteRecordRaw)
      : route
  )

describe('host-appended fragment', () => {
  it('is read as a route path by a hash history', () => {
    // Not a test of our code — a test of the TRAP, so the reason the memory
    // history exists cannot be optimised away by a future reader. `'./'` is
    // the BASE_URL every portal build ships with (`vite build --base=./`).
    window.location.hash = YOUTUBE_FRAGMENT
    try {
      expect(createWebHashHistory('./').location).toBe(
        '/debug&origin=https%3A%2F%2Fdevelopers.google.com'
      )
    } finally {
      window.location.hash = ''
    }
  })

  it('redirects to the main menu instead of rendering nothing', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: stubbedRoutes()
    })
    await router.push('/debug&origin=https%3A%2F%2Fdevelopers.google.com')

    // The failure mode being guarded: `matched.length === 0` is an empty
    // <RouterView>, i.e. a black screen.
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
    expect(router.currentRoute.value.name).toBe('main-menu')
  })

  it.each([
    '/vconsole',
    '/a/b/c',
    '/debug&origin=https%3A%2F%2Fwww.youtube.com',
    '/?utm_source=portal'
  ])('recovers from an unmatched location %s', async (path) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: stubbedRoutes()
    })
    await router.push(path)
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
  })

  it('still resolves the real routes normally', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: stubbedRoutes()
    })
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('main-menu')
    await router.push('/battle')
    expect(router.currentRoute.value.name).toBe('battle')
  })
})

describe('history mode', () => {
  it('is memory on a portal build and hash otherwise', () => {
    // The test env sets no `VITE_APP_<platform>` flag, so this build is the
    // plain-web one and must keep the hash history that GitHub Pages deep
    // links and the PvP `?pvp=` invite flow rely on.
    const anyPlatformFlag = [
      'VITE_APP_CRAZY_WEB', 'VITE_APP_WAVEDASH', 'VITE_APP_ITCH', 'VITE_APP_GLITCH',
      'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_Y8', 'VITE_APP_GAMEPIX',
      'VITE_APP_PLAYGAMA', 'VITE_APP_POKI'
    ].some((flag) => import.meta.env[flag] === 'true')

    expect(routerHistoryMode).toBe(anyPlatformFlag ? 'memory' : 'hash')
  })
})

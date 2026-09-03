// @vitest-environment jsdom
//
// ─── Web Storage shim ──────────────────────────────────────────────────────
//
// Regression guard for the YouTube Playables rejection (2026-09):
//
//     Uncaught TypeError: Cannot read properties of null (reading 'getItem')
//
// Inside the Playables runtime `window.localStorage` is null, and ~150 call
// sites across the codebase — a dozen of them at module-evaluation time —
// assume the real thing. `public/js/storage-shim.js` is a classic script that
// runs before the module graph and swaps in an in-memory Storage.
//
// The shim is plain JS in `public/` rather than a TS module ON PURPOSE (a
// module-graph import is deferred and would lose the race against the entry
// chunk's static imports), so this test evaluates the shipped file directly
// rather than importing a copy — there is no second implementation to drift.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SHIM_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/js/storage-shim.js'
)
const SHIM_SOURCE = fs.readFileSync(SHIM_PATH, 'utf8')

/** Evaluate the shim against the current jsdom window, the way the browser's
 *  parser-blocking script tag does. */
const runShim = (): void => {
  new Function(SHIM_SOURCE).call(globalThis)
}

const setStorage = (name: 'localStorage' | 'sessionStorage', value: unknown): void => {
  Object.defineProperty(window, name, { value, configurable: true, writable: true })
}

describe('storage-shim', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as any).__storageShim
  })

  it('replaces a null localStorage with a working in-memory Storage', () => {
    setStorage('localStorage', null)
    runShim()

    // The exact call that crashed on YouTube (useSpinnerConfig.ts, module scope).
    expect(() => window.localStorage.getItem('spinner_first_win')).not.toThrow()
    expect(window.localStorage.getItem('spinner_first_win')).toBeNull()

    window.localStorage.setItem('spinner_coins', '120')
    expect(window.localStorage.getItem('spinner_coins')).toBe('120')
  })

  it('replaces a null sessionStorage too', () => {
    // `useUser.ts` calls `sweepLegacyKeys(sessionStorage)` at module scope,
    // which would crash on exactly the same shape.
    setStorage('sessionStorage', null)
    runShim()
    expect(() => window.sessionStorage.key(0)).not.toThrow()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('replaces a storage whose accessor throws (sandboxed / opaque origin)', () => {
    setStorage('localStorage', {
      get length(): number {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      }
    })
    runShim()
    expect(() => window.localStorage.getItem('x')).not.toThrow()
    expect((window as any).__storageShim.localStorage).toBe('access threw')
  })

  it('leaves a working native storage completely alone', () => {
    const native = window.localStorage
    native.setItem('spinner_stage', '7')
    runShim()
    expect(window.localStorage).toBe(native)
    expect(window.localStorage.getItem('spinner_stage')).toBe('7')
    expect((window as any).__storageShim.localStorage).toBeNull()
  })

  it('does NOT replace a native storage that is merely out of quota', () => {
    // A write probe would fail here. Swapping in a volatile store would throw
    // away a real, populated save — strictly worse than the quota error, which
    // is why the usability probe is read-only.
    const native = window.localStorage
    native.setItem('spinner_coins', '999')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    runShim()
    expect(window.localStorage).toBe(native)
    expect(window.localStorage.getItem('spinner_coins')).toBe('999')
  })

  describe('the in-memory Storage behaves like the real one', () => {
    beforeEach(() => {
      setStorage('localStorage', null)
      runShim()
    })

    it('tracks length and key() in insertion order', () => {
      window.localStorage.setItem('a', '1')
      window.localStorage.setItem('b', '2')
      expect(window.localStorage.length).toBe(2)
      expect(window.localStorage.key(0)).toBe('a')
      expect(window.localStorage.key(1)).toBe('b')
      expect(window.localStorage.key(9)).toBeNull()
    })

    it('does not double-count a re-set key', () => {
      window.localStorage.setItem('a', '1')
      window.localStorage.setItem('a', '2')
      expect(window.localStorage.length).toBe(1)
      expect(window.localStorage.getItem('a')).toBe('2')
    })

    it('removeItem and clear drop keys from both the map and the index', () => {
      window.localStorage.setItem('a', '1')
      window.localStorage.setItem('b', '2')
      window.localStorage.removeItem('a')
      expect(window.localStorage.length).toBe(1)
      expect(window.localStorage.key(0)).toBe('b')
      window.localStorage.clear()
      expect(window.localStorage.length).toBe(0)
      expect(window.localStorage.getItem('b')).toBeNull()
    })

    it('coerces values to strings like the spec requires', () => {
      window.localStorage.setItem('n', 42 as unknown as string)
      expect(window.localStorage.getItem('n')).toBe('42')
    })

    it('survives keys that collide with Object.prototype', () => {
      expect(window.localStorage.getItem('constructor')).toBeNull()
      expect(window.localStorage.getItem('__proto__')).toBeNull()
      window.localStorage.setItem('toString', 'x')
      expect(window.localStorage.getItem('toString')).toBe('x')
    })

    it('methods can be detached and bound, the way BlobStorage does', () => {
      // BlobStorage captures `raw.getItem.bind(raw)` in its constructor so it
      // keeps reaching the original implementation after SaveManager patches.
      const get = window.localStorage.getItem.bind(window.localStorage)
      const set = window.localStorage.setItem.bind(window.localStorage)
      set('k', 'v')
      expect(get('k')).toBe('v')
    })

    it('can be wrapped by the SaveManager localStorage Proxy', () => {
      // SaveManager replaces window.localStorage with a Proxy over the
      // original and passes non-patched props through with `.bind(target)`.
      const target = window.localStorage
      const proxy = new Proxy(target, {
        get(t, prop) {
          const value = Reflect.get(t, prop, t)
          return typeof value === 'function' ? (value as Function).bind(t) : value
        }
      })
      proxy.setItem('p', '1')
      expect(proxy.getItem('p')).toBe('1')
      expect(proxy.length).toBe(1)
      expect(proxy.key(0)).toBe('p')
    })
  })
})

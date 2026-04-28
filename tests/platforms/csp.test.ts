// Characterization tests for the CSP generator. The current implementation
// in vite.config.ts builds the CSP string by concatenating per-platform host
// arrays + per-directive extras based on env-var flags. The extracted
// generator must produce byte-identical output for the same env input.
//
// Each test sets the env input the way `loadEnv()` would in vite.config.ts
// (a Record<string, string>) and asserts properties of the generated CSP
// string.

import { describe, expect, it } from 'vitest'
import { buildCsp } from '@/platforms/csp'

const baseEnv = (): Record<string, string> => ({})

describe('buildCsp', () => {
  describe('default web (no platform flag)', () => {
    it('contains base host whitelist', () => {
      const csp = buildCsp(baseEnv())
      expect(csp).toContain('https://*.crazygames.com')
      expect(csp).toContain('https://gamedistribution.com')
      expect(csp).toContain('https://wavedash.com')
      expect(csp).toContain('https://itch.io')
      expect(csp).toContain('https://glitch.fun')
    })

    it('does NOT include GameDistribution partner hosts', () => {
      const csp = buildCsp(baseEnv())
      expect(csp).not.toContain('amazon-adsystem')
      expect(csp).not.toContain('rubiconproject')
    })

    it('does NOT open script-src or style-src to https:', () => {
      const csp = buildCsp(baseEnv())
      // The literal "https:" should not appear as a stand-alone source.
      // (It WILL appear inside specific host URLs like https://*.adnxs.com.)
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).not.toContain('https:')
      const styleSrc = csp.match(/style-src ([^;]+)/)![1]!
      expect(styleSrc.split(/\s+/)).not.toContain('https:')
    })

    it('img-src is locked to data: + base hosts', () => {
      const csp = buildCsp(baseEnv())
      const imgSrc = csp.match(/img-src ([^;]+)/)![1]!
      expect(imgSrc).toContain('data:')
      expect(imgSrc.split(/\s+/)).not.toContain('https:')
    })

    it('frame-src is empty (only "self" + base hosts)', () => {
      const csp = buildCsp(baseEnv())
      const frameSrc = csp.match(/frame-src ([^;]+)/)![1]!
      expect(frameSrc.split(/\s+/)).not.toContain('https:')
    })

    it('font-src is locked to data: only', () => {
      const csp = buildCsp(baseEnv())
      const fontSrc = csp.match(/font-src ([^;]+)/)![1]!
      expect(fontSrc).toContain('data:')
      expect(fontSrc.split(/\s+/)).not.toContain('https:')
    })
  })

  describe('GameDistribution build (VITE_APP_GAME_DISTRIBUTION=true)', () => {
    const env = (): Record<string, string> => ({ VITE_APP_GAME_DISTRIBUTION: 'true' })

    it('includes GD partner hosts', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://*.amazon-adsystem.com')
      expect(csp).toContain('https://*.rubiconproject.com')
      expect(csp).toContain('https://cdn.jsdelivr.net')
      expect(csp).toContain('https://*.2mdn.net')
      expect(csp).toContain('https://fundingchoicesmessages.google.com')
    })

    it('opens script-src to https: + unsafe-inline + unsafe-eval', () => {
      const csp = buildCsp(env())
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).toContain('https:')
      expect(scriptSrc).toContain('\'unsafe-inline\'')
      expect(scriptSrc).toContain('\'unsafe-eval\'')
    })

    it('opens style-src to https: + unsafe-inline', () => {
      const csp = buildCsp(env())
      const styleSrc = csp.match(/style-src ([^;]+)/)![1]!
      expect(styleSrc.split(/\s+/)).toContain('https:')
      expect(styleSrc).toContain('\'unsafe-inline\'')
    })

    it('opens img-src + frame-src + media-src + font-src to https:', () => {
      const csp = buildCsp(env())
      for (const dir of ['img-src', 'frame-src', 'media-src', 'font-src']) {
        const m = csp.match(new RegExp(`${dir} ([^;]+)`))![1]!
        expect(m.split(/\s+/), dir).toContain('https:')
      }
    })

    it('opens connect-src to https: and wss:', () => {
      const csp = buildCsp(env())
      const connectSrc = csp.match(/connect-src ([^;]+)/)![1]!
      expect(connectSrc.split(/\s+/)).toContain('https:')
      expect(connectSrc.split(/\s+/)).toContain('wss:')
    })
  })

  describe('Glitch build (VITE_APP_GLITCH=true)', () => {
    it('adds unsafe-inline to script-src for the iframe bootstrap', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc).toContain('\'unsafe-inline\'')
    })

    it('does NOT add unsafe-eval (only GD needs that)', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc).not.toContain('\'unsafe-eval\'')
    })

    it('does NOT open script-src to https:', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).not.toContain('https:')
    })
  })

  describe('directive ordering and shape', () => {
    it('emits all 8 standard directives separated by "; "', () => {
      const csp = buildCsp(baseEnv())
      for (const dir of ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'frame-src', 'media-src', 'font-src']) {
        expect(csp).toContain(dir)
      }
      // Should be separated by "; " (semicolon + space) per CSP convention.
      expect(csp.split('; ').length).toBe(8)
    })

    it('every directive starts with "self"', () => {
      const csp = buildCsp(baseEnv())
      for (const directive of csp.split('; ')) {
        expect(directive).toMatch(/^[a-z-]+ 'self'/)
      }
    })
  })
})

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    // Without this, `@vitejs/plugin-vue` drops the SFC `<i18n>` custom block
    // on the floor and every component that keeps its copy there renders raw
    // keypaths under test. That blind spot hid a real bug: `<i18n-t>` with
    // the invalid `scope="local"` resolves against the GLOBAL messages, so
    // `rewardedIntro.bodyReward` shipped untranslated. Mirrors the
    // `defaultSFCLang` used by `vite.config.ts`.
    VueI18nPlugin({ defaultSFCLang: 'yaml' })
  ],
  // Vite's production config (`vite.config.ts`) injects `APP_VERSION` at
  // build time via `define`. Vitest doesn't run that plugin, so any
  // module that reads `APP_VERSION` at import time (e.g. `useUser.ts`)
  // throws ReferenceError under tests. Mirror the define here so test
  // imports of those modules don't trip on a missing global.
  define: {
    APP_VERSION: JSON.stringify('test')
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/save/setup.ts'],
    // tests/e2e runs under Playwright + a real Vite dev server (Node env,
    // not jsdom). Excluded from the default suite so `pnpm test` stays
    // fast; run them with `pnpm test:e2e`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  }
})
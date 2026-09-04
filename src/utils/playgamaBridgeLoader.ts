// ─── Playgama Bridge v2 loader ─────────────────────────────────────────────
//
// The ONE place `@playgama/bridge` enters the module graph. It exists as its
// own file for two reasons, both structural:
//
// 1. THE IMPORT MUST BE BUILD-GATED. `playgamaPlugin.ts` is statically
//    imported by `App.vue` (it needs synchronous access to the mute/pause
//    refs), so the plugin module is in EVERY build's graph. The Bridge npm
//    package is a ~286 KB single-file bundle with a module-level singleton —
//    Rollup cannot prove it side-effect-free, so a static import inside the
//    plugin would ship the whole Bridge to CrazyGames, GameDistribution,
//    itch, GamePix and Y8.
//
//    A plain `if (isPlaygama) await import(...)` is NOT enough: Rollup still
//    emits the chunk because the syntactic dynamic import survives. The
//    `import.meta.env`-literal TERNARY below is what makes the whole call
//    disappear on other builds — the same trick `usePVP.ts` uses to keep
//    PeerJS out of non-PvP bundles. `bundlePurity.test.ts` asserts the result.
//
// 2. OBFUSCATOR CONSTRAINT. `vite-plugin-javascript-obfuscator`'s
//    `stringArray` transform rewrites the specifier inside `import('...')`
//    into an array lookup Vite can no longer resolve. Files containing a
//    dynamic import therefore have to sit on the obfuscator's exclude list in
//    `vite.config.ts`. Keeping the import in a ~30-line leaf module means
//    only this file loses obfuscation, not the ~550-line plugin that holds
//    the actual integration logic.
//
// Why npm rather than the CDN `<script>` tag every other portal build used:
// YouTube Playables forbids external server calls, and the CDN build cannot
// satisfy that — it is a webpack bundle with
// `publicPath = "https://bridge.playgama.com/v1/stable/"`, so it fetches its
// per-platform adapter chunks at runtime and posts to `api.playgama.com`.
// The npm build is a single self-contained file with no chunk loading at all.

// The package's DEFAULT export is the singleton instance (a value); the
// class type is exported separately as `PlaygamaBridge`.
import type { PlaygamaBridge } from '@playgama/bridge'

export type Bridge = PlaygamaBridge

/**
 * Resolves the Bridge singleton, or `null` on a build that is not targeting
 * Playgama. Never throws — a failed import degrades to "no SDK" and the
 * plugin runs the game local-only.
 */
export const loadPlaygamaBridge: () => Promise<Bridge | null> =
  import.meta.env.VITE_APP_PLAYGAMA === 'true'
    ? async () => {
      try {
        const mod = await import('@playgama/bridge')
        return mod.default ?? null
      } catch (e) {
        console.warn('[playgama] Bridge module failed to load', e)
        return null
      }
    }
    : async () => null

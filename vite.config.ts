import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'
import { buildCsp } from './src/platforms/csp'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  // Only obfuscate during a real production build — never during dev,
  // where the obfuscator rewrites dynamic import strings into lookups
  // Vite can no longer transform, breaking module specifiers at runtime.
  const isProduction = (mode === 'production' || env.VITE_NODE_ENV === 'production') && command === 'build'
  const shouldObfuscate = env.VITE_ENABLE_OBFUSCATION === 'true'
  const sourcemapEnabled = env.VITE_BUILD_SOURCEMAP === 'false' ? false : !shouldObfuscate

  // ─── Exactly ONE platform flag per build ───────────────────────────────
  //
  // Vite merges `.env` with `.env.<mode>`, so a platform flag left true in
  // the base `.env` stays true for every mode that does not explicitly clear
  // it. Both `resolveSaveStrategy` and `resolveAdProvider` take the FIRST
  // matching arm, so an inherited flag silently hijacks the build — the game
  // ships with another portal's save strategy and ad provider and nothing in
  // the output hints at it. Fail the build instead.
  const PLATFORM_FLAGS = [
    'VITE_APP_CRAZY_WEB',
    'VITE_APP_WAVEDASH',
    'VITE_APP_ITCH',
    'VITE_APP_GLITCH',
    'VITE_APP_GAME_DISTRIBUTION',
    'VITE_APP_Y8',
    'VITE_APP_GAMEPIX',
    'VITE_APP_PLAYGAMA',
    'VITE_APP_POKI'
  ]
  const activeFlags = PLATFORM_FLAGS.filter(f => env[f] === 'true')
  if (activeFlags.length > 1) {
    throw new Error(
      `[build] ${activeFlags.join(', ')} are all "true" in mode "${mode}". `
      + 'Exactly one platform flag may be active per build — check .env and '
      + `.env.${mode}.local.`
    )
  }

  // `VITE_APP_YOUTUBE` is a distribution CHANNEL, not a platform: chaos-arena
  // reaches YouTube Playables through Playgama's partner pipeline, so the
  // Bridge still owns saves, ads and lifecycle. The flag only gates what
  // YouTube forbids on top of that. A YouTube build with no platform beneath
  // it would ship the Noop ad provider and LocalStorageStrategy into a runtime
  // where localStorage is null — i.e. silently no saves at all.
  if (env.VITE_APP_YOUTUBE === 'true' && activeFlags.length === 0) {
    throw new Error(
      `[build] VITE_APP_YOUTUBE is "true" in mode "${mode}" but no platform `
      + 'flag is set. YouTube Playables is published VIA a platform (Playgama) '
      + '— set VITE_APP_PLAYGAMA=true alongside it.'
    )
  }

  // Initialize plugins array
  const plugins = []

  // Only push the obfuscator if both conditions are met
  if (isProduction && shouldObfuscate) {
    console.log('--- 🛡️  Obfuscating Production Build ---')
    plugins.push(
      javascriptObfuscator({
        // Exclude files with dynamic imports — the obfuscator's stringArray
        // rewrites import paths into array lookups that Vite can no longer
        // resolve, which breaks code splitting.
        exclude: [
          /router\/index\.ts$/,
          /main\.ts$/,
          // i18n loader uses `import.meta.glob` for per-locale code
          // splitting — the obfuscator's stringArray rewrites those
          // dynamic paths so rollup can no longer produce separate
          // chunks (every locale ends up inlined in index.js).
          /i18n[\\/]index\.ts$/,
          // resolveSaveStrategy uses `await import('@/...')` inside
          // `import.meta.env.VITE_APP_*`-gated branches so Rollup can
          // tree-shake unused platform plugins. Obfuscation would
          // mangle the dynamic-import literals and break runtime
          // module resolution. (resolveAdProvider stays static-import
          // sync, so it doesn't need an exclude.)
          /platforms[\\/]resolveSaveStrategy\.ts$/,
          // GameDistributionProvider lazy-loads the heavy
          // `@/utils/gameDistributionPlugin` (~500 LOC) via dynamic
          // import so non-GD builds don't ship the GD SDK code.
          // Same obfuscator-vs-dynamic-import constraint as above.
          /use[\\/]ads[\\/]GameDistributionProvider\.ts$/,
          // PlaygamaProvider mirrors the GD pattern — lazy-loads
          // `@/utils/playgamaPlugin` so non-Playgama builds (CG, GD,
          // …) tree-shake the Bridge SDK code out completely. The
          // `bundlePurity.test.ts` Playgama check enforces this.
          /use[\\/]ads[\\/]PlaygamaProvider\.ts$/,
          // `playgamaBridgeLoader.ts` is the ONE place `@playgama/bridge`
          // enters the module graph, behind an `import.meta.env`-gated
          // dynamic import. Same obfuscator-vs-dynamic-import constraint:
          // the `stringArray` transform would rewrite the bare specifier
          // into a lookup Vite can no longer resolve. The loader is ~30
          // lines, which is exactly why the import lives there rather than
          // in the 450-line plugin — only this file loses obfuscation.
          /utils[\\/]playgamaBridgeLoader\.ts$/
        ],
        // ─── Obfuscation profile (tuned 2026-04-30) ─────────────────────
        // The previous profile enabled every aggressive transform the
        // plugin offers — `controlFlowFlattening`, `numbersToExpressions`,
        // `splitStrings`, `unicodeEscapeSequence`. Combined they were
        // inflating the bundle by ~3.4× over the unobfuscated baseline
        // (e.g. 217KB → 768KB on the entry chunk for the CrazyGames
        // build flagged by CG QA on 2026-04-30).
        //
        // The transforms removed below all have the same trade-off:
        // huge bundle / runtime cost for protection that any
        // off-the-shelf deobfuscator strips in seconds. Keeping them on
        // costs real users real download time without preventing a
        // motivated reverse-engineer for more than a coffee break.
        //
        // What stays (cheap, useful):
        //   • compact            — single-line output
        //   • simplify           — CFG simplification
        //   • stringArray        — string indirection table
        //   • stringArrayThreshold 0.6 — moderate coverage
        //
        // What was removed (expensive, low-value):
        //   • unicodeEscapeSequence — every `"foo"` → `"foo"`
        //     ~doubles strings on the wire. Trivially reversed.
        //   • splitStrings          — splits every string into 2-char
        //     pieces concatenated at runtime. Triples string size,
        //     interpretable by any human in <1 minute.
        //   • controlFlowFlattening — wraps every block in a switch
        //     dispatcher. ~30% bundle inflation, ~10% runtime perf hit.
        //   • numbersToExpressions  — every literal `5` becomes
        //     `0x4 + 0x1` etc. Bloats math-heavy modules (the canvas
        //     game loop is full of these).
        //
        // If a tighter profile is needed later, prefer enabling
        // `controlFlowFlattening` selectively on a small allowlist of
        // sensitive files (anti-cheat hot paths, license checks) rather
        // than blanket-enabling everywhere.
        options: {
          compact: true,
          simplify: true,
          stringArray: true,
          stringArrayThreshold: 0.6
        }
      } as any)
    )
  }

  // ─── CSP generation ────────────────────────────────────────────────
  // The whole per-platform CSP shape lives in `src/platforms/csp.ts`
  // — extracted so it's unit-testable. Adding a new platform's CSP
  // contribution = edit that file, not this one.
  //
  // An EMPTY string means "this platform must not ship a CSP meta tag at
  // all" — YouTube Playables, where the policy would also apply to
  // YouTube's own SDK and telemetry running in the same document. The
  // placeholder comment is simply left in the HTML in that case.
  const cspValue = buildCsp(env)

  if (cspValue) {
    plugins.push({
      name: 'inject-csp',
      transformIndexHtml(html: string) {
        return html.replace(
          '<!-- CSP meta tag injected by vite.config.ts at build time -->',
          `<meta http-equiv="Content-Security-Policy" content="${cspValue}" />`
        )
      }
    })
  }

  // YouTube Playables is a distribution CHANNEL layered on the Playgama
  // build, not a platform of its own — see `.env.youtube.local`. The Bridge's
  // `youtube` adapter is what talks to YouTube's ytgame SDK.
  const isYouTube = env.VITE_APP_YOUTUBE === 'true'
  const isPlaygama = env.VITE_APP_PLAYGAMA === 'true'
  const isPoki = env.VITE_APP_POKI === 'true'
  const isGameDistribution = env.VITE_APP_GAME_DISTRIBUTION === 'true'

  // Strip the Poki SDK <script> tag from index.html for non-Poki builds. Poki
  // is the only portal in the matrix whose SDK host must NOT appear anywhere
  // else — see the `resolve.alias` stub swap below for the other half.
  if (!isPoki) {
    plugins.push({
      name: 'strip-poki-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          // The comment body is `(?:(?!-->)[\s\S])*?` rather than `[^]*?` on
          // purpose: a plain lazy wildcard can start matching at an EARLIER
          // comment and swallow every tag in between. That is not theoretical
          // — it deleted the YouTube SDK tag and the storage-shim tag from this
          // build until it was fixed. The comment prefix is optional so the
          // strip still works if it is ever reworded away.
          /(?:<!--(?:(?!-->)[\s\S])*?-->\s*)?<script[^>]*game-cdn\.poki\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // Strip the CrazyGames SDK <script> tag from index.html for non-CrazyGames builds
  // so it doesn't block or error on other platforms (e.g. Wavedash).
  const isCrazyWeb = env.VITE_APP_CRAZY_WEB === 'true'
  if (!isCrazyWeb) {
    plugins.push({
      name: 'strip-crazygames-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!-- Load the SDK before your game code -->\s*<script[^>]*sdk\.crazygames\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // ─── YouTube Playables SDK tag ──────────────────────────────────────────
  //
  // Mirrors strip-crazygames-sdk. Only the YouTube channel build keeps it,
  // and there it is load-bearing rather than cosmetic: the Playgama Bridge's
  // `youtube` adapter waits for `window.ytgame` with a 100ms poll that has NO
  // timeout, so a Playables build without this tag hangs inside
  // `bridge.initialize()` forever. Every other portal strips it so nobody
  // pays for a third-party request they cannot use.
  //
  // NOTE: there is no longer a Playgama Bridge <script> tag to strip. v2 is
  // imported from the `@playgama/bridge` npm package (see
  // `src/utils/playgamaBridgeLoader.ts`) and bundled into the build, because
  // the CDN build fetches per-platform adapter chunks at runtime and posts to
  // `api.playgama.com` — neither of which YouTube permits.
  if (!isYouTube) {
    plugins.push({
      name: 'strip-youtube-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          // Same confined-comment form as the Poki stripper below — see the
          // note there for what a bare `[^]*?` costs.
          /(?:<!--(?:(?!-->)[\s\S])*?-->\s*)?<script[^>]*youtube\.com\/game_api[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // Emit `dist/playgama-bridge-config.json` ONLY for `pnpm build:playgama`.
  // Never serves it in dev (the Bridge would 404 it on localhost and
  // fall back to MOCK, which is what we want there). Never in other
  // builds either — the file MUST NOT be in `public/` because Vite would
  // serve it across every build mode and force the production-portal
  // protocol on the QA Tool / dev sandbox, hanging `initialize()`.
  //
  // Crucially, the config does NOT contain `forciblySetPlatformId` —
  // Bridge auto-detects the right protocol per parent-frame handshake
  // for the production portal, the developer QA Tool, and every other
  // Playgama-ecosystem context. Forcing a platform id breaks every
  // context except the one chosen at build time.
  if (isPlaygama) {
    plugins.push({
      name: 'emit-playgama-bridge-config',
      apply: 'build' as const,
      generateBundle(this: any) {
        this.emitFile({
          type: 'asset',
          fileName: 'playgama-bridge-config.json',
          source: JSON.stringify({
            advertisement: { minimumDelayBetweenInterstitial: 120 }
          }, null, 2)
        })
      }
    })
  }

  return {
    base: '/',
    server: {
      port: 5170
    },
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version)
    },
    plugins: [
      tailwindcss(),
      vue(),
      // vueDevTools(),
      VueI18nPlugin({
        // 1. Tell the plugin where your global translation files are
        include: resolve(dirname(fileURLToPath(import.meta.url)), './src/locales/**'),

        // 2. This allows you to use YAML in the <i18n> block
        // The plugin usually detects yaml automatically, but you can force
        // strict behavior if needed by ensuring the 'yaml' loader is available.
        defaultSFCLang: 'yaml'
      }),
      ...plugins
    ],
    resolve: {
      alias: {
        // ─── Poki stub swap — REQUIRED, not belt-and-braces ────────────
        //
        // On a non-Poki build both modules resolve to no-op stubs, so the
        // PokiSDK URL never enters the bundle at all.
        //
        // The obvious reasoning — "every Poki call is behind
        // `import.meta.env.VITE_APP_POKI === 'true'`, esbuild folds it to
        // false, Rollup drops the import" — is WRONG in this repo, because
        // we run `vite-plugin-javascript-obfuscator`. Its `stringArray` pass
        // hoists string literals into an indirection table BEFORE esbuild
        // folds the env comparison, so the SDK URL survives dead-code
        // elimination even though the code around it is eliminated. In the
        // project this pattern came from, `game-cdn.poki.com` was measured
        // sitting in the CrazyGames entry chunk after a by-the-book
        // env-gated integration.
        //
        // It compounds: `resolveAdProvider` statically imports EVERY
        // provider, and `useGameplayLifecycle` statically imports the
        // bracket functions, so both modules are in every build's graph
        // regardless of flags.
        //
        // Aliasing replaces the module before bundling and leaves a valid
        // one behind — unlike deleting the emitted chunk, which 404s
        // whatever still imports it. Verify with:
        //   pnpm build:crazy-web && grep -rl "game-cdn.poki.com" dist/
        // which must print nothing. MUST come before the '@' catch-alls.
        ...(env.VITE_APP_POKI === 'true' ? {} : {
          '@/use/ads/PokiProvider': fileURLToPath(new URL('./src/use/ads/PokiProvider.stub.ts', import.meta.url)),
          '@/utils/pokiPlugin': fileURLToPath(new URL('./src/utils/pokiPlugin.stub.ts', import.meta.url))
        }),
        // The mirror image, and only on Poki. The GD plugin is reached solely
        // through dead-branch dynamic imports, but Rollup still emits its chunk
        // — carrying `html5.api.gamedistribution.com`. Poki's requirement #6 is
        // explicit: "No third-party ads. Only the PokiSDK may serve
        // advertising. Strip every other ad SDK from the Poki build."
        ...(env.VITE_APP_POKI === 'true' ? {
          '@/utils/gameDistributionPlugin': fileURLToPath(new URL('./src/utils/gameDistributionPlugin.stub.ts', import.meta.url)),
          // Poki forbids in-app purchases. `VITE_APP_FEATURE_BG_SKINS=false`
          // already makes the shop unreachable, but it was still BUNDLED — its
          // real-money price strings ($1.29 / $1.99 / $9.99) sat in the shipped
          // SpinnerArena chunk, and "unreachable" is not an argument you get to
          // make to a reviewer who grepped the bundle.
          '@/components/organisms/InAppPurchaseShop.vue': fileURLToPath(new URL('./src/components/organisms/InAppPurchaseShop.stub.vue', import.meta.url))
        } : {}),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@/': fileURLToPath(new URL('./src/', import.meta.url)),
        '#': fileURLToPath(new URL('./src/assets', import.meta.url))
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    build: {
      minify: 'esbuild',
      // Source maps ship by default on unobfuscated builds (they are only
      // ever fetched with devtools open) but can be turned off per mode with
      // `VITE_BUILD_SOURCEMAP=false`.
      //
      // YouTube Playables sets it. That build deliberately runs WITHOUT the
      // obfuscator so a QA stack trace is readable — but the bundle is served
      // from a public URL, and shipping maps alongside it would publish the
      // full original source, which is the very thing the obfuscator exists to
      // prevent everywhere else. Unobfuscated minified code already gives a
      // greppable file+line; the maps would only add ~2.4 MB of upload and a
      // complete source disclosure.
      sourcemap: sourcemapEnabled,
      rollupOptions: {
        output: {
          // Pin the ACTIVE platform's heavy ad/SDK plugin to its own async
          // chunk. Without this, Rollup's default chunker may merge a small
          // plugin (e.g. playgamaPlugin) into a hot-path chunk
          // (index/App/SpinnerArena) — a nondeterministic split that
          // `bundlePurity.test.ts` rightly flags.
          //
          // Two rules, and the ORDER between them is what matters.
          //
          // `manualChunks` is called for every module in the GRAPH, including
          // ones tree-shaking will remove: a dead-branch
          // `await import('@/utils/gameDistributionPlugin')` puts that module
          // in the graph on every build. Naming it creates the chunk group
          // anyway, the seed is then shaken away, and Rollup fills the empty
          // group with whatever shares its dependency signature. That is how
          // YouTube QA's crash report came back as
          // `plugin-gd-CQHccaXY.js:19:42110` for a null-localStorage read in
          // `useSpinnerConfig.ts`, on a build shipping no GameDistribution
          // code at all — the "plugin-gd" chunk was Vue plus the composables.
          //
          // So each plugin pin is GATED on its own platform flag: a build with
          // none of that platform's code in it never names a group for it, and
          // the composables stay in `index` where they belong. Claiming the
          // framework as `vendor-vue` FIRST does the rest — it is the largest
          // thing an emptied group could otherwise absorb.
          //
          // The pins still exist because Rollup's default chunker can merge a
          // small ACTIVE plugin chunk into App nondeterministically, which is
          // the leak `bundlePurity.test.ts` exists to catch.
          manualChunks(id: string) {
            // Vendor first. A manual-chunk group survives its seed module
            // being tree-shaken away, and Rollup will then fill the empty
            // group with whatever shares its dependency signature. Claiming
            // the framework explicitly means the biggest such candidate can
            // never drift into a platform-plugin group again.
            if (/node_modules[\/](@vue|vue|vue-router|vue-i18n|@intlify)[\/]/.test(id)) {
              return 'vendor-vue'
            }
            // The Bridge npm package is ~286 KB on its own. Pin it next to the
            // plugin that loads it so the split is deterministic and the chunk
            // name says what is actually inside.
            if (isPlaygama && id.includes('@playgama/bridge')) return 'playgama-bridge'
            if (isPoki && id.includes('utils/pokiPlugin')) return 'plugin-poki'
            if (isPlaygama && id.includes('utils/playgamaPlugin')) return 'plugin-playgama'
            if (isGameDistribution && id.includes('utils/gameDistributionPlugin')) return 'plugin-gd'
          }
        }
      }
    }
  }
})

import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'

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
          /i18n[\\/]index\.ts$/
        ],
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          numbersToExpressions: true,
          simplify: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
          splitStrings: true,
          unicodeEscapeSequence: true
        }
      } as any)
    )
  }

  // ─── CSP generation ────────────────────────────────────────────────
  // Whitelist of external hosts. Add new platforms here — they're
  // automatically applied to every relevant directive.
  const CSP_HOSTS = [
    'https://*.crazygames.com',
    'https://sdk.crazygames.com',
    'https://wavedash.com',
    'https://*.wavedash.com',
    'https://itch.io',
    'https://*.itch.io',
    'https://glitch.fun',
    'https://*.glitch.fun',
    'https://gamedistribution.com',
    'https://*.gamedistribution.com',
    'https://www.clarity.ms',
    'https://api.jsonbin.io'
  ]

  // GameDistribution-specific partner hosts. The GD SDK's `main.min.js`
  // dynamically loads scripts from a fan-out of partner ad-tech /
  // analytics CDNs at runtime — the GD-base whitelist above only covers
  // gd.com itself, so we add these only for `isGameDistribution` builds
  // to keep other platforms' CSPs as tight as possible. Sourced from
  // observed network requests on a deployed gd.com preview, mid-2026.
  // If GD adds new partners later, append here.
  const isGameDistribution = env.VITE_APP_GAME_DISTRIBUTION === 'true'
  const GD_PARTNER_HOSTS = isGameDistribution ? [
    'https://*.gamemonkey.org',
    'https://*.improvedigital.com',
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net',
    'https://imasdk.googleapis.com',
    'https://*.2mdn.net',
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://*.googletagservices.com',
    'https://*.googletagmanager.com',
    'https://*.google-analytics.com',
    'https://*.googleadservices.com',
    'https://www.google.com',
    'https://www.gstatic.com',
    'https://fundingchoicesmessages.google.com',
    'https://*.adnxs.com',
    'https://*.adsafeprotected.com',
    'https://*.adform.net',
    'https://*.amazon-adsystem.com',
    'https://*.casalemedia.com',
    'https://*.criteo.com',
    'https://*.criteo.net',
    'https://*.openx.net',
    'https://*.pubmatic.com',
    'https://*.rubiconproject.com'
  ] : []

  // Extra per-directive sources that don't follow the blanket host pattern.
  // Glitch.fun wraps the game in an iframe and injects inline bootstrap
  // scripts (Aegis bridge, heartbeat, feature-policy probes), so script-src
  // needs 'unsafe-inline' for that platform specifically. GameDistribution
  // also requires 'unsafe-inline' / 'unsafe-eval' on script-src because
  // the partner ad scripts use eval-style code; without it the GD SDK
  // chains errors and never reports SDK_READY successfully.
  //
  // GameDistribution additionally needs `https:` on script-src because the
  // bidder waterfall (headerlift → Prebid → APS / IDx / Lotame / Pubcid /
  // Hadron / ID5 / etc.) loads scripts from a long tail of partner CDNs
  // that is dynamic — the host list shifts as GD adjusts demand. Mirrors
  // the same `https:` opening already applied to connect-src / frame-src /
  // media-src below for the same reason. Other distribution channels
  // (CrazyGames, Glitch, Itch, Wavedash) keep the tight allow-list.
  const isGlitch = env.VITE_APP_GLITCH === 'true'
  const scriptSrcExtra: string[] = []
  if (isGlitch) scriptSrcExtra.push('\'unsafe-inline\'')
  if (isGameDistribution) scriptSrcExtra.push('https:', '\'unsafe-inline\'', '\'unsafe-eval\'')
  const CSP_EXTRA: Record<string, string[]> = {
    'script-src': scriptSrcExtra,
    // GD's IAB TCF v2 consent wall pulls Google Fonts CSS at runtime —
    // opening to `https:` for GD only, same pattern as script-src/img-src.
    'style-src': isGameDistribution ? ['https:', '\'unsafe-inline\''] : ['\'unsafe-inline\''],
    // GD ad creatives come from arbitrary CDNs — opening to https: only
    // for that build type (other platforms keep the tight whitelist).
    'img-src': isGameDistribution ? ['data:', 'https:', 'blob:'] : ['data:'],
    'connect-src': [
      'https://*.sentry.io',
      'wss://*.wavedash.com',
      'wss://0.peerjs.com',
      'https://0.peerjs.com',
      'https://getpantry.cloud',
      'https://*.getpantry.cloud',
      // GD partner analytics / ad telemetry beacons.
      ...(isGameDistribution ? ['https:', 'wss:'] : [])
    ],
    // GD ads frequently render in nested iframes from partner domains.
    'frame-src': isGameDistribution ? ['https:'] : [],
    'media-src': isGameDistribution ? ['https:', 'blob:'] : [],
    // The consent wall + many partner CDNs serve webfonts. `font-src`
    // wasn't previously declared, so the browser fell back to
    // `default-src` (which is just `'self'`) and blocked every font.
    // Add a dedicated directive: open to `https:` + `data:` on GD,
    // tight on other platforms.
    'font-src': isGameDistribution ? ['https:', 'data:'] : ['data:']
  }
  const cspDirectives = [
    'default-src', 'script-src', 'style-src', 'img-src',
    'connect-src', 'frame-src', 'media-src', 'font-src'
  ]
  const cspValue = cspDirectives.map(dir => {
    const extras = CSP_EXTRA[dir] ?? []
    const hosts = [...CSP_HOSTS, ...GD_PARTNER_HOSTS]
    return `${dir} 'self' ${hosts.join(' ')} ${extras.join(' ')}`.trim()
  }).join('; ')

  plugins.push({
    name: 'inject-csp',
    transformIndexHtml(html: string) {
      return html.replace(
        '<!-- CSP meta tag injected by vite.config.ts at build time -->',
        `<meta http-equiv="Content-Security-Policy" content="${cspValue}" />`
      )
    }
  })

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

  return {
    base: '/',
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
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@/': fileURLToPath(new URL('./src/', import.meta.url)),
        '#': fileURLToPath(new URL('./src/assets', import.meta.url))
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    build: {
      minify: 'esbuild',
      // Disable source maps in production if you want maximum protection
      sourcemap: !shouldObfuscate
    }
  }
})

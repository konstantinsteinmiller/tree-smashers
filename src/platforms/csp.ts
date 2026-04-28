// ─── CSP generator ──────────────────────────────────────────────────────────
//
// Pure function. Takes the loaded env (as `loadEnv()` returns from Vite)
// and produces the Content-Security-Policy string the build-time meta tag
// uses. Lifted out of `vite.config.ts` so per-platform CSP shape can be
// unit-tested without spinning up Vite.
//
// Adding a new platform:
//   1. If it has its own host whitelist, add an entry under `PLATFORM_HOSTS`.
//   2. If it needs script-src `'unsafe-inline'` / `'unsafe-eval'` / `https:`,
//      check `env.VITE_APP_<PLATFORM>` and push into `scriptSrcExtra`.
//   3. If its bidder waterfall pulls in a long tail of partner CDNs, mirror
//      the GameDistribution pattern (open the relevant directives to `https:`).
//   4. Otherwise no change to this file is needed — `'self'` + the BASE_HOSTS
//      cover the rest.

/** Hosts allowed across every build mode (the platform stays itself when
 *  loaded standalone, and the SDK from each portal can reach its API).
 *  Keep this list short — add platform-specific hosts to PLATFORM_HOSTS. */
const BASE_HOSTS: ReadonlyArray<string> = [
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

/** GameDistribution-specific partner ad-tech / analytics CDNs. The GD SDK
 *  loads these at runtime; only ship the long whitelist on GD builds so the
 *  other platforms keep tight CSPs. */
const GD_PARTNER_HOSTS: ReadonlyArray<string> = [
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
]

const CONNECT_BASE_EXTRA: ReadonlyArray<string> = [
  'https://*.sentry.io',
  'wss://*.wavedash.com',
  'wss://0.peerjs.com',
  'https://0.peerjs.com',
  'https://getpantry.cloud',
  'https://*.getpantry.cloud'
]

const CSP_DIRECTIVES = [
  'default-src', 'script-src', 'style-src', 'img-src',
  'connect-src', 'frame-src', 'media-src', 'font-src'
] as const

/**
 * Build the full CSP string for the given build env. Mirrors what
 * vite.config.ts used to do inline; intended to be called from there at
 * `transformIndexHtml` time.
 */
export const buildCsp = (env: Record<string, string>): string => {
  const isGameDistribution = env.VITE_APP_GAME_DISTRIBUTION === 'true'
  const isGlitch = env.VITE_APP_GLITCH === 'true'

  const hosts: string[] = [...BASE_HOSTS, ...(isGameDistribution ? GD_PARTNER_HOSTS : [])]

  // Per-directive extras — mode-driven openings beyond `'self'` + hosts.
  const scriptSrcExtra: string[] = []
  if (isGlitch) scriptSrcExtra.push('\'unsafe-inline\'')
  if (isGameDistribution) scriptSrcExtra.push('https:', '\'unsafe-inline\'', '\'unsafe-eval\'')

  const extras: Record<string, string[]> = {
    'script-src': scriptSrcExtra,
    // GD's IAB TCF v2 consent wall pulls Google Fonts CSS at runtime —
    // open style-src to https: for GD only.
    'style-src': isGameDistribution ? ['https:', '\'unsafe-inline\''] : ['\'unsafe-inline\''],
    // GD ad creatives come from arbitrary CDNs — open img-src to https:
    // for that build type only.
    'img-src': isGameDistribution ? ['data:', 'https:', 'blob:'] : ['data:'],
    'connect-src': [
      ...CONNECT_BASE_EXTRA,
      // GD partner analytics / ad telemetry beacons.
      ...(isGameDistribution ? ['https:', 'wss:'] : [])
    ],
    // GD ads frequently render in nested iframes from partner domains.
    'frame-src': isGameDistribution ? ['https:'] : [],
    'media-src': isGameDistribution ? ['https:', 'blob:'] : [],
    // The consent wall + many partner CDNs serve webfonts.
    'font-src': isGameDistribution ? ['https:', 'data:'] : ['data:']
  }

  return CSP_DIRECTIVES.map(dir => {
    const directiveExtras = extras[dir] ?? []
    return `${dir} 'self' ${hosts.join(' ')} ${directiveExtras.join(' ')}`.trim()
  }).join('; ')
}

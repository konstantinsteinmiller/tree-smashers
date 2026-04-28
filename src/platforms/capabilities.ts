// ─── Platform capability resolver ───────────────────────────────────────────
//
// Pure function. Takes the build-time platform flags + the runtime hostname
// + Glitch's license-status ref and returns every capability gate App.vue
// previously inlined as a `computed`. The extraction collapses the nested
// `(isCrazyWeb && isCrazyGamesUrl()) || isNotPlatformBuild` patterns into
// a single source of truth — adding a new platform now means adding ONE
// arm here, not editing five computeds in App.vue.
//
// All functions are pure: they take the inputs they need explicitly, no
// module-level state, no Vue, no `window` reads. Vue components wrap the
// call in `computed()` so reactivity flows correctly.

export interface PlatformFlags {
  isCrazyWeb: boolean
  isWaveDash: boolean
  isItch: boolean
  isGlitch: boolean
  isGameDistribution: boolean
}

export type GlitchLicenseStatus = 'pending' | 'ok' | 'denied'

export interface CapabilitiesInput {
  flags: PlatformFlags
  hostname: string
  /**
   * Origin of the parent frame, when the game is embedded in an iframe.
   * Caller fills this with `window.location.ancestorOrigins?.[0] ?? document.referrer`.
   * Empty string when not iframed. Required so the Glitch detection can match
   * "embedded on glitch.fun via a CDN iframe" (where `hostname` is the CDN's,
   * not glitch.fun's). Optional in the input for backwards-compatibility with
   * non-iframe contexts; defaults to '' when omitted.
   */
  parentOrigin?: string
  glitchLicenseStatus: GlitchLicenseStatus
}

export interface ResolvedCapabilities {
  /** True when no platform flag is set — plain web / dev / `pnpm dev`. */
  isNotPlatformBuild: boolean
  /** Per-platform "render the game" gates: flag + matching hostname,
   *  OR the dev escape hatch (isNotPlatformBuild). */
  allowedToShowOnCrazyGames: boolean
  allowedToShowOnWaveDash: boolean
  allowedToShowOnItch: boolean
  allowedToShowOnGlitch: boolean
  allowedToShowOnGameDistribution: boolean
  /** True when Glitch was selected but their license API rejected the player. */
  isGlitchDenied: boolean
  /** True when the build targets a platform AND the license check has settled.
   *  Used by the "this game is currently only available on …" gate so the
   *  copy doesn't flash up before we know whether Glitch will let us in. */
  showOnlyAvailableText: boolean
  /** Domain string for the "available on <platform>" copy. Empty on dev. */
  plattformText: string
}

// ─── Hostname matchers ──────────────────────────────────────────────────────
// Kept separate so each platform's URL detection lives next to the other
// platform-specific code in this file rather than spread across App.vue.

const isCrazyGamesUrl = (hostname: string): boolean =>
  hostname.includes('crazygames')

const isWaveDashUrl = (hostname: string): boolean =>
  hostname.includes('wavedash')

const isItchUrl = (hostname: string): boolean =>
  hostname.includes('itch') || hostname.includes('itch.io') || hostname.includes('itch.zone')

const isGlitchUrl = (hostname: string, parentOrigin: string): boolean => {
  if (hostname.includes('glitch.fun')) return true
  // Glitch hosts the game bundle on a CDN and embeds it in an iframe whose
  // parent is glitch.fun, so the iframe's own hostname won't match. Accept
  // the parent frame's origin as proof of embed.
  return /(^|\/\/)([^/]+\.)?glitch\.fun(\/|$)/.test(parentOrigin || '')
}

const isGameDistUrl = (hostname: string): boolean =>
  hostname.includes('gamedistribution.com')

// ─── Resolver ───────────────────────────────────────────────────────────────

export const resolveCapabilities = (input: CapabilitiesInput): ResolvedCapabilities => {
  const { flags, hostname, glitchLicenseStatus } = input
  const parentOrigin = input.parentOrigin ?? ''

  const isNotPlatformBuild =
    !flags.isCrazyWeb && !flags.isWaveDash && !flags.isItch && !flags.isGlitch && !flags.isGameDistribution

  const allowedToShowOnCrazyGames =
    (flags.isCrazyWeb && isCrazyGamesUrl(hostname)) || isNotPlatformBuild

  const allowedToShowOnWaveDash =
    (flags.isWaveDash && isWaveDashUrl(hostname)) || isNotPlatformBuild

  const allowedToShowOnItch =
    (flags.isItch && isItchUrl(hostname)) || isNotPlatformBuild

  const allowedToShowOnGlitch =
    (flags.isGlitch && isGlitchUrl(hostname, parentOrigin) && glitchLicenseStatus === 'ok') || isNotPlatformBuild

  const isGlitchDenied = flags.isGlitch && glitchLicenseStatus === 'denied'

  const allowedToShowOnGameDistribution =
    (flags.isGameDistribution && isGameDistUrl(hostname)) || isNotPlatformBuild

  const anyPlatform =
    flags.isCrazyWeb || flags.isWaveDash || flags.isItch || flags.isGlitch || flags.isGameDistribution
  const showOnlyAvailableText = anyPlatform && glitchLicenseStatus !== 'pending'

  const plattformText = flags.isWaveDash
    ? 'wavedash.com'
    : flags.isCrazyWeb
      ? 'crazygames.com'
      : flags.isItch
        ? 'itch.io'
        : flags.isGlitch
          ? 'glitch.fun'
          : flags.isGameDistribution
            ? 'gamedistribution.com'
            : ''

  return {
    isNotPlatformBuild,
    allowedToShowOnCrazyGames,
    allowedToShowOnWaveDash,
    allowedToShowOnItch,
    allowedToShowOnGlitch,
    allowedToShowOnGameDistribution,
    isGlitchDenied,
    showOnlyAvailableText,
    plattformText
  }
}

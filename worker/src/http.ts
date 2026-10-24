// ─── Shared HTTP helpers for every Worker route ─────────────────────────────
//
// Split out of index.ts when the league routes (league.ts) arrived, so both
// route files answer with the SAME CORS, JSON, HMAC and id/name rules.

import { sanitizeDisplayName } from '../../src/utils/nameDenylist'

export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS?: string
  SCORE_SECRET?: string
  /** HMAC key of league battle tokens (`wrangler secret put LEAGUE_SECRET`).
   *  Server-only: the client never signs anything with it. Unset = the
   *  league's /start and /result answer 503; every other route works. */
  LEAGUE_SECRET?: string
}

/** `[a-zA-Z0-9_-]`, 8–64 — the same shape the client mints. */
export const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id)

/**
 * Strip the characters that let a name break a table or impersonate a rank:
 * C0/C1 controls, zero-width joiners and spaces, bidi overrides, and the BOM —
 * then swap a denylisted name for its deterministic generated stand-in (the
 * same one the client and the snapshot baker compute, so the player's own row
 * is still recognised as theirs).
 */
export const cleanName = (raw: unknown): string => {
  if (typeof raw !== 'string') return 'Anon'
  const out = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .trim()
    .slice(0, 16)
  return out.length > 0 ? sanitizeDisplayName(out) : 'Anon'
}

export const corsHeaders = (env: Env, origin: string | null): Record<string, string> => {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // An empty allowlist means "any": every portal build has its own origin and a
  // sandboxed iframe sends `null`, so locking this down is opt-in per deploy.
  const ok = allowed.length === 0 || (origin !== null && allowed.includes(origin))
  return {
    'access-control-allow-origin': ok ? (origin ?? '*') : 'null',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    // Wavedash serves the game cross-origin isolated (COEP: require-corp) and
    // asks every server the game talks to for this on EVERY response, errors
    // included (docs.wavedash.com/platform/cross-origin-isolation). A CORS
    // `fetch` already passes on the allow-origin header alone; this covers
    // anything ever loaded without CORS. Harmless for every other portal.
    'cross-origin-resource-policy': 'cross-origin'
  }
}

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra }
  })

/**
 * Re-clothe a cached response with this request's CORS headers.
 *
 * The cached copy carries whatever origin was allowed when it was stored, and
 * every portal build serves the game from a different one — so the headers have
 * to be rewritten per request or the second portal to ask gets a body it is not
 * allowed to read.
 */
export const withCors = (
  res: Response, cors: Record<string, string>, extra: Record<string, string> = {}
): Response => {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries({ ...cors, ...extra })) out.headers.set(k, v)
  return out
}

export const hmac = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time compare, so a signature cannot be probed a byte at a time. */
export const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

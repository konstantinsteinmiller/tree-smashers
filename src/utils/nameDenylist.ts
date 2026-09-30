/**
 * ─── Player-name denylist ───────────────────────────────────────────────────
 *
 * ONE list, shared by every place a name can reach a public board:
 *
 *   • the Cloudflare Worker (`worker/src/index.ts`) — on write, and again when it
 *     publishes the board, so rows written before this existed are masked too
 *   • the snapshot baker (`scripts/leaderboard-snapshot.mjs`)
 *   • the client's board adoption (`useLiveLeaderboard`) — render-time fallback
 *     for a board banked in a cache or baked by an older build
 *
 * Deliberately dependency-free and written in erasable-only TypeScript (no
 * enums, no parameter properties, no imports) so Node's type stripping can load
 * it from a `.mjs` script and Wrangler's esbuild from the Worker, unchanged.
 *
 * ── Matching ──
 * A name is normalised before it is compared: lowercase, diacritics dropped,
 * Cyrillic look-alikes folded to Latin, short digit/symbol runs read as
 * leetspeak (`S3x`, `5h1t`, `@ss`), long digit runs dropped as the plain numbers
 * they are, and every separator removed (`f.u_c-k`). It is compared both as-is
 * and with repeated letters collapsed (`fuuuuck`).
 *
 * Two strengths, because a substring match on a short word is how the
 * Scunthorpe problem happens (`cock` in "Peacock", `ass` in "Class"):
 *
 *   STRONG — unambiguous even inside another word; SUBSTRING match.
 *   TOKEN  — only a whole word of the name (split on separators, digits and
 *            camelCase) or the whole name. Short or ambiguous words live here.
 *
 * The audience is 6–15, so a false positive is cheap (the row just shows a
 * generated name) and a false negative is not. Terms are written in their
 * normalised form (lowercase ASCII, no separators).
 *
 * Keep it SMALL: this is a floor against the obvious, not a moderation system.
 * Add a term when a real name gets through, and add that name to the tests.
 */

// ─── Terms ──────────────────────────────────────────────────────────────────
//
// Written naturally (Cyrillic as Cyrillic, `ñ` as `ñ`) and run through
// `normalizeName` at load, so a term and a name always meet in the same form.

const STRONG_TERMS: readonly string[] = [
  // en — profanity / sexual
  'fuck', 'phuck', 'fvck', 'fock', 'fck', 'motherf', 'shit', 'bitch', 'biatch', 'cunt', 'bastard',
  'asshole', 'dumbass', 'jackass', 'whore', 'slut', 'penis', 'vagina', 'porn', 'sex', 'milf',
  'hentai', 'dildo', 'jizz', 'blowjob', 'handjob', 'orgasm', 'boner', 'nudes', 'pedophil',
  'paedophil', 'twat', 'wanker', 'bollock', 'testicl',
  // en — slurs
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'chingchong', 'chingchang',
  // extremism / real people with abuse connotations
  'hitler', 'siegheil', 'meinkampf', 'auschwitz', 'holocaust', 'whitepower', 'kukluxklan',
  'pstein', 'epstien', 'diddler',
  // self-harm / drugs
  'killyourself', 'kilyourself', 'suicide', 'cocaine', 'methhead',
  // de
  'ficken', 'ficker', 'fickdich', 'hurensohn', 'wichser', 'fotze', 'arschloch', 'schlampe',
  'missgeburt', 'schwuchtel', 'spasti', 'kanake', 'neger', 'hodensack', 'muschi',
  // es
  'hijodeputa', 'putamadre', 'joder', 'cabrón', 'pendejo', 'mierda', 'chinga', 'maricón',
  'gilipollas', 'culero',
  // fr
  'putain', 'connard', 'connasse', 'salope', 'enculé', 'niquetamère', 'bâtard',
  // pt
  'caralho', 'buceta', 'viado', 'foder', 'arrombad', 'piroca', 'cuzão',
  // ru — Latin transliteration
  'blyat', 'blyad', 'pizdec', 'pizda', 'pidor', 'pidar', 'mudak', 'nahui', 'nahuy', 'yebat',
  'zalupa', 'shluha',
  // ru — Cyrillic
  'хуй', 'хуи', 'пизд', 'бляд', 'блят', 'секс', 'ебат', 'ебан', 'пидор', 'пидар', 'мудак',
  'залуп', 'шлюх', 'сука',
  // tr
  'orospu', 'siktir', 'sikerim', 'yarrak', 'pezevenk', 'amcık', 'amınakoy'
]

const TOKEN_TERMS: readonly string[] = [
  // en
  'ass', 'arse', 'dick', 'cock', 'pussy', 'fag', 'fuk', 'cum', 'tits', 'titty', 'boob', 'boobs',
  'anal', 'anus', 'rape', 'rapist', 'raper', 'nude', 'naked', 'horny', 'wank', 'wtf', 'stfu', 'kys',
  'nazi', 'nazis', 'kkk', 'isis', 'weed', 'meth', 'heroin', 'pedo', 'paedo', 'hoe', 'hoes',
  'coon', 'spic', 'chink', 'dyke',
  // de
  'arsch', 'hure', 'fick', 'kacke', 'spast', 'pimmel', 'titten', 'nutte',
  // es / pt / fr
  'puta', 'puto', 'polla', 'zorra', 'coño', 'verga', 'porra', 'fdp', 'pute', 'nique', 'ebat',
  'merde', 'merda',
  // ru / tr
  'xui', 'xuy', 'suka', 'amk', 'sik'
]

/** Matched against the name with only separators removed — for numbers that
 *  are the slur, where reading digits as leetspeak would lose them. */
const RAW_DIGITS: readonly string[] = ['1488']

// ─── Normalisation ──────────────────────────────────────────────────────────

/** Leet digits/symbols → letters. Only applied to SHORT digit runs (see below). */
const LEET: Readonly<Record<string, string>> = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g',
  '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e'
}

/** Cyrillic letters that are drawn like Latin ones → the Latin letter, so a
 *  mixed-script name cannot dodge a term by swapping one glyph. Applied to the
 *  terms too. */
const CYRILLIC_FOLD: Readonly<Record<string, string>> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't',
  у: 'y', х: 'x', і: 'i', ј: 'j'
}

/** Other letters NFKD leaves alone. */
const SPECIAL: Readonly<Record<string, string>> = { ß: 'ss', ı: 'i', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd' }

const foldChar = (ch: string): string => CYRILLIC_FOLD[ch] ?? SPECIAL[ch] ?? ch

const isLetter = (ch: string): boolean => /\p{L}/u.test(ch)

/**
 * Normalise a name for matching. Exported for tests and for anything that wants
 * to compare two names "as a moderator would read them".
 */
export const normalizeName = (raw: string): string => {
  const base = raw.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const chars = [...base].map(foldChar).join('')
  let out = ''
  // A digit run of 3+ is a number ("Spinner482915", "Rusty2524"), not leetspeak;
  // reading it as letters would invent words out of random ids. Shorter runs
  // and symbols are read as the letters they stand in for ("S3x0", "5h1t").
  const runs = chars.match(/[0-9]+|[^0-9]+/g) ?? []
  for (const run of runs) {
    if (/^[0-9]+$/.test(run)) {
      if (run.length <= 2) out += [...run].map((d) => LEET[d] ?? '').join('')
      continue
    }
    for (const ch of run) {
      if (isLetter(ch)) out += ch
      else if (LEET[ch]) out += LEET[ch]
    }
  }
  return out
}

/** `fuuuuck` → `fuck`, `shiiit` → `shit`. */
const collapseRepeats = (s: string): string => s.replace(/(.)\1+/gu, '$1')

/** Split a name into words on separators and camelCase boundaries (digits stay
 *  inside their word, so `B00bs` is still one word). */
const tokens = (raw: string): string[] =>
  raw
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}@$!|+€]+/u)
    .map(normalizeName)
    .filter(Boolean)

const STRONG: readonly string[] = [...new Set(STRONG_TERMS.map(normalizeName))]
const TOKEN_SET: ReadonlySet<string> = new Set(TOKEN_TERMS.map(normalizeName))

/**
 * Whether a name hits the denylist. `false` for anything that is not a
 * non-empty string.
 */
export const isDenylistedName = (raw: unknown): boolean => {
  if (typeof raw !== 'string' || raw.length === 0) return false
  const digits = raw.replace(/[^0-9]/g, '')
  if (RAW_DIGITS.some((d) => digits.includes(d))) return true

  const norm = normalizeName(raw)
  const collapsed = collapseRepeats(norm)
  if (STRONG.some((t) => norm.includes(t) || collapsed.includes(t))) return true

  if (TOKEN_SET.has(norm) || TOKEN_SET.has(collapsed)) return true
  for (const tok of tokens(raw)) {
    if (TOKEN_SET.has(tok) || TOKEN_SET.has(collapseRepeats(tok))) return true
  }
  return false
}

// ─── Replacement ────────────────────────────────────────────────────────────

/**
 * The words replacement names are built from — the same shape the game mints
 * for anonymous players (`usePlayerIdentity`), so a masked row looks like any
 * other guest and does not advertise that it was masked.
 */
export const SAFE_NAME_WORDS: readonly string[] = [
  'Spinner', 'Blader', 'Striker', 'Ripper', 'Vortex',
  'Cyclone', 'Blazer', 'Talon', 'Havoc', 'Rogue'
]

/** FNV-1a, 32-bit. Deterministic across the Worker, Node and the browser. */
const hash = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A generated, safe name DERIVED from `seed`. Deterministic on purpose: the
 * Worker, the baker and the client all mask the same offending name to the same
 * replacement, so the player's own row is still recognised as theirs.
 */
export const safeNameFor = (seed: string): string => {
  const h = hash(seed)
  const word = SAFE_NAME_WORDS[h % SAFE_NAME_WORDS.length] ?? 'Spinner'
  return `${word}${100000 + (Math.floor(h / SAFE_NAME_WORDS.length) % 900000)}`
}

/** The name to SHOW: unchanged when clean, a generated stand-in otherwise. */
export const sanitizeDisplayName = (name: string): string =>
  isDenylistedName(name) ? safeNameFor(name) : name

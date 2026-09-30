// ─── First-time gift: one free 2x speed-up ──────────────────────────────────
//
// Pure module — no Vue, no storage access of its own — so every rule is
// unit-testable (tests/freeSpeedGift.test.ts). `useFreeSpeedGift.ts` feeds it
// the live values.
//
// The 2x speed-up costs a rewarded video on builds that serve rewarded ads
// and 100 coins on every other build (speedBoostPurchase.ts, D19). On EVERY
// build a genuine first-time player gets ONE boost free (D17), so the first
// taste of the feature is neither an ad nor a price. The gift is decided
// ONCE, at the start of the save's life, and then only ever moves forward:
//
//   (absent) ──grant──▶ 'granted' ──consume──▶ 'used'
//
//   • DECIDED EARLY. The speed switch only appears from stage 2, i.e. after
//     the player already has progress, so "no progress" cannot be checked at
//     the moment the button is shown. The gift is written while the save is
//     still pristine (first boot) and simply waits in the save until then.
//   • SETTLED, NOT LOCAL. Same rule as the first-launch intro (`introGate.ts`):
//     a returning CrazyGames / Playgama player on a new device has an empty
//     localStorage until the cloud hydrate lands, so nothing is granted while
//     the read is `pending` / `failed-*`. Unknown fails closed.
//   • EXISTING PLAYERS GET NOTHING. A save that already has progress and no
//     gift key predates the feature (or belongs to a returning player whose
//     cloud save just arrived) — it is not a first-timer's save.
//   • NEVER TWICE. 'used' rides the cloud save (`spinner_` prefix), and a
//     device-local mirror outside the payload prefixes survives a stale cloud
//     blob that wins a merge and brings an old 'granted' back.

import type { HydrateState } from '@/utils/save/types'

/** Cloud-synced gift state: absent | 'granted' | 'used'. Kept by the
 *  full-progress reset (an anti-farm gate, not progress). */
export const SPEED_GIFT_KEY = 'spinner_free_2x_gift'
export const SPEED_GIFT_GRANTED = 'granted'
export const SPEED_GIFT_USED = 'used'

/** Device-local "already used here". Deliberately OUTSIDE the save payload
 *  prefixes (`spinner_` / `ca_`), like `chaosarena_uid`, so no hydrate can
 *  overwrite or delete it. */
export const SPEED_GIFT_USED_LOCAL_KEY = 'chaosarena_free_2x_used'

export interface SpeedGiftGateInput {
  /** Current SPEED_GIFT_KEY value. */
  stored: string | null
  /** SPEED_GIFT_USED_LOCAL_KEY is set on this device. */
  usedLocally: boolean
  /** Any key a played match leaves behind is set. `null` = unknown. */
  hasProgress: boolean | null
  /** The local snapshot had no progress when this session started. */
  pristineAtBoot: boolean
  hydrate: HydrateState
}

export const shouldGrantSpeedGift = (i: SpeedGiftGateInput): boolean => {
  // Already decided (granted or used) — the state only moves forward.
  if (i.stored !== null) return false
  if (i.usedLocally) return false
  // The save read has not settled: a cloud save may still arrive.
  if (i.hydrate !== 'success-with-data' && i.hydrate !== 'success-empty') return false
  if (i.hasProgress === false) return true
  // The cloud confirmed it holds nothing, but the read settled late — after
  // this session's first match already wrote progress. The session started
  // pristine and the cloud is empty, so that progress is the first-timer's own.
  return i.hasProgress === true && i.pristineAtBoot && i.hydrate === 'success-empty'
}

export const isSpeedGiftAvailable = (i: Pick<SpeedGiftGateInput, 'stored' | 'usedLocally'>): boolean =>
  i.stored === SPEED_GIFT_GRANTED && !i.usedLocally

// ─── Daily gift: one free 1-minute 2x speed-up per day ──────────────────────
//
// Every player, on every build, also gets ONE short free boost per game day,
// on top of (never stacked with) the first-time gift above:
//
//   • SAME DAY AS EVERY DAILY. The day is `utcDayKey()` — 00:00 UTC, the rule
//     the daily challenge and daily rewards already use.
//   • FIRST-TIME GIFT WINS. While the first-time gift is unspent the badge is
//     that gift (3 min); the daily one is hidden. Spending the first-time gift
//     also stamps today as the daily's day, so that day holds one free boost.
//   • STORED AS "LAST DAY USED". `spinner_free_2x_daily` (cloud-synced) holds
//     the last day a free boost was spent. A device-local mirror outside the
//     payload prefixes holds the same, so a stale cloud blob that wins a merge
//     and brings an older day back cannot re-open today on this device.
//     The effective day is the LATER of the two.
//   • ONLY FORWARD. Available only when today is strictly AFTER the last used
//     day — turning the device clock back never re-opens a day that was
//     already spent (the existing dailies compare with `!==`; this one does
//     not, because it is free and would otherwise farm by clock rollback).
//   • BUT NOT FOREVER. A stored day more than FUTURE_DAY_TOLERANCE days
//     AFTER today is not a rollback, it is a corrupt value or a device whose
//     clock was once far ahead — honouring it would lock the gift for
//     months. Such a day is ignored (per source: a sane cloud day still
//     counts when only the device mirror is corrupt), the gift is on offer,
//     and claiming it overwrites both keys with today. A day 1–2 days ahead
//     (timezone / small clock skew, or a real rollback) still blocks.
//   • SETTLED, NOT LOCAL. Same as the first-time gift: nothing is offered
//     while the save read is pending / failed — a player's other device may
//     already have spent today's boost and the cloud save has not arrived.

/** Cloud-synced 'YYYY-MM-DD' (UTC) of the last day a free boost was spent.
 *  Kept by the full-progress reset (anti-farm gate, not progress). */
export const DAILY_SPEED_GIFT_KEY = 'spinner_free_2x_daily'

/** Device-local mirror of DAILY_SPEED_GIFT_KEY, outside the payload prefixes. */
export const DAILY_SPEED_GIFT_LOCAL_KEY = 'chaosarena_free_2x_daily'

/** The daily gift is a taste, not the full paid / ad boost (3 min). */
export const DAILY_SPEED_GIFT_DURATION_MS = 60 * 1000

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** How many days a stored "last used" day may lie after today and still
 *  block. Further ahead is treated as corrupt / clock skew and ignored. */
export const FUTURE_DAY_TOLERANCE = 2

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole UTC days since the epoch for a 'YYYY-MM-DD' key. */
const dayNumber = (day: string): number =>
  Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS)

/** A stored day, or '' when absent / garbage / implausibly far ahead of
 *  `today` (never blocks). */
const dayOrEmpty = (v: string | null, today: string): string => {
  if (v === null || !DAY_RE.test(v)) return ''
  if (DAY_RE.test(today) && dayNumber(v) - dayNumber(today) > FUTURE_DAY_TOLERANCE) return ''
  return v
}

/** The later of the cloud and device-local "last used" days ('' = never),
 *  ignoring any day more than FUTURE_DAY_TOLERANCE days after `today`. */
export const lastDailyGiftDay = (cloudDay: string | null, localDay: string | null, today: string): string => {
  const a = dayOrEmpty(cloudDay, today)
  const b = dayOrEmpty(localDay, today)
  return a > b ? a : b
}

export interface DailySpeedGiftInput {
  hydrate: HydrateState
  /** The first-time gift is currently available (it takes precedence). */
  firstGiftAvailable: boolean
  /** utcDayKey() now. */
  today: string
  /** DAILY_SPEED_GIFT_KEY value. */
  cloudDay: string | null
  /** DAILY_SPEED_GIFT_LOCAL_KEY value. */
  localDay: string | null
}

export const isDailySpeedGiftAvailable = (i: DailySpeedGiftInput): boolean => {
  if (i.firstGiftAvailable) return false
  if (i.hydrate !== 'success-with-data' && i.hydrate !== 'success-empty') return false
  return i.today > lastDailyGiftDay(i.cloudDay, i.localDay, i.today)
}

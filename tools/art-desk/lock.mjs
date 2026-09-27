/**
 * ─── One paint job at a time, per Gemini profile, across processes ─────────
 *
 * Three agents (and the desk's own queue) may ask for paintings at the same
 * moment. The Gemini window can do one chat at a time, and the account's
 * allowance wants the jobs spaced out, so every painter goes through here.
 *
 * Layout, inside the profile folder (it is the profile the lock is about):
 *
 *   <profileDir>/art-desk-paint/
 *     held/            the lock. mkdir is atomic: whoever creates it holds it.
 *       owner.json     { pid, host, token, label, since, beat }
 *     queue/<ticket>   one file per waiter; the OLDEST live ticket goes next
 *                      (FIFO, so no caller starves while others poll)
 *     last.json        { endedAt, nextAt } — the throttle, which outlives the
 *                      lock: the next holder waits until nextAt
 *     break/           a short-lived guard so only one waiter breaks a stale lock
 *
 * Stale recovery: a holder whose pid is gone, or whose heartbeat (rewritten
 * every 10 s) is older than 3 minutes, is broken by the head of the queue.
 * A waiter's ticket whose pid is gone or which has not been touched for
 * 2 minutes is swept by the others.
 *
 * Waiters never fail: they poll every 2 s until it is their turn.
 */
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

const HEARTBEAT_MS = 10_000
const HOLDER_STALE_MS = 180_000
const TICKET_STALE_MS = 120_000
const POLL_MS = 2_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const lockDir = (profileDir) => join(profileDir, 'art-desk-paint')

const pidAlive = (pid) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf-8'))
  } catch {
    return null
  }
}
const writeJson = (f, data) => {
  const tmp = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  try {
    renameSync(tmp, f)
  } catch {
    writeFileSync(f, JSON.stringify(data, null, 2))
    try {
      unlinkSync(tmp)
    } catch {
    }
  }
}
const ageOf = (f) => {
  try {
    return Date.now() - statSync(f).mtimeMs
  } catch {
    return Infinity
  }
}

/** Who holds the lock, and whether that holder is dead or hung. */
export const holderState = (dir) => {
  const held = join(dir, 'held')
  if (!existsSync(held)) return { held: false }
  const owner = readJson(join(held, 'owner.json'))
  const sameHost = !owner || owner.host === hostname()
  let stale = false
  let why = ''
  if (!owner) {
    // Crashed between mkdir and writing owner.json.
    if (ageOf(held) > 30_000) {
      stale = true
      why = 'no owner file'
    }
  } else if (sameHost && !pidAlive(owner.pid)) {
    stale = true
    why = `pid ${owner.pid} is gone`
  } else if (Date.now() - (owner.beat ?? owner.since ?? 0) > HOLDER_STALE_MS) {
    stale = true
    why = `no heartbeat for ${Math.round((Date.now() - (owner.beat ?? owner.since)) / 1000)} s`
  }
  return { held: true, owner, stale, why }
}

/** The throttle: when the next job may start. */
export const throttleState = (dir) => readJson(join(dir, 'last.json'))

const sweepTickets = (qdir) => {
  const live = []
  let names = []
  try {
    names = readdirSync(qdir)
  } catch {
    return live
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const f = join(qdir, name)
    const t = readJson(f)
    const dead = !t || (t.host === hostname() && !pidAlive(t.pid)) || ageOf(f) > TICKET_STALE_MS
    if (dead) {
      try {
        unlinkSync(f)
      } catch {
      }

      continue
    }
    live.push(name)
  }
  return live.sort()
}

/**
 * Break a stale `held` — guarded by `break/`, so two waiters can never both
 * decide it is stale, both remove it, and remove each other's fresh lock.
 */
const breakStale = (dir, log) => {
  const guard = join(dir, 'break')
  try {
    mkdirSync(guard)
  } catch {
    if (ageOf(guard) > 30_000) {
      try {
        rmSync(guard, { recursive: true, force: true })
      } catch {
      }
    }
    return false
  }
  try {
    const s = holderState(dir)
    if (s.held && s.stale) {
      log(`breaking a stale paint lock (${s.why}; was ${s.owner?.label ?? '?'})`)
      rmSync(join(dir, 'held'), { recursive: true, force: true })
      return true
    }
    return false
  } finally {
    try {
      rmSync(guard, { recursive: true, force: true })
    } catch {
    }
  }
}

/**
 * Wait for our turn, take the lock, honour the throttle gap, run `fn`, release.
 *
 * `fn({ markSpent })` — call markSpent() once a prompt has actually been sent
 * to Gemini; only then does the NEXT job have to wait out the gap.
 */
export const withPaintLock = async (profileDir, {
  gapSeconds = 90, jitterSeconds = 60, label = 'paint', log = () => {
  }
} = {}, fn) => {
  const dir = lockDir(profileDir)
  const qdir = join(dir, 'queue')
  mkdirSync(qdir, { recursive: true })
  const token = `${process.pid}-${randomBytes(4).toString('hex')}`
  const host = hostname()
  const ticketName = `${String(Date.now()).padStart(15, '0')}-${token}.json`
  const ticket = join(qdir, ticketName)
  writeJson(ticket, { pid: process.pid, host, label, since: Date.now() })
  const held = join(dir, 'held')
  const ownerFile = join(held, 'owner.json')
  let mine = false

  const cleanup = () => {
    try {
      unlinkSync(ticket)
    } catch {
    }
    if (mine && readJson(ownerFile)?.token === token) {
      try {
        rmSync(held, { recursive: true, force: true })
      } catch {
      }
    }
    mine = false
  }
  // A killed process (Ctrl-C, parent timeout) must not leave the lock behind;
  // a hard kill that skips this is what the pid check recovers from.
  const onExit = () => cleanup()
  const onSignal = (sig) => {
    cleanup()
    process.exit(sig === 'SIGINT' ? 130 : 143)
  }
  process.on('exit', onExit)
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  process.on('SIGHUP', onSignal)

  let lastSaid = ''
  const say = (msg) => {
    if (msg !== lastSaid) {
      lastSaid = msg
      log(msg)
    }
  }
  const beat = setInterval(() => {
    // Keep the ticket fresh while waiting, the owner file while holding.
    try {
      utimesSync(ticket, new Date(), new Date())
    } catch {
    }
    if (mine) {
      const o = readJson(ownerFile)
      if (o?.token === token) writeJson(ownerFile, { ...o, beat: Date.now() })
    }
  }, HEARTBEAT_MS)
  beat.unref?.()

  try {
    // ── Wait for our turn ──
    const t0 = Date.now()
    for (; ;) {
      const queue = sweepTickets(qdir)
      if (!queue.includes(ticketName)) writeJson(ticket, { pid: process.pid, host, label, since: Date.now() })
      const ahead = queue.indexOf(ticketName)
      if (ahead <= 0) {
        const s = holderState(dir)
        if (s.held && s.stale) breakStale(dir, log)
        try {
          mkdirSync(held)
          mine = true
          writeJson(ownerFile, { pid: process.pid, host, token, label, since: Date.now(), beat: Date.now() })
          try {
            unlinkSync(ticket)
          } catch {
          }
          break
        } catch (e) {
          if (e.code !== 'EEXIST') throw e
          const o = holderState(dir).owner
          say(`waiting for the paint lock — held by ${o?.label ?? '?'} (pid ${o?.pid ?? '?'})`)
        }
      } else {
        say(`waiting for the paint lock — ${ahead} job(s) ahead in the queue`)
      }
      await sleep(POLL_MS)
    }
    if (Date.now() - t0 > 3000) log(`got the paint lock after ${Math.round((Date.now() - t0) / 1000)} s`)

    // ── The throttle gap since the previous job, whoever ran it ──
    const last = throttleState(dir)
    if (last?.nextAt && last.nextAt > Date.now()) {
      const wait = last.nextAt - Date.now()
      log(`throttle: waiting ${Math.round(wait / 1000)} s after the previous generation`)
      await sleep(wait)
    }

    let spent = false
    try {
      return await fn({
        markSpent: () => {
          spent = true
        }
      })
    } finally {
      if (spent) {
        const gap = (gapSeconds + Math.random() * jitterSeconds) * 1000
        writeJson(join(dir, 'last.json'), { endedAt: Date.now(), nextAt: Date.now() + gap, by: label })
      }
    }
  } finally {
    clearInterval(beat)
    cleanup()
    process.off('exit', onExit)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    process.off('SIGHUP', onSignal)
  }
}

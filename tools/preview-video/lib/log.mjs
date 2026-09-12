// ─── Logger ─────────────────────────────────────────────────────────────────
//
// Deliberately tiny and dependency-free. A recording run prints one line per
// phase and one per finished clip; anything noisier buries the two numbers that
// actually matter (frames captured, bytes written).
//
// No colour library: this runs in CI logs, PowerShell and Git Bash, and the
// only place a colour ever helped was the warning, which the `!` already does.

/** @typedef {import('./types.js').Logger} Logger */

const tag = (prefix) => (prefix ? `[${prefix}] ` : '')

/**
 * @param {string} [prefix]
 * @returns {Logger}
 */
export function createLogger(prefix = '') {
  const t = tag(prefix)
  /** @type {Logger} */
  const log = {
    info: (msg) => console.log(`${t}${msg}`),
    step: (msg) => console.log(`\n${t}── ${msg} ${'─'.repeat(Math.max(0, 62 - msg.length))}`),
    ok: (msg) => console.log(`${t}✓ ${msg}`),
    warn: (msg) => console.warn(`${t}! ${msg}`),
    error: (msg) => console.error(`${t}✗ ${msg}`),
    child: (extra) => createLogger(prefix ? `${prefix}/${extra}` : extra),
    time: (label) => {
      const started = Date.now()
      return () => {
        const s = (Date.now() - started) / 1000
        console.log(`${t}${label} — ${s.toFixed(1)} s`)
      }
    }
  }
  return log
}

/** Human-readable byte count: `41.2 MB`. */
export const bytes = (n) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

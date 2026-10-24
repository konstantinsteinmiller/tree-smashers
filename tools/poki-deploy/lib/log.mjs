// Terminal output for the Poki deploy pipeline. Step banners, PASS/WARN/FAIL
// lines, and a `die` that always says what to do next — this pipeline is meant
// to be run unattended enough that a bare stack trace is a dead end.

const C = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code, s) => (C ? `\x1b[${code}m${s}\x1b[0m` : s)

export const bold = s => c('1', s)
export const dim = s => c('2', s)
export const green = s => c('32', s)
export const yellow = s => c('33', s)
export const red = s => c('31', s)
export const cyan = s => c('36', s)

let stepNo = 0
export const step = title => {
  stepNo += 1
  console.log(`\n${bold(`── ${stepNo}. ${title} `.padEnd(74, '─'))}`)
}

export const info = (msg, detail) => console.log(`   ${msg}${detail ? `  ${dim(detail)}` : ''}`)
export const pass = (msg, detail) => console.log(`   ${green('PASS')}  ${msg}${detail ? `  ${dim(detail)}` : ''}`)
export const warn = (msg, detail) => console.log(`   ${yellow('WARN')}  ${msg}${detail ? `  ${dim(detail)}` : ''}`)
export const fail = (msg, detail) => console.log(`   ${red('FAIL')}  ${msg}${detail ? `  ${dim(detail)}` : ''}`)

/** Abort with an explanation AND the next action. Never throw a bare Error at
 *  the user from a pipeline they launched with one command. */
export const die = (msg, next) => {
  console.error(`\n${red('✖')} ${msg}`)
  if (next) console.error(`  ${dim('→')} ${next}`)
  process.exit(1)
}

export const bytes = n => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// A PKZIP writer, and the reason this file exists at all.
//
// ── The trap ──
//
// Every build script in this repo ends with the Windows idiom
//
//     cd dist && tar -a -cf ../game-poki.zip *
//
// and that is correct — under cmd.exe or PowerShell, where `tar` is Windows'
// bundled **bsdtar**, whose `-a` picks the format from the `.zip` suffix.
//
// Run the same script from Git Bash (or from any Node process whose PATH puts
// Git's `/usr/bin` first — including one you started from Git Bash) and `tar`
// is **GNU tar** instead. GNU tar's `-a` only knows gzip/bzip2/xz/zstd. It does
// not know zip, does not error, and writes a plain TAR archive under the name
// `game-poki.zip`.
//
// Nothing downstream notices. `tar -tf` lists it happily, because it is a tar.
// The file is the right size and has the right name. P4D's uploader takes it,
// spins, and answers **"We couldn't read your zip file. Please make sure it's a
// valid zip."** — which reads like a problem with the build, and is really a
// problem with `$PATH`. That cost a full upload round to find, and it would
// have cost one on every machine where the shells differ.
//
// So the pipeline stops asking a shell to make its archive. It packs `dist/`
// itself, here, with no dependencies: correct local headers, a real central
// directory, no streaming data descriptors (browser-side unzip libraries
// routinely choke on those), and deterministic entry order so the same build
// produces the same bytes.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

/** DOS date/time, which is what a zip entry stores. */
const dosTime = date => {
  const d = new Date(date)
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f)
  const day = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { time, day }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

const crc32 = buf => {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const walk = (dir, base = dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, base, out)
    else out.push({ abs: p, name: relative(base, p).split(sep).join('/') })
  }
  return out
}

/**
 * Pack a directory into a zip whose entry paths are relative to it — so
 * `index.html` lands at the archive ROOT, which is Poki's one structural
 * requirement for an upload.
 *
 * @param {string} dir            directory to pack
 * @param {string} outPath        zip to write
 * @param {object} [opts]
 * @param {(name: string) => boolean} [opts.exclude]  return true to leave a file out
 */
export const zipDir = (dir, outPath, { exclude = () => false } = {}) => {
  const files = walk(dir).filter(f => !exclude(f.name))
  const chunks = []
  const central = []
  let offset = 0

  for (const f of files) {
    const data = readFileSync(f.abs)
    const crc = crc32(data)
    const deflated = deflateRawSync(data, { level: 9 })
    // Storing beats deflating when deflating made it bigger — already-compressed
    // assets (png, webp, mp3, woff2) are the normal case in a game build.
    const useDeflate = deflated.length < data.length
    const body = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0
    const nameBuf = Buffer.from(f.name, 'utf8')
    const { time, day } = dosTime(statSync(f.abs).mtime)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4)              // version needed: 2.0
    local.writeUInt16LE(0x0800, 6)          // bit 11: names are UTF-8. NO bit 3.
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, body)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(CENTRAL_SIG, 0)
    cen.writeUInt16LE(20, 4)                // version made by
    cen.writeUInt16LE(20, 6)                // version needed
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(time, 12)
    cen.writeUInt16LE(day, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30)                // extra
    cen.writeUInt16LE(0, 32)                // comment
    cen.writeUInt16LE(0, 34)                // disk
    cen.writeUInt16LE(0, 36)                // internal attrs
    cen.writeUInt32LE(0, 38)                // external attrs
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)

    offset += local.length + nameBuf.length + body.length
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIG, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  const out = Buffer.concat([...chunks, cdBuf, eocd])
  writeFileSync(outPath, out)
  return {
    path: outPath,
    entries: files.length,
    bytes: out.length,
    sha1: createHash('sha1').update(out).digest('hex').slice(0, 12),
    names: files.map(f => f.name),
  }
}

/**
 * Structural check of an existing archive. Catches the tar-named-.zip case and
 * anything else that is not a real PKZIP — cheaply, before an upload spends a
 * round discovering it.
 */
export const inspectZip = path => {
  const b = readFileSync(path)
  if (b.length < 22) return { ok: false, why: 'file is too small to be a zip' }
  if (b.readUInt32LE(0) !== LOCAL_SIG) {
    const head = b.slice(0, 4).toString('latin1').replace(/[^\x20-\x7e]/g, '.')
    return {
      ok: false,
      why: `does not start with a PKZIP local header (first bytes: "${head}") — `
        + `if this came from "tar -a -cf x.zip", GNU tar wrote a TAR under a .zip name`,
    }
  }
  const flags = b.readUInt16LE(6)
  let eocd = -1
  for (let i = b.length - 22; i >= 0; i--) { if (b.readUInt32LE(i) === EOCD_SIG) { eocd = i; break } }
  if (eocd < 0) return { ok: false, why: 'no end-of-central-directory record — the archive is truncated or not a zip' }
  return {
    ok: true,
    entries: b.readUInt16LE(eocd + 10),
    dataDescriptors: !!(flags & 8),
    bytes: b.length,
  }
}

/** Entry names, read from the central directory (no shelling out to tar). */
export const listZip = path => {
  const b = readFileSync(path)
  let eocd = -1
  for (let i = b.length - 22; i >= 0; i--) { if (b.readUInt32LE(i) === EOCD_SIG) { eocd = i; break } }
  if (eocd < 0) return []
  let p = b.readUInt32LE(eocd + 16)
  const n = b.readUInt16LE(eocd + 10)
  const names = []
  for (let i = 0; i < n && p + 46 <= b.length; i++) {
    if (b.readUInt32LE(p) !== CENTRAL_SIG) break
    const nameLen = b.readUInt16LE(p + 28)
    const extraLen = b.readUInt16LE(p + 30)
    const cmtLen = b.readUInt16LE(p + 32)
    names.push(b.slice(p + 46, p + 46 + nameLen).toString('utf8'))
    p += 46 + nameLen + extraLen + cmtLen
  }
  return names
}

#!/usr/bin/env node
/**
 * Painting prompts for the smasher sheets — one ready-to-send .txt per smasher
 * next to its BARE reference (art-sheets/smashers-bare/<id>.png, character only,
 * no disc: the disc stays a live, spinning procedural layer under the paint).
 *
 * The character notes are parsed from the table in art-sheets/PROMPTS-smashers.md
 * so there is ONE source for them. New smashers (batch models) only need a row.
 *
 *   node tools/smasher-sheets/prompts.mjs  → art-sheets/smashers-bare/<id>-a.prompt.txt, <id>-b.prompt.txt
 *
 * Parts (tools/smasher-sheets/parts.mjs): a = frames 0…15, b = frames 16…31, each
 * a 4 × 4 square sheet. All 32 frames are painted; nothing is mirrored.
 *
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = join(ROOT, 'art-sheets', 'smashers-bare')
const md = readFileSync(join(ROOT, 'art-sheets', 'PROMPTS-smashers.md'), 'utf8')

const rows = []
for (const line of md.split(/\r?\n/)) {
  const m = line.match(/^\| `smashers\/([a-z0-9-]+)\.png` \| ([^|]+) \| ([^|]+) \| (.+) \|\s*$/)
  if (m) rows.push({ id: m[1], name: m[2].trim(), species: m[3].trim(), note: m[4].trim() })
}
// Batch smashers (src/data/smashers/batch*.ts) without a table row: the comment
// block above each entry ("// Badger — head-first digger: …") gives species +
// character; the reference sheet carries the colours and markings.
const known = new Set(rows.map(r => r.id))
const dataDir = join(ROOT, 'src', 'data', 'smashers')
for (const f of readdirSync(dataDir).filter(f => /^batch\w*\.ts$/.test(f)).sort()) {
  const lines = readFileSync(join(dataDir, f), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = line.match(/^ {2}([a-z]+): \{$/)
    if (!m || known.has(m[1])) return
    const comment = []
    for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) comment.unshift(lines[j].replace(/^\s*\/\/\s?/, ''))
    const text = comment.join(' ').trim()
    const dash = text.indexOf(' — ')
    const species = dash > 0 ? text.slice(0, dash).trim().toLowerCase() : 'forest critter'
    const what = dash > 0 ? text.slice(dash + 3).trim() : text
    rows.push({
      id: m[1],
      name: m[1][0].toUpperCase() + m[1].slice(1),
      species,
      note: `A ${species} plush. Its fighting style: ${what} Keep EXACTLY the reference's colours, markings, ears, tail and accessories — only the finish changes.`
    })
    known.add(m[1])
  })
}

// Extra per-smasher warnings for shapes a model misreads (croaky's eye bumps
// look like eyes from behind: the 3 × 3 paint put pupils on their backs).
const EXTRA = {
  croaky: 'Its eyes sit on two round bumps on top of its head, ONLY on the front of each bump. Seen from the side-back and back the bumps are plain green with NO eyes, no pupils, no brows.'
}

export const smasherPrompt = ({ id, name, species, note }, part) => {
  if (EXTRA[id]) note = `${note} ${EXTRA[id]}`
  const b = part === 'b'
  // Part b goes WITHOUT part a's painting attached: with it (bramble pilot) the
  // model copied a's FRONT view into the back-view cells. The shared prompt
  // alone holds the finish across the two parts.
  const att = `ONE image is attached: the LAYOUT reference.`
  const turn = b
    ? `cell 1 (top-left) is the BACK view — NO face at all (no eyes, no nose, no mouth), only the back of the head, the back and the tail side. Every next cell is the character turned a further 11.25 degrees on the spot: the face comes back from the OTHER side — cell 9 (third row, first cell) is the other SIDE view, and cell 16 (bottom-right) is almost facing the viewer again. Cells 1 to 4 show no face; follow each reference cell for how much of the face shows. The face turns towards the SAME side as in the reference in every cell — never mirror a cell; check the nose direction of each reference cell and keep it.`
    : `cell 1 (top-left) faces the viewer, and every next cell is the character turned a further 11.25 degrees on the spot: cell 9 (third row, first cell) is the SIDE view, and cell 16 (bottom-right) is almost the BACK view. Cells 13 to 16 show little or no face — follow each reference cell for how much of the face shows. The face turns towards the SAME side as in the reference in every cell — never mirror a cell; check the nose direction of each reference cell and keep it.`
  return `WHAT COMES BACK IS ONE SQUARE SHEET: THE SAME CHARACTER FROM 16 ANGLES, 4 ACROSS AND 4 DOWN, ON FLAT MAGENTA.
One square image, 1:1, sixteen equal square cells: 4 per row, 4 rows. Each cell holds the SAME character, exactly where the drawing sits in that cell of the layout reference.
· 16 drawings of ONE character. Not 9, not 12, not 15, not 20. Not 16 different characters, not a scene.

WHAT THE ATTACHMENTS ARE — read this before anything else.
· ${att}
· The LAYOUT reference is drawn by the game's own 3D rig. It fixes each cell's ANGLE, POSE, PROPORTIONS, POSITION and SIZE, and the character's colours. Keep all of those. Repaint its flat fills as a finished illustration — but never move, resize, re-pose, add or drop a limb.
· Frame order, row by row: ${turn} Follow the layout reference cell by cell.

WHAT IT IS NOT.
· NO DISC, NO BASE, NO GROUND, NO SHADOW under the character. The game draws a spinning disc itself, underneath your painting. The character floats on the magenta exactly as in the layout reference.
· No text, no numbers, no labels, no cell borders, no grid lines, no gutters.

WHAT IT IS — "${name}", a ${species} from "Tree Smashers", a cosy forest arena battler. ${note}
· It is a STUFFED ANIMAL — a plush toy: soft rounded felt and fleece, a button-like shine in the eyes, slightly squashy shapes.
· STITCHES: paint dashed stitch lines ONLY where the layout reference draws a dashed line, following that line's exact path. Invent NO other seams — no seam down the middle of the face, head, back or body unless the reference has one there. A stitch line is fixed to the plush: it turns with the character and keeps its place in every cell.
· CUTE BUT ANGRY: big round cute eyes with a glossy highlight, heavy slanted angry eyebrows, a grumpy frown with tiny white fangs (or the teeth the note asks for). Chunky head, small body, stubby limbs.

COLOUR — keep the layout reference's palette for every part. Pink parts are soft salmon / rose, never hot pink.

THE VIEW — the camera looks down at the character from about 55 degrees (3/4 top-down), the same in every cell.

FACE — eyes, pupils and brows exist ONLY where the layout reference cell shows them, always looking the way the character faces in that cell. A reference cell without a visible eye gets no painted eye.

CONSISTENCY — ONE character turning on the spot: identical proportions, colours, markings, stitch lines, accessories, expression and line weight in all 16 cells.

STYLE — a richly hand-painted plush toy, clearly MORE finished than the flat reference:
· Soft painted shading that shows the felt and fleece: rounded volume, gentle fabric texture, visible stitched seams, a warm light from the top-left and a soft darker underside on every shape.
· A bold dark brown contour around the whole silhouette (about 2% of a cell's width) so it still reads when shown at 50 pixels; thinner inner lines.
· No glow, no bloom, no blur, no photorealism, no shiny 3D plastic, no realistic fur strands, nothing scary or gory.

SIZE — each character fills the same share of its cell as in the layout reference, centred where the reference puts it. Keep a clear magenta gap between neighbouring characters; nothing crosses into the next cell.

BACKGROUND — this matters more than the style.
Fill every pixel that is not the character with solid, flat, pure magenta #FF00FF, edge to edge — a green screen.
· EXACTLY #FF00FF. NOT transparent, NOT a checkerboard, NOT white, NOT a gradient. No glow, halo or shadow on the magenta.
· The character contains no magenta and no hot pink anywhere.
· Keep the bottom-right corner of the image clear of anything but the last character.

BEFORE YOU CALL IT FINISHED, count and check:
· 16 cells, 4 per row, 4 rows, the same character in each, NO disc under it.
· The turn follows the layout reference cell by cell.
· Every pixel that is not the character is flat, vivid #FF00FF.

OUTPUT: one square 1:1 image, 4 × 4 cells, magenta ground, 16 characters, matching the layout reference cell for cell.
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let n = 0
  for (const r of rows) {
    if (!existsSync(join(DIR, `${r.id}.png`))) { console.warn(`skip ${r.id}: no bare reference (run export.mjs --bare)`); continue }
    for (const part of ['a', 'b']) writeFileSync(join(DIR, `${r.id}-${part}.prompt.txt`), smasherPrompt(r, part))
    n++
  }
  console.log(`wrote ${n} prompts to ${DIR}`)
}

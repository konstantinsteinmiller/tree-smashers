#!/usr/bin/env node
/**
 * Write the master prompts for the skin pass, from concepts.mjs.
 *
 *   node art/skins/build-prompts.mjs
 *
 * Per class, into art/skins/<class>/:
 *   prompt-sheet.txt    the 2x2 sheet prompt — attach style-*.png first, then
 *                       sheet.png LAST (Gemini returns the shape of the last
 *                       attachment).
 *   prompt-<id>.txt     a single-skin re-paint — attach accepted siblings /
 *                       style-*.png first, then single-<id>.png LAST.
 *   prompt-<id>-free.txt  the re-paint WITHOUT a layout sheet (finish refs only).
 * With --md also art/skins/PROMPTS-skins.md (gitignored) — every prompt in a
 * fenced block with its attachments in the heading.
 *
 * Clause order follows the art-generation-pipeline PROMPT-ANATOMY: shape of
 * the deliverable first, the reference rule second, subject, view, one hand,
 * style, measured layout, the magenta contract, the checklist, OUTPUT last.
 * The shared clauses are constants so the sheet and single builders cannot
 * drift apart.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLASSES, CLASS_ORDER } from './concepts.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const POS = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right']

const outlineCheck = (t) => {
  switch (t.kind) {
    case 'pinwheel':
      return `${t.arms} swept blade arms`
    case 'barbs':
      return `about ${t.n} ${t.style === 'lobe' ? 'spiny lobes' : t.style === 'needle' ? 'quills' : t.style === 'fin' ? 'fin spines' : 'spikes'} all the way round`
    case 'disc':
      return 'a smooth, closed circle with nothing sticking out'
    case 'xlobes':
      return 'four wings in an X'
    case 'squircle':
      return t.points ? 'a diamond with four long points (north, east, south, west)' : 'a rounded square with four matching corners'
    case 'pads':
      return 'a thick, chunky, blunt rim'
    case 'spikes':
      return t.style === 'mandibles' ? 'two pairs of mandibles on opposite sides' : `${t.n} long, sharp points`
    default:
      return 'its grey outline'
  }
}

const REFERENCE_RULE = (layoutName, styleSubjects) => `WHAT THE ATTACHMENTS ARE — read this before anything else.
· The LAST attachment is the LAYOUT REFERENCE (${layoutName}). Its flat grey shapes are NOTATION: they fix each skin's OUTLINE, SIZE and CENTRE, the small hexagonal badge in the middle and the ring around it. Take nothing else from it — not its grey, not its flat fills, not its thin lines. A result that comes back as the same grey shapes neatly shaded is a trace of the placeholder, and it is unusable.
· THE GREY IS NEVER PAINTED. No grey plate, backing, base, border, frame or shadow in the shape of the grey drawing may appear anywhere — not behind the skin, not around it, not peeking out between its parts. The skin's OWN painted parts (wings, points, frame, blocks) fill that outline; wherever the skin does not reach, the pixel is magenta. A skin sitting on a grey cut-out of the placeholder is the most common way this goes wrong.
· Every other attachment is a STYLE REFERENCE: a finished skin from the same game. Copy its FINISH — the ink, the shading, the highlights, the level of detail, the hexagonal-badge construction — and NEVER its subject. No skin may show ${styleSubjects} or anything else taken from them.`

const WHAT_IT_IS = `WHAT IT IS — skins for "Chaos Arena", a spinning-top battle game. A skin is the painted top face of one spinning top as the player sees it from directly above while it spins. Every skin is built the same way, from the centre out:
(1) a small HEXAGONAL BADGE in the exact centre, holding one simple icon;
(2) one or two concentric rings around it;
(3) the themed outer rim, which makes the outline.`

const VIEW = `THE VIEW — straight down the spin axis, like a coin lying flat, seen from exactly above.
· Round and radial, centred on the badge — NOT an ellipse, NOT tilted. No three-quarter view, no side wall, no underside, no spike or stem underneath, no perspective, no foreshortening.
· No cast shadow, no ground, no table, no floor, no scenery.`

const STYLE = `STYLE — polished mobile-game art, exactly like the style references:
· A bold dark contour around every shape — at its heaviest about 2% of the skin's diameter, the weight of a brush pen, not a technical pen. Hold the picture at thumbnail size: if the outline has thinned to a hairline there, it is several times too thin.
· Rich, saturated colour with two or three cel-shading steps per shape and a soft light from the top-left; a crisp white highlight painted ON the surface of metal, enamel, horn, shell, glass and anything glossy (a shine band or dot — never a four-pointed sparkle star or twinkle symbol floating over it).
· Chunky, readable shapes that still read at 64 pixels across, with fine surface texture (fur strokes, wood grain, rivets, scales, stitching) painted inside them.
· AN OBJECT WITH NO FACE IS NOT AN EXCEPTION. A drum, an anvil or a compass is painted to exactly the same standard as an animal, with the same ink, the same light and the same shine.
· AVOID — this is exactly how attempts go wrong: flat vector clip-art; pale hairline outlines; photorealism or a plastic 3D render; a perspective or three-quarter view; text, letters, numbers or runes; a soft glow or bloom around the rim; anything see-through or half-transparent; drop shadows.`

const BACKGROUND = `BACKGROUND — this matters more than the style.
Fill every pixel that is not a skin with solid, flat, pure magenta #FF00FF, edge to edge — treat it as a green screen.
· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not rose, not purple, not a soft or tinted version of it.
· NOT transparent (never a grey-and-white checkerboard), NOT white, NOT a gradient, NOT a texture.
· No card, panel, frame, plate or circle behind a skin: the magenta touches the skin's outline on every side, including the gaps between arms, spikes and points.
· No glow, halo, drop shadow or vignette on the magenta. Any glow stays INSIDE the skin's own outline.
· The skins contain no magenta and no hot pink anywhere.
· The rich palette is for the SKINS. The ground is not part of the painting and is not toned with it: it stays a vivid, eye-hurting #FF00FF.`

const styleSubjectList = (cls) => {
  const names = {
    blades: 'red blades',
    wasp: 'a wasp',
    thunder: 'lightning bolts',
    salamaner: 'flames or a salamander',
    nature: 'leaves or a tree',
    'golden-eagle': 'a bird or feathers',
    bluedragon: 'a dragon',
    chip: 'circuits',
    castle: 'a castle or battlements',
    mountain: 'rocks or a mountain',
    rhino: 'a rhino',
    wulf: 'a wolf'
  }
  return CLASSES[cls].styleRefs.map(id => names[id] ?? id).join(', ')
}

const sheetPrompt = (cls) => {
  const def = CLASSES[cls]
  const panels = def.skins.map((s, i) =>
    `· ${POS[i]} — ${s.name}: ${s.subject}. Colours: ${s.colour}. Hexagonal badge: ${s.medallion}.`).join('\n')
  const checks = def.skins.map((s, i) => `${POS[i].toLowerCase()} has ${outlineCheck(s.tpl)}`).join('; ')
  return `WHAT COMES BACK IS A SHEET OF FOUR SPINNING-TOP SKINS, NOT ONE PICTURE.
One square image, 1024 x 1024 pixels, holding FOUR separate top-down spinning-top skins laid out 2 across and 2 down, each one sitting exactly where a grey shape sits in the LAST attached image: top-left, top-right, bottom-left, bottom-right.
· 4 skins. Not 1, not 2, not 6, not 9 — exactly 2 rows of 2.
· One big spinning top filling the canvas is the wrong answer however well it is painted, and so is a scene, a poster or a product shot.
· The four skins never touch or overlap: keep a wide band of flat magenta between them, as wide as in the layout reference.

${REFERENCE_RULE('four grey shapes on magenta', styleSubjectList(cls))}

${WHAT_IT_IS}

READ THE PANELS — four different designs:
${panels}

THE CLASS SILHOUETTE — all four are "${def.label}" tops, and the outline IS the gameplay, so it must match the grey shape in each panel: the same number of arms, points or lobes, the same thickness, the same reach.
${def.silhouette}

${VIEW}

FOUR DESIGNS, ONE HAND. Four different subjects painted by the same artist in one sitting: the same ink weight, the same light from the top-left, the same shine, the same level of detail and the same size. Each skin keeps its OWN colour scheme as listed above — no panel borrows another panel's colours.

${STYLE}

LAYOUT / SIZE — measured against the image, not judged by eye:
· Each skin is centred on its grey shape's centre: at 25% and 75% of the width, and 25% and 75% of the height.
· Each skin reaches exactly as far as its grey shape: about 400 px across, 39% of the image width. If a skin comes within 60 px of another skin or of the image edge, it is too big.
· Every blade, spine, point, tusk and lobe ends inside that circle; nothing pokes out past it.
· The bottom-right corner of the image stays empty magenta.

${BACKGROUND}

BEFORE YOU CALL IT FINISHED, count and check:
· 4 skins, 2 across and 2 down, each on its grey shape's spot, none touching.
· Outlines: ${checks}.
· Each has a small hexagonal badge in its exact centre with its own icon.
· Seen from straight above: round and flat, not oval, not tilted.
· Every pixel that is not a skin is flat, vivid #FF00FF — hold it against a pure magenta swatch, not your memory of one.
· No text, labels, numbers or watermarks.

OUTPUT: one image, 1024 x 1024 pixels, 1:1 square, PNG. If your tool has an aspect-ratio control, set it to 1:1. No labels, captions, numbers or watermarks.
`
}

const singlePrompt = (cls, s) => {
  const def = CLASSES[cls]
  return `WHAT COMES BACK IS ONE SPINNING-TOP SKIN, CENTRED, ON FLAT MAGENTA.
One square image, 1024 x 1024 pixels, holding exactly ONE top-down spinning-top skin in the middle, sitting exactly where the grey shape sits in the LAST attached image.
· 1 skin. Not 2, not 4 — and not a scene, a poster or a product shot.

${REFERENCE_RULE('one grey shape on magenta', styleSubjectList(cls) + ', or any other skin shown in them')}

${WHAT_IT_IS}

THE SKIN — ${s.name}: ${s.subject}.
Colours: ${s.colour}.
Hexagonal badge: ${s.medallion}.

THE CLASS SILHOUETTE — a "${def.label}" top, and the outline IS the gameplay, so it must match the grey shape: ${outlineCheck(s.tpl)}, the same thickness, the same reach.
${def.silhouette}

${VIEW}

${STYLE}

LAYOUT / SIZE — measured against the image, not judged by eye:
· Centred exactly in the middle of the image.
· It reaches exactly as far as the grey shape: about 760 px across, 74% of the image width — not bigger. There is at least 120 px of magenta between the skin and every edge of the image.
· Every blade, spine, point, tusk and lobe ends inside that circle; nothing pokes out past it.
· The bottom-right corner of the image stays empty magenta.

${BACKGROUND}

BEFORE YOU CALL IT FINISHED, count and check:
· Exactly one skin, centred, with ${outlineCheck(s.tpl)}.
· A small hexagonal badge in its exact centre with its icon.
· Seen from straight above: round and flat, not oval, not tilted.
· Every pixel that is not the skin is flat, vivid #FF00FF.
· No text, labels, numbers or watermarks.

OUTPUT: one image, 1024 x 1024 pixels, 1:1 square, PNG. If your tool has an aspect-ratio control, set it to 1:1. No labels, captions, numbers or watermarks.
`
}

// ── Re-paint WITHOUT a layout sheet ─────────────────────────────────────────
// Returns of the sheet/single builders showed that when a subject does not
// naturally fill the grey silhouette (a beetle, a butterfly, lances round a
// core), Gemini keeps the grey fill as a backing plate however hard the words
// forbid it — 5 of 24 skins came back sitting on a grey cut-out. So the
// re-paint drops the layout sheet: every attachment is a FINISH reference
// (accepted skins of the SAME class carry the class silhouette), the outline
// is stated in words, and fit-skins.mjs normalises size and centre anyway.
// Attach finish refs only; they are square, so the return is 1:1.
const freePrompt = (cls, s) => {
  const def = CLASSES[cls]
  return `WHAT COMES BACK IS ONE SPINNING-TOP SKIN, CENTRED, ON FLAT MAGENTA.
One square image, 1024 x 1024 pixels, holding exactly ONE top-down spinning-top skin in the middle.
· 1 skin. Not 2, not 4 — and not a scene, a poster, a creature or an object on its own: a spinning-top skin.

WHAT THE ATTACHMENTS ARE — every attached image is a FINISHED skin from the same game, attached as a FINISH reference only. Copy their finish — the ink, the shading, the highlights, the level of detail, the hexagonal-badge construction, the flat top-down view, the way the whole skin is one round spinning top — and NEVER their subjects. No skin may show ${styleSubjectList(cls)}, or any other subject shown in them.

${WHAT_IT_IS}

THE SKIN — ${s.name}: ${s.subject}.
Colours: ${s.colour}.
Hexagonal badge: ${s.medallion}.
The subject is turned INTO the spinning top — its parts are the top's rim and rings. It is never a whole ${s.name.toLowerCase()} lying on top of a plate or a disc.

THE CLASS SILHOUETTE — a "${def.label}" top, and the outline IS the gameplay: ${outlineCheck(s.tpl)}.
${def.silhouette}
Every part of the skin is painted in its own colours. There is NO grey plate, base, disc, frame or backing behind or around it: wherever the skin's own parts do not reach, the pixel is magenta.

${VIEW}

${STYLE}

LAYOUT / SIZE — measured against the image, not judged by eye:
· Centred exactly in the middle of the image, about 760 px across (74% of the image width). At least 120 px of magenta between the skin and every edge.
· The bottom-right corner of the image stays empty magenta.

${BACKGROUND}

BEFORE YOU CALL IT FINISHED, count and check:
· Exactly one skin, centred, with ${outlineCheck(s.tpl)}.
· A small hexagonal badge in its exact centre with its icon.
· Seen from straight above: round and flat, not oval, not tilted.
· Not one grey plate, disc or backing shape anywhere.
· Every pixel that is not the skin is flat, vivid #FF00FF.
· No text, labels, numbers, sparkle stars or watermarks.

OUTPUT: one image, 1024 x 1024 pixels, 1:1 square, PNG. If your tool has an aspect-ratio control, set it to 1:1. No labels, captions, numbers or watermarks.
`
}

const fenceFor = (body) => {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

const md = ['# Skin prompts — Chaos Arena (generated by art/skins/build-prompts.mjs — do not edit by hand)', '',
  'Each heading is for the operator: attach the listed images IN ORDER (the reference last), then paste ONLY the fenced block.', '']

for (const cls of CLASS_ORDER) {
  const def = CLASSES[cls]
  const dir = join(HERE, cls)
  const sp = sheetPrompt(cls)
  writeFileSync(join(dir, 'prompt-sheet.txt'), sp)
  const styles = def.styleRefs.map(id => `${cls}/style-${id}.png`).join(', ')
  md.push(`## ${def.label} — sheet (attach ${styles}, then ${cls}/sheet.png → ${def.skins.map(s => `images/models/${s.id}_256x256.webp`).join(', ')})`, '', `${fenceFor(sp)}text`, sp.trimEnd(), fenceFor(sp), '')
  for (const s of def.skins) {
    const p = singlePrompt(cls, s)
    writeFileSync(join(dir, `prompt-${s.id}.txt`), p)
    md.push(`## ${s.name} — single (attach accepted siblings or ${styles}, then ${cls}/single-${s.id}.png → images/models/${s.id}_256x256.webp)`, '', `${fenceFor(p)}text`, p.trimEnd(), fenceFor(p), '')
    const fp = freePrompt(cls, s)
    writeFileSync(join(dir, `prompt-${s.id}-free.txt`), fp)
    md.push(`## ${s.name} — re-paint, no layout sheet (attach 2-3 accepted ${def.label} skins as finish refs only → images/models/${s.id}_256x256.webp)`, '', `${fenceFor(fp)}text`, fp.trimEnd(), fenceFor(fp), '')
  }
}
// The combined markdown (one fenced block per prompt, copy button in any
// preview) duplicates the .txt files, so it is written only on request and
// never committed: node art/skins/build-prompts.mjs --md
const wantMd = process.argv.includes('--md')
if (wantMd) writeFileSync(join(HERE, 'PROMPTS-skins.md'), md.join('\n'))
console.log(`wrote 6 sheet prompts, 24 single + 24 no-layout re-paint prompts${wantMd ? ', PROMPTS-skins.md' : ''}`)

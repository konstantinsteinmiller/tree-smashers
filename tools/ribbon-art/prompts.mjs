/**
 * Painted title ribbon (FRibbon.vue) — one TEXT-ONLY prompt per tone family.
 * The painting is cut into a 3-slice by tools/ribbon-art/pack.mjs: LEFT end
 * (tail + fold), a stretchable MIDDLE face, RIGHT end. So the face must be a
 * perfectly straight, level, horizontally uniform band.
 */
export const FAMILIES = {
  sun: { face: 'warm sun yellow (#ffc93c-ish)', light: 'pale butter yellow', shade: 'deep golden orange (#e08a12-ish)', tail: 'golden orange, one step darker than the face' },
  leaf: { face: 'fresh leaf green (#4cbb3c-ish)', light: 'light lime green', shade: 'deep forest green (#24792a-ish)', tail: 'medium green, one step darker than the face' },
  berry: { face: 'bright berry pink-red (#e8456b-ish)', light: 'light rose pink', shade: 'deep raspberry (#a3203f-ish)', tail: 'raspberry red, one step darker than the face' },
  royal: { face: 'royal blue (#3b5bdb-ish)', light: 'light sky blue', shade: 'deep navy-blue (#22328f-ish)', tail: 'medium royal blue, one step darker than the face' }
}

export const prompt = (fam) => {
  const c = FAMILIES[fam]
  return [
    'Paint ONE game UI element for "Tree Smashers", a cosy, bright cartoon toy game: an EMPTY title RIBBON BANNER (the classic "victory" banner a game title sits on), seen straight from the FRONT, no perspective, no tilt.',
    'Shape: a long, perfectly STRAIGHT and LEVEL horizontal ribbon face (a wide flat band, about 4.5 times wider than it is tall), NOT arched, NOT curved, NOT waving — its top edge and bottom edge are two perfectly straight horizontal lines from one end to the other, and the band has the SAME height and the SAME shading along its whole length.',
    'At EACH end of the face, the same ribbon continues as a short TAIL that folds BEHIND the face: the ribbon visibly bends backwards at the face\'s end (a small darker triangular fold of the same ribbon, tucked in naturally just below the face\'s end, joined to it, no gap), then comes out sideways a little LOWER than the face as a short tail ending in a clean swallow-tail V notch. The tail is clearly ONE continuous piece of fabric-like ribbon with the face, wrapping behind it — not a separate flag stuck behind. Left and right ends are exact mirror images.',
    `Colours: the face is ${c.face}, with a thin ${c.light} highlight band along the top inside edge and a ${c.shade} shade band along the bottom inside edge; the tails are ${c.tail}; the folds are the darkest shade of the same colour (not black, not navy).`,
    'Style: chunky, bold, toy-like game UI — smooth painted surfaces like glossy painted plastic. A bold, even, thick dark navy (#161a40) outline around the face, the folds and the tails. Flat cel shading, at most three tones per part (highlight, base, shade). NO stitches, NO stitching lines, NO dashed lines, NO seams, NO felt, NO fabric texture, NO pattern, NO wrinkles on the face.',
    'The face is EMPTY: NO text, NO letters, NO icons, NO stars, NO decoration on it.',
    'NO glow, NO sparkles, NO blur, NO soft drop shadow, NO shadow on the ground, NO radial gradients, NO gloss blobs, NO frame.',
    'Composition: a WIDE landscape image (16:9). The whole banner, tails included, is centred and fills about 92% of the image width, with an even magenta margin on every side; nothing is cut off at the image edges.',
    'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the banner — no gradient, no texture, no shadow on it, no magenta inside the banner. It will be keyed to transparency.',
    'Generate the image now.'
  ].join('\n')
}

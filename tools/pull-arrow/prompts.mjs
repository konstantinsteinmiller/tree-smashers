/**
 * The orbiting "pull this smasher" arrow (src/use/pullArrowArt.ts) — ONE text-only
 * sprite. At runtime it is rotated to point at the disc, so it must point exactly RIGHT
 * and be left-right asymmetric only in its tip.
 */
export const prompt = () => [
  'Paint ONE small game UI marker for "Tree Smashers", a cosy bright cartoon toy game where cute-but-angry plush creatures battle on spinning wooden discs: an ORNAMENTED ARROW that points at the creature the player should pull next. Seen flat from above, no perspective.',
  'The arrow points exactly to the RIGHT. A chunky, rounded, kite-shaped arrowhead in sunny gold (#ffc93c base, a lighter butter-yellow top band, a deeper amber underside), its tip pointing right. Set into the middle of the head a round berry-red gem (#e8456b) with a tiny white highlight. At the back of the head, two curled, mirror-image GREEN LEAF WINGS (#5cc85a with a lighter vein line) sweep back and outward like a little ornament. Cute, chunky, premium mobile-game UI, like a collectible charm — NOT a plain triangle.',
  'Style: a bold, even, thick dark navy (#161a40) outline around EVERY part (head, gem, each leaf); flat cel shading with at most three tones per colour, crisp hard edges, saturated clean colours. NO stitches, NO dashed lines, NO felt or fabric, NO metal chrome. NO glow, NO blur, NO soft drop shadow, NO shadow on the ground, NO radial gradients, NO light rays, NO text, NO letters, NO numbers, NO watermark.',
  'Composition: a SQUARE image (1:1); the arrow sits alone in the middle, about 70% of the image width, with wide empty magenta space around it.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the art — no gradient, no texture, no floor, no shadow. It will be keyed to transparency, so never use magenta, pink-purple or hot pink inside the art itself.',
  'Generate the image now.'
].join('\n')

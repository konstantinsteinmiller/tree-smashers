// ─── The engine's skill port ────────────────────────────────────────────────
//
// Everything the physics engine (useSpinnerGame.ts) needs from the skill
// system that is NOT the string-free core (`skillCore.ts`): creating a blade's
// skill state, the §5 collision / contact / salvo hooks and the skill VFX
// layer. The engine never imports this module. It is loaded only through the
// skills gate (`loadSkillEngine`) and handed to the engine with
// `installSkillEngine(port)`; until then — and forever on a skills-off build —
// the engine holds `null`, never creates `blade.skills`, and every skill hook
// behind `skillsActive` / `blade.skills !== undefined` stays unreachable.

export {
  createBladeSkills,
  createContactResult,
  createIncomingResult,
  createOutgoingResult,
  incomingSkill,
  onEnemyContact,
  outgoingSkillMul,
  salvoDamage,
  teamSalvoPct
} from '@/use/skills/skillRuntime'

export {
  createSkillVfx,
  drawSkillGlyph,
  renderBladeSkillFx,
  renderSkillFlavour,
  renderSkillLayer,
  resetSkillVfx,
  skillBladeAlpha,
  skillVfxEvent,
  tickSkillVfx
} from '@/use/skills/skillVfx'

export {
  createSkillCallouts,
  pushSkillCallout,
  renderSkillCallouts,
  resetSkillCallouts
} from '@/use/skills/skillCallouts'

export { smasherSkillKey } from '@/use/skills/smasherSkillArt'

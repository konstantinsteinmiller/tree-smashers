// ─── Skill storage keys (skills-feature.md §10.4) ──────────────────────────
//
// A flag-boundary module (src/skills/ — never obfuscated, no imports): the key
// strings live HERE, not in the shared `src/keys.ts`, so a skills-off build —
// where nothing reads them — drops them with the rest of the skill system.
// `src/keys.ts` re-exports them for existing imports.
//
// All `spinner_`-prefixed → part of the cloud payload on every strategy, and
// NOT in useResetProgress's KEEP_KEYS → a progress reset wipes them (the
// stage goes back to 1, so every skill is locked again anyway). Unlocks are
// never stored — they are derived from the cleared stage in `useSkills`.

/** Learned levels only: `{"v":1,"lv":{"mirror_plate":3}}` (level ≥ 1). */
export const SKILLS_KEY = 'spinner_skills'
/** The team's two slots: `{"v":1,"slots":["phase_step",null]}`. */
export const SKILL_LOADOUT_KEY = 'spinner_skill_loadout'
/** Reveal / intro bookkeeping, synced so a second device does not replay
 *  them: `{"v":1,"seen":[…],"intro":true,"slot2Seen":true,"filled":2}`. */
export const SKILL_UI_KEY = 'spinner_skill_ui'

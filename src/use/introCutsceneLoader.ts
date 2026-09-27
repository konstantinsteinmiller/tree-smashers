// ─── The ONE place the intro cutscene chunk is imported ─────────────────────
//
// A dynamic `import('@/…')` survives only in files on the obfuscator's exclude
// list (vite.config.ts): its `stringArray` pass rewrites the specifier into a
// runtime lookup Rollup can no longer resolve, so the chunk is never built and
// the import fails in every obfuscated portal build. This file is on that list
// and is kept tiny so excluding it costs no protection. (Same pattern as
// `utils/playgamaBridgeLoader.ts`.)
export const loadIntroCutscene = () => import('@/components/organisms/IntroCutscene.vue')

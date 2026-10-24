// ─── The ONE place the intro cutscene chunk is imported ─────────────────────
//
// A dynamic `import('@/…')` survives only in files on the obfuscator's exclude
// list (vite.config.ts): its `stringArray` pass rewrites the specifier into a
// runtime lookup Rollup can no longer resolve, so the chunk is never built and
// the import fails in every obfuscated portal build. This file is on that list
// and is kept tiny so excluding it costs no protection. (Same pattern as
// `utils/playgamaBridgeLoader.ts`.)
export const loadIntroCutscene = () => import('@/components/organisms/IntroCutscene.vue')

/**
 * Warm the intro for a probable first-timer while the splash is still up:
 * the cutscene chunk, then every painted file it draws (team trees, thorns,
 * tree-hit FX, the meadow backdrop / props / floor, the five smasher sheets,
 * the intro paintings). Nothing here blocks the splash; the cutscene waits
 * (capped) for the files it still lacks.
 */
export const warmIntroCutscene = (): void => {
  void loadIntroCutscene().catch(() => { /* the arena skips the intro then */
  })
  void import('@/use/introRender')
    .then((m) => {
      m.preloadIntroCanvasArt()
      return import('@/use/introArt')
    })
    .then(m => m.preloadIntroArt())
    .catch(() => { /* best-effort */
    })
}

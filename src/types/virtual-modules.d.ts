// Ambient declarations for Vite virtual modules.
//
// This file must stay free of top-level `import` / `export`. With one, it
// becomes a module and `declare module 'x'` inside it is read as AUGMENTATION
// of an existing module rather than a declaration of a new one — so the id
// still fails to resolve, which is why these do not live in `env.d.ts`.

declare module 'virtual:leaderboard-snapshot' {
  /**
   * The leaderboard as it stood when this bundle was built.
   *
   * Baked only into builds that may not fetch a board at runtime (Poki forbids
   * every external runtime request; Yandex rejects third-party storage URLs at
   * moderation). `null` on every build that has a live endpoint.
   *
   * See `leaderboardSnapshotPlugin` in `vite.config.ts` for how it is produced
   * and `scripts/leaderboard-snapshot.mjs` for why it carries a histogram
   * alongside the published rows.
   */
  const snapshot: {
    updatedAt: number
    total: number
    entries: { rank: number; name: string; score: number; power: number }[]
    /** `[score, howManyPlayersHaveIt]`, ordered score DESC. */
    dist: [number, number][]
  } | null
  export default snapshot
}

declare module 'virtual:league-pool' {
  /**
   * The league's baked opponent pool (vite.config.ts `leaguePoolPlugin`).
   * `null` until LG1 bakes one, and always `null` on a league-off build.
   * Typed `unknown`: the reader (LG1) validates it structurally.
   */
  const pool: unknown
  export default pool
}

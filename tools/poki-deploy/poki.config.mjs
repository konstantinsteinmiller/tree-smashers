// Per-project settings for `pnpm deploy:poki` — Battlecross.
//
// `team` and `gameId` come straight out of the P4D URL of the game's Versions
// page:
//   https://app.poki.dev/<team>/games/<gameId>/versions

export default {
  // The developer team every game of this studio lives under (the same slug as
  // the sibling repos' configs).
  team: 'hyperg8',
  // NOT KNOWN YET, and deliberately not guessed. Until Battlecross exists in
  // P4D and its uuid is pasted here (or passed as `--game-id <uuid>`), every mode
  // that talks to P4D refuses to start — see lib/target.mjs. This repo was
  // copied from Mega Droid (and that one from Survivalist) and this field used
  // to hold their ids; an upload with one of them would have landed in THAT
  // game's Versions list, so both are refused outright even if pasted back in.
  // `--gates-only` (offline) needs no id.
  gameId: '5f6415aa-a3f3-461d-9d5a-93edf2b16b2e',
  gameName: 'Battlecross',

  build: 'pnpm build:poki',
  dist: 'dist',
  // What `build:poki` writes (its tail is `node tools/poki-deploy/pack.mjs`).
  zip: 'dist/battlecross-poki.zip',

  /** Pack `dist` into `zip` with the pipeline's own zip writer instead of
   *  trusting a shell `tar -a -cf`, which silently produces a TAR named `.zip`
   *  whenever GNU tar wins the PATH. Leave this on. */
  repack: true,
  /** Extra files to keep out of the upload (backups and nested zips are
   *  already excluded). */
  zipExclude: () => false,

  /** What the version is called in P4D. Keep the version number in it — it is
   *  the only thing tying a live build back to a commit. */
  versionName: version => `Battlecross ${version}`,

  /** Extra hosts the gates and the runtime sweep should accept. Anything here
   *  needs a matching per-URL approval in P4D → Settings → CSP. Battlecross
   *  makes no external requests on Poki (the leaderboard is baked), so: none. */
  allowHosts: [],

  /** Strings that must never ship in a Poki release — Poki asks for a clean
   *  build, "no debug code, no dev artifacts". The release aliases this tooling
   *  to stubs (src/platforms/policy.ts → vite.config.ts); a QA twin built with
   *  `VITE_POKI_QA_TOOLS=true` keeps it and is REFUSED here, by design. */
  forbidInBundle: [
    { text: '[CHEAT]', why: 'dev cheats, src/use/useCheats.ts' },
    { text: 'ctrl+shift+alt+', why: 'cheat shortcuts, src/game/cheats.ts' },
    { text: 'cmarc', why: 'typed debug-mode toggle, src/use/useCheats.ts' },
    // NOT the hidden 20-tap interstitial (src/use/useQaAdTrigger.ts): it ships
    // in the release on purpose (src/platforms/policy.ts).
  ],

  qa: {
    playMs: 45000,          // how long the harness actually plays before judging
    reloadIdleMs: 60000,    // no-input window after an iframe reload; any gameplayStart in it FAILS (sticky activation)
    // How long to wait for a commercial break. NOTE: this game requests an
    // interstitial only on the result screen's Continue, 121 s apart
    // (src/use/useAdGate.ts), so a short pass usually sees none and reports the
    // ad steps as unproven. A human can fire one on demand, on the release
    // itself: 20 taps on the gold readout (HUD or map) within 30 s
    // (src/use/useQaAdTrigger.ts).
    adWaitMs: 120000,
  },

  /** Surfaces this game actually has. They decide whether a checklist step is
   *  "not applicable" or a real question — a game WITH usernames must not have
   *  its profanity-filter step reported as n/a.
   *
   *  Battlecross has neither on Poki: there is no name-entry UI anywhere
   *  (`setPlayerName` has no caller), and with `VITE_LEADERBOARD_URL` empty the
   *  Poki build shows only a rank badge — the top-100 list, the one place other
   *  players' names appear, is compiled out (`leaderboardListEnabled` is false)
   *  and the baked seed board carries no rows. */
  declares: {
    usernames: false,
    chat: false,
  },

  /** Expressions evaluated INSIDE the game's iframe during the QA pass. */
  hooks: {
    /** A snapshot that must survive a reload. Battlecross keeps ALL of its
     *  state in ONE localStorage blob, `bcross_state`, keyed by `bc_*`
     *  fields (src/keys.ts). Only DURABLE progress is read — counters that
     *  change on a visit's result, never on a mere reload — so a timestamp
     *  cannot fail a save that works. `null` when there is no save yet, which
     *  the pass reports as unproven, not as a pass. */
    readProgress: `(() => {
      try {
        const raw = localStorage.getItem('bcross_state')
        if (!raw) return null
        const s = JSON.parse(raw)
        const hero = s.bc_hero || {}
        const world = s.bc_world || {}
        const inv = s.bc_inventory || {}
        return {
          level: s.bc_level ?? null,
          xp: hero.xp ?? null,
          gold: s.bc_gold ?? null,
          story: s.bc_story ?? null,
          questsDone: s.bc_quests_done ?? null,
          cleared: Array.isArray(world.cleared) ? world.cleared.length : 0,
          flags: Array.isArray(world.flags) ? world.flags.length : 0,
          skills: Array.isArray(hero.learned) ? hero.learned.length : 0,
          items: Array.isArray(inv.items) ? inv.items.length : 0,
        }
      } catch (e) { return null }
    })()`,

    /** Open the game's rewarded-ad flow. Battlecross has no rewarded ads at
     *  all (interstitials only, after a result screen) — left null, and the
     *  step is reported as not applicable rather than silently ticked. */
    triggerRewarded: null,
  },
}

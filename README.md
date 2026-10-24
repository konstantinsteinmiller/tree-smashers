# Tree Smashers

Tree Smashers is a turn-based 2D flick-and-smash battler: launch cute but angry stuffed-animal **smashers** riding
turning discs across cozy forest arenas, knock out the enemy team or destroy their **Team Tower** (a little tree) to win.
(Formerly "Chaos Arena", a spinning-top game — the campaign, bosses, league and PvP mechanics carry over unchanged.)

- Store texts, how-to-play and controls: [description.md](description.md)
- Outstanding work (art desk, branding, registrations, balance): [roadmap.md](roadmap.md)

WIP: [playable demo](https://konstantinsteinmiller.github.io/tree-smashers/)

## Game overview

- **Smashers** — 12 unique plush animals (`src/data/smasherCatalog.ts`): hedgehog, rabbit, bear cub, beaver, ram, fox,
  turtle, woodpecker, sloth, squirrel, owl and boar. Each has its own stat profile and 3 unique skills; levels are
  bought with coins with no cap (past 30 each level costs ×1.08 more on top of the quadratic curve and its stat gain
  tapers; skill levels stop at 10; 9999 is only a corrupted-save ceiling), skill 2 unlocks at level 10, skill 3 at level 20. Roster state: `src/use/useSmashers.ts`.
- **Skills** — every smasher skill runs on one of the 10 skill-engine effects (`src/use/skills/*`) with its own
  multipliers (`mods`), so similar skills have different strengths and weaknesses.
- **Arenas** — 3 layouts repeating by stage (Mossy Glade, Mud Hollow, Twin Islands) with islands, speed boosters and
  pot holes, on top of the arena types (lava, ice, forest, boss).
- **Team size** — 1, 2 or 3 smashers per side (`src/data/teamSize.ts`, state `src/use/useTeamSize.ts`). Slot 1 from
  the start, slot 2 after winning stage 3, slot 3 after winning stage 10; the player picks the count in the Team modal.
  Every smasher is 10 % smaller than before (×0.9) and a side's count scales it again (1 → ×1, 2 → ×0.87, 3 → ×0.75);
  a side of one gets ×1.2 damage and max HP. Campaign NPC teams keep their composition and are sized by their own count;
  league fights and leaderboard ghosts are always 2v2; PvP is 1v1 / 2v2 (default) / 3v3, set by the host.
- **Team Towers** — from stage 3 on (and in PvP / league), destroying the enemy tower wins the battle instantly.
- **Art** — smashers are drawn procedurally from a 3D rig (`src/smashers/*`) in 16 consistent angles;
  `pnpm art:smashers` exports the reference sheets for the art desk (`art-sheets/smashers/`).
- **Save state** — all player progress lives in `smashers_*` localStorage keys (`src/keys.ts`) and rides the cloud save.

## Development

```sh
pnpm install
pnpm dev                 # dev server
pnpm test                # vitest
pnpm type-check          # vue-tsc
pnpm build:crazy-web     # portal builds: crazy-web, poki, playgama, gamepix, y8, itch, glitch, gamemonetize, youtube …
pnpm art:smashers        # export 32-angle smasher sheets
```

Leaderboard backend: Cloudflare Worker + D1 in `worker/` (`leaderboard-tree-smashers`, see `worker/SETUP.md`).

## Future Features Roadmap

Features rated on impact to three KPIs (1–5 scale each, 5 = highest impact):

- **Conversion** — likelihood a new player stays past 1 minute
- **Play Time** — average session length increase
- **Retention** — probability of return visits over 7/30 days

**Overall Score** = weighted average: Conversion × 0.3 + Play Time × 0.3 + Retention × 0.4

---

### Onboarding & First-Time Experience

| Feature                                                             | Conversion | Play Time | Retention | Overall | Notes                                                             |
|---------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|-------------------------------------------------------------------|
| Asset preloader with animated progress bar                          |     4      |     1     |     1     | **1.9** | Prevents blank screen / pop-in that kills conversion              |

### Core Gameplay Depth

| Feature                                                                               | Conversion | Play Time | Retention | Overall | Notes                                                       |
|---------------------------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|-------------------------------------------------------------|
| Smasher signature moves (active abilities on top of the 3 passive skills)             |     2      |     5     |     5     | **4.1** | Deepens strategy, gives reason to experiment with builds    |
| Boss stages every 5 levels (unique mechanics, large blade, special arena)             |     2      |     5     |     4     | **3.7** | Memorable moments that players talk about and come back for |
| Blade element system (fire > nature > water > fire) with arena hazards                |     2      |     4     |     4     | **3.4** | Adds team-building strategy and counter-play                |
| Arena modifiers (ice = low friction, lava ring = damage zone, shrinking arena)        |     2      |     4     |     4     | **3.4** | Variety prevents repetitive sessions                        |
| Smarter NPC AI (target weakest blade, combo launches, defensive positioning)          |     1      |     4     |     3     | **2.7** | Makes late-game feel challenging, not grindy                |
| ~~3v3 team expansion~~ — shipped as team sizes 1 / 2 / 3 (slot 3 after stage 10)       |     1      |     4     |     3     | **2.7** | More tactical depth for engaged players                     |
| Combo system (rapid successive hits = multiplier + screen effects)                    |     3      |     3     |     3     | **3.0** | Skill expression + satisfying feedback                      |
| Charge/power meter (hold longer = stronger but riskier launch)                        |     2      |     3     |     2     | **2.3** | Adds skill ceiling to launch mechanic                       |

### Progression & Collection

| Feature                                                                       | Conversion | Play Time | Retention | Overall | Notes                                                  |
|-------------------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|--------------------------------------------------------|
| Daily login rewards (escalating over 7 days, reset on miss)                   |     1      |     2     |     5     | **2.9** | Proven D1→D7 retention driver in casual games          |
| Achievement system with badges (first win, 10-win streak, all parts upgraded) |     1      |     4     |     5     | **3.5** | Long-term goals keep players invested                  |
| Smasher collection book ("Pokédex" style — all smashers + colourways + lore)  |     2      |     3     |     5     | **3.5** | Completionism is a strong retention motivator          |
| Prestige/rebirth system (reset campaign for permanent stat multipliers)       |     1      |     5     |     5     | **3.8** | Extends endgame massively for committed players        |
| Star rating per stage (1-3 stars based on HP remaining)                       |     2      |     4     |     4     | **3.4** | Replayability — perfectionist players redo stages      |
| Unlock new smashers from stage rewards (not just coins)                        |     2      |     3     |     4     | **3.1** | Surprise rewards > predictable coins for dopamine      |
| Seasonal limited-edition blade skins (holiday themes, monthly rotation)       |     1      |     2     |     5     | **2.9** | FOMO drives return visits                              |
| Weekly challenge stages (unique rules, leaderboard, exclusive reward)         |     1      |     4     |     5     | **3.5** | Recurring fresh content without dev cost of new stages |

### Social & Competitive

| Feature                                                                 | Conversion | Play Time | Retention | Overall | Notes                                                 |
|-------------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|-------------------------------------------------------|
| PvP multiplayer (real-time 1v1 via WebSocket)                           |     2      |     5     |     5     | **4.1** | Highest long-term retention feature — humans > bots   |
| Async PvP ("ghost" replays — fight recorded teams of other players)     |     2      |     4     |     5     | **3.8** | 80% of PvP retention at 20% of the engineering cost   |
| Global leaderboard (highest stage, fastest clear, most damage)          |     1      |     3     |     4     | **2.8** | Competitive players need a reason to optimize         |
| Share replay clip (auto-generate 10s GIF of best hit, share to socials) |     3      |     1     |     3     | **2.4** | Organic acquisition + viral loop                      |
| Clan/guild system (shared goals, clan wars)                             |     1      |     3     |     5     | **3.2** | Social obligation is the strongest retention mechanic |
| Friend challenges (share link → friend plays same stage)                |     3      |     2     |     3     | **2.7** | Low-cost social feature, good for acquisition         |
| Spectate mode (watch top players live)                                  |     1      |     3     |     3     | **2.4** | Aspirational content for new players                  |

### Monetization (Free-to-Play)

| Feature                                                          | Conversion | Play Time | Retention | Overall | Notes                                                 |
|------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|-------------------------------------------------------|
| Rewarded video ads (2x/3x coin multiplier wheel after stage win) |     1      |     2     |     2     | **1.7** | Primary revenue driver; keep optional to avoid churn  |
| Battle pass (free + premium tracks, 30-day season)               |     1      |     4     |     5     | **3.5** | Best F2P monetization model for retention             |
| Cosmetic shop (blade trails, arena themes, win animations)       |     1      |     2     |     3     | **2.1** | Non-P2W revenue; drives collection behavior           |
| Continue token (watch ad to revive team on loss)                 |     2      |     3     |     2     | **2.3** | High ad revenue per impression; use sparingly         |
| Interstitial ads (every 3rd match, skippable after 5s)           |     1      |     1     |     1     | **1.0** | Revenue filler — too frequent = churn, tune carefully |
| Remove-ads IAP ($2.99 one-time)                                  |     1      |     2     |     3     | **2.1** | Whale conversion; pairs well with interstitials       |

### Quality of Life & Polish

| Feature                                                           | Conversion | Play Time | Retention | Overall | Notes                                               |
|-------------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|-----------------------------------------------------|
| Quick-restart button (tap to replay current stage instantly)      |     2      |     4     |     3     | **3.0** | Reduces dead time between attempts                  |
| Speed-up toggle (2x game speed for replayed stages)               |     1      |     3     |     3     | **2.4** | Respects player time on grind stages                |
| Stats screen (win rate, total damage dealt, favorite blade)       |     1      |     2     |     3     | **2.1** | Players love data about themselves                  |
| Haptic feedback on mobile (vibrate on hit, launch)                |     3      |     2     |     2     | **2.3** | Tactile feedback improves "game feel" significantly |
| Offline progress (idle coin generation while away)                |     1      |     1     |     4     | **2.2** | Gives reason to reopen the app                      |
| Animated main menu (spinning blade showcase, parallax background) |     3      |     1     |     1     | **1.6** | First impression polish for conversion              |
| Sound & music system (dynamic battle music, hit SFX variety)      |     3      |     2     |     2     | **2.3** | Audio is 50% of game feel; currently minimal        |
| Dark mode support                                                 |     2      |     1     |     1     | **1.3** | Nice-to-have, low KPI impact                        |

### Game Modes (Post-Campaign)

| Feature                                                        | Conversion | Play Time | Retention | Overall | Notes                                            |
|----------------------------------------------------------------|:----------:|:---------:|:---------:|:-------:|--------------------------------------------------|
| Endless/survival mode (waves of enemies, how far can you go?)  |     1      |     5     |     4     | **3.4** | Top play-time driver; great leaderboard content  |
| Daily dungeon (unique stage each day, one attempt, big reward) |     1      |     3     |     5     | **3.2** | Daily engagement hook with scarcity              |
| Tournament mode (bracket of 8 NPCs, winner-takes-all prize)    |     1      |     4     |     4     | **3.0** | Event-style content, high engagement per session |
| Practice/sandbox mode (test builds, no stakes)                 |     2      |     3     |     2     | **2.3** | Helps players learn without frustration          |
| Time attack (clear stage under X seconds for bonus)            |     1      |     3     |     3     | **2.4** | Skill-based replayability                        |

---

### Suggested Implementation Priority

**Phase 1 — Conversion & Core (Week 1-2):**

1. Guided tutorial (3.6)
2. Asset preloader (1.9 but blocks everything else)
3. First-win celebration (3.0)
4. Quick-restart button (3.0)

**Phase 2 — Depth & Stickiness (Week 3-5):**

5. Special abilities per part (4.1)
6. Boss stages (3.7)
7. Star rating per stage (3.4)
8. Achievement system (3.5)
9. Sound & music system (2.3)

**Phase 3 — Retention Loops (Week 6-8):**

10. Daily login rewards (2.9)
11. Prestige system (3.8)
12. Weekly challenge stages (3.5)
13. Blade collection book (3.5)
14. Endless/survival mode (3.4)

**Phase 4 — Social & Monetization (Week 9-12):**

15. Async PvP (3.8)
16. Battle pass (3.5)
17. Rewarded video ads (1.7 but primary revenue)
18. Global leaderboard (2.8)
19. Real-time PvP (4.1 but high engineering cost)

---

Sounds generated with [elevenLabs](https://elevenlabs.io/app/sound-effects/generate)
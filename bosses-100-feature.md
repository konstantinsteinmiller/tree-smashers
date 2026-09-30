# Bosses for stages 101–200 — design spec (Chaos Arena)

> Status: **design, not implemented** — implementation starts after the skill system ships
> (skills WP4/WP7/WP9/WP10, see §12). Written to be built from without guessing. Every number
> is read from the shipped code (file/function cited) or measured with the boss scenario
> simulator `tools/skills-sim/bosses100.mjs` (§8, Appendix A).
> Source: `new-features.md` → "new Bosses for 100+ stages".

---

## 0. TL;DR

- **What:** the ten boss slots **110, 120 … 200** get **new encounters** built from **three new
  boss mechanics** (the brief's three ideas); the x5 slots keep today's cycle copies, so
  something new arrives every 10 stages with a familiar boss in between (§3.2). Each mechanic
  debuts alone (110/120/130), returns layered on an old archetype the player knows (ghost,
  healers, split, partners, stat-switch — 140–190) and all three meet in the finale (200).
- **Beyond 200:** the boss *layout* repeats every **200** stages (brief), the *difficulty*
  keeps its 100-stage cycle (+22 part levels, ×1.35 rewards per cycle). Stage 310 = the Cinder
  Tyrant at +44 levels, named "… II". Every mechanic magnitude is scale-free (§3.3).
- **Reward:** the slot's normal boss reward + roulette, plus a **trophy skin** — each new
  boss wears a new painted skin that can only be earned by beating an encounter that wears
  it (§3.5).

| boss (debut)                                   | mechanic                      | key numbers                                                                                                                                                                                                         | counterplay                                                                                                                                             | first-try win, fitting L10 pair / no skills |
|------------------------------------------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| **The Cinder Tyrant** (110, Round/Tanky)       | **Ember Nova** — aoe burn     | every **2.0 s of combat clock** (runs only while a launched blade moves); reach **2.2 × boss radius** + victim radius; **3 % of victim max HP** (min 1), hazard kind `burn`; one hit per victim per nova            | finish launches outside the ring, hit-and-run, kill fast; Hazard Ward (−40 %), Guard Shell, Second Wind                                                 | **50 %** / 21 %                             |
| **The Glacier Warden** (120, Quad Core/Speedy) | **Frost Lock** — hard freeze  | any touch: victim keeps **10 %** speed (a shock); rammed by the Warden: **Frozen** — can't be launched on its team's **next turn**; never two turns in a row; **never the last launchable spinner** (no lost turns) | keep both spinners alive, one-shot hits over combos; Phase Step (phased = immune), Static Charge (stunned Warden doesn't ram), Hazard Ward (keeps 19 %) | **56 %** / 25 %                             |
| **The Frostbite Yeti** (130, Spiky/Tanky)      | **Frostbite** — stacking slow | every touch: **+1 stack = −10 % speed** (and −10 % velocity on landing), **max 5 = −50 %**; each stack lasts **through the victim team's next 2 turns**; 1 stack / 250 ms                                           | rotate spinners, hit-and-leave instead of hugging; Phase Step (no stack), Static Charge                                                                 | **59 %** / 28 %                             |

- **Balance** (sim, §8): debut 50–61 %, combos 29–44 %, finale 17 % first-try win with a
  fitting L10 pair at the typical player's economic part level; 93–99 % at the rubber-band
  floor (Magma Titan 65 %); fights 8–24 turns. From 120 on every encounter is easier than the
  cycle copy it replaces (those are 0–1 % walls from 140 on, 190 aside); 110 replaces a
  near-free Bear Mother II and becomes the cycle's first real boss. Skill pairs stay
  **≤ 1.36×** power on every new boss (cap 1.5×).
- **Performance:** event-driven; ≤ ~16 extra primitives in the worst frame (the finale); cached
  aura/ice sprites, pooled rings, reused flame-burn strip; no `shadowBlur`, no per-frame
  gradients; every effect has an `FX.low` fallback; 3 new ≤ 12 KB SFX in the deferred tier.
- **Determinism:** no random numbers at all — tick-counted combat clock and turn indices only —
  so the encounters replay from a seed and can be **league gatekeepers** (LG7, §9).
- **Test shortcut:** cheat `ctrl+shift+9` opens the **Boss Lab** — all ten encounters + three
  single-trait sandboxes, one click each, re-opening on the next one after every fight (§11).
- **Build:** 10 work packages BW0–BW9 in 5 batches after the skill system ships; critical path
  skills WP4 → BW2 → BW3 → BW6 → BW8 → BW9 (§12). **Six decisions** for the user (§13.1).

---

## 1. Goals / non-goals

**Goals**

- Keep the most-loved promise — *something new every 5–10 stages* — alive past stage 100,
  where today the campaign only replays stages 1–100 with +22 part levels (`scaleStage` in
  `useSpinnerCampaign.ts`).
- Three **new boss mechanics** that a seasoned player has never seen, each one readable in a
  single contact and answerable with the loadout choice the skill system introduces.
- **Performance-neutral**: event-driven effects, fixed pools, cached sprites, no `shadowBlur`,
  no per-frame gradients, `FX.low` fallbacks; ≤ 16 extra canvas primitives in the worst frame.
- **Deterministic**: no `Math.random`, no wall clock — so the same encounters can be league
  gatekeepers (league plan LG7) and replay identically from a seed.
- A test shortcut: a cheat-only **Boss Lab** modal that loads every new encounter (§11).

**Non-goals (v1)**

- New mechanics on regular (non-boss) enemies, in the daily challenge or in PvP (backlog §13.2).
- Skills on bosses (the skills spec keeps enemies skill-less, `skills-feature.md` §9).
- A new currency or a new reward type — the new bosses pay the normal boss reward + roulette;
  the only extra is a cosmetic **trophy skin** per new boss (§3.5).

**Scope note — "up to 10 encounters".** The brief asks for *up to 10 new boss encounters on
stages 101–200* and offers three mechanic ideas. This spec builds **10 encounters from those 3
new mechanics**, each layered onto the old archetype of the slot it replaces (ghost, split,
partners, healers, stat-switch). Three mechanics keep the rules learnable and the VFX budget
flat; ten encounters keep the "something new every 10 stages" cadence. More *mechanics* are a
backlog item (§13.2), not needed for the cadence.

---

## 2. Ground truth — how bosses work today (numbers from code)

- **Campaign table.** `BASE_STAGES` in `src/use/useSpinnerCampaign.ts` holds 100 hand-written
  stages; bosses on every 5th stage plus stage 88. `getStageById(id)` maps any id to
  `cycle = ⌊(id−1)/100⌋`, `base = (id−1) mod 100`, and `scaleStage` adds `22 × cycle` to every
  enemy part level (`cycleLevelBonus`) and multiplies both rewards by `1 + 0.35 × cycle`
  (`cycleRewardMul`); the mid-game trim (×0.55 regular, ×0.75 boss) keys on the *base* id
  20–100 (`tightenMidGame`). Stages 101–200 are therefore stages 1–100 again, suffixed "II".
- **Boss stats.** Bosses get 2× HP (`createBladeState`, `bossHpMultiplier`) and 1.6× radius
  (healers 1.2×). Campaign NPCs also take the difficulty HP multiplier; campaign bosses the
  **rubber band** `bossHpRubberBandMul()` — −10 % HP per 2 consecutive boss losses, max −50 %.
- **Abilities** (`BossAbility`, wired in `initGame`): `ghost` (splits into 2 damage-linked
  twins on first launch), `split` (5 children on death, 1.1 s invulnerable), `partners` /
  `healers` (team group, no friendly fire; healers +2 HP per ally contact / 250 ms),
  `child-emitter` (mini blades on contact, ≤ 3 alive), `stat-switch` (max(ATK, DEF) as ATK on
  its turn, as DEF on yours), `life-leech` (heals 30 % of damage dealt), `thunder` (1 HP/s aura
  in 1.8× radius, per-target 1 s cooldown). Skin `teleporter` passes walls.
- **Hazards.** Lava wall `ceil(2.5 % maxHp)` per bounce + the painted flame-burn strip
  (`borderFx.ts triggerBurn`, capped by `burnCap()`: 2 on `FX.low`, 3 on Firefox); shock
  wall/bouncer keeps 10 % speed (250 ms per-blade gate `lastShockMs`, currently
  `performance.now()` — skills WP0 moves it to game time); ice arena decay `1 − (1 − d)·0.35`.
- **Turns.** One launch per side; a turn ends when the launched blade stops
  (`STOP_THRESHOLD 0.25`). A resting blade deals no damage. Contacts deal damage once per
  contact entry (`CONTACT_REARM_MS 50`).
- **Clocks.** `gameTime()` is `pvpTickCount × FIXED_STEP_MS` in PvP and `performance.now()`
  otherwise. Physics runs in fixed 16.67 ms steps (`FIXED_STEP_MS = 1000/60`); at `simSpeed 2`
  each step runs two substeps.
- **Skills (designed, being built).** Hazard Ward reduces lava/thunder aura damage (−40 % at
  L10) and keeps 19 % instead of 10 % speed on a shock; Static Charge stuns an enemy that rams
  the bearer (skips its next turn, never two in a row); Guard Shell = battle-start shield of 16 %
  max HP; Phase Step = 10 % dodge + 300 ms phase; Second Wind = one heal of 18 % at ≤ 35 % HP;
  Mirror Plate = 16 % half-and-reflect. Pair power ≤ 1.5× (`skills-feature.md` §3). Stage 101+
  unlocks no skill (skills plan G16); by stage ~80 a typical player owns all ten at L10.
- **Presentation hooks that already exist.** `BossPeekBadge.vue` (next boss portrait in the
  painted `boss-frame`, driven by `bossPeek.ts`), `BossDefeatedBanner.vue` (`bossDefeated.ts`),
  the boss roulette (`RouletteWheel.vue`, `rouletteGrants.ts`), skins painted through
  `art/skins/` + `tools/art-desk` (`pnpm art:desk`), cheat boss stages
  (`buildCheatBossStage`, `useCheats.ts`, enabled by `localStorage.cheat = true`).

---

## 3. Stage 101+ structure

### 3.1 Layout period 200, scaling cycle 100

- **Boss layout repeats every 200 stages** (brief: "Bosses on stages 201+ are a repetition of
  the spread-out pattern of stages 1–200"). `slot = ((id − 1) mod 200) + 1`.
    - slot 1–100 → today's `BASE_STAGES` (unchanged);
    - slot 101–200 → today's cycle copy **except the ten `x10` boss slots**, which take the new
      encounter table `BOSS_ENCOUNTERS` (§5, `src/data/bossEncounters.ts`).
- **Difficulty keeps its 100-stage cycle** — `cycle = ⌊(id − 1)/100⌋`, +22 part levels and
  ×(1 + 0.35·cycle) rewards per cycle, exactly as today. New encounters are authored at
  **cycle-1 levels** (what stage 101–200 fields) and get `+22 × (cycle − 1)` in later odd
  cycles: stage 310 = the Cinder Tyrant at its 110 levels + 44.
- So: 1–100 base · 101–200 base+22 with 10 new bosses · 201–300 base+44 · 301–400 new layout
  +66 · … forever.

### 3.2 The 101–200 boss ladder

"New" rows replace the cycle copy of that slot; every other boss slot keeps its cycle copy, so
a new encounter lands **every 10 stages** with a familiar boss in between.

| slot | today (cycle copy)                       | 101–200 after this feature         | new mechanic                     |
|------|------------------------------------------|------------------------------------|----------------------------------|
| 105  | Cyclone Warlord II (plain)               | unchanged                          | —                                |
| 110  | Bear Mother II (split)                   | **The Cinder Tyrant**              | Ember Nova (intro)               |
| 115  | Phantom Twin II (ghost)                  | unchanged                          | —                                |
| 120  | Iron Brotherhood II (partners ×3)        | **The Glacier Warden**             | Frost Lock (intro)               |
| 125  | Mending Choir II (healers ×3)            | unchanged                          | —                                |
| 130  | Chaos Incarnate II (life-leech)          | **The Frostbite Yeti**             | Frostbite (intro)                |
| 135  | Ravenous Swarm II (split)                | unchanged                          | —                                |
| 140  | Dragon Specter II (ghost)                | **The Twin Pyres**                 | ghost + Ember Nova               |
| 145  | Unbroken Trio II (partners ×3)           | unchanged                          | —                                |
| 150  | Eternal Grove II (healers ×4)            | **The Blizzard Choir**             | healers ×3 + Frostbite lead      |
| 155  | Dread Scorpion II (child-emitter)        | unchanged                          | —                                |
| 160  | Swarm Hive II (split)                    | **The Shattering Glacier**         | split + Frost Lock, shards chill |
| 165  | Dragon Eclipse II (ghost)                | unchanged                          | —                                |
| 170  | Quartet of Fate II (partners ×4)         | **The Frostfire Pact**             | partners: Ember + Frost + guard  |
| 175  | Hallowed Circle II (healers ×4)          | unchanged                          | —                                |
| 180  | Molten Titan II (stat-switch)            | **The Magma Titan** (lava arena)   | stat-switch + Ember Nova         |
| 185  | Riftborn II (child-emitter)              | unchanged                          | —                                |
| 188  | Darkwood Hollow II (partners, sandstorm) | unchanged                          | —                                |
| 190  | Dragon Sovereign II (ghost)              | **The Blizzard Twins** (ice arena) | ghost + Frostbite                |
| 195  | Final Guard II (partners + thunder)      | unchanged                          | —                                |
| 200  | Everlasting Choir II (healers ×4)        | **The Elemental Court**            | partners: all three mechanics    |

Order of teaching: each mechanic arrives **alone** first (110, 120, 130), then returns layered
on an archetype the player already knows (140–190), then all three meet in the finale (200).
The stat-switch and life-leech bosses lose their 101–200 copy; stat-switch survives inside the
Magma Titan and life-leech keeps its regular-stage appearance at 171.

### 3.3 Escalation past 200

| stage range | layout        | enemy levels           | names                                                   |
|-------------|---------------|------------------------|---------------------------------------------------------|
| 1–100       | base          | table                  | `stages.stage_N`                                        |
| 101–200     | base + 10 new | +22 (new: as authored) | cycle copies "II"; new encounters **no suffix** (debut) |
| 201–300     | base          | +44                    | "III" (unchanged rule)                                  |
| 301–400     | base + 10 new | +66 (new: authored+44) | cycle copies "IV"; new encounters **"II"**              |
| 501–600     | base + 10 new | +110 (new: +88)        | new encounters "III"                                    |

- Every new-mechanic magnitude is **scale-free**: Ember Nova is a % of the victim's max HP,
  Frost Lock and Frostbite are speed fractions and turn counts. Nothing needs re-tuning per
  cycle; the +22 levels per cycle carry the difficulty exactly as they do for old bosses.
- New-encounter suffix: `appearance = (cycle + 1) / 2` → `''`, `'II'`, `'III'`, … via the
  existing `CYCLE_SUFFIX` list (cycle copies keep today's `cycleSuffix(cycle)`).

### 3.4 Rewards

- **Stage reward = the replaced slot's reward row** (`rewardWin` / `rewardLose` after trim and
  cycle multiplier). The economy model (`tools/skills-sim/econ.mjs`) and every coin number in
  the game stay identical; the boss roulette runs as for any boss (`noteCampaignBossWin`,
  `BossDefeatedBanner`, roulette + ad respin).
- **Rubber band** applies as to every campaign boss (it is in `createBladeState`).
- **Battle pass XP, leaderboard score, stage advance** — unchanged (they key on the stage win).

### 3.5 What the player gets: trophy skins

Each of the three new bosses wears a **new skin** (§7.1). The **first win against any
encounter whose roster wears that skin** grants the skin — a *trophy*:

| skin (class)              | granted by the first win over                                      |
|---------------------------|--------------------------------------------------------------------|
| `cinder` (Round Guard)    | 110 Cinder Tyrant · 140 Twin Pyres · 170 Frostfire Pact · 200      |
| `frost-vault` (Quad Core) | 120 Glacier Warden · 160 Shattering Glacier · 170 · 200            |
| `yeti` (Spiky)            | 130 Frostbite Yeti · 150 Blizzard Choir · 190 Blizzard Twins · 200 |

(180 Magma Titan keeps the existing `boulder` skin; it grants nothing extra.)

- Trophy skins are **cosmetic only** (no hidden stat like `diamond`), in a new
  `TROPHY_SKINS` set that every offer path excludes (shop, skin chest, daily reward, battle
  pass, roulette segments, rewarded-ad skins) — they can only be *earned*.
- The grant is idempotent (`buySkin` no-op if owned) and shown after the roulette reward's
  Continue as one extra `FReward` card ("Boss trophy" + the skin + its name). It queues
  *behind* any skill reveal (skills plan G12/G13 own that queue; stage 101+ unlocks no skill,
  so in practice only the "existing player" skills intro can precede it).
- A player already past 110 when this ships collects the skins from whichever wearer he meets
  first (every skin appears ≥ 3 times in 110–200 and all three at 200).

### 3.6 Other modes

| mode                     | new mechanics                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------------|
| Campaign 101+            | ON (the ten encounters)                                                                          |
| Cheat stages / Boss Lab  | ON                                                                                               |
| League gatekeepers (LG7) | ON — encounters are deterministic; `buildBossEncounterStage(id, levels)` builds any of them (§9) |
| Daily challenge          | OFF in v1 (its `SOLO_ABILITIES` pool is unchanged); backlog §13.2                                |
| PvP, leaderboard ghosts  | OFF (traits exist only on NPC bosses)                                                            |
| Video pipeline scenes    | follow the stage; a new-boss beat can use the Boss Lab builder                                   |

---

## 4. The three new mechanics ("traits")

### 4.0 Words used below (exact, in turn terms)

- **Trait carrier**: an NPC boss blade whose stage config has `bossTrait: 'ember' | 'frost' |
  'chill'`. Ghost twins inherit the trait (the twin copies the config); split children and
  emitted minions do **not** (their config drops it), except the Shattering Glacier's shards
  (`shardTrait: 'chill'`, §5).
- **Victim**: a blade of the *other owner* than the carrier. Carriers never affect their own
  team (partners, healers, twins, children are immune).
- **Team turn index** `t(team)`: counts that team's turns; it increments when the team's turn
  *begins* — i.e. when it launches, or when its turn is skipped. The NPC side already has this
  counter for Static Charge (`npcTurnIndex`, skills §10.3 item 5); this spec adds the mirror
  `playerTurnIndex`, incremented in `beginLaunch` for player launches and in the skip path.
  A skipped turn **counts** as that team's turn.
- **"Next turn" of a victim** = its team's turn `t + 1`, where `t` is the team's index at the
  moment of the event. An event during the victim's own launch (turn `t`) and an event during
  the enemy turn that follows it both point at the same next turn `t + 1`.
- **Combat clock** `bossClockMs`: a per-match counter advanced by `FIXED_STEP_MS` on every
  physics **substep** while the phase is `player_launched` or `npc_launched` (something is
  moving). It does not run while a player aims, during the meteor intro, the turn
  announcement, a pause, an ad or after game over. At `simSpeed 2` it advances twice per tick,
  so a launch sees the same pulses at 1× and 2×.
- **Armed contact**: a collision where `contactArmed` is true in `resolveCollision` (the
  existing one-roll-per-contact gate).
- **Phased**: `blade.skills.phasedUntil > gameTime()` (Phase Step, skills §4.2).

### 4.1 Ember Nova — the Cinder Tyrant (`bossTrait: 'ember'`)

*"The air around it burns. Every two seconds of fighting it exhales fire."*

**Rule.** Every **2,000 ms of combat clock** (`EMBER_PERIOD_MS`), every living ember carrier
releases a nova. Each victim whose centre is within `EMBER_RADIUS_MUL (2.2) × carrier.radius +
victim.radius` of a carrier loses `max(1, EMBER_PCT (3 %) × victim.maxHp)` as damage of kind
**`'burn'`**. A victim is hit **at most once per nova tick**, however many carriers reach it
(Twin Pyres, Elemental Court). The first nova comes after 2,000 ms of combat.

| parameter | value                                         | notes                                                              |
|-----------|-----------------------------------------------|--------------------------------------------------------------------|
| period    | 2,000 ms combat clock                         | ≈ one nova per launch on average (measured, §8)                    |
| reach     | 2.2 × boss radius + victim radius             | boss r = 44.8 (mobile) → 126.6 units centre-to-centre; arena r 200 |
| damage    | 3 % of the victim's max HP, min 1             | scale-free across cycles (lava is 2.5 % per bounce)                |
| kind      | `'burn'` (hazard)                             | through `applyHpLoss` (skills §10.3 item 9)                        |
| targets   | victims only, once per nova                   | allies, twins, children immune                                     |
| telegraph | charge arc on the boss rim fills over the 2 s | last 300 ms the arc thickens (§7.3)                                |

- **Why combat clock, not game time:** time-based damage in a turn-based game must not punish
  a player for aiming slowly, and must replay identically from a seed. Thunder's aura (which
  ticks in real time, also while aiming) is the precedent this deliberately does *not* copy.
- **Counterplay:** end your launches **outside the ring** (the reach is drawn when the arc
  charges), hit and bounce away instead of hugging; kill fast (the nova is a clock, fewer
  combat seconds = fewer novas); Hazard Ward, Guard Shell, Second Wind.
- **Edge cases:** a nova that kills the last player blade ends the match as a loss (like
  lava). A nova never hits during the meteor intro (clock stopped). The Opening Salvo lands
  before the first nova. The clock survives turn changes (a nova can come on the enemy's
  launch); it resets per match.

### 4.2 Frost Lock — the Glacier Warden (`bossTrait: 'frost'`)

*"Touch it and you stop dead. Get rammed by it and you freeze solid."* — the **hard freeze**.

**Rule A — cold touch (any armed contact).** The victim keeps `FROST_KEEP = 10 %` of its
speed (exactly a shock-wall zap: same code path, same 250 ms per-blade `lastShockMs` gate,
Hazard Ward's `shockKeep` applies). The damage of that contact is computed first (from the
pre-contact closing speed), so the hit itself is not weakened — only what comes after it:
no rebound chain, no second hit, no wall ricochet.

**Rule B — frozen solid (contact while the carrier is the launched blade, `launchedBladeId
=== carrier.id`).** The victim becomes **Frozen** for its team's next turn:
`victim.stunnedForTurn = t(victim team) + 1`, `victim.lockKind = 'frost'` — the same launch
lock Static Charge puts on enemies (§12.1). A frozen blade cannot be selected, dragged,
auto-selected or launched on that turn (the AI and PvP paths use the same filter). Limits:

1. **No two in a row:** `stunImmuneTurn = stunnedForTurn + 1`; a blade frozen for turn `n`
   cannot be frozen for `n + 1`.
2. **Never a lost turn:** a freeze that would leave the victim's team with **no launchable
   blade** on that turn does not happen (the ice cracks off — VFX + SFX, no lock); and if a
   later death leaves a team whose only living blades are frost-locked, they thaw when its
   turn starts. So Frost Lock takes away *which* spinner you play, never *whether* you play.
3. The freeze ends when that turn ends (it was spent by launching the other blade).

| parameter           | value                                                      |
|---------------------|------------------------------------------------------------|
| speed kept on touch | 10 % (Hazard Ward L10: 19 %)                               |
| touch gate          | 250 ms per victim (`lastShockMs`, shared with shock walls) |
| lock trigger        | carrier is the launched blade                              |
| lock length         | the victim team's next turn                                |
| re-lock             | not on the following turn; never the last launchable blade |

- **Counterplay:** keep your **two** spinners healthy (a lone survivor can't be locked, but the
  pair gets split every boss turn); single decisive shots instead of combos (Momentum is weak
  here, Lucky Edge strong); Phase Step (a phased victim ignores both rules); Static Charge (a
  stunned Warden skips its ram).
- **Edge cases:** frozen blades still collide, take damage and can be pushed; the freeze is a
  launch lock, not a physics state. A player who was frozen *and* the Warden stunned by Static
  Charge on the same contact: the player plays the other blade, the Warden skips its turn —
  the turn indices advance, both effects expire, nothing can loop.

### 4.3 Frostbite — the Frostbite Yeti (`bossTrait: 'chill'`)

*"Every touch bites deeper. Stay near it and your spinners grind to a crawl."* — the
**stacking slow**.

**Rule.** Every armed contact between the carrier and a victim (either one moving) that is not
phased gives the victim one **Chill stack**, at most one per victim per `CHILL_GATE_MS =
250 ms`. Each stack:

- reduces the victim's **speed multiplier by 10 %** (`statsFor` → `speedMultiplier × (1 −
  0.10 × stacks)`) — so the launch power, the travel, the speed-based crit window and the
  speed-advantage rule all see the slower blade; the HUD SPD value drops with it;
- cuts the victim's **current velocity by 10 %** at the moment it lands (the touch feels cold);
- **lasts until the end of the victim team's 2nd turn after the touch** (`CHILL_TURNS = 2`):
  stack expiry = `t(victim team) + 2`; when that team's turn number `n` ends (its launched
  blade stops, or the turn is skipped) every stack with `expiry ≤ n` is removed (and the rule
  is re-applied when its next turn begins, so a stack can never outlive its turn).

Stacks are **independent** (each has its own expiry, no refresh of older stacks); **cap 5
stacks = −50 %**. A touch at the cap replaces the stack that would expire first (the chill
does not grow, it lasts longer).

| parameter          | value                                                                                          |
|--------------------|------------------------------------------------------------------------------------------------|
| per stack          | −10 % speed multiplier; −10 % current velocity on landing                                      |
| cap                | 5 stacks (−50 %)                                                                               |
| duration per stack | through the victim team's next 2 turns                                                         |
| gate               | 1 stack per victim per 250 ms                                                                  |
| worked example     | rammed on the boss turn after your turn 7 → stack live on your turns 8 and 9, gone when 9 ends |

- **Counterplay:** **rotate** — a chilled spinner that sits out two turns thaws; hit-and-leave
  shots (every touch is a stack, a hug is several); Phase Step; Static Charge (a stunned Yeti
  does not ram); kill it before stacks pile up.
- **Edge cases:** the HUD value, not the card's base stat, is what changes. The 10 % velocity
  cut can push an already-slow blade under `STOP_THRESHOLD`; the existing stop rule then ends
  its move (and, if it was the launched blade, the turn) as usual. Chill does not affect the
  carrier or its allies (partners/healers of the Yeti).

### 4.4 The two freeze bosses side by side

|              | **Glacier Warden — Frost Lock** (hard freeze)                  | **Frostbite Yeti — Frostbite** (stacking slow)     |
|--------------|----------------------------------------------------------------|----------------------------------------------------|
| on any touch | speed → 10 % (a shock)                                         | +1 stack: −10 % speed, velocity −10 %              |
| on *its* ram | **Frozen**: that spinner can't be launched next turn           | same as any touch                                  |
| stacking     | none — binary                                                  | up to 5 stacks (−50 %)                             |
| lasts        | exactly the victim's next turn                                 | each stack: the victim's next 2 turns              |
| worst case   | you play the other spinner                                     | both spinners at −50 % launch power                |
| reads as     | ice block around the spinner + locked card                     | frost rim thickens + 1–5 snowflake pips            |
| answered by  | two healthy spinners, one-shot hits, Phase Step, Static Charge | rotation, hit-and-leave, Phase Step, Static Charge |

---

## 5. The ten encounters

Levels are the **cycle-1 part levels** (stage 101–200; +44 in 301–400). They are the tuning
dial of §8 — enemy levels are not shown in battle — which is why a Yeti can sit at 20 while a
Warden sits at 45: each number is what makes that body *plus its trait* land on the target.
All bosses keep the standard boss treatment (2× HP, 1.6× radius, boss arena unless noted).

| slot | encounter (`nameKey`)                                  | roster (top/bottom tl/bl · skin · ability + trait)                                                                                                           | arena    | lesson / twist                                                                                               |
|------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------|
| 110  | **The Cinder Tyrant** (`boss_cinder_tyrant`)           | Round/Tanky 22/22 · `cinder` · plain + **ember**                                                                                                             | boss     | debut of the nova: a slow, durable brazier; the fight is about ending launches outside its ring              |
| 120  | **The Glacier Warden** (`boss_glacier_warden`)         | Quad Core/Speedy 45/45 · `frost-vault` · plain + **frost**                                                                                                   | boss     | debut of Frost Lock: a fast rammer that stops your combos dead and freezes whoever it hits                   |
| 130  | **The Frostbite Yeti** (`boss_frostbite_yeti`)         | Spiky/Tanky 20/20 · `yeti` · plain + **chill**                                                                                                               | boss     | debut of Frostbite: a spiky brawler; every touch bites, hugging it is how you lose                           |
| 140  | **The Twin Pyres** (`boss_twin_pyres`)                 | Round/Balanced 33/33 · `cinder` · **ghost** + ember                                                                                                          | boss     | the Phantom Twin trick with fire: two linked burning halves → twice the nova *area*, still one burn per nova |
| 150  | **The Blizzard Choir** (`boss_blizzard_choir`)         | Spiky/Tanky 18/18 · `yeti` · **healers** + chill; Soft Shell/Balanced 17/17 · `shell` · healers; Quad Core/Balanced 17/17 · `prisma` · healers               | boss     | a healer choir led by a chilling Yeti: slow spinners can't out-damage the heals — rotate                     |
| 160  | **The Shattering Glacier** (`boss_shattering_glacier`) | Quad Core/Speedy 52/52 · `frost-vault` · **split** + frost, `shardTrait: chill`                                                                              | boss     | kill the Warden and it shatters into 5 frost shards whose touch chills                                       |
| 170  | **The Frostfire Pact** (`boss_frostfire_pact`)         | Round/Tanky 26/26 · `cinder` · **partners** + ember; Quad Core/Speedy 26/26 · `frost-vault` · partners + frost                                               | boss     | fire and ice together: the Warden pins you in place, the Tyrant's nova does the rest                         |
| 180  | **The Magma Titan** (`boss_magma_titan`)               | Soft Shell/Tanky 46/44 · `boulder` · **stat-switch** + ember                                                                                                 | **lava** | the Molten Titan returns burning, on lava: novas plus lava bounces — the Hazard Ward stage                   |
| 190  | **The Blizzard Twins** (`boss_blizzard_twins`)         | Spiky/Tanky 26/26 · `yeti` · **ghost** + chill                                                                                                               | **ice**  | two linked Yetis on ice: chill stacks twice as fast, and ice makes every slowed spinner slide                |
| 200  | **The Elemental Court** (`boss_elemental_court`)       | Round/Balanced 24/24 · `cinder` · partners + ember; Quad Core/Speedy 24/24 · `frost-vault` · partners + frost; Spiky/Tanky 24/24 · `yeti` · partners + chill | boss     | the finale: all three mechanics at once, as one partner group                                                |

Boss counts on the field: 1 · 1 · 1 · 2 (twins) · 3 · 1 → 5 shards · 2 · 1 · 2 (twins) · 3 — never
more than 5 live enemies (the split case, same as today's split bosses).

Stage rewards are the replaced slot's (§3.4); e.g. at cycle 1 slot 110 pays what stage 110
pays today (473 win / 122 loss) and slot 200 pays 3,544 / 810.

---

## 6. Interactions

### 6.1 Skills (all ten, L10 numbers from `skills-feature.md` §4)

| skill              | Ember Nova (burn)                                                                                 | Frost Lock                                                                                                         | Frostbite                                   |
|--------------------|---------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| **Hazard Ward**    | burn ×(1 − `lava`) = **−40 %** (kind `'burn'` joins `'lava'` in `applyHpLoss`); popup tinted cyan | cold touch keeps `10 % + 90 % × shockKeep` = **19 %** speed (same rule as a shock wall); **no** effect on the lock | none (a contact effect, not a hazard)       |
| **Guard Shell**    | absorbs burn first (as every HP loss)                                                             | no effect on touch or lock                                                                                         | no effect                                   |
| **Second Wind**    | can trigger on a burn (not on a lethal one)                                                       | —                                                                                                                  | —                                           |
| **Phase Step**     | none (hazard, like thunder)                                                                       | a **phased** victim ignores the touch *and* the lock; a proc on the Warden's ram prevents both                     | a phased victim gets **no stack**           |
| **Mirror Plate**   | none                                                                                              | normal on the ram's damage; lock still applies                                                                     | normal                                      |
| **Static Charge**  | a stunned carrier skips its launch → fewer combat seconds → fewer novas                           | may stun the Warden that rams you; you are still frozen; both expire (§4.2)                                        | a stunned Yeti skips its ram (fewer stacks) |
| **Opening Salvo**  | lands at meteor end, before the first nova                                                        | normal                                                                                                             | normal                                      |
| **Homing Rockets** | normal; rocket damage never triggers traits                                                       | rocket hits are not contacts (no touch/lock)                                                                       | not contacts (no stack)                     |
| **Momentum**       | normal                                                                                            | the cold touch ends the chain (stacks can't build off the Warden)                                                  | slower launch → fewer rebounds              |
| **Lucky Edge**     | normal                                                                                            | normal — one-shot value rises here                                                                                 | normal                                      |

Hard rules: traits never read or write skill state except the three documented reads
(Hazard Ward multipliers, Phase Step `phasedUntil`, Static Charge's turn skip); trait damage
(kind `'burn'`) never triggers Lucky Edge, Momentum, Mirror Plate, Phase Step, the rocket
counter or Static Charge — the skills spec's no-recursion list gains `'burn'`.

### 6.2 Arenas

| arena          | Ember Nova                                                                                | Frost Lock                                                | Frostbite                                                                                                                        |
|----------------|-------------------------------------------------------------------------------------------|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| boss / default | as specified                                                                              | as specified                                              | as specified                                                                                                                     |
| **lava** (180) | lava bounce 2.5 % + novas 3 %: both kind lava/burn → Hazard Ward cuts both                | drained blades don't reach the wall (less lava)           | slower blades bounce less                                                                                                        |
| **ice** (190)  | —                                                                                         | frozen blades slide further when pushed (decay unchanged) | ice's low friction partly cancels the slow — deliberate: the Blizzard Twins are an ice fight where chill *feels* like mud on ice |
| shock          | not used in the table; if combined, the Warden's touch and the wall share the 250 ms gate | same                                                      | —                                                                                                                                |
| forest         | heals +1 per bounce as usual                                                              | —                                                         | —                                                                                                                                |
| bouncers       | no interaction                                                                            | bouncer hits are not boss contacts                        | —                                                                                                                                |

### 6.3 Existing boss abilities and systems

| system                             | rule                                                                                                                                                          |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ghost                              | twins inherit the trait; Twin Pyres: 2 carriers, still one nova hit per victim; Blizzard Twins: 2 chill sources (each contact stacks, 250 ms gate per victim) |
| split                              | children drop the trait; Shattering Glacier children get `shardTrait` = chill (1 stack per touch, same rules)                                                 |
| partners / healers                 | carriers keep their group; allies immune; healers heal as usual                                                                                               |
| stat-switch                        | orthogonal; the Magma Titan burns in both phases                                                                                                              |
| life-leech, thunder, child-emitter | not combined in the table; if a daily/league roster ever mixes them, rules stack independently                                                                |
| teleporter skin                    | normal                                                                                                                                                        |
| powerups                           | speed crate multiplies after chill (`speed × buff × (1 − 0.1·stacks)`)                                                                                        |
| anti-draw                          | unchanged; burn is not a collision                                                                                                                            |
| rubber band / difficulty           | boss HP only; trait magnitudes unchanged                                                                                                                      |
| first-game boost                   | n/a (stage 1 only)                                                                                                                                            |
| `computeStateHash`                 | adds the launch lock (`stunnedForTurn`, `stunImmuneTurn`, `lockKind`), chill stack count + earliest expiry, `bossClockMs` (§9)                                |

---

## 7. Presentation

### 7.1 The three bosses — look and art sheets

House style is the skin style (`skins-new-designs.md`): top-down Beyblade top, bold ink
contour, cel shading, hex medallion → inner rings → themed rim, even-fold symmetry (the slicer
centres on the bounding box). Themes checked against the "ruled out" list there (fire, ice,
boulder/rock, snake are taken — hence a brazier, a frozen vault and a yeti).

| boss                   | parts (class)       | skin id / name                | subject (the `concepts.mjs` sentence)                                                                                                                                                                                                        | colour                                                                                   | medallion                          |
|------------------------|---------------------|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|------------------------------------|
| **The Cinder Tyrant**  | Round Guard / Tanky | `cinder` · "Cinder"           | a round iron **brazier** spinning top: a smooth closed rim of black cast iron with FOUR riveted grate bars crossing a bed of glowing coals, thin molten cracks between the coals (nothing sticks out of the circle — Round Guard silhouette) | cast iron #221e27→#3b3640, coal glow #ff6a1a with #ffd27a cores, ash grey rim highlights | a single flame inside a ring       |
| **The Glacier Warden** | Quad Core / Speedy  | `frost-vault` · "Frost Vault" | a four-lobed **vault door frozen over**: a square steel vault face with FOUR rounded frost-crusted lobes, heavy bolts at the four corners iced in, a spoked vault wheel as the inner ring                                                    | steel blue-grey #4a5a6e, frost white #f2fbff, glacier cyan #7fd4ff, deep ice #2a7fc9     | a padlock with a snowflake keyhole |
| **The Frostbite Yeti** | Spiky / Tanky       | `yeti` · "Yeti"               | a **yeti fur** spinning top: a round body ringed ALL the way round by shaggy white fur tufts tipped with icicle spikes pointing straight out, a band of blue-grey hide as the inner ring                                                     | snow white #ffffff / #dfe9f2 fur, icicle #9fe7e0 → #4aa3d8, hide #3b4b63                 | a yeti face with two short tusks   |

- **Pipeline:** add the three entries to `art/skins/concepts.mjs` (classes `round`,
  `quadratic`, `triangle`; `tpl` e.g. `{ kind: 'disc', lobes: 4 }` / `{ kind: 'quad', lobes: 4 }`
  / `{ kind: 'burr', spikes: 16 }` — pick the kinds the class already uses), run
  `node art/skins/build-refs.mjs`, `node art/skins/build-prompts.mjs`, paint with the **free**
  prompt + 2–3 finish refs of the same class (README "Re-paint one skin"), slice
  (`tools/art-desk/slice.mjs --size 600x600 --png --pad 0`), fit
  (`node art/skins/fit-skins.mjs --out-dir public/images/models`) → `cinder_256x256.webp`,
  `frost-vault_256x256.webp`, `yeti_256x256.webp`. `pnpm art:desk` finds the sheets by id.
- **Catalog:** append the ids to `SPINNER_MODEL_IDS` and to the class lists in
  `SKINS_PER_TOP` (append-only, `tests/skinCatalog.newSkins.test.ts` guards it), add them to a
  new `TROPHY_SKINS` set excluded wherever `SPECIAL_SKINS` / ad-only skins are filtered from
  offers (`offerableSkins`-style helpers in `skinCatalog.ts`, roulette segment builder, chest,
  daily, battle pass), and name them under `skins.*` in every locale.
- **Boss badge / portrait:** `BossPeekBadge` already shows the boss's skin inside the painted
  elite frame (`boss-frame_384x369.webp`) — no new frame art. The Magma Titan reuses `boulder`.
- **Boss scale:** bosses already render at 1.6× radius with slower spin; no new renderer work.

### 7.2 Boss intro and the "next boss" teaser

- **BossPeekBadge trait chip.** When `getBossPeek` names a new-encounter stage, the badge gets
  a 20 px trait glyph row under the portrait (flame ring / ice block / snowflake — inline SVG
  paths in the shared 24×24 glyph style of the `game-ui-icon-set` skill), `aria-label`
  = the trait name. Players learn what is coming 1–2 stages ahead. (Skills plan G12 adds a
  skill glyph on the same badge for 10–55; both chips use one slot component.)
- **Boss intro card** (`BossIntroCard.vue`, new, DOM): on a new-encounter stage it plays
  **inside the existing 1,600 ms meteor intro** (no added time): the boss name (the stage
  name, reddish display letters like `BossDefeatedBanner`, `fitFontPx` per locale) above the
  trait glyph(s); 250 ms in, 900 ms hold, 350 ms out; transform/opacity only; `FX.low` and
  `prefers-reduced-motion` → static fade. No input, no timer of its own beyond the meteor
  intro, pauses with it (`createPausableTimer`).
- **StageBadge**: unchanged (`💀N` + "Boss Stage").

### 7.3 In-battle feedback — VFX, SFX, HUD

Rules from `PERF-LEDGER.md` and project memory: raster-bound game, no `shadowBlur`, no
per-frame gradients or `ctx.filter`, capped pools, zero per-frame allocation, time from the
physics tick so a pause freezes effects.

| effect               | high tier                                                                                                                                             | `FX.low` / Firefox                | pool / cap              | SFX                                                               |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------|-------------------------|-------------------------------------------------------------------|
| carrier aura (all 3) | 1 `drawImage` of a cached aura sprite (existing `auraSprite()` cache: ember orange / frost cyan / chill white-blue)                                   | none                              | 1 per carrier (≤ 3)     | —                                                                 |
| **Ember charge**     | 1 stroked arc on the boss rim, sweep = combat-clock fraction, 3 px (5 px in the last 300 ms)                                                          | same                              | 1 per carrier           | —                                                                 |
| **Ember nova**       | 2 strokes (outer ring + faint inner) expanding from boss radius to reach over 350 ms, alpha fade                                                      | 1 stroke                          | 3-slot ring pool        | `boss-ember-pulse` once per nova tick                             |
| burn on victim       | existing painted flame-burn strip `triggerBurn(borderFx, victim, burnCap(), !FX.low)` + orange damage number                                          | burnCap 2, no rekindle            | existing burn pool      | — (the nova sound covers it)                                      |
| **Frost touch**      | 6 ice-shard particles from the existing particle pool                                                                                                 | none                              | shared pool (60)        | existing clash sound                                              |
| **Frozen**           | cached ice-shell sprite (pre-rendered once per radius to an offscreen canvas) drawn over the blade at 0.85 α; shatter = 6 shards when the turn passes | 1 stroked hexagon (2 px, #bfe9ff) | ≤ 2 (player blades)     | `boss-freeze` on lock; `boss-freeze` at 0.4 volume on a crack-off |
| **Chill**            | 1 stroked frost rim at `radius + 2`, width 1.5 + stacks px, #aee6ff 0.85 α                                                                            | same                              | ≤ 2                     | `boss-chill` per new stack, throttled 400 ms                      |
| chill popup          | snowflake glyph via the damage-number pool (skills §8.2 `glyph` field, Path2D built once)                                                             | glyph only                        | damage-number pool (60) | —                                                                 |

- **Worst frame** (Elemental Court): 3 aura sprites + 1 charge arc + 1 nova (2 strokes) + 2
  ice shells + 2 frost rims + ≤ 4 burn strips + ≤ 12 transient shards ≈ **16 primitives** plus
  transients — against the hundreds the arena draws. Everything else is event-driven.
- **Zero per-frame allocation:** ring pool and shell sprites preallocated in `initGame` when
  the roster has a trait (and only then — non-trait stages pay nothing); chill stacks are a
  fixed `Float64Array(5)` per affected blade; the nova's victim dedupe is a reused bitmask over
  player blade indices (≤ 2 bits), not a `Set`.
- **3 new SFX** (`boss-ember-pulse`, `boss-freeze`, `boss-chill`, ≤ 12 KB `.ogg`, synthesised
  like the rest of the SFX set) join the **deferred** tier of `useAssets.ts`, requested when
  `currentStageId ≥ 101` or a Boss Lab stage loads; they share the `MAX_ACTIVE_VFX` concurrency
  counter; each at most once per 400 ms.

**HUD (bottom-corner stat cards, `SpinnerArena.vue`).**

| state                                               | card                                                                                                                                                                                           | canvas      | a11y                                                                 |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|----------------------------------------------------------------------|
| Frozen (from the freeze until its locked turn ends) | card tinted ice-blue with an ice-block glyph over the portrait corner; the spinner can't be picked — a tap on it shakes the blade 150 ms, plays the crack SFX and keeps the other one selected | ice shell   | `aria-label` = `bosses.frozenAria` "Frozen — sits out its next turn" |
| Chilled                                             | 1–5 snowflake pips under the SPD row; SPD shows the effective value in ice-blue                                                                                                                | frost rim   | `bosses.chillAria` "Chilled: speed −{pct}%"                          |
| Burning                                             | nothing persistent (burn is instant); the orange number + flame strip read on the canvas                                                                                                       | flame strip | —                                                                    |

State reaches the DOM through the skills plan's `skillHud`-style `shallowRef` (mutated only on
trait events, `triggerRef` ≤ 10/s) — no per-frame DOM writes, no reactivity in the physics
hot path. `bladeStats` keeps reading `statsFor`, which already includes chill.

---

## 8. Balance

### 8.1 Method

- **Simulator:** `tools/skills-sim/bosses100.mjs` — the skills balance sim (`engine.mjs`, a
  1:1 headless port of the battle loop, `skills-feature.md` §3.2) patched at load time with
  the three traits exactly as §4 specifies (Appendix A). Traits draw no RNG, so the old-slot
  fights reproduce the unpatched engine.
- **Player:** the default team (Star/Balanced + Round/Balanced) at the **economic part level**
  of the skills spec (`econLevel`: half of the typical income into the team's parts) — 30 at
  stage 110 rising to 40 at 200 — with the sim's "typical player" policy (auto-selected or
  nearest blade, lowest-HP/nearest target, ±8° aim, no bank shots, **no awareness of the
  traits**: it neither leaves the nova ring nor rotates away from chill).
- **Loadouts (both spinners, L10 — a stage-101+ player owns all ten, skills §6.3):** `none`;
  the **counter** pair a player would pick for that boss (ember: Hazard Ward + Guard Shell;
  frost: Phase Step + Static Charge; chill: Phase Step + Second Wind; mixed rosters: Guard
  Shell + Second Wind); and **Guard Shell + Second Wind**, the strongest general pair.
- **Read-outs per encounter:** first-try **win rate** at full boss HP and at the rubber-band
  floor (×0.5 HP, reached after 10 straight losses); **turns** per battle (fight length —
  every launch and every skipped turn counts); **TTK/TTD** (turns to kill the boss with the
  player immortal ÷ turns to lose with the boss immortal — the fight-strength ratio of skills
  §3.1; < 1 favours the player); burn share of damage taken, freezes, chill stacks on the
  launched spinner.
- N = 400 battles per cell (grids: 200–300), common random numbers, alternating first turn.
- Measured 2026-09-30 against the working-tree `engine.mjs` / `skills.mjs` (skills WP10 — the
  sim reading `skillCatalog.ts` — in progress). Re-run Appendix A once the skills ship (BW9).

### 8.2 The ground: stage 101–200 bosses today (cycle copies)

Default team at the economic level, full HP / rubber-band floor (×0.5 HP):

| slot | boss (cycle copy)                   | win none | win GS+SW | win GS+SW @×0.5 HP | turns |
|------|-------------------------------------|----------|-----------|--------------------|-------|
| 105  | Cyclone Warlord II · plain          | 94 %     | 98 %      | 100 %              | 1.7   |
| 110  | Bear Mother II · split              | 87 %     | 95 %      | 100 %              | 13.6  |
| 115  | Phantom Twin II · ghost             | 72 %     | 88 %      | 98 %               | 2.4   |
| 120  | Iron Brotherhood II · partners      | 0 %      | 1 %       | 69 %               | 40.7  |
| 125  | Mending Choir II · healers          | 0 %      | 2 %       | 59 %               | 25.8  |
| 130  | Chaos Incarnate II · life-leech     | 14 %     | 32 %      | 69 %               | 4.4   |
| 135  | Ravenous Swarm II · split           | 0 %      | 0 %       | 47 %               | 9.5   |
| 140  | Dragon Specter II · ghost           | 0 %      | 0 %       | 4 %                | 5.8   |
| 145  | Unbroken Trio II · partners         | 0 %      | 0 %       | 6 %                | 11.5  |
| 150  | Eternal Grove II · healers ×4       | 0 %      | 0 %       | 7 %                | 31.7  |
| 155  | Dread Scorpion II · child-emitter   | 0 %      | 0 %       | 4 %                | 23.9  |
| 160  | Swarm Hive II · split               | 0 %      | 0 %       | 9 %                | 10.1  |
| 165  | Dragon Eclipse II · ghost           | 0 %      | 1 %       | 20 %               | 2.0   |
| 170  | Quartet of Fate II · partners ×4    | 0 %      | 0 %       | 1 %                | 18.2  |
| 175  | Hallowed Circle II · healers ×4     | 0 %      | 0 %       | 0 %                | 32.4  |
| 180  | Molten Titan II · stat-switch       | 0 %      | 0 %       | 0 %                | 8.4   |
| 185  | Riftborn II · child-emitter         | 0 %      | 0 %       | 0 %                | 18.2  |
| 190  | Dragon Sovereign II · ghost         | 11 %     | 14 %      | 44 %               | 1.6   |
| 195  | Final Guard II · partners + thunder | 0 %      | 0 %       | 0 %                | 25.4  |
| 200  | Everlasting Choir II · healers ×4   | 0 %      | 0 %       | 0 %                | 27.6  |

Reading: cycle 1 adds +22 levels to every enemy while the economic part level only climbs
30 → 40 (the quadratic upgrade cost past L10), so from ~stage 135 the cycle-copy bosses are
**walls** for the typical player — even at the rubber-band floor. Players who get there
over-level or out-play the policy. That is why the new encounters are *not* tuned to match
the slots they replace (decision D5): they are tuned to a ladder of their own, and the kept
x5 bosses remain the walls between them.

### 8.3 Targets

| group  | slots         | first-try win, fitting L10 pair      | win, no skills | fight length |
|--------|---------------|--------------------------------------|----------------|--------------|
| debut  | 110, 120, 130 | 45–60 %                              | ≥ 15 %         | 8–25 turns   |
| combo  | 140–190       | 25–45 %                              | ≥ 5 %          | 8–30 turns   |
| finale | 200           | 10–20 % (≥ 40 % at the rubber floor) | —              | ≤ 35 turns   |

Plus: the counter pair must beat `none` clearly (the loadout choice matters) and the trait
must be *felt* — ≥ 10 % of damage taken from novas on ember fights, ≥ 1.5 freezes per frost
fight, ≥ 1.5 chill stacks on the average launch in chill fights.

### 8.4 Result — the shipped tuning (N = 400 per cell)

First-try win rate at full boss HP; "@×0.5" = at the rubber-band floor; turns and trait
read-outs with the counter pair.

| slot | encounter          | counter pair               | win **counter** | win GS+SW | win none | win counter @×0.5 | turns | TTK/TTD (counter) | trait felt                                                |
|------|--------------------|----------------------------|-----------------|-----------|----------|-------------------|-------|-------------------|-----------------------------------------------------------|
| 110  | Cinder Tyrant      | Hazard Ward + Guard Shell  | **50 %**        | 56 %      | 21 %     | 99 %              | 19.2  | 0.68              | burn = 13 % of damage taken (19 % without Ward), 19 novas |
| 120  | Glacier Warden     | Phase Step + Static Charge | **56 %**        | 56 %      | 25 %     | 97 %              | 15.0  | 0.65              | 2.6 freezes (3.3 without Phase Step), 0 lost turns        |
| 130  | Frostbite Yeti     | Phase Step + Second Wind   | **59 %**        | 61 %      | 28 %     | 98 %              | 11.3  | 0.67              | 3.3 chill stacks on the launched spinner (−33 %)          |
| 140  | Twin Pyres         | Hazard Ward + Guard Shell  | **29 %**        | 41 %      | 12 %     | 94 %              | 11.9  | 0.72              | burn 10 % (15 % without Ward), 24 novas                   |
| 150  | Blizzard Choir     | Phase Step + Second Wind   | **39 %**        | 44 %      | 12 %     | 97 %              | 23.1  | 0.64              | 1.9 stacks                                                |
| 160  | Shattering Glacier | Phase Step + Static Charge | **35 %**        | 39 %      | 14 %     | 93 %              | 16.4  | 0.85              | 2.5 freezes; shards 0.1 stacks                            |
| 170  | Frostfire Pact     | Guard Shell + Second Wind  | **35 %**        | 35 %      | 11 %     | 97 %              | 23.3  | 0.51              | burn 19 %, 1.9 freezes                                    |
| 180  | Magma Titan        | Hazard Ward + Guard Shell  | **34 %**        | 30 %      | 6 %      | 65 %              | 7.8   | 1.31              | burn 4 % (+ lava); the stat-switch ram dominates          |
| 190  | Blizzard Twins     | Phase Step + Second Wind   | **32 %**        | 36 %      | 12 %     | 97 %              | 10.2  | 0.78              | 3.7 stacks (−37 %)                                        |
| 200  | Elemental Court    | Guard Shell + Second Wind  | **17 %**        | 17 %      | 3 %      | 95 %              | 22.1  | 0.62              | burn 11 %, 1.4 freezes, 2.1 stacks                        |

Against the targets (§8.3): debut 50–61 % ✓ · combos 29–44 % ✓ · finale 17 % (95 % at the
floor) ✓ · every fight 8–24 turns ✓ · no-skill win ≥ 15 % on debuts / ≥ 5 % on combos ✓ ·
trait felt ✓ except the **Magma Titan's burn share (4–6 %)**, where the stat-switch ram
decides the fight; the nova there is area denial around a boss you must hug in its defence
phase, and the lava arena adds the fire (accepted). The ladder is monotone: debut ~55 % → combos
~35 % → finale ~17 %. From 120 on every encounter is **easier than the cycle copy it replaces**
(compare §8.2); at 110 the Bear Mother II copy was a near-free win (95 %), so the Cinder Tyrant
is the cycle's first real boss. None is a free win without skills.

**Skill power stays under the skills cap on the new bosses.** PI = OFF × DEF (skills §3.1)
of the pair against `none`, same seeds:

| slot                      | 110  | 120  | 130  | 140  | 150  | 160  | 170  | 180  | 190  | 200  |
|---------------------------|------|------|------|------|------|------|------|------|------|------|
| counter pair              | 1.27 | 1.30 | 1.29 | 1.24 | 1.28 | 1.30 | 1.29 | 1.29 | 1.33 | 1.31 |
| Guard Shell + Second Wind | 1.32 | 1.31 | 1.30 | 1.31 | 1.31 | 1.28 | 1.29 | 1.28 | 1.36 | 1.31 |

All ≤ 1.36 (cap 1.50). The counters are *competitive, not mandatory*: Hazard Ward visibly
cuts the burn share (19 % → 13 % at 110) and Phase Step + Static Charge remove a fifth of the
freezes, but the
sustain pair is as good overall — so no boss forces one loadout, while a player who reads the
boss is never punished for bringing its counter.

### 8.5 How the tuning got here

| pass            | change                                                                                                                                                                                                                                          | why (measured)                                                                                                                                                                                                                                                                               |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1 (N = 50–200) | first bodies by feel: Cinder Round/Tanky 30/30, Warden Quad Core/Balanced 30/30, Yeti Spiky/Speedy 32/32, Shattering Glacier Quad Core/Tanky 40/40, Frostfire Pact 3 partners at 38, Court 3 × 46; Frost Lock allowed to skip a whole turn      | Cinder 0 % (no skills) / 3 % (GS+SW); **Warden: 13.6 freezes and 9.4 lost turns per battle, 48-turn fights**; Yeti ~75 % (no skills) in **under 4 turns** — a glass boss dies before any chill matters; Shattering Glacier 48–77 turns; Pact and Court 0 % at every level offset down to −12 |
| v2              | Frost Lock **never costs a whole turn** (rule 2 + thaw at turn start); Warden family on **Speedy** bottoms (a rammer that hits and gets hit); Yeti family on **Tanky** bottoms (lives long enough for stacks to build); Pact 3 → **2** partners | Warden fights 48 → 15 turns, lost turns 9.4 → 0; Yeti fights < 4 → 11 turns with 3.3 stacks on the launched spinner                                                                                                                                                                          |
| v3 (shipped)    | level grid −8 … +8 around the v2 bodies (`--shift`), per encounter the level closest to §8.3                                                                                                                                                    | table §8.4                                                                                                                                                                                                                                                                                   |

### 8.6 Sensitivity (counter pair, first-try win at full HP; shipped value in bold)

| knob          | values                                              | 110              | 120              | 130         | 140              | 150         | 160              | 170              | 180              | 190         | 200              |
|---------------|-----------------------------------------------------|------------------|------------------|-------------|------------------|-------------|------------------|------------------|------------------|-------------|------------------|
| `EMBER_PCT`   | 2 % / **3 %** / 4 %                                 | 56 / **50** / 46 |                  |             | 36 / **29** / 26 |             |                  | 43 / **35** / 28 | 37 / **34** / 29 |             | 22 / **17** / 14 |
| `CHILL_TURNS` | 1 / **2**                                           |                  |                  | 64 / **59** |                  | 49 / **39** |                  |                  |                  | 42 / **32** | 22 / **17**      |
| Frost Lock    | off / **on, never a lost turn** / on, skips allowed |                  | 63 / **56** / 35 |             |                  |             | 41 / **35** / 23 | 37 / **35** / 35 |                  |             | 16 / **17** / 16 |

- Burn share at 110 moves 9 % → 13 % → 16 % across the `EMBER_PCT` row; Frostbite at one turn
  leaves 2.2 instead of 3.3 stacks on the launched spinner (130).
- **Allowing skipped turns costs 2.9 (120) and 3.1 (160) whole turns per battle** and 21 / 12
  points of win rate — the evidence behind decision D3. With the shipped rule the lock is worth
  ~6–7 points at 120/160: felt, not dominant.
- Each knob moves win rate by ≤ 10 points per step: the tuning table (`BOSS_TRAIT_TUNING`) can
  be hot-fixed after launch without a logic change, like `SKILL_POWER_SCALE`.

### 8.7 Robustness — other players

**Enemy-matched ("lockstep") part level** (the mean enemy level of the neighbouring regular
stages; 25 at 110 → 47 at 200, i.e. *below* the economic level early in the cycle and
*above* it late), counter pair:

| 110  | 120  | 130  | 140  | 150  | 160  | 170  | 180  | 190  | 200  |
|------|------|------|------|------|------|------|------|------|------|
| 11 % | 22 % | 55 % | 43 % | 57 % | 64 % | 79 % | 66 % | 91 % | 59 % |

A player who keeps pace with the enemy levels finds 110/120 harder (he is 5 levels below the
economic player there) and the second half easier — the new ladder does not punish players who
out-level the curve.

**Other team builds** (Guard Shell + Second Wind, economic level, N = 150–200), new
encounter vs the cycle copy of the same slot:

| build                                     | 110       | 120  | 130    | 140       | 150    | 160    | 170       | 180       | 190    | 200       |
|-------------------------------------------|-----------|------|--------|-----------|--------|--------|-----------|-----------|--------|-----------|
| glass (Star/Speedy + Piercer/Speedy) new  | 7 %       | 6 %  | 24 %   | 8 %       | 7 %    | 4 %    | 1 %       | 1 %       | 8 %    | 2 %       |
| glass — old slot                          | 37 %      | 0 %  | 7 %    | 0 %       | 0 %    | 0 %    | 0 %       | 0 %       | 3 %    | 0 %       |
| tank (Soft Shell/Tanky + Round/Tanky) new | **9 %**   | 94 % | 7 %    | 35 %      | 5 %    | 81 %   | **6 %**   | 65 %      | 1 %    | 0 %       |
| tank — old slot                           | 99 %      | 7 %  | 14 %   | 0 %       | 0 %    | 0 %    | 0 %       | 0 %       | 27 %   | 0 %       |
| tank: burn share / turns (new)            | 48 % / 54 | —    | — / 28 | 44 % / 35 | — / 57 | — / 44 | 48 % / 67 | 15 % / 16 | — / 22 | 24 % / 45 |

- Glass teams are weak against everything in cycle 1 at this level; the new encounters are
  no worse for them (better on 9 of 10 slots) except the Cinder Tyrant.
- **Tanks are the Cinder's prey, by design, and it is the sharpest edge in this spec:** a tank
  hugs the boss, its fights run long, and the combat clock turns long fights into many novas —
  burn becomes ~half of all damage and slot 110 drops from 99 % (Bear Mother II) to 9 %. The
  Warden family is the tank's easy prey in return (94 % / 81 %). The answer inside the game is
  the one the loadout system exists for: bring Hazard Ward (tank + counter pair at 110: 17 %,
  burn 35 %) or switch to a harder-hitting top for this boss. Watch "attempts per boss" at 110 by
  team composition after launch; the knob is `EMBER_PCT` (§8.6) — a per-build rule is not
  proposed (it would be invisible to the player). Listed as a risk (§14).

---

## 9. Determinism and league gatekeepers

**The traits draw no random numbers at all.** Every decision is a pure function of state the
loop already makes deterministic once the skills/league determinism work lands:

| input               | source                                                                                                     | deterministic because                                       |
|---------------------|------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| nova timing         | `bossClockMs` (+`FIXED_STEP_MS` per substep in launched phases)                                            | tick-counted, never `performance.now()`; identical at 1×/2× |
| nova targets        | positions at the tick, carriers and victims iterated in **`syncKey` order** (skills WP0 `bladesBySyncKey`) | order-independent result (one hit per victim per tick)      |
| frost touch gate    | `lastShockMs` on **game time** (skills WP0 moves it off `performance.now()`)                               | PvP/league clock                                            |
| lock / chill expiry | team turn indices (`playerTurnIndex`, `npcTurnIndex`)                                                      | turn-counted                                                |
| chill gate          | `lastChillAt` on game time                                                                                 | as above                                                    |

- **No `Math.random`, no `matchRng()` draw** is added → turning the feature on cannot shift the
  shared match stream (powerups, turn order, AI), and the old-slot results in §8 reproduce
  bit-for-bit with the patched sim.
- **State hash:** `computeStateHash` adds per blade `lockKind` and `stunImmuneTurn` (skills §9.1
  already adds `shield` / `stunnedForTurn`), the chill stack count and its earliest expiry, and
  once per hash the `bossClockMs` — so a desync in any trait shows up in the existing turn-hash
  check.
- **League requirement (LG0/LG6):** the league plan asks for an optional `seed` in `initGame`
  (skills plan "Requests from the league plan"). For a league battle to replay from its seed,
  `gameTime()` must also be tick-based in league mode (today only PvP is) — that is a league
  work item, not a boss one; the traits need nothing beyond it.

**Gatekeepers (league LD1-A: a boss at every tier promotion, LG7).** This spec exports

```ts
// src/data/bossEncounters.ts
export const buildBossEncounterStage = (
  id: BossEncounterId,                     // 'cinder_tyrant' | … | 'elemental_court'
  level: (cfg: StageBladeConfig) => { topLevel: number; bottomLevel: number }
): Stage
```

so LG7 can field any encounter at a level derived from the challenger's team power (the same
idea as `buildCheatBossStage`). Recommended mapping (open decision D6): the three debut bosses
guard the upper promotions — **Gold → Platinum: Cinder Tyrant, Platinum → Diamond: Glacier
Warden, Diamond → Champion: Elemental Court**; the lower promotions keep classic bosses (Bear
Mother, Phantom Twin, Iron Brotherhood). Gatekeeper fights use `mode: 'ghost'`-style flags
(no rubber band, no roulette, no trophy — LG7 owns their rewards).

---

## 10. i18n — new strings

English first (`src/i18n/locales/en.ts`), then the same keys in **all 39 locale files** the
project ships (`ar az bg ca cs da de el en eo es fi fr gl hi hr hu id it jp kk kr lt lv nb nl
pl pt-BR pt-PT ro ru sv th tr uk uz vi zh zh-TW`), translated per
`src/i18n/TRANSLATION-GUIDE.md`. Interpolation only via `{param}`; no `|` or `@`; global `t()`
(never `<i18n-t scope="local">`, see the project's scope trap). Canvas shows no text.

**20 new keys**

| key                              | English                         | used by                                         |
|----------------------------------|---------------------------------|-------------------------------------------------|
| `stages.boss_cinder_tyrant`      | The Cinder Tyrant               | stage name (StageBadge, peek, intro card, lab)  |
| `stages.boss_glacier_warden`     | The Glacier Warden              | ″                                               |
| `stages.boss_frostbite_yeti`     | The Frostbite Yeti              | ″                                               |
| `stages.boss_twin_pyres`         | The Twin Pyres                  | ″                                               |
| `stages.boss_blizzard_choir`     | The Blizzard Choir              | ″                                               |
| `stages.boss_shattering_glacier` | The Shattering Glacier          | ″                                               |
| `stages.boss_frostfire_pact`     | The Frostfire Pact              | ″                                               |
| `stages.boss_magma_titan`        | The Magma Titan                 | ″                                               |
| `stages.boss_blizzard_twins`     | The Blizzard Twins              | ″                                               |
| `stages.boss_elemental_court`    | The Elemental Court             | ″                                               |
| `skins.cinder`                   | Cinder                          | skin name everywhere skins are named            |
| `skins.frost-vault`              | Frost Vault                     | ″                                               |
| `skins.yeti`                     | Yeti                            | ″                                               |
| `bosses.traits.ember`            | Ember Nova                      | trait chip `aria-label`, intro card glyph label |
| `bosses.traits.frost`            | Frost Lock                      | ″                                               |
| `bosses.traits.chill`            | Frostbite                       | ″                                               |
| `bosses.frozenAria`              | Frozen — sits out its next turn | stat card `aria-label`                          |
| `bosses.chillAria`               | Chilled: speed −{pct}%          | stat card `aria-label` (`pct` = 10 × stacks)    |
| `bosses.trophyTitle`             | Boss trophy                     | trophy `FReward` ribbon                         |
| `bosses.trophyUnlocked`          | {name} unlocked!                | trophy card line (`name` = `t('skins.<id>')`)   |

Reused: `bossStage`, `bossDefeated`, `bossPeek.*`, `spinner.rewards`, `tapToContinue` /
`clickToContinue`. Boss-name keys are new (not `stage_N`) because slot 110 must not read
"The Bear Mother II" any more; `Stage.name` holds the key as today. A parity test (pattern of
`tests/i18nAdKeys.test.ts` / the skills i18n parity test) asserts all 20 keys are non-empty in
all 39 locales and every `{param}` of English exists in each translation. Layout checks: the
longest names (de/ru/vi) through the existing locale-fit audit on BossPeekBadge, the intro
card and the stat card (`tools/locale-fit`).

---

## 11. Cheat: the Boss Lab

Brief: *"add a cheat that opens a secret modal (has all the new bosses for testing as a quick
clickable shortcut, so I can test them all after another)."*

- **Open:** `ctrl+shift+9` (free in `useCheats.ts`'s map; digits are matched by `e.code`, so
  it works on every keyboard layout). Only when cheats are on (`localStorage.cheat = true`,
  the existing gate — `useCheats()` returns `{}` otherwise). Also `?bosslab` on a dev build
  opens it once on load (touch devices have no keyboard).
- **`BossLabModal.vue`** (an `FModal`, loaded with `defineAsyncComponent` so it never enters
  the production entry chunk):
    - 10 encounter tiles in stage order — skin thumbnail, `stages.<nameKey>`, slot number, trait
      glyphs; the last-played tile is outlined and the next one pre-focused;
    - 3 **trait sandboxes** — one lone carrier of each trait (`ember` / `frost` / `chill`) on a
      Quad Core body, for isolating a single mechanic;
    - a **level** switch: *as in the campaign* (authored cycle-1 levels) or *matched to my team*
      (`buildCheatBossStage`'s peak-level rule), and an **arena** select (as authored / boss /
      lava / ice / shock);
    - a **knob** row (dev only, not persisted): nova period, nova %, chill per stack, chill
      turns, frost lock on/off — writes the runtime `BOSS_TRAIT_TUNING` object for fast feel
      tests.
- **Flow:** a tile click → `loadCheatStage(buildBossEncounterStage(...))` (id −1, never
  persists or advances), close. After that battle's result screen closes, the Boss Lab
  re-opens with the **next** encounter focused, so all ten can be played back-to-back with
  one click each. `Esc` / close leaves it; `ctrl+shift+alt+c` (existing) clears the cheat stage.
- Dev-only copy (tile captions like "sandbox", knob labels) is exempt from i18n per the
  project rule; boss names come from `stages.*`, so the lab also previews every locale.
- Cheat stages skip the trophy grant (mode `'cheat'` like the roulette cheat).

---

## 12. Implementation

### 12.1 Data model

```ts
// src/types/spinner.ts — additions
export type BossTrait = 'ember' | 'frost' | 'chill'
// SpinnerConfig gains:
//   bossTrait?: BossTrait      // trait carrier (NPC bosses only)
//   shardTrait?: BossTrait     // trait given to this boss's split children (Shattering Glacier)
// SpinnerState gains:
//   chillExp?: Float64Array    // length 5, expiry team-turn per stack (NaN = empty); allocated only for victims
//   chillN?: number            // live stack count (read by statsFor)
//   lastChillAt?: number       // game time of the last stack (250 ms gate)
//   lockKind?: 'stun' | 'frost'
// Frost Lock REUSES the skills' launch lock (skills §4.10 / §10.1):
//   stunnedForTurn / stunImmuneTurn = "this blade may not launch on its OWN team's turn N".
//   The skills plan already makes the lock work for both sides (plan G2); lockKind lets the
//   never-lose-a-turn rule (§4.2) thaw frost locks without touching Static Charge stuns.

// src/data/bossEncounters.ts — pure data, no Vue (unit-testable like skinCatalog.ts)
export const BOSS_LAYOUT_PERIOD = 200
export type BossEncounterId =
  | 'cinder_tyrant' | 'glacier_warden' | 'frostbite_yeti' | 'twin_pyres' | 'blizzard_choir'
  | 'shattering_glacier' | 'frostfire_pact' | 'magma_titan' | 'blizzard_twins' | 'elemental_court'
export interface BossEncounter {
  id: BossEncounterId
  slot: 110 | 120 | 130 | 140 | 150 | 160 | 170 | 180 | 190 | 200
  nameKey: `boss_${BossEncounterId}`        // under `stages.`
  arenaType: ArenaType
  bouncers?: number
  enemyTeam: StageBladeConfig[]             // cycle-1 levels, bossTrait set on carriers
  trophySkins: SpinnerModelId[]
}
export const BOSS_ENCOUNTERS: readonly BossEncounter[]
export const encounterForSlot = (slot200: number): BossEncounter | null
export const buildBossEncounterStage = (id, level?) => Stage   // Boss Lab + league LG7
export const newEncounterSuffix = (cycle: number) => string     // '' | 'II' | 'III' …

// src/use/bosses/bossTraits.ts — pure runtime, no Vue, zero allocation in the hot path
export const BOSS_TRAIT_TUNING = {
  EMBER_PERIOD_MS: 2000, EMBER_RADIUS_MUL: 2.2, EMBER_PCT: 0.03,
  FROST_KEEP: 0.1, CHILL_PER_STACK: 0.1, CHILL_MAX: 5, CHILL_TURNS: 2, CHILL_GATE_MS: 250
}   // mutable only from the Boss Lab (dev); every value mirrored in tools/skills-sim/bosses100.mjs
export function tickBossClock(state, stepMs, launchedPhase): boolean      // true = nova due
export function emberVictimMask(carriers, blades, out): number          // bitmask, one hit per victim
export function frostTouchKeep(victim, hazardWardShockKeep): number      // 0.1 … 0.19
export function tryFrostLock(victim, team, teamTurn): 'locked' | 'immune' | 'cracked'
export function addChillStack(victim, teamTurn, now): boolean
export function pruneChill(victim, endedTurn): void
export function chillSpeedMul(victim): number
```

`getStageById` (`useSpinnerCampaign.ts`): `slot200 = ((id − 1) % 200) + 1`; if `slot200 > 100`
and `encounterForSlot(slot200)` → build the stage from the encounter (levels `+ 22 × (cycle −
1)`, rewards of the replaced base slot after trim × `cycleRewardMul(cycle)`, `name` = the
encounter key, `cycleSuffix` = `newEncounterSuffix(cycle)`, `isBoss: true`); otherwise today's
path. `STAGES` (legacy, 200 entries) picks the new encounters up automatically.

### 12.2 Hook points in `useSpinnerGame.ts` (names stable; after skills WP4 lands)

1. **`initGame`** — carriers need no flags beyond `config.bossTrait` (twins copy the config;
   `spawnSplitChildren` sets `bossTrait: parent.config.shardTrait`, the child-emitter copy
   sets `bossTrait: undefined`). Reset `bossClockMs = 0`, `nextNovaAt = EMBER_PERIOD_MS`,
   `playerTurnIndex = 0`; if any carrier exists, preallocate the VFX pools and call
   `flameImage()` (ember uses the lava flame strip).
2. **`updatePhysics` substep loop** — after the all-pairs collision loop of *each* substep:
   `if (phase is player_launched | npc_launched && tickBossClock(...)) fireEmberNova()` (so 2×
   speed sees identical novas). `fireEmberNova` iterates carriers and victims in `syncKey`
   order, builds the victim mask, and applies `applyHpLoss(victim, dmg, 'burn')` + the burn
   strip + the ring; kills go through the extracted `handleDeaths` (skills §10.3 item 9).
3. **`resolveCollision`** — inside `if (contactArmed)`, after reflections and before the
   skills' contact hooks (skills §5 step 6): `onTraitContact(a, b)` and `onTraitContact(b,
   a)`; each checks carrier/victim owners and `phasedUntil`, then frost touch (shared
   `lastShockMs` gate on game time), frost lock (only if `launchedBladeId === carrier.id`),
   chill stack.
4. **`beginLaunch`** (skills WP4 item 4) — player launches increment `playerTurnIndex` (NPC:
   `npcTurnIndex`, already there). The launch-lock filter the skills add for Static Charge
   (`launchNpc`, and for PvP the player side, plan G2) is reused for the player's own
   selection: `selectBlade`, drag start, joystick start, and every auto-select
   (`passToPlayer`, the `deciding_turn` timeout, the `npc_launched → player_turn` transition)
   skip a blade with `stunnedForTurn === playerTurnIndex + 1` at the turn about to start. At
   turn start, if every living player blade is frost-locked, clear the frost locks (thaw).
5. **Turn end** (`player_launched → npc_turn`, and the stun/skip path) — `pruneChill(blade,
   endedTurnIndex)` for the team that just finished; HUD event.
6. **`applyHpLoss`** (skills WP4 item 9) — kind `'burn'` joins `'lava'` for Hazard Ward.
7. **`statsFor`** — `spd *= chillSpeedMul(blade)` (the per-tick cache is cleared every tick,
   so a new stack is seen next tick).
8. **`bounceOffWalls` / `bounceOffBouncers`** — unchanged except that `lastShockMs` is game
   time (skills WP0).
9. **`computeStateHash`** — adds the fields listed in §9.
10. **`clearBattleVfx`** — clears nova rings, ice shells, shard particles.
11. **`render`** — carrier auras before the blade loop; charge arcs, novas, ice shells and
    frost rims after it (`renderBossTraitVfx` from `bossTraitVfx.ts`).

`useSpinnerGame` exposes a `bossTraitHud` `shallowRef` (`{ frozen: boolean; chill: number }[]`
per player blade), published with `triggerRef` only on trait events.

### 12.3 Work packages

| WP                      | contents                                                                                                              | files                                                                                                                                                                    | depends on                                                 | gated by (must pass before hand-off)                                                                                                                                                                                                                                                                                                                                                                                                              | acceptance                                                  |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| **BW0** sim + tuning    | boss scenario sim, grids, final tables (this doc §8)                                                                  | `tools/skills-sim/bosses100.mjs`                                                                                                                                         | — (done)                                                   | runs from Appendix A; old-slot rows reproduce the unpatched engine                                                                                                                                                                                                                                                                                                                                                                                | §8 numbers reproducible                                     |
| **BW1** data + campaign | `BossTrait` types, `bossEncounters.ts`, layout period in `getStageById`, stage-name keys in `en.ts`                   | `src/types/spinner.ts`, `src/data/bossEncounters.ts`, `src/use/useSpinnerCampaign.ts`, `src/i18n/locales/en.ts`                                                          | skills shipped                                             | new `tests/bossEncounters.test.ts`: 110/120/…/200 resolve to the encounters, 105/115/…/195 and 188 unchanged, 210 = base 10 + 44, 310 = encounter + 44 with suffix "II", rewards equal the replaced slot's, boss-peek schedule unchanged (`tests/bossPeek*.test.ts` still green), `STAGES.length === 200`; sim parity: `bosses100.mjs` ENCOUNTERS == data table (the sim switches to reading the TS file, like `data.mjs` does for `BASE_STAGES`) | `pnpm test` green                                           |
| **BW2** trait runtime   | pure functions of §12.1                                                                                               | `src/use/bosses/bossTraits.ts`                                                                                                                                           | BW1 types                                                  | new `tests/bossTraits.test.ts`: every rule of §4 incl. the chill worked example, cap-replace, gates, immunity, never-lose-a-turn/thaw, Phase Step, Hazard Ward keep/burn; a spy proves no `Math.random`/`matchRng` call                                                                                                                                                                                                                           | 100 % branch coverage of the module                         |
| **BW3** engine          | hook points §12.2                                                                                                     | `src/use/useSpinnerGame.ts` (exclusive)                                                                                                                                  | skills WP0 + WP4, BW2                                      | regression: a seeded match without traits yields the post-WP4 `computeStateHash` sequence (inert when off); two runs of each trait roster with one seed give identical hash sequences at 1× and 2×; selection helper refuses a frost-locked blade; burn → Guard Shell absorbs / Hazard Ward reduces; `tools/skills-sim` quick run still loads (G17: no renamed constants)                                                                         | cheat to 110/120/130: mechanics behave as §4                |
| **BW4** VFX + SFX       | pools, cached sprites, `FX.low`, 3 synthesised SFX in the deferred tier                                               | `src/use/bosses/bossTraitVfx.ts`, `src/use/useAssets.ts`, `public/audio/sfx/boss-*.ogg`                                                                                  | BW2 (BW3 wires the calls)                                  | `tests/bossTraitVfx.test.ts`: pool caps, no growth after 1,000 triggers, `FX.low` branches draw ≤ the table; perf A/B `perf/ab.mjs` on the Elemental Court (Boss Lab URL param) at 4× and 8× CPU throttle: fps drop ≤ 3 %, frames > 33 ms +≤ 2 pp, heap slope unchanged; `perf/quality-check.mjs` tier settles as before; `PERF-LEDGER.md` row                                                                                                    | budget table §7.3 holds                                     |
| **BW5** art + skins     | 3 skins painted and fitted; catalog append; `TROPHY_SKINS` excluded from every offer path; `skins.*` names in `en.ts` | `art/skins/concepts.mjs`, `public/images/models/{cinder,frost-vault,yeti}_256x256.webp`, `src/data/skinCatalog.ts`, roulette/chest/daily/BP offer filters                | — (independent)                                            | `tests/skinCatalog.newSkins.test.ts` extended (append-only, image exists); new test: no offer helper ever returns a trophy skin; user eyeballs the keyed returns next to their class (skills README rule)                                                                                                                                                                                                                                         | skins render in the Boss Lab                                |
| **BW6** UI              | trait glyphs, BossPeek traits, BossIntroCard, HUD pips/frozen card + tap-shake, trophy grant flow                     | `src/components/atoms/BossTraitGlyph.vue`, `BossIntroCard.vue`, `BossPeekBadge.vue`, `src/use/bossPeek.ts`, `src/views/SpinnerArena.vue` (exclusive), `en.ts` `bosses.*` | BW3, skills WP7 (SpinnerArena owner)                       | unit: `getBossPeek` carries `traits` for encounter stages only; trophy grant idempotent, queued after roulette Continue and after skill reveals, skipped in cheat/ghost/league modes; intro card uses `createPausableTimer`; e2e below                                                                                                                                                                                                            | layouts at 360×640, 740×360, 1024×768: no horizontal scroll |
| **BW7** Boss Lab        | cheat key, lazy modal, trait sandboxes, knobs, "next" flow                                                            | `src/use/useCheats.ts`, `src/components/organisms/BossLabModal.vue`                                                                                                      | BW1, BW3                                                   | unit: cheat map has `ctrl+shift+9`; lab builds 10 + 3 stages; build purity grep: `BossLabModal` only in an async chunk                                                                                                                                                                                                                                                                                                                            | the user can click through all ten                          |
| **BW8** locales         | the 20 keys in the other 38 locales                                                                                   | `src/i18n/locales/*.ts`                                                                                                                                                  | BW1/BW5/BW6 en keys; skills WP9 (same files, run after it) | i18n parity test (20 keys × 39 locales, params), `tools/locale-fit` audit on de/ru/vi/th/ar                                                                                                                                                                                                                                                                                                                                                       | —                                                           |
| **BW9** QA              | e2e + builds                                                                                                          | `tests/e2e/bosses100.test.ts`                                                                                                                                            | all                                                        | e2e (own browser profile, verify the served `<title>`): cheat to 109 → win → peek shows the Cinder chip → 110: intro card, nova ring + burn numbers, win → roulette → trophy card → skin owned after reload (cloud-save build pattern); 120: frozen card + tap-shake; 130: chill pips; Boss Lab click-through; every platform build + bundle purity; sim re-run after skills WP10 table changes                                                   | release checklist                                           |

**League LG7** consumes `buildBossEncounterStage` (BW1) and the engine (BW3); no boss WP depends on it.

### 12.4 Batches and critical path

| batch              | WPs           | why together                                                                      |
|--------------------|---------------|-----------------------------------------------------------------------------------|
| 0 (now)            | BW0           | done with this document                                                           |
| 1 (skills shipped) | BW1, BW2, BW5 | pure data / pure functions / art — no shared files with each other                |
| 2                  | BW3, BW4      | BW3 owns `useSpinnerGame.ts`; BW4's module lands first in the batch, BW3 wires it |
| 3                  | BW6, BW7      | both need the engine; BW6 owns `SpinnerArena.vue`                                 |
| 4                  | BW8           | all English keys exist; after skills WP9 touched the same 39 files                |
| 5                  | BW9           | everything                                                                        |

**Critical path:** skills WP4 → BW2 → BW3 → BW6 → BW8 → BW9. BW5 (painting) runs beside it
and only has to land before BW6's trophy card is tested.

---

## 13. Open decisions and backlog

### 13.1 Decisions for the user (each with the recommended default)

| #      | question                                | recommended default                                                                                                                                                                                                                                      | why                                                                                                                                                                                                                                                | alternative                                                                                                           |
|--------|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| **D1** | Scope: how many encounters / mechanics? | **10 encounters from the 3 new mechanics**, layered on the replaced slot's archetype (§3.2)                                                                                                                                                              | keeps "new every 10 stages" with 3 learnable rules and a flat VFX budget                                                                                                                                                                           | only the 3 debut bosses (110/120/130), rest of 101–200 stays cycle copies; or design 7 more mechanics (backlog §13.2) |
| **D2** | Trophy skins — earned only?             | **Yes: first win over a wearer grants the skin; never sold, never in chests/roulette/BP/ads**                                                                                                                                                            | a reward you can only get by beating the boss is the motivation "invested players" need; no economy impact                                                                                                                                         | also sell them for coins/ad after the first defeat                                                                    |
| **D3** | Frost Lock: may it cost a whole turn?   | **No** — it never locks the last launchable spinner (§4.2 rule 2)                                                                                                                                                                                        | measured: with skips allowed the first Warden cost **9.4 lost turns per battle**, the shipped bodies still **2.9–3.1 lost turns and −12…−21 win points** (§8.5–8.6) — losing whole turns is the most frustrating thing a casual player can receive | allow skips (a mirror of Static Charge), with heavier boss nerfs                                                      |
| **D4** | Frostbite: "until end of next turns"    | **each stack lasts through the victim team's next 2 turns**, independent stacks, cap 5                                                                                                                                                                   | "turns" is plural; 1 turn makes rotation a free answer (the chilled spinner just sits out one turn), 2 turns makes rotation a real choice; measured: 1 turn = 2.2 instead of 3.3 stacks and +5…+10 win points on the chill fights (§8.6)           | 1 turn (weaker, shorter fights), or refresh-all-on-touch (stronger, snowballs)                                        |
| **D5** | Difficulty anchor                       | **new encounters measure *easier* than the late cycle-copy bosses they replace** (those are walls at the typical player's economy level, §8.2) but fall in a ladder: debut ~45–60 %, combos ~25–45 %, finale ~15 % first-try win with a fitting L10 pair | fresh content should be beatable in a few tries, not a grind; the kept x5 bosses stay the walls                                                                                                                                                    | match the replaced walls (0–5 % in the sim)                                                                           |
| **D6** | League gatekeepers                      | **Cinder Tyrant guards Gold→Platinum, Glacier Warden Platinum→Diamond, Elemental Court Diamond→Champion**, classic bosses below                                                                                                                          | the new bosses are the prestige content; deterministic by construction                                                                                                                                                                             | classic bosses only; or new bosses only for Champion                                                                  |

### 13.2 Backlog (deliberately out of v1)

| idea                                                                                                                                              | why deferred                                                                          |
|---------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| more mechanics (e.g. *gravity well* pulling resting spinners, *mirror boss* that copies your last launch, *bomb carrier* that detonates on death) | three mechanics already fill ten encounters; each new one costs VFX budget + a lesson |
| traits in the daily challenge (`SOLO_ABILITIES` += ember/frost/chill as mutators)                                                                 | the daily must stay beatable at 66 % ability rate; needs its own sim pass             |
| traits on regular enemies in cycles ≥ 2 ("elite" enemies)                                                                                         | same as skills backlog "elite enemies"; needs a counter-tell                          |
| a skill that answers frost directly ("Thaw": chance to shrug off a freeze / a chill stack)                                                        | the skills cap proof covers 10 skills; an 11th needs the pair sweep again             |
| trophy frame / title for beating all ten                                                                                                          | cosmetic long tail after v1 telemetry                                                 |
| preview video beat (Cinder nova + Warden freeze) through the video pipeline                                                                       | after art lands                                                                       |

---

## 14. Risks

| risk                                                                                                                                                                                                                           | likelihood / impact | mitigation                                                                                                                                                                                     |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Sim player ≠ real player.** The policy never steps out of the nova ring, never rotates away from chill, never plans around a freeze — real players will do better against all three traits, so real win rates run *above* §8 | high / medium       | targets are set for the weak policy; every magnitude is a knob in `BOSS_TRAIT_TUNING` (no logic change to retune); KPI: attempts per new boss (target median 2–4) and quit rate on 110/120/130 |
| **Frost Lock read as a bug** ("my spinner won't move")                                                                                                                                                                         | medium / high       | ice shell on the blade + ice card + tap-shake with crack SFX + intro card glyph + peek chip; e2e covers the tap path; never costs a whole turn (D3)                                            |
| **Tank teams vs the Cinder family** — long hugging fights turn into many novas: 110 drops from 99 % (old slot) to 9 % for a Soft Shell + Round Guard team, burn ≈ half of all damage (§8.7)                                    | measured / medium   | intended counter (Hazard Ward, a harder-hitting top); telemetry: attempts at 110/140/170 split by team build; knob `EMBER_PCT` (2 % gives +6 points at 110 for the default team)               |
| **Long frost fights** — the Warden family drains your combos, fights ran 30–75 turns in the first tuning pass                                                                                                                  | measured / medium   | Warden bodies moved to Speedy bottoms and tuned by turns as well as win rate (§8.3); keep the fight-length column in every re-run                                                              |
| **Determinism for the league** depends on skills WP0 (game-time shock gate, syncKey order) and a tick clock in league mode                                                                                                     | medium / medium     | traits add no RNG and use only tick/turn clocks; the state hash covers trait state; LG7 owns the league clock                                                                                  |
| **Skill tables change** (skills WP10 re-tune) and shift every number here                                                                                                                                                      | medium / low        | re-run Appendix A after WP10; the sim reads the catalog then                                                                                                                                   |
| **Save / progress edge cases** — a player sitting on a replaced slot meets the new boss on his next attempt after the update                                                                                                   | certain / low       | stage id and save keys are unchanged; the rubber-band streak carries over; 110 gets harder (Cinder 56 % vs Bear Mother II 95 %), every later replaced slot easier (§8.2 vs §8.4)               |
| **Bundle / purity** — Boss Lab code in production entry                                                                                                                                                                        | low / low           | lazy `defineAsyncComponent` chunk + purity grep in BW7                                                                                                                                         |
| **Art rerolls** — three paints at 1.6× boss scale show every flaw                                                                                                                                                              | medium / low        | BW5 runs early and independently; fallback: ship the encounters on existing skins (`fire`, `ice`, `wolf-demon`) and add the trophies later                                                     |
| **Perf on low-end** — three auras + ice shells in the finale                                                                                                                                                                   | low / medium        | ≤ 16 primitives, cached sprites, `FX.low` drops auras; A/B gate in BW4                                                                                                                         |

---

## Appendix A — reproducing the numbers

`tools/skills-sim/bosses100.mjs` (Node ≥ 20, no dependencies). It reads `engine.mjs`,
patches it at fixed anchor strings (aborting if one drifted), writes
`out/engine-bosses.gen.mjs` (gitignored) and imports it — so it never forks the skills
engine, and every rule the skills sim replicates stays shared. The patch adds: custom stage
objects (`opts.stage`), per-battle knobs (`opts.knobs`), the boss HP multiplier
(`opts.bossHpMul` = rubber band), the three traits (§4), `'burn'` in Hazard Ward and the
metrics, the player turn index, the frost filter/thaw, chill in `statsFor`, and the combat
clock. Traits draw no RNG, so the *old* fights reproduce the unpatched engine exactly
(checked: 300 of 300 seeded battles — stages 110/130/180/200 × 3 modes, with skills —
identical result, turns, ticks and damage taken in both engines).

```sh
cd tools/skills-sim
B="$HOME/.claude/skills/worker-budget/budget.mjs"

# §8.4 final table (10 encounters × none / counter pair / Guard Shell + Second Wind, full HP and rubber 0.5)
node "$B" run --want 10 -- node bosses100.mjs --n 400 --noold \
  --configs none,counter,guard_shell+second_wind --rubber 1,0.5 --out out/final.json

# §8.2 the kept and replaced cycle-copy bosses
node "$B" run --want 10 -- node bosses100.mjs --n 200 --oldonly \
  --slots 105,110,115,120,125,130,135,140,145,150,155,160,165,170,175,180,185,190,195,200 \
  --configs none,guard_shell+second_wind --rubber 1,0.5 --out out/old.json

# level-shift grid used for tuning (§8.5): every encounter at −8…+8 levels
node "$B" run --want 10 -- node bosses100.mjs --n 200 --noold \
  --configs none,counter,guard_shell+second_wind --shift -8,-4,0,4,8 --out out/grid.json

# knob sensitivity (§8.6), e.g.
node "$B" run --want 10 -- node bosses100.mjs --n 300 --noold --slots 110,140,180 \
  --configs counter --set EMBER_PCT=0.04 --out out/ember4.json

node bosses100.mjs --report out/final.json     # markdown table
```

Options: `--slots`, `--configs` (`none`, `counter` = the encounter's fitting pair,
or any `a+b` pair at L10), `--levelMode econ|lock`, `--team default|glass|tank|spiky`,
`--rubber` (boss HP multipliers), `--shift` (level offsets for new fights), `--set KNOB=v`
(any key of `DEFAULT_KNOBS`, e.g. `FROST_NEVER_SKIP=0`, `CHILL_TURNS=1`), `--noold` /
`--oldonly`. Seeds are `slot × 1000003 + i × 7919` (common random numbers across configs);
the player alternates the first turn.

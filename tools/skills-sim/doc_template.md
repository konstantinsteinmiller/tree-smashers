# Skills — design spec (Tree Smashers)

> Status: **design, not implemented**. Written to be built from without guessing.
> Every number below is either read from the shipped code (file/function cited) or
> produced by the balance simulator described in §3 (reproducible, Appendix A).
> Supersedes the `## skills` notes in `new-features.md` (those said "IAP, 10× rewarded
> ads, max 3 skills"; the current brief is **2 slots, coin upgrades, max level 10**).

---

## 0. TL;DR

- **What:** from the Stage-10 boss on, the player's spinners get **2 skill slots** (slot 1
  opens when Stage 10 is cleared, slot 2 when Stage 20 is cleared). The two equipped skills
  are carried by **both** spinners of the team (each spinner has its own shield, cooldowns
  and counters). There are **10 skills**; each boss from 10 to 55 **unlocks one** (the boss
  "teaches its trick"), which the player then **learns (buys level 1) for 150 coins**; all 10
  are unlockable by stage 56. Choosing which 2 of 10 to bring to which stage — Hazard Ward
  for lava, Static Charge for lone bosses — is the depth.
- **Leveling:** learn + L1 → L10 with coins, **2,650 coins per skill, 26,500 for all ten** —
  a typical player who puts ~35 % of post-unlock income into skills maxes their first two
  by **~stage 33**, the first four by **~stage 49** and **all ten by ~stage 80** (§6).
- **Power cap:** "power" = **time-to-kill × time-to-die**, measured in a headless replica
  of the real physics/damage loop against the real stage rosters (§3).
    - Single skills at L10: **{{SINGLE_MEDIAN_RANGE}}** on a median stage, **≤ {{SINGLE_MAX}}** on the worst.
    - Pairs at L10: **all 45 pairs ≤ 1.5×** for the representative player — worst pair
      **{{WORST_PAIR}}** ({{WORST_PAIR_CI}}). Other part levels and builds: §3.7.
    - Rejected alternative, 2 slots on *each* spinner (4 skills): specialised teams reach
      **{{TEAM_MAX}}** — hence one shared loadout.
    - A per-hit multiplier clamp and a fixed order of operations (§5) keep multiplicative
      stacking bounded by construction.
- **Performance:** every effect is event-driven (collision / proc / battle start). New
  per-frame work is capped at **≤ 20 extra canvas primitives** in the worst case, all
  pooled, zero per-frame allocation, **no `shadowBlur`**, and every skill has an `FX.low`
  fallback (§8.3).
- **Modes:** ON everywhere — campaign, bosses, leaderboard ghost fights and
  **PvP** (both players' loadouts, exchanged and replayed deterministically, shown in the VS
  preview, §9.1). Campaign and daily AI enemies get **no** skills in v1 (backlog §11).

{{T_SKILL_SUMMARY}}

**Decisions (confirmed by the user, 2026-09-27):**

1. **2 slots shared by the team (both spinners carry the loadout).** The per-spinner
   alternative (2 slots on each spinner, 4 different skills) reaches **{{TEAM_MAX}}**, over
   the cap (§3.6). §1.
2. **Unlocks start at the Stage-10 boss**, then one per boss every 5 stages (10, 15 … 55). §6.2, §7.1.
3. **A boss win unlocks the right to buy level 1** (150 coins); it is not a free drop. §6.1–6.3.
4. **PvP: skills ON**, loadouts exchanged, recorded and replayed; no PvP-specific scaling. §9.1.
5. **Optional rewarded "top-up" on the upgrade button** (same payout, throttle and
   cooldown as the existing AdRewardButton — no new ad inventory). §6.5.
6. **The tank vs life-leech ~1.55× corner is an accepted exception.** §3.7.

Design note — **tuning is deliberately conservative (v7).** Two earlier table sets failed the
robustness checks (glass-cannon and tank builds against the stage-30 life-leech boss) and
were trimmed (§3.7). If skills feel too weak in playtests, `SKILL_POWER_SCALE` 1.1 is the
first knob — re-run the sweep before shipping it.

---

## 1. Goals / non-goals

**Goals**

- Depth for engaged players (stage 10+): a loadout decision per stage and arena (2 of 10).
- A **difficulty softener**: a fully leveled pair makes the team at most **1.5×** as strong
  (§3), and every skill helps a *struggling* player at least as much as a strong one
  (defensive / comeback skills come first in the unlock order).
- A second **coin sink** that is cheap enough to finish (all ten by ~stage 80) and never
  competes with part upgrades for the long tail (parts are uncapped, skills stop at L10).
- Zero cost for players below stage 8: no UI, no strings, no assets loaded.
- No frame-time regression on low-end devices (§8.3, §10.9).

**Non-goals (v1)**

- Real-money purchase of skills or levels; diamonds cannot buy skills (keeps the global
  leaderboard non-pay-to-win and Poki's single-currency rule trivially satisfied).
- Active (tap-to-use) abilities — every skill is passive/proc; the launch gesture stays the
  only input.
- Skills on campaign/daily AI enemies, a third slot (both backlog, §11).

**Why one shared 2-slot loadout.** The brief caps "both slots" together at 1.5×, i.e. the
player's total power. With slots on each spinner (4 skills per team) the measurement in §3.6
shows the cap cannot hold: time-to-kill is driven by whichever spinner deals the damage and
time-to-die by whichever survives longest, so offence on one spinner and defence on the other
multiply across spinners (up to {{TEAM_MAX}}). A single 2-slot loadout carried by both spinners
is exactly the configuration the pair sweep measures, so the proof in §3 is the proof of the
shipped design. It also keeps the UI one row, the lesson one idea ("your spinners have two
skills"), and makes the per-stage choice the decision: 2 of 10, swapped between battles.

---

## 2. Ground truth: how a fight works today (numbers from code)

- **Turn-based physics.** Each side launches one blade per turn (`releaseDrag` /
  `launchNpc` in `src/use/useSpinnerGame.ts`); the turn ends when the launched blade stops
  (`STOP_THRESHOLD = 0.25`). A resting blade deals **zero** damage.
- **Damage per contact entry** (`resolveCollision`, one roll per side per contact —
  `CONTACT_REARM_MS = 50`):
  `dmg = closingSpeed · atkMul · (crit ? 1.25 : 1) · wA / (wB · defMul) · DAMAGE_SCALE(1.4) · speedAdv`.
  `defMul` is ignored on positional crits; Piercer keeps only 25 % of the defender's
  defence bonus, Star 75 %; Star also has a hidden 8 % lucky crit. (`damage-calculation-physics.md`
  predates two changes — closing speed instead of raw speed, and `DAMAGE_SCALE` 1 → 1.4;
  the code is the source used here.)
- **HP scale.** `maxHp = 20 + top.healthBonus + bottom.healthBonus + levels·bonus`
  (`computeStats`), ×2 for bosses (`createBladeState`). Example at stage 16, a typical
  player (level 6, see §3.2): Star/Balanced has **48 HP**, a clean hit on the Quad/Tanky
  enemy (82 HP) does **~29**. Fights are short and swingy: most regular stages end in
  3–25 turns.
- **Hazards.** Lava wall: `ceil(2.5 % maxHp)` per bounce; forest wall: +1 HP; Frost Lock
  cold touch (stage 101+ bosses): −90 % speed (250 ms per-blade gate); thunder boss aura: 1 HP/s in range;
  Spiky chip: `max(1, 2.5 % victim maxHp)` per pair per 150 ms (outside the contact gate).
- **Bosses.** Every 5th stage; abilities ghost / split / partners / healers /
  child-emitter / stat-switch / life-leech / thunder (`initGame` wiring). Consecutive boss
  losses shave up to 50 % boss HP (`bossHpRubberBandMul`).
- **Economy anchors.** Part upgrades `upgradeCost(L) = 100 + 20(L−1) + 3·max(0, L−10)²`
  (uncapped). Stage wins 100–3,500, trimmed ×0.55 (×0.75 bosses) for stages 20–100.
  Rewarded ad and big chest pay `max(125|100, 3 × rewardLose)` (`useStageRewards.ts`).

---

## 3. The power metric and the ≤ 1.5× proof

### 3.1 Definition

For a loadout **S** fighting a stage roster **R**:

- **OFF(S) = TTK₀ / TTK_S** — *time to kill*: mean number of turns (launches, both sides)
  until the enemy team is dead, **with the player team immortal** (their HP resets after
  every hit, so defensive value cannot leak into this number).
- **DEF(S) = TTD_S / TTD₀** — *time to die*: mean turns until the player team is dead,
  **with the enemy team immortal** (so a faster kill cannot shorten the fight and hide
  damage taken).
- **Power index PI(S) = OFF × DEF.** This is the Lanchester "fight strength" (damage rate
  × durability). 1.00 = no change, 1.50 = the brief's cap.

Why not win rate: it saturates (a 1.2× spinner goes from 80 % → 93 % at stage 16 but
0 % → 0 % at stage 80). Win rate is still reported (§3.9) as the "easiness" read-out.

**The cap:** *the 2-slot loadout at L10 must have PI ≤ 1.50 on every representative stage.*
Both spinners carry the pair, exactly as in the game (each with its own shield, cooldowns
and counters); team-wide effects (Opening Salvo) fire once. The rejected per-spinner
alternative (4 different skills) is measured in §3.6.

### 3.2 The simulator

`tools/skills-sim/` (Appendix A). A headless port of the shipped loop — not a model of
it:

- **Replicated 1:1** (with source citations in `engine.mjs`): fixed 60 Hz step,
  acceleration ramp (`ACCEL_FRAMES 28`), decay incl. ice, low-speed brake and no-hit drag,
  circle walls with wall boost + bounce decay, bouncers, all-pairs collision incl. friendly
  fire, elastic bounce, contact re-arm gate, hug-break, back-hit crits + crit cooldown,
  Star lucky crit, Piercer/Star defence rules, speed advantage, anti-draw,
  Spiky chip, lava/forest/thunder-aura hazards, powerups (stage ≥ 2), turn-order
  switching, NPC AI (`launchNpc` incl. ally-blocking lanes), every boss ability (ghost
  twin + damage link, split children + invulnerability, partners/healers groups + healing,
  child-emitter, stat-switch phases, life-leech, thunder aura, teleporter skin).
- **Read from source at run time:** `TOP_PARTS`, `BOTTOM_PARTS`, both upgrade-bonus tables,
  `BASE_HP`, the full `BASE_STAGES` table (evaluated with the file's own `e()`/`s()`), the
  mid-game trim, and 26 physics constants (the sim aborts if any drifted).
- **Omitted:** rendering, sound, screen shake, boss rubber-banding (measures the
  *un-softened* fight), difficulty setting (MEDIUM = 1.0), first-game boost.
- **Player policy** ("typical player"): half the time launches the auto-selected first
  living blade, otherwise the blade nearest its target; target = lowest-HP or random/nearest
  enemy; ±8° aim error; 85–100 % pull. No deliberate bank shots.
- **Player build:** the default team (Star/Balanced + Round/Balanced — what every player
  starts with) at the **economic level**: the part level reachable if half of the typical
  income (§6.3) went into those 3 parts. Robustness runs use the "lockstep" level (mean
  enemy part level of nearby regular stages) and other builds (§3.7).
- **Stages:** 13 representative stages covering every arena and boss type:
  15 (ghost boss), 17 (lava, 3 enemies), 30 (life-leech boss), 31 (forest), 35 (split
  boss), 49 (forest, 3), 50 (4 healers), 55 (child-emitter), 77 (lava), 80 (stat-switch
  boss), 95 (partners + thunder boss), 99 (lava, 4 enemies), 100 (4 healers).
  (Stages 11, 14, 31 and 99 were shock/thunder arenas when the v1–v8 numbers below were
  measured; those arenas are gone — 11/14/31 are forest, 99 is lava — so re-run before
  quoting their per-stage figures.)
- **Noise control:** common random numbers (identical seeds per stage across all configs;
  skill procs draw from a **separate** RNG stream so they don't shift physics/AI rolls),
  alternating first turn. "worst+2SE" columns use a deliberately conservative standard
  error that ignores the (positive) seed correlation between baseline and skill runs; the
  worst pairs are then re-measured with a paired estimator (§3.5).

### 3.3 Baseline (no skills)

{{T_BASELINE}}

Reading: bosses at 50/80/95/100 are unwinnable for the AI policy without the rubber band
(real players also pick Piercer, bank shots and over-level) — the TTK/TTD ratios are still
well defined there, which is why the metric uses them instead of win rate.

### 3.4 Single skills — PI at L1 / L5 / L10

Stage columns are the PI at **L10**; the first two columns give the worst stage at L1 and L5.
Sorted by the L10 worst stage.

{{T_SINGLES}}

Level curve check (median over stages): {{T_LEVELCURVE}}

**Early vs late game.** No skill uses a flat number: shields and heals are a % of the
bearer's max HP, Opening Salvo a % of the enemy's, Lucky Edge and Momentum multiply the
hit, Homing Rockets are a fraction of a reference hit computed from both blades' live
stats, Mirror Plate scales with the incoming hit and the attacker's defence, Hazard Ward
with the hazard. A given level therefore has the same relative influence at stage 20 and at
stage 200 — the L10 rows above are flat from stage 15 to 100 — and the early game is
softened less only because levels are low then (see the L1/L5 medians).

### 3.5 All 45 pairs at L10 (and L1/L5)

Sorted by the worst stage. **All 45 pairs are ≤ 1.50**; the paired re-runs below put a
confidence interval on the closest ones.

{{T_PAIRS10}}

L1 / L5 pairs (N = 200, stages 15, 30, 35, 50, 77, 80, 99): {{T_PAIRS_LOW}}

**Paired high-N confirmation** of every pair whose worst stage reached ≥ 1.35, on the stages
where pairs peak (15, 30, 95); then, on stage 30, the top pairs of the glass-cannon and tank
builds from §3.7 (the tank rows are the heal-race corner discussed there). Base and pair run on the same seed; the 95 %
confidence
interval comes from the paired influence function, so it is much tighter than the
conservative "+2SE" column above:

{{T_CONFIRM}}

### 3.6 Why not 2 slots *per spinner* (4 different skills)

The rejected alternative, measured the same way: each spinner gets its own L10 pair, no
skill repeats (Spinner 1 = Star/Balanced, Spinner 2 = Round/Balanced). Eight loadouts are
built from the strongest pairs of §3.5, ten are deliberately specialised (an offensive pair on
one spinner, a defensive pair on the other, both ways round):

{{T_TEAM}}

Specialisation breaks the cap: an offensive pair on the damage dealer (the Star) plus a
defensive pair on the survivor (the Round Guard) multiplies across spinners — the same four
skills assigned the other way round stay low. This is why the design ships **one** shared
2-slot loadout.

### 3.7 Robustness

{{T_ROBUST}}

**This check changed the tuning — twice.**

| version | change                                                                                                                                                     | why                                                                                                                                                                             |
|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v4      | Phase Step 12 %, Mirror Plate 18 %, Lucky Edge 20 %, rockets 22 % of an uncapped reference hit, Hazard Ward chip −30 % / shock keep +20 pp                 | passed the default-team sweep only with a pairing rule (Phase Step + Static Charge 1.476, paired CI up to 1.513)                                                                |
| v5      | rocket reference speed capped at 1.5×; Phase 11 %, Mirror 16 %, rockets 20 %                                                                               | glass team, stage 30: Phase Step + Homing Rockets **1.533 (CI 1.506–1.562)** — Speedy bottoms reach a 2.5+ speed multiplier by stage 30 and inflated the rockets' reference hit |
| **v7**  | Lucky 13 %, Phase 10 %, Shell 16 %, Second Wind 18 %, Salvo 14 %, Static 18 %, rockets 17 %, Hazard Ward lava/thunder −40 %, chip −15 %, shock keep +10 pp | tank team: Lucky Edge alone 1.31 on stage 30 and Hazard Ward alone 1.38 on stage 31 (Spiky chip is most of the damage a 150-HP tank takes) pushed tank pairs to 1.50–1.57       |

Every number in this document is from **v7** (the §4 tables).

**The tank × life-leech corner — accepted exception (user decision, 2026-09-27).** Against the stage-30 life-leech boss
a tank team (Soft
Shell/Tanky + Round/Tanky) barely out-damages the boss's 30 % leech heal, so its kill time
reacts violently to *any* extra power. A control run with **no skills**, just a plain stat
buff from the start of the battle (for scale: one arena powerup crate is ×1.25 on one stat):

| build · stage | plain +15 % damage | plain +15 % defence | +15 % damage **and** defence |
|---------------|--------------------|---------------------|------------------------------|
| default · 16  | 1.10               | 1.09                | 1.21                         |
| default · 30  | 1.14               | 1.11                | 1.24                         |
| glass · 30    | 1.18               | 1.15                | 1.32                         |
| **tank · 30** | **1.35**           | 1.18                | **1.48**                     |

So on that one corner the fight-length metric is inflated ~2× for every power source — a
+15 %/+15 % stat buff alone scores 1.48. The strongest v7 skill pairs there measure
{{TANK30}}, i.e. they are worth about the same as a plain +15 % damage / +15 % defence buff —
**≈ 1.32× in damage × tankiness terms**, which is what the brief's cap is about. Everywhere
else (all 13 stages for the default and glass builds and the lockstep level) the raw metric
itself stays ≤ 1.5.

### 3.8 Why no pair can run away (structure) — and where the proof actually comes from

The **proof is the measurement** (§3.5 all 45 pairs, §3.5 paired confirmation on the worst
stages, §3.6 real teams, §3.7 other levels/builds). The structure below explains *why* the
measured numbers stay flat and why no untested situation can make them explode.

Expected-value size of each skill at L10 (continuous approximation — ignores that HP comes
in discrete one-shot chunks, which is why measured values can sit a few % above these):

| skill          | EV argument                                                               | L10 size            | measured median / worst                         |
|----------------|---------------------------------------------------------------------------|---------------------|-------------------------------------------------|
| Guard Shell    | DEF ≈ 1 + shield% (the shield is extra HP)                                | 1.16                | {{MED:guard_shell}} / {{MAX:guard_shell}}       |
| Phase Step     | DEF ≈ 1 / (1 − p) (all damage from collisions, cooldown never binds)      | 1.111               | {{MED:phase_step}} / {{MAX:phase_step}}         |
| Mirror Plate   | DEF ≈ 1 / (1 − p·½) = 1.087; plus reflected damage ÷ attacker defence     | 1.09 × small        | {{MED:mirror_plate}} / {{MAX:mirror_plate}}     |
| Second Wind    | DEF ≈ 1 + heal% (once per battle, only if the threshold is reached alive) | ≤ 1.18              | {{MED:second_wind}} / {{MAX:second_wind}}       |
| Lucky Edge     | OFF ≈ 1 + p·(m − 1) on collision damage                                   | 1.13                | {{MED:lucky_edge}} / {{MAX:lucky_edge}}         |
| Momentum       | OFF ≤ 1 + 3·k even if **every** hit is at 3 stacks (perfect bank shots)   | 1.225               | {{MED:momentum}} / {{MAX:momentum}}             |
| Homing Rockets | OFF ≈ 1 + volley ÷ (contacts per volley × damage per contact)             | ~1.15               | {{MED:homing_rockets}} / {{MAX:homing_rockets}} |
| Opening Salvo  | OFF ≈ 1 / (1 − pct) (one chunk of the enemy's total HP)                   | 1.163               | {{MED:opening_salvo}} / {{MAX:opening_salvo}}   |
| Static Charge  | DEF ≤ 1 + p (one skipped enemy turn per proc, never two in a row)         | 1.18                | {{MED:static_charge}} / {{MAX:static_charge}}   |
| Hazard Ward    | DEF ≈ 1 / (1 − w × hazard share of damage)                                | 1.0 – ~1.2 by arena | {{MED:hazard_ward}} / {{MAX:hazard_ward}}       |

Every EV size is ≤ **1.225 = √1.5**, so two *independent* factors stay ≤ 1.5. The places
where factors are not independent are exactly where the design adds a rule:

- **Lucky Edge × Momentum** multiply on the same hit → per-hit clamp
  `SKILL_HIT_MUL_CAP = 2.2` (§5); EV product 1.13 × 1.225 = 1.38 even with perfect play.
- **Phase Step → Mirror Plate** are sequential on one roll (a dodged hit cannot be
  mirrored) → sub-multiplicative.
- **Guard Shell + Second Wind** are both extra HP → roughly additive (1 + 0.16 + 0.18),
  below their product.
- **No recursion:** rocket, salvo and reflect damage never trigger Lucky Edge, Momentum,
  the rocket counter, Mirror Plate or Static Charge (§5).
- **One shared loadout:** at most two different skills exist in a battle; team-wide effects
  (Opening Salvo) fire once, not once per spinner.
- **Two genuine cross-overs, both found by the sweep and tuned for:**
    1. **Same-trigger chaining — Phase Step + Static Charge.** Both react to the *same* enemy
       ram, and a dodged ram can still stun: against a lone one-shot boss that chains into "no
       damage *and* a skipped turn". In v4 this pair measured 1.476 on stage 30 (paired CI up
       to 1.513) and needed a pairing rule; after the v7 trims it is {{PS_SC}}, so v7 ships
       **without** any mutual exclusion. If a later buff brings it back, the rule is ready:
       `excludes: ['static_charge']` on Phase Step (and vice versa), refused in `equip()`.
    2. **Heal races — life-leech bosses** (stage 30, 71 and their cycle copies) heal 30 % of
       the damage they deal, so any extra damage *or* denied hit shortens the kill
       super-linearly (Phase Step alone gets OFF {{PS_OFF30}} there). Every top pair peaks on
       that stage — see §3.7 for how strongly it amplifies *any* power source, skills or not.

### 3.9 Win rate ("easiness") at L10

Win rate of the full battle (both sides mortal), same seeds:

{{T_WR}}

### 3.10 Early game — the Stage-10 unlock

Skills now arrive at stage 10, so the early stages were checked separately: every single
skill and every pair at L1, L3 and L5 (a player at stage 10–20 cannot own more — the first
levels cost 150–350 coins against a stage win of 140–500), default team at the economic part
level, stages 10 (split boss), 11 (forest + thunder boss), 12 (lava), 13 (ice), 14 (forest),
15 (ghost boss), 17 (lava) and 20 (partners boss). Slot 2 only opens at stage 20, so the pair
rows before 20 are a worst case that cannot happen in the game — as are skills that unlock
later than the stage shown (all ten are tested everywhere).

{{T_EARLY}}

---

## 4. The 10 skills

Conventions for every card:

- **Bearer** = each player spinner — both spinners carry the equipped skills, each with its
  own runtime state. **Enemy** = a blade with the other owner. Skills never trigger on player↔player contacts (friendly
  fire) or on
  same-group allies.
- **Proc rolls** use a per-match `skillRng()` stream (§10.3) — never `Math.random()` and
  never the shared `matchRng()`.
- **Game time** = `gameTime()` (pauses with the physics loop; cooldowns never run during a
  modal or an ad).
- **"Armed contact"** = a collision where `contactArmed` is true in `resolveCollision`
  (the one-roll-per-contact gate).
- Level tables are the implementation tables (`src/data/skillCatalog.ts`), verbatim.
- "Measured PI" = §3 simulator, L10, 13 stages.

{{CARDS}}

---

## 5. Stacking, order of operations, governor

Inside `resolveCollision`, for each direction A→B, **in this order**:

1. Base damage exactly as today (closing speed, crits, Piercer/Star defence, speed
   advantage, split-sibling 25 %).
2. **Attacker skills** (only if B is an enemy of A): Lucky Edge roll (skipped if the hit is
   already a positional or Star-lucky crit) → Momentum (`1 + k·stacks`, then `stacks + 1`).
   Clamp the product of attacker skill multipliers to **`SKILL_HIT_MUL_CAP = 2.2`**.
3. **Defender skills** (only if A is an enemy of B): Phase Step (negate) — if it fired,
   stop; else Mirror Plate (×0.5, remember the reflected amount).
4. The existing **anti-draw** rule, on the post-skill numbers.
5. `applyBladeDamage` → central `applyHpLoss(target, dmg, kind)` (§10.3): Hazard Ward
   (hazard kinds only) → Guard Shell absorb → HP → Second Wind check → ghost-link mirror
   (existing).
6. Mirror Plate reflection is applied to the attacker (kind `reflect`), then contact skills
   (Homing Rockets counter, Static Charge) run once per armed enemy contact.

Hard rules:

- **No recursion:** damage of kind `rocket`, `salvo`, `reflect`, `chip`, `lava`, `thunder`
  never rolls Lucky Edge / Momentum / Phase / Mirror and never increments the rocket
  counter.
- **Shared loadout:** every player spinner carries both equipped skills; per-spinner state
  (shield, dodge cooldown, phase window, Second Wind, Momentum stacks, rocket counter) is
  independent; Opening Salvo fires once per battle. Equipping a skill that is already in the
  other slot swaps the two slots.
- **Enemies never carry skills** in v1 (`blade.skills` is only created for `owner === 'player'`).
- **Heals:** Second Wind is the only skill heal and fires once per battle per bearer.
- **Kill-switch knobs:** every magnitude lives in one table (`skillCatalog.ts`); the clamp
  constant and a global `SKILL_POWER_SCALE` (default 1.0) allow a hot-fix without touching
  logic. The scale multiplies `chance`, `shield`, `heal`, `pct`, `frac`, `perStack`, `lava`,
  `thunder`, `chip`, `shockKeep`, and `mult` as `1 + (mult − 1) × scale`; it never touches
  cooldowns, `everyN`, thresholds or `maxStacks`.

---

## 6. Economy

### 6.1 Upgrade cost

| step  | learn (L1) | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 | 6→7 | 7→8 | 8→9 | 9→10 | **total** |
|-------|------------|-----|-----|-----|-----|-----|-----|-----|-----|------|-----------|
| coins | **150**    | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575  | **2,650** |

All ten skills: **26,500 coins**. Beating a boss *unlocks* its skill; the player *learns* it
(level 1) for 150 coins — less than one win at the unlock stage (stage 10 pays 350 × 1.14
roulette; stage 11 pays 200), so the first skill is affordable immediately. No level gate by
stage. Coins only (`addCoins(-cost)`), never diamonds.

Arithmetic for the headline (typical profile, §6.3): income earned during stages 10–80 ≈
75,800 coins; 35 % of it ≈ 26,530 ≥ 26,500 → all ten maxed at ~stage 80. The first two
skills (Mirror Plate, Phase Step) cost 2 × 2,650 = 5,300 and unlock at 10/15; income during
stages 10–33 ≈ 15,170, × 35 % ≈ 5,310 ≥ 5,300 → both maxed by ~stage 33.

For scale (from the code): a regular stage-31 win pays 237 (trimmed), stage 61 pays 380,
a part upgrade to L20 costs 780 and to L30 1,880. Early skill levels cost about one win,
the last level about 1.5 wins at stage 60–70. A full pair (5,000) buys up to 1.5× for one
spinner; buying +50 % damage for both default spinners with parts at stage 80 (Star
25 → 43, Round 25 → 47) would cost ≈ 115,000 coins. Skills are cheap *because* they are
capped — past the cap every coin flows back to parts.

### 6.2 Acquisition — boss unlock, then learn with coins

| clear boss                            | skill unlocked (learn for 150)                             | slots open                                                       |
|---------------------------------------|------------------------------------------------------------|------------------------------------------------------------------|
| 10 The Bear Mother (split)            | **Mirror Plate** — after learning, auto-equipped in slot 1 | slot 1                                                           |
| 15 The Phantom Twin (ghost)           | **Phase Step** (learn → list, NEW badge; swap if you like) |                                                                  |
| 20 The Iron Brotherhood (partners)    | **Guard Shell**                                            | slot 2 (auto-filled with the earliest learned, unequipped skill) |
| 25 The Mending Choir (healers)        | **Second Wind**                                            |                                                                  |
| 30 Chaos Incarnate (life-leech)       | **Lucky Edge**                                             |                                                                  |
| 35 The Ravenous Swarm (split)         | **Homing Rockets**                                         |                                                                  |
| 40 The Dragon Specter (ghost)         | **Opening Salvo**                                          |                                                                  |
| 45 The Unbroken Trio (partners)       | **Momentum**                                               |                                                                  |
| 50 The Eternal Grove (healers)        | **Hazard Ward**                                            |                                                                  |
| 55 The Dread Scorpion (child-emitter) | **Static Charge**                                          |                                                                  |

- **Two states.** *Unlocked* is derived, never stored: `highestClearedStage =
  currentStageId − 1 ≥ unlockStage` — a hydrate race or a fresh device can never lose an
  unlock. *Learned* = a stored level ≥ 1 in `smashers_skills` (bought with coins).
- Order rationale: defensive/comeback skills first (they soften the difficulty spikes a
  stage-10–30 player actually hits), offence next, situational/control last. Thematic
  links (the Bear Mother's hide → Mirror Plate, ghost → Phase Step, iron brotherhood →
  Shell, choir → heal, swarm → rockets, dragon → salvo) make the unlock self-explanatory.
- **Auto-fill:** when a skill is learned or a slot opens, an empty unlocked slot is filled
  with the earliest learned, unequipped skill (unlock order). It never replaces a skill the
  player placed.
- Infinite campaign (stage 101+) re-runs bosses but unlocks nothing new.

### 6.3 Income — where "maxed by stage 80" comes from

Income model (`tools/skills-sim/econ.mjs`), all inputs read from the game tables:

- win of each stage (`rewardWin`, trimmed) × roulette EV **1.141** on bosses
  (`RouletteWheel.vue` weights), plus expected losses × `rewardLose` (0.6 loss per regular
  stage, 1.5 per boss from stage 15; 0.2/0.8 before);
- rewarded ad `max(125, round5(3 × rewardLose))`, big chest `max(100, round5(3 ×
  rewardLose))`, daily rewards (coin days only: 1,450 per 7-day cycle), battle-pass coins
  (`bpCoinReward`, 50 xp/win, 12.5 xp/loss, skin and diamond tiers pay no coins).

Profiles: **campaign-only** (wins + losses, nothing else), **typical** (1 ad per 3 stages,
1 big chest per 3 stages, 6 stages/day, battle pass claimed), **engaged** (1 ad per stage).

{{T_INCOME}}

Projection — spend a fixed share of every coin earned after the unlock on skill upgrades,
learning each skill as soon as it unlocks and finishing one before starting the next, in unlock order (stage 10 → 200):

{{T_SKILLECON}}

**Interpretation of the brief ("rather easy to max each skill before stage 80"):** a
*typical* player who puts ~35 % of post-unlock income into skills maxes all ten by stage
~80, their first two by ~33 and the first four by ~49 — while the remaining
~65 % keeps parts at the economic level used in §3 (50 %) with ~15 % to spare for skins.
A player who never watches an ad, opens a chest or claims the battle pass ("campaign-only")
gets there by ~121 at the same share (the campaign is infinite); an engaged ad-watcher by
~69. "First four" = Mirror Plate, Phase Step, Guard Shell, Second Wind.

### 6.4 Interaction with the other sinks and rewards

- **Parts** stay the uncapped long-term sink (their cost is quadratic past L10); skills are
  front-loaded and finish. Past ~stage 80 all spend returns to parts.
- **Skins / background skins** unchanged. Skins remain cosmetic except the existing
  Diamond (+20 % def) and Teleporter (wall pass) specials — both independent of skills.
- **Battle pass / daily rewards:** unchanged in v1 (no skill rewards — the drop schedule
  already paces unlocks). Backlog: a "skill level" reward on a few BP tiers (§11).
- **Save-merge score** gains `+150 × Σ skill levels` (learning = one level; same weight as a part level, §10.4).

### 6.5 Optional rewarded accelerator ("top-up") — confirmed

Follows the playbook's Phase 6 rules (rewarded readiness gating, no ad over a result
screen, audio guarantee handled centrally by `useAds.showRewardedAd`).

- Where: on a skill's learn / upgrade button in the skill picker, only when
  `coins < cost && cost − coins ≤ rewardedAdCoins` (`useStageRewards.ts`).
- Gate: `isRewardedReady` **and** the AdRewardButton cooldown key
  `smashers_ad_button_ready_at` is expired (the same 30 s cooldown, the same
  `useRewardedThrottle` budget of 5 per 7 min). One inventory, no new farm loop.
- Call: `showRewardedAd({ kind: 'coins', amount: rewardedAdCoins })` (native builds get the
  Families intro modal from there). On `true`: `addCoins(rewardedAdCoins)`, coin burst to
  the coin pill, write the cooldown key; the upgrade itself stays a separate tap.
- Never offered in battle (the picker only exists outside battle), never while a modal or
  another ad is open. Flag `SKILL_AD_TOPUP` (default on; off turns it into a plain disabled
  button).

---

## 7. UI / UX

### 7.1 Reveal timeline

| player state                    | what exists                                                                                                                                                                                                                                                                                             |
|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| stages 1–7                      | nothing (no section, no strings, no icons fetched)                                                                                                                                                                                                                                                      |
| stage 8–10 (cleared 7)          | **Teaser:** Team modal shows a "SKILLS" row with 2 padlocked tiles, badges "Stage 10" (slot 1) and "Stage 20" (slot 2). Tapping a tile shows a `FSpeechBubble`: *"Beat the Stage 10 boss to unlock skills!"*. On the Stage-10 badge (menu only) a small "?" chip = "this boss unlocks something".       |
| clear 10                        | after the roulette reward's "tap to continue": **Skill reveal overlay** (§7.4) — "New skill!" with Mirror Plate and one CTA **Learn 🪙150** (the stage-10 win alone pays ≥ 350). Learning snaps it into slot 1. Declining leaves the Team button with a soft glow + NEW dot until the skill is learned. |
| first battle with a skill       | the HUD icons on both stat cards "breathe" for the first 3 s (wordless lesson); the first proc flashes the icon on the card of the spinner it happened to.                                                                                                                                              |
| clear 15                        | reveal overlay for Phase Step (Learn CTA; goes to the list — slot 1 is taken)                                                                                                                                                                                                                           |
| clear 20                        | reveal "New skill slot!" + Guard Shell; slot 2 is auto-filled with the earliest learned, unequipped skill                                                                                                                                                                                               |
| clear 25…55                     | reveal per unlock with the Learn CTA; learned skills without a free slot go to the list with a NEW badge                                                                                                                                                                                                |
| existing players (update ships) | on first load with `stage > 10`: one combined overlay "Skills unlocked!" with every unlocked icon and a single CTA to the picker; nothing is learned automatically.                                                                                                                                     |

Reveals are queued (never two at once, ≥ 1.2 s apart), only ever on the menu/`tap_to_start`
screen, never mid-battle, never over an ad (the interstitial fires in `beginBattle`, which
the overlay blocks until dismissed).

### 7.2 Team modal — the SKILLS section (`SpinnerConfigModal.vue`)

Placed in the **bottom column, between BOTTOM PART and STATS**. The loadout belongs to the
team, so the row is identical on both blade tabs and carries a small "both spinners" glyph
(two overlapping spinner outlines, `aria-label` from `skills.hint`). Hidden entirely below
the teaser stage. Two tiles:

- **Unlocked, filled:** skill icon (32 px), name, "Lv.N", a thin level bar. Tap → skill
  picker (§7.3) in the context of this slot.
- **Unlocked, empty:** dashed border, "+" glyph, label "Empty". Tap → picker.
- **Locked:** padlock glyph + "Stage 20" badge. Tap → speech bubble.

Portrait phone (≤ 500 px wide):

```
┌───────────────────────────────────┐
│ [Blade 1][Blade 2]              ✕ │
│ 🪙 1 234      TOP BLADE      [BG] │
│  ┌────┐ ┌────┐ ┌────┐             │
│  │Star│ │Spky│ │Rnd │   (3×2)     │
│  └────┘ └────┘ └────┘             │
│  ┌────┐ ┌────┐ ┌────┐             │
│  │Quad│ │Soft│ │Prcr│             │
│  └────┘ └────┘ └────┘             │
│  BOTTOM PART                      │
│  ┌────┐ ┌────┐ ┌────┐             │
│  │Spd │ │Tnk │ │Bal │             │
│  └────┘ └────┘ └────┘             │
│  SKILLS                  ⓘ        │
│  ┌──────────────┐┌──────────────┐ │
│  │◈ Phase Step  ││ 🔒  Stage 20 │ │
│  │ Lv.3 ▰▰▰▱▱▱▱▱▱▱││              │ │
│  └──────────────┘└──────────────┘ │
│  STATS ❤48 ⚖110 ⚔2.8 🛡1.0 ⚡1.2  │
│  hints…                           │
└───────────────────────────────────┘
```

Landscape phone (`(orientation: landscape) and (max-height: 500px)` — the modal is the
two-column row layout): the SKILLS row sits in `.bottom-col` under the bottom-part grid,
tiles shrink to icon + "Lv.N" only (name moves to the picker), 2 tiles side by side,
min tap target 44 × 44 px:

```
┌──────────────────────────────────────────────────────────────┐
│ [Blade 1][Blade 2]                                         ✕ │
│ TOP BLADE (3×2 cards)              │ BOTTOM PART (3 cards)   │
│ ┌───┐┌───┐┌───┐                    │ ┌───┐┌───┐┌───┐         │
│ └───┘└───┘└───┘                    │ └───┘└───┘└───┘         │
│ ┌───┐┌───┐┌───┐                    │ SKILLS [◈ Lv3] [🔒20]   │
│ └───┘└───┘└───┘                    │ STATS ❤48 ⚔2.8 …        │
└──────────────────────────────────────────────────────────────┘
```

Tablet / desktop (≥ 640 px): same as portrait, tiles show the one-line effect under the
name ("10 % dodge · 2.5 s").

Rules: no horizontal scroll at 360 × 640, 740 × 360, 1024 × 768 (e2e, §10.8); the `FModal`
content slot stays the only scroller (see the comment block in `.config-layout`); tiles
use the existing `.stat-glass` / card gradient vocabulary (selected = yellow gradient
border, locked = `bg-slate-800 border-slate-600`).

### 7.3 Skill picker (`SkillPickerModal.vue`, an `FModal` like the skin picker)

```
┌───────────────────────────────────┐
│ SKILLS · slot 1                 ✕ │
│ 🪙 1 234                          │
│ ┌───────────────────────────────┐ │
│ │ ◈ Phase Step        Lv.3 [NEW]│ │
│ │ 4.5% chance to phase through …│ │
│ │ Next: 5% · 3.5 s              │ │
│ │ [ EQUIPPED ✓ ]  [⬆ 🪙 150 ]   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ◈ Guard Shell       Lv.1      │ │
│ │ Start with a 5% HP shield …   │ │
│ │ [ EQUIP ]       [⬆ 🪙 100 ]   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ░ ??????    Stage 25 boss drop│ │
│ └───────────────────────────────┘ │
│  Equipped skills work on both …   │
└───────────────────────────────────┘
```

- Order: equipped in this slot, learned & unequipped, equipped in the other slot, unlocked
  but not learned (full icon, effect at L1, one button **Learn 🪙150** — `skills.learn`),
  locked (silhouette icon, name hidden, "Unlocks after the Stage N boss").
- Tap the card body = equip into the context slot (if it sits in the other slot, the two
  slots swap). The equipped card shows "EQUIPPED ✓" and a **Remove** button.
- Upgrade bar = same component/vocabulary as the part upgrade button (`⬆ 🪙 cost`,
  grey when unaffordable, `level-up` SFX, `MAX` at L10). Optional ad top-up variant §6.5.
- Values in the text are the *current* level; "Next:" shows level + 1. Values come from
  the catalog, formatted by i18n interpolation (no string concatenation).
- Grid: 1 column portrait, 2 columns landscape phones, 2–3 columns ≥ 640 px (same
  breakpoint scheme as `.skin-picker-grid`).
- Opened without a slot context (header "ⓘ"/list button) → upgrade-only, no equip.

### 7.4 Reveal overlay (`SkillRevealOverlay.vue`, built on `FReward`)

Ribbon "NEW SKILL!" / "SKILLS UNLOCKED!" / "NEW SKILL SLOT!"; big icon (96 px) with the
existing `roulette-reward-glow` CSS; name; one-line effect at L1; a chip "slot 1" when it was
auto-equipped; CTA **Learn 🪙150** (greyed with the ad top-up when unaffordable, §6.5) or, once learned, **Equip /
Upgrade** (opens the Team modal with the SKILLS row breathing) and the standard "tap to continue". `happy` SFX.
Combined variant (migration): up to 10 icons in a 5×2 grid, no per-skill text.

### 7.5 Boss-unlock chip (`StageBadge.vue`)

On a boss stage whose skill is not unlocked yet, outside battle only: a 20 px circular chip
at the badge's right edge with the skill icon (or "?" before stage 10 is cleared);
`aria-label` = `skills.bossDrop` ("Beat this boss to unlock {name}"). Non-interactive. Gives
every boss a visible reward.

### 7.6 Wordless lessons

- Slot breathing (scale 1 → 1.06, 1.2 s) until the first equip/visit; never text.
- HUD icon breathing for the first 3 s of the first battle with a newly equipped skill.
- First proc of each skill: the HUD icon flashes and the canvas glyph pops (§8.2) — the
  cause/effect is the lesson.
- No tooltips in battle; all explanations live in the picker.

---

## 8. In-battle presentation

### 8.1 HUD (blade stat cards, bottom corners)

Under `.blade-stat-grid` of **each** spinner card, a `.blade-skill-row` with the (up to two)
equipped skills as `SkillHudIcon`s (18 px, 20 px ≥ 640 px), only in a mode where skills are
active. Every card shows **that spinner's** state (its own shield, cooldown, counters):

| skill                                   | HUD state                                                                              |
|-----------------------------------------|----------------------------------------------------------------------------------------|
| Guard Shell                             | ring fill = shield / shieldMax (updated on absorb events)                              |
| Phase Step                              | conic cooldown sweep (CSS animation, duration = cooldown, restarted by `:key` on proc) |
| Second Wind                             | full color until used, then 40 % opacity                                               |
| Lucky Edge, Mirror Plate, Static Charge | static; flash on proc                                                                  |
| Momentum                                | 0–3 pips (current launch)                                                              |
| Homing Rockets                          | N pips filling toward the next volley                                                  |
| Opening Salvo                           | flashes at battle start, then 40 % opacity                                             |
| Hazard Ward                             | flashes when it mitigates (max 1 flash/s)                                              |

State comes from a `shallowRef<SkillHudState[][]>` exposed by `useSpinnerGame`, mutated
only inside skill events and published with `triggerRef` (≤ ~10/s). No per-frame DOM
writes, no Vue reactivity in the physics hot path.

### 8.2 Proc feedback on the canvas

All popups go through the existing `damageNumbers` pool (cap 60) with a new optional
`glyph?: SkillId` field: a 12 px icon (`Path2D`, built once per module from the catalog
icon path) drawn left of the number. Numbers are locale-free; **no words on the canvas**.

| skill          | on proc                                                               | VFX                                                                                                                 |
|----------------|-----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| Phase Step     | glyph, no number                                                      | bearer drawn at 45 % alpha for 300 ms (existing `needsAlpha` path)                                                  |
| Guard Shell    | cyan number = absorbed amount                                         | outer arc at `radius + 3`, 2 px, cyan, sweep = shield%; on break: 6 cyan particles (existing powerup particle pool) |
| Second Wind    | green heal number                                                     | one expanding ring, 350 ms, 1 stroke                                                                                |
| Lucky Edge     | crit-style orange ×1.5-size number, **without** the crit `shadowBlur` | —                                                                                                                   |
| Momentum       | `×1.15`-style label (existing `comboText`) when stacks > 0            | —                                                                                                                   |
| Homing Rockets | numbers at impact                                                     | ≤ 3 rockets/volley: triangle head + 1 tail segment, quadratic path to the target's live position, 400 ms            |
| Opening Salvo  | numbers per enemy                                                     | existing explosion spritesheet at 0.5 scale, once per enemy (≤ 5)                                                   |
| Static Charge  | glyph over the stunned enemy until its turn is skipped                | existing `spawnShockBolt` (already capped by `maxActiveVfx()`)                                                      |
| Mirror Plate   | blue number + glyph at the attacker                                   | —                                                                                                                   |
| Hazard Ward    | the reduced hazard number is tinted cyan                              | —                                                                                                                   |

### 8.3 VFX, audio and performance budget

Rules (from `PERF-LEDGER.md` and the project memory): the game is raster-bound, gradient
fills and pattern fills dominate, `shadowBlur` is poison on Firefox, pools must be capped.

| skill          | per-frame cost while active                 | event cost             | pool / cap                          | `FX.low` fallback                      | audio                                |
|----------------|---------------------------------------------|------------------------|-------------------------------------|----------------------------------------|--------------------------------------|
| Guard Shell    | 1 stroke per shielded player spinner (≤ 2)  | ≤ 6 particles on break | shared particle pool (60)           | arc kept, no particles                 | `skill-shield-break` (new) at 0.02   |
| Phase Step     | +1 save/alpha/restore for 300 ms            | 1 popup                | damage-number pool                  | same                                   | `skill-phase` (new) at 0.02          |
| Second Wind    | 1 stroke for 350 ms (≤ 2)                   | 1 popup                | 2-slot ring pool                    | no ring                                | `level-up` (existing)                |
| Lucky Edge     | 0                                           | 1 popup                | pool                                | no glyph                               | none (clash already plays)           |
| Momentum       | 0                                           | ≤ 1 label per hit      | pool                                | no label                               | none                                 |
| Homing Rockets | 2 primitives per rocket, ≤ 6 rockets        | ≤ 3 popups             | **6-slot preallocated pool**        | head only, no tail; impact number only | `skill-rocket` (new) once per volley |
| Opening Salvo  | spritesheet ≤ 5 for 650 ms, once per battle | ≤ 5 popups             | existing explosions                 | numbers + hitFlash only                | `explosion-1` once                   |
| Static Charge  | 1 small glyph fill per stunned enemy (≤ 4)  | 1 bolt                 | `maxActiveVfx()` (2 on low/Firefox) | glyph only                             | none                                 |
| Mirror Plate   | 0                                           | 1 popup                | pool                                | no glyph                               | `clash-3` at 0.015                   |
| Hazard Ward    | 0                                           | tint only              | —                                   | same                                   | none                                 |

- **Worst-case extra per frame:** 2 shield arcs + 2 heal rings + 6 rockets × 2 + 4 stun
  glyphs = **20 primitives** (+ up to 2 alpha save/restores while phased) — and only 2 of the
  10 skills can be equipped, so a real loadout draws a fraction of that — against the
  hundreds the arena already draws; no gradients, no patterns,
  no `shadowBlur`, no `ctx.filter`.
- **Zero per-frame allocation:** rockets and rings are fixed-size arrays of reused
  objects; skill lookups on blades are a bitmask (`skills.has & BIT`) + a small
  per-blade struct created in `initGame`; no `.find()` / closures in `resolveCollision`.
- **Skill SFX throttle:** max one skill sound per skill per 400 ms and they share the
  existing `MAX_ACTIVE_VFX` concurrency counter with clash sounds.
- 3 new SFX files (≤ 12 KB `.ogg` each) join the **deferred** SFX tier of `useAssets.ts`
  (tier 2 in its "Preload tiers" comment — never the splash-critical tier), requested only
  once the player owns a skill and `isSkillsEnabled`; skill icons are inline SVG paths (no
  image requests).

### 8.4 Readability with two skills + hazards

- One skill popup per blade per 250 ms; if several procs land in the same collision, only
  the highest priority shows (Second Wind > Phase > Mirror > Lucky > Momentum > Rockets >
  Static > Ward); the others still apply and still flash their HUD icons.
- Player skill popups are blue/cyan/green families; enemy damage stays red; hazards keep
  their existing colours — a player can read "whose" effect it was without text.
- Nothing is added to the top HUD; the only persistent new elements are ≤ 2 small icons
  per stat card and the shield arc.
- Enemy skills: none in v1. If added (backlog), they use the same glyph popups in **red**
  and a 12 px glyph badge over the enemy blade.

---

## 9. Modes and AI opponents

| mode                                                  | skills                                             | why                                                                                                                                                                                                                             |
|-------------------------------------------------------|----------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Campaign (incl. infinite cycles)                      | ON                                                 | the softener's target                                                                                                                                                                                                           |
| Campaign bosses                                       | ON (rubber band unchanged, applied first)          | bosses are the difficulty spikes                                                                                                                                                                                                |
| Leaderboard ghost fights (`FakeLeaderBoard` rematch)  | ON, **both sides**                                 | the ghost replays a recorded loadout (§9.1); small reward (50 + 2 × stage)                                                                                                                                                      |
| Global live leaderboard (score = best campaign stage) | indirect                                           | everyone can earn every skill with coins only (no IAP/diamond path) → not pay-to-win. Tie-break `teamPower` stays parts-only (no Worker contract change).                                                                       |
| PvP (PeerJS)                                          | **ON**, both sides (user decision)                 | loadouts exchanged in `player-ready`, deterministic per-blade proc streams, both loadouts in the VS preview; "level 1" lobbies clamp skills to L1 — §9.1                                                                        |
| Cheat / test stages                                   | ON (dev)                                           | cheats to grant/max skills (§10.2)                                                                                                                                                                                              |
| Video pipeline / trailer / test scenes                | follow the save state; `?skills=0` forces them off | keeps previously recorded scenarios reproducible; a skills trailer beat can use the stress param (§10.9)                                                                                                                        |

`loadoutForBattle(mode)` in `useSkills` is the single place that decides the local side;
the opponent's loadout comes from the PvP message or the ghost record (§9.1).

### 9.1 PvP and ghosts — how skills work against another player

**Exchange.** `PvPMessage` `player-ready` gains `skills: { id: SkillId; level: number }[]`
(≤ 2, sanitised on receipt: known ids, levels 1–10, no duplicates). `usePVP` stores
`hostSkills` / `guestSkills` next to `hostTeam` / `guestTeam`; `SpinnerArena` passes
`{ skillLoadout: mine, enemySkillLoadout: theirs }` to `initGame`, which builds
`blade.skills` for the remote (`npc`-side) blades too. In a "level 1" lobby
(`PvPGameConfig.levelOne`) both sides' skills are clamped to L1, like the parts.

**Determinism.** PvP is lockstep (`pvpTickCount`, shared seed from `game-start`). Skill
rolls must not depend on the order in which a client iterates blades — the two clients hold
the teams in swapped `playerBlades` / `npcBlades` arrays, so a shared stream would be drawn
in different orders. Each blade therefore gets its **own** stream:
`createRng(seed ^ hash(role, bladeIndex))` with `role` = host|guest of the blade's owner
(identical on both clients), drawn only by that blade's own procs. Opening Salvo fires for
both sides in host-then-guest order. `computeStateHash` adds each blade's `shield` and
`stunnedForTurn` so a skill desync is caught by the existing turn hash check.

**VS preview.** Before the first turn (the `deciding_turn` announcement in PvP, or the
duel VS intro where that component exists) each side's card shows its two skill icons with
their level (`SkillIcon` + "Lv.N"); the opponent row has `aria-label` =
`skills.opponentSkills`. During the match the stat-card HUD shows only the local side (as
today); opponent procs use the same canvas glyph popups in **red**.

**Ghosts (recorded and replayed).** A ghost is a stored snapshot, not a live peer:

- *FakeLeaderBoard NPC entries* get a generated loadout stored on the entry
  (`LeaderboardEntry.skills`): the skills unlocked by their `maxStage`, the two
  highest-value for that stage type, levels `clamp(1 + ⌊(maxStage − unlockStage)/7⌋, 1, 10)`
  from the entry's seeded RNG — so a rematch replays the same loadout.
- *Live leaderboard rows* (when the Worker stores builds) post `{ team, skills }` alongside
  the score; until then ghost fights against live rows use the generated rule above.
- The ghost's blades are driven by the NPC AI as today; its skills run through the same
  runtime as the player's (enemy-side hooks, per-blade streams).

**Fairness / matchmaking.** Skills are symmetric in PvP, so they only matter as a *gap*.
The cap bounds that gap at 1.5× (worst pair 1.43×), and `tools/skills-sim/levelequiv.mjs`
puts it in part-level terms: +4 levels on all four parts measures **1.40 / 1.49 / 1.44×** (stages 30 /
50 / 80), i.e. a maxed pair ≈ 4 part levels per part. Level gaps of that size already happen
in open lobbies today, so **no PvP-specific scaling** is added. Two adjustments:
honour points (`calcHonorPoints(myTotal, enemyTotal)`) count **each skill level as 0.8 of
a part level** in both totals (20 skill levels ≈ 16 part levels), and "level 1" lobbies clamp
skills to L1 (≤ 1.15× for any pair at L1, §3.10).

**AI opponents:** campaign and daily AI enemies get no skills in v1 — giving them skills
would cancel the softener.
Backlog: "elite" enemies in campaign cycle ≥ 2 (stage 201+) carrying one L5 skill with a
visible glyph badge (§11).

---

## 10. Implementation

### 10.1 Data model

```ts
// src/data/skillCatalog.ts — pure data, no Vue (unit-testable like skinCatalog.ts)
export const SKILL_IDS = [
  'phase_step', 'guard_shell', 'second_wind', 'lucky_edge', 'homing_rockets',
  'opening_salvo', 'momentum', 'hazard_ward', 'static_charge', 'mirror_plate'
] as const
export type SkillId = (typeof SKILL_IDS)[number]
export type SkillTag = 'DEF' | 'SUS' | 'OFF' | 'CTL' | 'UTL'

export const SKILL_MAX_LEVEL = 10
/** Coins to reach level L+1, index L: [learn L1, L1→2, …, L9→10] — sums to 2,650. */
export const SKILL_COST = [150, 100, 125, 150, 200, 250, 300, 350, 450, 575] as const
export const SKILL_TEASER_STAGE = 8             // currentStageId >= 8
export const SKILL_UNLOCK_CLEARED = 10          // highest cleared stage
export const SKILL_SLOT2_CLEARED = 20
export const SKILL_HIT_MUL_CAP = 2.2
export const SKILL_POWER_SCALE = 1              // hot-fix knob, multiplies chances/percents
export const SKILL_BIT: Record<SkillId, number> // 1 << index

export interface SkillDef {
  id: SkillId
  tag: SkillTag
  unlockStage: 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55
  /** 24×24 viewBox SVG path; used by <SkillIcon> (DOM) and new Path2D() (canvas). */
  icon: string
  /** Accent colour for HUD ring / popups. */
  color: string
  /** Reserved: skills that may not be equipped together with this one. Empty in v7
   *  (see §3.8 — the Phase Step + Static Charge rule is ready but not needed). */
  excludes?: readonly SkillId[]
  levels: readonly SkillLevelParams[]   // length 10, tables in §4
}
export type SkillLevelParams =
  | { shield: number }                                   // guard_shell
  | { chance: number; cooldownMs: number }               // phase_step
  | { chance: number; share: 0.5 }                       // mirror_plate
  | { threshold: 0.35; heal: number }                    // second_wind
  | { chance: number; mult: number }                     // lucky_edge
  | { perStack: number; maxStacks: 3 }                   // momentum
  | { everyN: number; frac: number; maxTargets: 3 }      // homing_rockets
  | { pct: number }                                      // opening_salvo
  | { chance: number }                                   // static_charge
  | { lava: number; thunder: number; chip: number; shockKeep: number } // hazard_ward
export const SKILLS: Record<SkillId, SkillDef>
export const skillParams = <T extends SkillLevelParams>(id: SkillId, level: number): T
export const skillCost = (level: number): number | null  // level 0 → 150 (learn); null at 10
export const unlockedSkillIds = (highestCleared: number): SkillId[]   // learned = level ≥ 1 in the save
export const unlockedSlotCount = (highestCleared: number): 0 | 1 | 2
export const canEquipTogether = (a: SkillId, b: SkillId): boolean  // reads `excludes`; always true in v7

// src/types/spinner.ts — additions
export interface BladeSkills {
  ids: SkillId[]            // ≤ 2, from the loadout
  lv: Partial<Record<SkillId, number>>
  has: number               // bitmask for O(1) checks in the hot path
  shield: number
  shieldMax: number
  dodgeReadyAt: number      // gameTime ms
  phasedUntil: number       // gameTime ms
  secondWindUsed: boolean
  stacks: number            // Momentum, reset per own launch
  rocketCount: number
}
// SpinnerState gains:
//   skills?: BladeSkills          (player blades only)
//   stunnedForTurn?: number       (enemies; Static Charge)
//   stunImmuneTurn?: number
// DamageNumber (internal to useSpinnerGame) gains: glyph?: SkillId; isLucky?: boolean
```

### 10.2 Files

**New**

| file                                                                             | contents                                                                                                                                                                                                                                                                                                                                           |
|----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/data/skillCatalog.ts`                                                       | §10.1 data + icons + helpers                                                                                                                                                                                                                                                                                                                       |
| `src/use/skills/skillRuntime.ts`                                                 | pure hook functions used by the loop (no Vue): `createBladeSkills`, `outgoingSkillMul`, `incomingSkill`, `hazardScale`, `absorbShield`, `secondWindHeal`, `onOwnBounce`, `onEnemyContact` (returns a rocket volley / stun event), `refHit`, `salvoDamage`                                                                                          |
| `src/use/useSkills.ts`                                                           | singleton composable: levels + loadout + UI state persistence (`saveDataVersion` re-read), `owned`, `slotsUnlocked`, `equip(slot, id)` (swaps if the skill is in the other slot; honours `excludes`), `unequip`, `upgrade(id)` (coin check → `addCoins(-cost)`), `loadoutForBattle(mode)`, `pendingReveals` queue, `markSeen`, `migrateIfNeeded()` |
| `src/components/atoms/SkillIcon.vue`                                             | inline SVG from `SKILLS[id].icon`; `aria-label` via i18n. Glyphs are authored in the 24×24 solid style of the user-level `game-ui-icon-set` skill (`GLYPH-AUTHORING.md`); its `lock`, `plus` and `heart` glyphs are reused as-is (locked slot, empty slot, Second Wind base)                                                                       |
| `src/components/atoms/SkillHudIcon.vue`                                          | 18/20 px icon + ring/pips/cooldown (CSS only)                                                                                                                                                                                                                                                                                                      |
| `src/components/molecules/SkillSlotTile.vue`                                     | the Team-modal tile (filled / empty / locked)                                                                                                                                                                                                                                                                                                      |
| `src/components/organisms/SkillPickerModal.vue`                                  | §7.3                                                                                                                                                                                                                                                                                                                                               |
| `src/components/organisms/SkillRevealOverlay.vue`                                | §7.4                                                                                                                                                                                                                                                                                                                                               |
| `public/audio/sfx/skill-phase.ogg`, `skill-shield-break.ogg`, `skill-rocket.ogg` | ≤ 12 KB each                                                                                                                                                                                                                                                                                                                                       |
| `tools/skills-sim/`                                                              | already in the repo — the balance simulator (Appendix A); keep `skills.mjs` in step with the catalog for re-tuning                                                                                                                                                                                                                                 |

**Modified**

| file                                              | change                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/use/useSpinnerGame.ts`                       | hook points §10.3; rockets/rings/stun rendering; `skillHud` shallowRef; `initGame` extra options param                                                                                                                                                                                                                                                                                                                                      |
| `src/views/SpinnerArena.vue`                      | `loadoutForBattle(mode)` passed to **every** `initGame` call (PvP and ghost fights also pass the opponent loadout) (≈ 10 campaign / ghost / daily sites — worth folding into one `initCampaignGame()` helper; PvP sites pass nothing); reveal overlay queue after `onRouletteRewardContinue` and on mount (migration); HUD skill row in the stat cards; team-button NEW dot; `isGameplayActive` unaffected (overlay only on `tap_to_start`) |
| `src/components/organisms/SpinnerConfigModal.vue` | SKILLS section (§7.2) + picker wiring                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/components/StageBadge.vue`                   | boss-drop chip (§7.5)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/components/organisms/PvPLobbyModal.vue`      | ready card shows both players' skill icons + levels (§9.1)                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/use/usePVP.ts`                               | `player-ready` carries `skills`; `hostSkills` / `guestSkills` refs; `levelOne` clamps skills to L1                                                                                                                                                                                                                                                                                                                                          |
| `src/use/usePvpStats.ts`                          | `calcHonorPoints` totals add 0.8 × Σ skill levels (§9.1)                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/use/useLeaderboard.ts`                       | `LeaderboardEntry.skills` generated and stored for NPC entries; ghost fights pass it as the enemy loadout                                                                                                                                                                                                                                                                                                                                   |
| `src/use/useDeterministicRng.ts`                  | nothing new if the independent-stream helper `createRng(seed)` is present (it is in the working tree as of this writing, added for the intro cutscene); otherwise add exactly that helper. `useSpinnerGame` keeps `skillRng = createRng(matchSeed ^ 0x9E3779B9)` per match                                                                                                                                                                  |
| `src/keys.ts`                                     | `SKILLS_KEY`, `SKILL_LOADOUT_KEY`, `SKILL_UI_KEY`                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/utils/save/SaveMergePolicy.ts`               | score `+ 150 × Σ (skill level − 1)` (reads `SKILLS_KEY`)                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/use/useUser.ts`                              | `isSkillsEnabled = import.meta.env.VITE_APP_FEATURE_SKILLS !== 'false'`                                                                                                                                                                                                                                                                                                                                                                     |
| `src/use/useCheats.ts`                            | `ctrl+shift+alt+a` toggles a non-persisted `devOwnAllSkills` override in `useSkills` (ownership is normally derived from the stage), `ctrl+shift+alt+y` sets every owned skill to L10 (persisted, like the coin cheat), `ctrl+shift+alt+o` wipes the three skill keys                                                                                                                                                                       |
| `src/use/useCombatLog.ts` / `CombatLog.vue`       | optional `skill?: SkillId` on entries ("Spinner 1 · Lucky Edge · 32")                                                                                                                                                                                                                                                                                                                                                                       |
| `src/use/useAssets.ts`                            | 3 SFX in the deferred tier, requested once the player owns a skill (`isSkillsEnabled`)                                                                                                                                                                                                                                                                                                                                                      |
| `src/i18n/locales/*.ts` (8)                       | `skills.*` keys, Appendix B                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/…`                                         | §10.8                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 10.3 Hook points in `useSpinnerGame.ts` (function names are stable; line numbers ≈ at time of writing)

1. **RNG:** in `initGame`, capture the seed (`const seed = seedMatchRngRandom()` — today the
   return value is dropped) and create `skillRng = createRng(seed ^ 0x9E3779B9)`. All skill
   rolls use `skillRng()`; physics, AI and powerups keep `matchRng`, so turning skills on or
   off never shifts powerup spawns or turn order (the sim uses the same two-stream split).
2. **`initGame` (≈1962):** add a last parameter `opts: { skillLoadout?: SkillLoadout } = {}`
   where `type SkillLoadout = { id: SkillId; level: number }[]` (≤ 2 entries, the team's slots)
   (positional params stay for the ~10 existing call sites). After `playerBlades.value = …`:
   `blade.skills = createBladeSkills(opts.skillLoadout ?? [], blade.maxHp)` for **every** player blade (shield =
   `round(maxHp × shield%)`). Reset: rocket pool, ring pool, popup throttle map,
   `npcTurnIndex = 0`, `skillHud`.
3. **Battle start — `updatePhysics`, the `meteorIntroTimer >= 1600` branch (≈2688):**
   before `phase.value = 'deciding_turn'` call `fireOpeningSalvo()`: if any player blade
   has `opening_salvo`, each living enemy loses `min(pct × maxHp, hp − 1)` via
   `applyBladeDamage(e, d, e.x, e.y, 'player', false, 'salvo')` (existing signature + the new `kind` param of item 9);
   spawn the explosion sprites.
4. **Launch sites** — `releaseDrag` (≈2390), `forceReleaseDragAtMax` (≈2438),
   `releaseJoystickDrag` (≈2495), `executeRemoteLaunch` (≈2538), `launchNpc` (≈2579): route
   the shared lines (`vx = vy = 0 … accelFramesLeft = ACCEL_FRAMES; wallBounceCount = 0`)
   through a new `beginLaunch(blade)` that also sets `blade.skills.stacks = 0`.
5. **`launchNpc`:** increment `npcTurnIndex`; pick from
   `living.filter(b => b.stunnedForTurn !== npcTurnIndex)`; if that list is empty →
   stun-skip: glyph popup over the stunned blades, `passToPlayer()`, same bookkeeping as the
   `npc_launched → player_turn` transition (stat-switch phase back to `'defense'`).
6. **`bounceOffWalls` (≈2974):** after `blade.wallBounceCount++` → `onOwnBounce(blade)`
   (Momentum, only if `launchedBladeId === blade.id`). Lava branch: replace the direct
   `blade.hp = …` with `applyHpLoss(blade, lavaDmg, 'lava')` (the number shown is the
   post-ward, post-shield amount). (No shock branch any more: Hazard Ward's
   `shockKeep` only softens the Frost Lock cold touch, `frostTouchKeep` in bossTraits.ts.)
7. **`bounceOffBouncers` (≈3092):** after the reflect → `onOwnBounce(blade)`.
8. **`resolveCollision` (≈3142)** inside `if (contactArmed)`, after `dmgAtoB`/`dmgBtoA` are
   computed and **before** the anti-draw block — the §5 order; the anti-draw survivability
   check becomes `hp + (skills?.shield ?? 0)`. Fast path: skip everything when
   `!a.skills && !b.skills`. After both `applyBladeDamage` calls: apply reflections,
   then `onEnemyContact(player blade, enemy)` once per armed player↔enemy pair (rocket
   counter; Static Charge only if `launchedBladeId === enemy.id`). Spiky chip block: skip
   chip onto a blade whose `skills.phasedUntil > now`; pass kind `'chip'`.
9. **`applyBladeDamage` (≈1881):** new optional `kind: HpLossKind = 'hit'` param; replace
   `target.hp = Math.max(0, target.hp - dmg)` with `applyHpLoss(target, dmg, kind)` which
   does Hazard Ward → shield → HP → Second Wind and returns the HP actually lost (for the
   popup and the combat log). The ghost-link mirror keeps using the post-skill amount.
   Kills from `rocket`/`reflect`/`salvo` must still run the split-on-death path — extract
   the existing `if (hadKill) { … spawnSplitChildren … }` block into `handleDeaths(…blades)`
   and call it from those sites too.
10. **Thunder aura (≈2830):** `target.hp = …` → `applyHpLoss(target, THUNDER_DAMAGE, 'thunder')`.
11. **After the thunder block:** `tickRockets(16)` — move rockets, apply damage on arrival
    (game time, so it pauses with the loop); skip dead/invulnerable targets.
12. **`clearBattleVfx` (≈1080):** also clear rockets/rings/stun glyphs.
13. **`render` (≈3731):** after the blade loop: `renderSkillRings`, `renderRockets`,
    `renderStunGlyphs`; shield arc inside `renderBlade` after `renderHealthRing`;
    `renderDamageNumbers` learns `glyph` and `isLucky` (crit style without `shadowBlur`).
14. **`computeStateHash`:** add each blade's `shield` and `stunnedForTurn` (PvP desync check, §9.1). In PvP every blade
    uses its own `createRng(seed ^ hash(role, bladeIndex))` stream instead of the shared `skillRng`.

`SkillHudState` events are emitted from 3–11; `SpinnerArena.vue` maps them onto the stat
cards (`bladeStats` stays as is — skills never change displayed ATK/DEF/SPD).

### 10.4 Save keys, cloud sync, merge, reset, migration

| key                     | shape                                                          | notes                                                                                                                                                               |
|-------------------------|----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `smashers_skills`        | `{"v":1,"lv":{"mirror_plate":3,…}}`                            | learned skills only (level ≥ 1); an unlocked-but-unlearned skill has no entry; unknown ids and entries whose skill is not unlocked by the current stage are ignored |
| `smashers_skill_loadout` | `{"v":1,"slots":["phase_step","guard_shell"]}`                 | the team's 2 slots (`null` = empty); sanitized on read: unowned skills, a locked slot 2 and duplicates are dropped (the first entry wins)                           |
| `smashers_skill_ui`      | `{"v":1,"seen":["phase_step"],"teaser":true,"slot2Seen":true}` | which reveals were shown; synced so a second device doesn't replay them                                                                                             |

- All three are `smashers_`-prefixed → part of the cloud payload
  (`SaveMergePolicy.PAYLOAD_PREFIXES`) on every strategy (CrazyGames, Playgama/YouTube,
  GameDistribution, Poki local, Glitch) with no strategy change. Composables write
  `localStorage` only (the SaveManager patches it; Playgama's batching stays inside its
  strategy).
- `useSkills` re-reads all three in a `watch(saveDataVersion, …)` exactly like
  `useSpinnerCampaign` (cloud hydrate can land after module init).
- **Unlocks are derived** from `currentStageId` (§6.2); only learned levels are stored, and
  they are coin purchases, so they sync and merge like part upgrades.
- **Merge score** (`computeMeta`): `+ 150 × Σ levels` over the stored levels — learning and
  each upgrade score exactly like a part upgrade. Update `tests/save/*` expectations.
- **Reset progress** (`useResetProgress.ts`): the three keys are `smashers_` and not in
  `KEEP_KEYS` → wiped; stage resets to 1 → skills unowned. Nothing to add.
- **Migration** (first run of a build with skills, `stage > 10`, no `smashers_skill_ui`):
  unlocks derived, nothing learned, one combined reveal queued (§7.1).
- **Never persist platform/device state** here (quality tier, mute, language stay where
  they are).

### 10.5 i18n

Global messages under `skills` in `src/i18n/locales/{en,de,es,fr,jp,kr,ru,zh}.ts` (English
first, then all seven others — Appendix B has every string). Reused existing keys: `lv`
("Lv."), `spinner.spinnerLabel` ("Spinner {n}"), `stages.stage_N` (boss names),
`tapToContinue` / `clickToContinue`, `spinner.ad`. Interpolation only via `{param}` — never
concatenation; no `|` or `@` in messages (vue-i18n syntax). Use `t()` with global keys (not
`<i18n-t scope="local">`, see the project's scope trap). Canvas shows **no text**.

New keys (42): `skills.title`, `skills.slotEmpty`, `skills.slotAria`, `skills.unlockAt`,
`skills.teaser`, `skills.lockedSkill`, `skills.equip`, `skills.remove`, `skills.equipped`,
`skills.max`, `skills.new`, `skills.now`, `skills.next`, `skills.unlockedTitle`,
`skills.newSkillTitle`, `skills.newSlotTitle`, `skills.bossDrop`, `skills.learn`, `skills.opponentSkills`,
`skills.hint`, `skills.upgradeAria`, `skills.hudAria`, `skills.names.<id>` × 10, `skills.desc.<id>` × 10.

A key-parity test (like `tests/i18nAdKeys.test.ts`) asserts every key is a non-empty string
in all 8 locales and that every `{param}` in English exists in each translation.

### 10.6 Telemetry

- Poki: `pokiMeasure('skills', <id|'reveal'>, 'unlock' | 'equip' | 'upgrade' | 'maxed' |
  'visible' | 'interact')` — imported from `@/utils/pokiPlugin` (stub-swapped on every other
  build, so no SDK leaks). Values contain no `/` or `^`.
- Everywhere: `console.debug('[skills]', …)` behind `isDebug`.
- Combat log (optional): proc entries let QA and curious players verify effects.
- KPIs to watch after launch: stage-10→30 progression time, boss attempts per boss
  10–55 (should drop ~10–25 %), share of players who learn the first skill within 2 stages
  of unlocking it, coins spent on skills vs parts, PvP desync-hash mismatches (must stay 0),
  D7 retention of the stage-10+ cohort.

### 10.7 Flags and tuning knobs

- `VITE_APP_FEATURE_SKILLS` (default on; `'false'` hides every surface and passes empty
  loadouts — a production hot-fix switch, same pattern as `VITE_APP_FEATURE_BG_SKINS`).
- `skillCatalog.ts`: level tables, `SKILL_UPGRADE_COST`, drop stages, teaser/slot stages,
  `SKILL_HIT_MUL_CAP`, `SKILL_POWER_SCALE`, `SKILL_AD_TOPUP`.
- Re-tune loop: edit the catalog → port values to `tools/skills-sim/skills.mjs` → run the
  pair sweep (Appendix A) → the max PI must stay ≤ 1.50 (keep ≥ 3 % headroom).

### 10.8 Test plan

Unit (vitest; run through `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- pnpm test`):

- `skillCatalog`: 10 ids, unique unlock stages 10…55, every parameter non-decreasing with
  level (cooldown non-increasing), cost table sums to 2,650, the closed-form L10 EV sizes of §3.8 (Shell, Phase, Second
  Wind, Lucky, Momentum, Salvo, Static) ≤ 1.225.
- `skillRuntime` with a stub RNG: Lucky Edge never on positional crits; Momentum stacks
  from bounces and hits, resets on `beginLaunch`, capped at 3; Phase negates and opens a
  300 ms window that also blocks Spiky chip, respects cooldown; Mirror halves and reflects
  `½·dmg / max(1, attacker def)`; shield absorbs before HP for every kind; Second Wind
  once, not on overkill; Hazard Ward per kind; Static Charge only vs the launched enemy,
  stun honoured by NPC pick, no two consecutive stuns, all-stunned skips the turn; rocket
  volley split, ghost-linked twins deduped, invulnerable split children skipped; hit
  multiplier clamp 2.2; recursion guard.
- `useSkills`: unlocks from stage, learning costs 150 and refuses when locked or unaffordable, slots 0/1/2, equip into
  the other slot swaps,
  `excludes` honoured when set (test with a stub catalog), upgrade
  deducts coins and stops at 10, persistence round-trip, `saveDataVersion` re-read,
  sanitisation of a corrupt/unlearned loadout, migration learns nothing, `levelOne` clamps to L1.
- PvP determinism: two engine instances with swapped player/npc arrays and the same seed
  produce identical `computeStateHash` sequences with skills on both sides.
- `SaveMergePolicy`: score with/without skills; old save = new save at equal progress.
- i18n parity (§10.5).
- **Regression guard for physics:** with an empty loadout, a seeded match produces the same
  `computeStateHash` sequence as before the change (proves skills are inert when off).

E2E (existing Playwright setup in `tests/e2e`, own browser profile, verify the served
`<title>` before trusting a run):

- Cheat to stage 10 boss → win → roulette → reveal overlay → Learn (150) → Team modal shows
  Mirror Plate in slot 1; HUD icon present on both stat cards in the next battle.
- Team modal at 360×640, 740×360 (landscape), 1024×768: no horizontal scroll, tiles ≥ 44 px.
- PvP (two browser contexts): both loadouts visible on the ready card / VS preview; turn hashes match for a full match
  with skills on both sides.
- Cloud-save builds (`tests/e2e/crazygames-save.test.ts` pattern): equip + upgrade, reload
  → loadout and levels restored after hydrate.

Balance (manual, before each tuning change): `tools/skills-sim` pair sweep, §3 tables.

### 10.9 Performance verification

`perf/ab.mjs` A/B, 4× and 8× CPU throttle, stage 48 (the ledger's reference) with a
`?skills=stress` debug param that equips the heaviest-drawing pair (Guard Shell + Homing
Rockets, then Second Wind + Static Charge in a second run) and forces 100 % proc
chance: **accept** if fps drops ≤ 3 %, frames > 33 ms rise ≤ 2 pp, heap slope unchanged
within noise. Record the row in `PERF-LEDGER.md` (null result welcome). Also run
`perf/quality-check.mjs` to confirm the auto-quality tier still settles identically.

### 10.10 Rollout

1. Ship behind the flag on one portal (CrazyGames) with telemetry; watch §10.6 KPIs for a
   week.
2. Tune with `SKILL_POWER_SCALE` / tables only (no logic changes), re-run the sweep.
3. Enable on Playgama/YouTube, GameDistribution, Poki, native. Poki: single currency is
   unaffected (coins only); verify the Poki build's bundle purity (no new SDK imports).

---

## 11. Backlog

| idea                                                                            | why deferred                                                                                                                   |
|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| **Slow Pulse** (user idea: −50 % speed pulse every 3 s)                         | time-driven in a turn-based game (usually fires between launches); overlaps Static Charge; a 3-s ring is a recurring animation |
| **Zig-Zag** (user idea: direction change every 0.5 s)                           | fights the slingshot aim the player just chose; makes shots unreadable; no clear power                                         |
| **Repulse Bubble** (user idea: push resting spinners away)                      | pushing enemies into lava walls is uncapped damage (2.5 % maxHp per bounce); needs its own hazard budget                       |
| **Softener Ring** (flat −2 per hit)                                             | folded into Hazard Ward's chip reduction; flat values stop mattering past stage ~40                                            |
| **Harden** (33 %: +25 % def for 5 s)                                            | a weaker, less readable Mirror/Phase; time-based buff in a turn-based game                                                     |
| **Vampire Edge** (lifesteal)                                                    | Second Wind covers sustain with one readable event instead of a stream of heal numbers                                         |
| **Armor Break** (ignore X % of enemy defence bonus)                             | strong vs. the tank bosses (def up to 5.4) — first candidate for an 11th skill, bound 1/(1−X)                                  |
| **Trajectory Sight** (aim line shows first ricochet; level = bounces shown)     | pure QoL, no power; needs per-drag raycast drawing; better as a free accessibility option                                      |
| **Third slot** (`new-features.md` said "max 3")                                 | breaks the √1.5 pair argument; would need a per-battle runtime governor                                                        |
| **Elite enemies with skills** (cycle ≥ 2, stage 201+)                           | late-cycle variety; needs the red glyph badge and a counter-tell                                                               |
| **Battle-pass skill rewards** (e.g. "+1 level of your lowest skill" on 3 tiers) | the unlock schedule already paces them; revisit if the sink feels too steep                                                    |
| **Skill evolution at L10** (cosmetic trail/colour)                              | pure cosmetics, good for the long tail after all ten are maxed                                                                 |
| **Rewarded "try a locked skill for one battle"**                                | teaser monetisation; wait for the top-up's numbers first                                                                       |

---

## Appendix A — reproducing the numbers

Everything lives in `tools/skills-sim/` (plain Node ≥ 20 ESM, no dependencies); its
`README.md` has the quick and full runs. `results/` keeps the two headline result files (the
§3.5 pair sweep and its paired confirmation); every other table is regenerated by the full run.

| file                                         | role                                                                                                                                                          |
|----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `data.mjs`                                   | reads part tables, upgrade bonuses, `BASE_STAGES`, trim, `upgradeCost` straight from the TS sources; asserts 26 physics constants against `useSpinnerGame.ts` |
| `engine.mjs`                                 | the headless battle replica + skill runtime (§3.2)                                                                                                            |
| `skills.mjs`                                 | the level tables (identical to §4)                                                                                                                            |
| `econ.mjs`                                   | income model (§6.3)                                                                                                                                           |
| `skillecon.mjs`                              | "when is everything maxed" projection                                                                                                                         |
| `run.mjs`                                    | worker-thread driver (`--set` singles / pairs / custom, `--levels`, `--n`, `--stages`, `--team`, `--levelMode` econ / lock)                                   |
| `report.mjs`                                 | markdown tables (`--mode` pi / off / def / wr, `--L`)                                                                                                         |
| `confirm.mjs`                                | paired high-N confirmation with 95 % CIs (§3.5)                                                                                                               |
| `control.mjs`                                | plain stat-buff control runs (no skills) for the §3.7 corner table: `node control.mjs tank 30 1500`                                                           |
| `mkteams.mjs`, `mkrobust.mjs`                | config lists for §3.6 / §3.7                                                                                                                                  |
| `fill.mjs`, `content.mjs`, `doc_template.md` | regenerate this document from the results (`node fill.mjs` writes a preview; `--write` overwrites `skills-feature.md` and refuses while any input is missing) |

```sh
cd tools/skills-sim
B="$HOME/.claude/skills/worker-budget/budget.mjs"
node "$B" run --want 10 -- node run.mjs --set pairs --levels 10 --n 600 \
  --stages 15,17,30,31,35,49,50,55,77,80,95,99,100 --out results/v7_pairs10.json
node report.mjs results/v7_pairs10.json --L 10
```

Runs used for this doc: {{RUNS}}

## Appendix B — strings for all 8 locales

{{I18N}}

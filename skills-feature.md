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
    - Single skills at L10: **1.02–1.16×** on a median stage, **≤ 1.20×** on the worst.
    - Pairs at L10: **all 45 pairs ≤ 1.5×** for the representative player — worst pair
      **Phase Step + Static Charge = 1.43× on stage 30** (paired high-N re-run: 1.407, 95 % CI 1.373–1.442). Other part
      levels and builds: §3.7.
    - Rejected alternative, 2 slots on *each* spinner (4 skills): specialised teams reach
      **1.65× (Lucky Edge + Opening Salvo ‖ Guard Shell + Second Wind, stage 50)** — hence one shared loadout.
    - A per-hit multiplier clamp and a fixed order of operations (§5) keep multiplicative
      stacking bounded by construction.
- **Performance:** every effect is event-driven (collision / proc / battle start). New
  per-frame work is capped at **≤ 20 extra canvas primitives** in the worst case, all
  pooled, zero per-frame allocation, **no `shadowBlur`**, and every skill has an `FX.low`
  fallback (§8.3).
- **Modes:** ON everywhere — campaign, bosses, leaderboard ghost fights and
  **PvP** (both players' loadouts, exchanged and replayed deterministically, shown in the VS
  preview, §9.1). Campaign and daily AI enemies get **no** skills in v1 (backlog §11).

| #  | skill              | tag | boss drop                 | at L10                                                                              | PI L10 median / worst |
|----|--------------------|-----|---------------------------|-------------------------------------------------------------------------------------|-----------------------|
| 1  | **Mirror Plate**   | DEF | 10 · The Bear Mother      | 16 % chance: take half of an enemy hit, send half ÷ its defence back                | 1.09 / 1.19           |
| 2  | **Phase Step**     | DEF | 15 · The Phantom Twin     | 10 % chance to take 0 from an enemy hit (+300 ms phase), 2.5 s cooldown             | 1.11 / 1.18           |
| 3  | **Guard Shell**    | DEF | 20 · The Iron Brotherhood | battle-start shield = 16 % of max HP                                                | 1.15 / 1.20           |
| 4  | **Second Wind**    | SUS | 25 · The Mending Choir    | once per battle at ≤ 35 % HP: heal 18 % of max HP                                   | 1.16 / 1.20           |
| 5  | **Lucky Edge**     | OFF | 30 · Chaos Incarnate      | 13 % of non-crit hits deal ×2.0                                                     | 1.08 / 1.13           |
| 6  | **Homing Rockets** | OFF | 35 · The Ravenous Swarm   | every 5 enemy contacts: rockets for 17 % of a reference hit, split over ≤ 3 enemies | 1.08 / 1.20           |
| 7  | **Opening Salvo**  | OFF | 40 · The Dragon Specter   | battle start: every enemy loses 14 % of max HP (non-lethal)                         | 1.13 / 1.16           |
| 8  | **Momentum**       | OFF | 45 · The Unbroken Trio    | in own launch: +7.5 % hit damage per wall/bouncer rebound or hit, max 3 stacks      | 1.04 / 1.08           |
| 9  | **Hazard Ward**    | UTL | 50 · The Eternal Grove    | lava/thunder aura −40 %, Spiky chip −15 %, keeps 19 % speed on shock (vs 10 %)      | 1.04 / 1.09           |
| 10 | **Static Charge**  | CTL | 55 · The Dread Scorpion   | 18 % chance: an enemy ramming you stops and skips its next turn                     | 1.02 / 1.16           |

**Decisions (confirmed by the user, 2026-09-27):**

1. **2 slots shared by the team (both spinners carry the loadout).** The per-spinner
   alternative (2 slots on each spinner, 4 different skills) reaches **1.65× (Lucky Edge + Opening Salvo ‖ Guard Shell +
   Second Wind, stage 50)**, over
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
multiply across spinners (up to 1.65× (Lucky Edge + Opening Salvo ‖ Guard Shell + Second Wind, stage 50)). A single
2-slot loadout carried by both spinners
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
  `dmg = closingSpeed · atkMul · (crit ? 1.25 : 1) · wA / (wB · defMul) · DAMAGE_SCALE(1.4) · speedAdv` (the thunder-arena combo factor was retired with that arena).
  `defMul` is ignored on positional crits; Piercer keeps only 25 % of the defender's
  defence bonus, Star 75 %; Star also has a hidden 8 % lucky crit. (`damage-calculation-physics.md`
  predates two changes — closing speed instead of raw speed, and `DAMAGE_SCALE` 1 → 1.4;
  the code is the source used here.)
- **HP scale.** `maxHp = 20 + top.healthBonus + bottom.healthBonus + levels·bonus`
  (`computeStats`), ×2 for bosses (`createBladeState`). Example at stage 16, a typical
  player (level 6, see §3.2): Star/Balanced has **48 HP**, a clean hit on the Quad/Tanky
  enemy (82 HP) does **~29**. Fights are short and swingy: most regular stages end in
  3–25 turns.
- **Hazards.** Lava wall: `ceil(2.5 % maxHp)` per bounce; forest wall: +1 HP; thunder boss aura: 1 HP/s in range;
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
  Spiky chip, lava/forest/shock/thunder-aura hazards, powerups (stage ≥ 2), turn-order
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
  15 (ghost boss), 17 (lava, 3 enemies), 30 (life-leech boss), 31 (shock), 35 (split
  boss), 49 (forest, 3), 50 (4 healers), 55 (child-emitter), 77 (lava), 80 (stat-switch
  boss), 95 (partners + thunder boss), 99 (lava arena, 4 enemies), 100 (4 healers).
- **Noise control:** common random numbers (identical seeds per stage across all configs;
  skill procs draw from a **separate** RNG stream so they don't shift physics/AI rolls),
  alternating first turn. "worst+2SE" columns use a deliberately conservative standard
  error that ignores the (positive) seed correlation between baseline and skill runs; the
  worst pairs are then re-measured with a paired estimator (§3.5).

### 3.3 Baseline (no skills)

| stage                 | enemies (top/bottom tl/bl)                                                                     | player lvl (econ / lockstep) | win rate | turns | TTK₀ | TTD₀ |
|-----------------------|------------------------------------------------------------------------------------------------|------------------------------|----------|-------|------|------|
| 15 boss:ghost         | triangle/speedy 8/10                                                                           | 6 / 4                        | 58%      | 2.8   | 2.4  | 3.6  |
| 17 lava               | star/speedy 5/5, triangle/balanced 5/4, round/tanky 4/5                                        | 7 / 5                        | 53%      | 9.2   | 9.2  | 8.3  |
| 30 boss:life-leech    | triangle/speedy 19/21                                                                          | 12 / 9                       | 10%      | 4.4   | 5.8  | 4.6  |
| 31 shock              | triangle/speedy 12/9, quadratic/tanky 9/9                                                      | 12 / 10                      | 88%      | 18.6  | 14.8 | 20.2 |
| 35 boss:split         | triangle/tanky 15/10                                                                           | 13 / 10                      | 0%       | 8.0   | 17.1 | 8.0  |
| 49 forest             | cushioned/balanced 14/14, triangle/speedy 14/13, round/tanky 13/14                             | 18 / 14                      | 44%      | 20.9  | 15.1 | 14.9 |
| 50 boss:healers       | cushioned/balanced 14/14, round/balanced 14/11, cushioned/speedy 14/12, quadratic/speedy 16/11 | 18 / 14                      | 0%       | 28.6  | 32.9 | 29.9 |
| 55 boss:child-emitter | round/tanky 25/30                                                                              | 19 / 15                      | 0%       | 20.2  | 57.5 | 17.1 |
| 77 lava               | star/speedy 21/21, piercer/speedy 20/21                                                        | 24 / 21                      | 93%      | 2.2   | 2.0  | 4.2  |
| 80 boss:stat-switch   | cushioned/tanky 36/32                                                                          | 25 / 22                      | 0%       | 9.1   | 39.9 | 9.1  |
| 95 boss:partners      | cushioned/tanky 28/28, round/tanky 28/28, triangle/tanky 27/27, quadratic/balanced 28/23       | 28 / 26                      | 0%       | 21.9  | 74.2 | 22.9 |
| 99 thunder            | star/speedy 28/28, triangle/speedy 28/27, quadratic/tanky 27/28, cushioned/balanced 27/27      | 29 / 26                      | 30%      | 14.1  | 12.5 | 10.7 |
| 100 boss:healers      | cushioned/balanced 29/32, cushioned/tanky 28/33, round/balanced 33/30, quadratic/speedy 29/32  | 29 / 25                      | 0%       | 26.4  | 60.7 | 26.4 |

N = 400 battles per stage and mode.

Reading: bosses at 50/80/95/100 are unwinnable for the AI policy without the rubber band
(real players also pick Piercer, bank shots and over-level) — the TTK/TTD ratios are still
well defined there, which is why the metric uses them instead of win rate.

### 3.4 Single skills — PI at L1 / L5 / L10

Stage columns are the PI at **L10**; the first two columns give the worst stage at L1 and L5.
Sorted by the L10 worst stage.

| skill          | L1 worst | L5 worst | S15  | S17  | S30  | S31  | S35  | S49  | S50  | S55  | S77  | S80  | S95  | S99  | S100 | **L10 median** | **L10 worst** | worst+2SE |
|----------------|----------|----------|------|------|------|------|------|------|------|------|------|------|------|------|------|----------------|---------------|-----------|
| Second Wind    | 1.08     | 1.14     | 1.20 | 1.16 | 1.14 | 1.15 | 1.17 | 1.17 | 1.18 | 1.16 | 1.12 | 1.14 | 1.18 | 1.16 | 1.20 | **1.16**       | **1.20**      | 1.26      |
| Homing Rockets | 1.09     | 1.12     | 1.04 | 1.08 | 1.20 | 1.12 | 1.11 | 1.07 | 1.09 | 1.02 | 1.01 | 1.06 | 1.10 | 1.07 | 1.08 | **1.08**       | **1.20**      | 1.28      |
| Guard Shell    | 1.07     | 1.13     | 1.19 | 1.15 | 1.11 | 1.14 | 1.15 | 1.14 | 1.17 | 1.15 | 1.11 | 1.13 | 1.17 | 1.13 | 1.20 | **1.15**       | **1.20**      | 1.26      |
| Mirror Plate   | 1.06     | 1.12     | 1.12 | 1.08 | 1.19 | 1.07 | 1.10 | 1.06 | 1.10 | 1.08 | 1.07 | 1.13 | 1.09 | 1.07 | 1.09 | **1.09**       | **1.19**      | 1.27      |
| Phase Step     | 1.07     | 1.11     | 1.16 | 1.08 | 1.18 | 1.09 | 1.11 | 1.11 | 1.14 | 1.10 | 1.08 | 1.13 | 1.12 | 1.11 | 1.14 | **1.11**       | **1.18**      | 1.27      |
| Static Charge  | 1.10     | 1.12     | 1.02 | 1.06 | 1.16 | 0.94 | 1.11 | 1.00 | 1.02 | 1.02 | 1.01 | 1.11 | 1.02 | 0.98 | 1.01 | **1.02**       | **1.16**      | 1.25      |
| Opening Salvo  | 1.06     | 1.11     | 1.11 | 1.15 | 1.10 | 1.13 | 1.12 | 1.13 | 1.11 | 1.15 | 1.07 | 1.16 | 1.16 | 1.16 | 1.14 | **1.13**       | **1.16**      | 1.22      |
| Lucky Edge     | 1.04     | 1.08     | 1.08 | 1.08 | 1.13 | 1.08 | 1.08 | 1.10 | 1.11 | 1.09 | 1.03 | 1.08 | 1.10 | 1.08 | 1.11 | **1.08**       | **1.13**      | 1.21      |
| Hazard Ward    | 1.03     | 1.05     | 1.04 | 1.08 | 1.04 | 1.06 | 1.05 | 1.06 | 1.00 | 1.00 | 1.04 | 1.00 | 1.09 | 1.02 | 1.00 | **1.04**       | **1.09**      | 1.15      |
| Momentum       | 1.03     | 1.05     | 1.01 | 1.03 | 1.02 | 1.04 | 1.03 | 1.04 | 1.05 | 1.08 | 1.02 | 1.06 | 1.08 | 1.05 | 1.08 | **1.04**       | **1.08**      | 1.13      |

Level curve check (median over stages):

| skill          | L1   | L5   | L10  | L10 OFF × DEF (median) |
|----------------|------|------|------|------------------------|
| Guard Shell    | 1.05 | 1.09 | 1.15 | 1.00 × 1.15            |
| Phase Step     | 1.04 | 1.07 | 1.11 | 1.00 × 1.11            |
| Mirror Plate   | 1.03 | 1.05 | 1.09 | 1.03 × 1.06            |
| Second Wind    | 1.06 | 1.11 | 1.16 | 1.00 × 1.16            |
| Lucky Edge     | 1.03 | 1.05 | 1.08 | 1.08 × 1.00            |
| Momentum       | 1.01 | 1.03 | 1.04 | 1.04 × 1.00            |
| Homing Rockets | 1.04 | 1.05 | 1.08 | 1.08 × 1.00            |
| Opening Salvo  | 1.04 | 1.08 | 1.13 | 1.13 × 1.00            |
| Static Charge  | 1.01 | 1.01 | 1.02 | 0.98 × 1.04            |
| Hazard Ward    | 1.01 | 1.02 | 1.04 | 1.00 × 1.04            |

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

| #  | pair (both spinners)           | S15  | S17  | S30  | S31  | S35  | S49  | S50  | S55  | S77  | S80  | S95  | S99  | S100 | median | **worst**       | worst+2SE |
|----|--------------------------------|------|------|------|------|------|------|------|------|------|------|------|------|------|--------|-----------------|-----------|
| 1  | Phase Step + Static Charge     | 1.15 | 1.09 | 1.43 | 1.05 | 1.23 | 1.12 | 1.13 | 1.13 | 1.09 | 1.19 | 1.14 | 1.11 | 1.12 | 1.13   | **1.43** (S30)  | 1.52      |
| 2  | Homing Rockets + Static Charge | 1.05 | 1.09 | 1.40 | 1.08 | 1.23 | 1.09 | 1.10 | 1.06 | 1.01 | 1.16 | 1.11 | 1.03 | 1.09 | 1.09   | **1.40** (S30)  | 1.49      |
| 3  | Guard Shell + Second Wind      | 1.40 | 1.28 | 1.24 | 1.29 | 1.33 | 1.33 | 1.35 | 1.32 | 1.23 | 1.30 | 1.35 | 1.27 | 1.33 | 1.32   | **1.40** (S15)  | 1.49      |
| 4  | Second Wind + Opening Salvo    | 1.35 | 1.32 | 1.25 | 1.31 | 1.30 | 1.33 | 1.31 | 1.33 | 1.19 | 1.32 | 1.40 | 1.33 | 1.36 | 1.32   | **1.40** (S95)  | 1.45      |
| 5  | Mirror Plate + Static Charge   | 1.15 | 1.10 | 1.39 | 1.03 | 1.22 | 1.08 | 1.10 | 1.08 | 1.07 | 1.21 | 1.09 | 1.06 | 1.10 | 1.10   | **1.39** (S30)  | 1.48      |
| 6  | Phase Step + Mirror Plate      | 1.26 | 1.15 | 1.39 | 1.17 | 1.21 | 1.19 | 1.22 | 1.21 | 1.13 | 1.23 | 1.19 | 1.20 | 1.22 | 1.21   | **1.39** (S30)  | 1.48      |
| 7  | Phase Step + Second Wind       | 1.39 | 1.25 | 1.35 | 1.25 | 1.30 | 1.31 | 1.32 | 1.28 | 1.21 | 1.28 | 1.33 | 1.28 | 1.32 | 1.30   | **1.39** (S15)  | 1.48      |
| 8  | Phase Step + Homing Rockets    | 1.20 | 1.16 | 1.38 | 1.23 | 1.24 | 1.18 | 1.22 | 1.13 | 1.08 | 1.19 | 1.23 | 1.18 | 1.24 | 1.20   | **1.38** (S30)  | 1.47      |
| 9  | Guard Shell + Phase Step       | 1.38 | 1.24 | 1.32 | 1.24 | 1.28 | 1.28 | 1.29 | 1.26 | 1.20 | 1.27 | 1.30 | 1.26 | 1.30 | 1.28   | **1.38** (S15)  | 1.47      |
| 10 | Lucky Edge + Static Charge     | 1.11 | 1.08 | 1.37 | 1.05 | 1.22 | 1.10 | 1.11 | 1.10 | 1.04 | 1.16 | 1.11 | 1.06 | 1.10 | 1.10   | **1.37** (S30)  | 1.45      |
| 11 | Mirror Plate + Homing Rockets  | 1.16 | 1.14 | 1.37 | 1.20 | 1.21 | 1.13 | 1.19 | 1.12 | 1.06 | 1.19 | 1.20 | 1.13 | 1.19 | 1.19   | **1.37** (S30)  | 1.45      |
| 12 | Second Wind + Homing Rockets   | 1.26 | 1.24 | 1.36 | 1.30 | 1.30 | 1.25 | 1.28 | 1.21 | 1.13 | 1.21 | 1.32 | 1.22 | 1.30 | 1.26   | **1.36** (S30)  | 1.44      |
| 13 | Guard Shell + Opening Salvo    | 1.35 | 1.31 | 1.21 | 1.29 | 1.28 | 1.30 | 1.29 | 1.31 | 1.18 | 1.31 | 1.36 | 1.30 | 1.35 | 1.30   | **1.36** (S95)  | 1.42      |
| 14 | Mirror Plate + Second Wind     | 1.34 | 1.25 | 1.35 | 1.24 | 1.29 | 1.27 | 1.29 | 1.27 | 1.20 | 1.28 | 1.29 | 1.23 | 1.28 | 1.28   | **1.35** (S30)  | 1.43      |
| 15 | Second Wind + Static Charge    | 1.25 | 1.20 | 1.35 | 1.11 | 1.32 | 1.18 | 1.19 | 1.18 | 1.12 | 1.24 | 1.20 | 1.12 | 1.22 | 1.20   | **1.35** (S30)  | 1.43      |
| 16 | Lucky Edge + Homing Rockets    | 1.12 | 1.13 | 1.33 | 1.22 | 1.18 | 1.17 | 1.18 | 1.13 | 1.03 | 1.15 | 1.19 | 1.14 | 1.19 | 1.17   | **1.33** (S30)  | 1.41      |
| 17 | Mirror Plate + Lucky Edge      | 1.20 | 1.14 | 1.33 | 1.16 | 1.19 | 1.17 | 1.20 | 1.18 | 1.09 | 1.21 | 1.19 | 1.16 | 1.21 | 1.19   | **1.33** (S30)  | 1.41      |
| 18 | Guard Shell + Homing Rockets   | 1.26 | 1.23 | 1.33 | 1.28 | 1.28 | 1.22 | 1.26 | 1.19 | 1.12 | 1.20 | 1.29 | 1.19 | 1.29 | 1.26   | **1.33** (S30)  | 1.41      |
| 19 | Guard Shell + Mirror Plate     | 1.33 | 1.23 | 1.32 | 1.22 | 1.27 | 1.23 | 1.26 | 1.25 | 1.19 | 1.26 | 1.26 | 1.21 | 1.25 | 1.25   | **1.33** (S15)  | 1.41      |
| 20 | Guard Shell + Static Charge    | 1.24 | 1.18 | 1.32 | 1.08 | 1.31 | 1.14 | 1.17 | 1.16 | 1.12 | 1.23 | 1.16 | 1.10 | 1.19 | 1.17   | **1.32** (S30)  | 1.40      |
| 21 | Second Wind + Lucky Edge       | 1.31 | 1.24 | 1.28 | 1.25 | 1.27 | 1.29 | 1.31 | 1.26 | 1.15 | 1.24 | 1.31 | 1.25 | 1.32 | 1.27   | **1.32** (S100) | 1.37      |
| 22 | Phase Step + Lucky Edge        | 1.23 | 1.14 | 1.32 | 1.18 | 1.20 | 1.20 | 1.21 | 1.20 | 1.11 | 1.18 | 1.20 | 1.22 | 1.25 | 1.20   | **1.32** (S30)  | 1.40      |
| 23 | Guard Shell + Lucky Edge       | 1.30 | 1.22 | 1.25 | 1.23 | 1.24 | 1.26 | 1.29 | 1.24 | 1.14 | 1.22 | 1.28 | 1.22 | 1.32 | 1.24   | **1.32** (S100) | 1.37      |
| 24 | Homing Rockets + Opening Salvo | 1.16 | 1.21 | 1.32 | 1.29 | 1.23 | 1.22 | 1.22 | 1.19 | 1.07 | 1.23 | 1.27 | 1.21 | 1.23 | 1.22   | **1.32** (S30)  | 1.39      |
| 25 | Mirror Plate + Opening Salvo   | 1.26 | 1.22 | 1.30 | 1.22 | 1.23 | 1.20 | 1.23 | 1.24 | 1.11 | 1.31 | 1.25 | 1.23 | 1.24 | 1.23   | **1.31** (S80)  | 1.37      |
| 26 | Phase Step + Opening Salvo     | 1.29 | 1.23 | 1.31 | 1.24 | 1.24 | 1.26 | 1.26 | 1.25 | 1.14 | 1.30 | 1.30 | 1.28 | 1.30 | 1.26   | **1.31** (S30)  | 1.39      |
| 27 | Opening Salvo + Static Charge  | 1.13 | 1.16 | 1.31 | 1.12 | 1.25 | 1.15 | 1.13 | 1.16 | 1.05 | 1.26 | 1.18 | 1.12 | 1.15 | 1.15   | **1.31** (S30)  | 1.39      |
| 28 | Second Wind + Momentum         | 1.23 | 1.20 | 1.17 | 1.19 | 1.21 | 1.22 | 1.23 | 1.25 | 1.13 | 1.21 | 1.30 | 1.21 | 1.28 | 1.21   | **1.30** (S95)  | 1.35      |
| 29 | Opening Salvo + Hazard Ward    | 1.16 | 1.24 | 1.13 | 1.28 | 1.17 | 1.20 | 1.11 | 1.15 | 1.11 | 1.16 | 1.26 | 1.17 | 1.14 | 1.16   | **1.28** (S31)  | 1.34      |
| 30 | Guard Shell + Momentum         | 1.22 | 1.18 | 1.14 | 1.17 | 1.19 | 1.20 | 1.21 | 1.23 | 1.12 | 1.19 | 1.27 | 1.18 | 1.28 | 1.19   | **1.28** (S100) | 1.33      |
| 31 | Lucky Edge + Opening Salvo     | 1.21 | 1.22 | 1.23 | 1.24 | 1.20 | 1.23 | 1.24 | 1.24 | 1.09 | 1.26 | 1.27 | 1.24 | 1.24 | 1.24   | **1.27** (S95)  | 1.32      |
| 32 | Second Wind + Hazard Ward      | 1.27 | 1.26 | 1.17 | 1.25 | 1.22 | 1.24 | 1.18 | 1.16 | 1.18 | 1.14 | 1.27 | 1.17 | 1.19 | 1.19   | **1.27** (S95)  | 1.32      |
| 33 | Guard Shell + Hazard Ward      | 1.26 | 1.23 | 1.15 | 1.23 | 1.20 | 1.21 | 1.16 | 1.14 | 1.17 | 1.13 | 1.24 | 1.15 | 1.19 | 1.19   | **1.26** (S15)  | 1.34      |
| 34 | Momentum + Opening Salvo       | 1.13 | 1.18 | 1.13 | 1.17 | 1.15 | 1.19 | 1.18 | 1.24 | 1.08 | 1.23 | 1.23 | 1.22 | 1.23 | 1.18   | **1.24** (S55)  | 1.29      |
| 35 | Homing Rockets + Hazard Ward   | 1.08 | 1.16 | 1.23 | 1.23 | 1.16 | 1.13 | 1.08 | 1.04 | 1.05 | 1.06 | 1.19 | 1.07 | 1.09 | 1.09   | **1.23** (S30)  | 1.31      |
| 36 | Momentum + Homing Rockets      | 1.05 | 1.11 | 1.23 | 1.16 | 1.15 | 1.12 | 1.13 | 1.12 | 1.02 | 1.12 | 1.16 | 1.11 | 1.15 | 1.12   | **1.23** (S30)  | 1.30      |
| 37 | Static Charge + Hazard Ward    | 1.06 | 1.12 | 1.23 | 1.07 | 1.18 | 1.05 | 1.01 | 1.02 | 1.05 | 1.09 | 1.09 | 0.99 | 1.02 | 1.06   | **1.23** (S30)  | 1.30      |
| 38 | Mirror Plate + Momentum        | 1.13 | 1.11 | 1.22 | 1.10 | 1.14 | 1.10 | 1.16 | 1.16 | 1.06 | 1.19 | 1.17 | 1.13 | 1.17 | 1.14   | **1.22** (S30)  | 1.29      |
| 39 | Phase Step + Momentum          | 1.17 | 1.12 | 1.21 | 1.13 | 1.15 | 1.16 | 1.18 | 1.17 | 1.08 | 1.19 | 1.21 | 1.17 | 1.22 | 1.17   | **1.22** (S100) | 1.27      |
| 40 | Mirror Plate + Hazard Ward     | 1.17 | 1.18 | 1.22 | 1.17 | 1.15 | 1.12 | 1.10 | 1.08 | 1.12 | 1.13 | 1.14 | 1.09 | 1.09 | 1.13   | **1.22** (S30)  | 1.29      |
| 41 | Phase Step + Hazard Ward       | 1.21 | 1.18 | 1.22 | 1.18 | 1.16 | 1.16 | 1.13 | 1.09 | 1.14 | 1.12 | 1.20 | 1.13 | 1.14 | 1.16   | **1.22** (S30)  | 1.29      |
| 42 | Momentum + Static Charge       | 1.03 | 1.06 | 1.22 | 0.99 | 1.16 | 1.06 | 1.07 | 1.10 | 1.01 | 1.16 | 1.08 | 1.02 | 1.08 | 1.07   | **1.22** (S30)  | 1.29      |
| 43 | Lucky Edge + Hazard Ward       | 1.12 | 1.16 | 1.16 | 1.19 | 1.13 | 1.16 | 1.11 | 1.09 | 1.07 | 1.09 | 1.18 | 1.10 | 1.11 | 1.12   | **1.19** (S31)  | 1.25      |
| 44 | Lucky Edge + Momentum          | 1.09 | 1.10 | 1.14 | 1.12 | 1.11 | 1.14 | 1.15 | 1.16 | 1.04 | 1.15 | 1.16 | 1.13 | 1.18 | 1.14   | **1.18** (S100) | 1.22      |
| 45 | Momentum + Hazard Ward         | 1.05 | 1.12 | 1.05 | 1.13 | 1.08 | 1.10 | 1.04 | 1.07 | 1.06 | 1.06 | 1.17 | 1.07 | 1.07 | 1.07   | **1.17** (S95)  | 1.22      |

N = 600 battles per stage, pair and mode (13 stages × 45 pairs × 3 modes).

L1 / L5 pairs (N = 200, stages 15, 30, 35, 50, 77, 80, 99):

**L1:** worst pair Phase Step + Homing Rockets = **1.16**; median over all 45 pairs' worst stages = 1.10.

**L5:** worst pair Homing Rockets + Static Charge = **1.25**; median over all 45 pairs' worst stages = 1.19.

**Paired high-N confirmation** of every pair whose worst stage reached ≥ 1.35, on the stages
where pairs peak (15, 30, 95); then, on stage 30, the top pairs of the glass-cannon and tank
builds from §3.7 (the tank rows are the heal-race corner discussed there). Base and pair run on the same seed; the 95 %
confidence
interval comes from the paired influence function, so it is much tighter than the
conservative "+2SE" column above:

| stage              | team    | pair (both spinners, L10)      | N seeds | OFF  | DEF  | **PI**    | 95 % CI       |
|--------------------|---------|--------------------------------|---------|------|------|-----------|---------------|
| 30 boss:life-leech | default | Phase Step + Static Charge     | 2000    | 0.95 | 1.48 | **1.407** | 1.373 – 1.442 |
| 30 boss:life-leech | default | Homing Rockets + Static Charge | 2000    | 1.05 | 1.33 | **1.397** | 1.366 – 1.428 |
| 30 boss:life-leech | default | Mirror Plate + Static Charge   | 2000    | 0.99 | 1.39 | **1.379** | 1.347 – 1.412 |
| 15 boss:ghost      | default | Guard Shell + Second Wind      | 2000    | 1.00 | 1.38 | **1.377** | 1.358 – 1.396 |
| 15 boss:ghost      | default | Phase Step + Second Wind       | 2000    | 1.00 | 1.37 | **1.373** | 1.353 – 1.393 |
| 95 boss:partners   | default | Second Wind + Opening Salvo    | 2000    | 1.17 | 1.17 | **1.365** | 1.341 – 1.389 |
| 15 boss:ghost      | default | Guard Shell + Phase Step       | 2000    | 1.00 | 1.36 | **1.361** | 1.341 – 1.382 |
| 30 boss:life-leech | default | Phase Step + Homing Rockets    | 2000    | 1.24 | 1.09 | **1.359** | 1.339 – 1.378 |
| 30 boss:life-leech | default | Phase Step + Mirror Plate      | 2000    | 1.19 | 1.13 | **1.352** | 1.331 – 1.374 |
| 30 boss:life-leech | default | Lucky Edge + Static Charge     | 2000    | 1.01 | 1.33 | **1.339** | 1.308 – 1.370 |
| 95 boss:partners   | default | Guard Shell + Opening Salvo    | 2000    | 1.17 | 1.15 | **1.344** | 1.320 – 1.367 |
| 30 boss:life-leech | default | Mirror Plate + Homing Rockets  | 2000    | 1.29 | 1.04 | **1.341** | 1.323 – 1.359 |
| 15 boss:ghost      | default | Mirror Plate + Second Wind     | 2000    | 1.05 | 1.28 | **1.337** | 1.317 – 1.357 |
| 30 boss:life-leech | default | Mirror Plate + Second Wind     | 2000    | 1.13 | 1.17 | **1.333** | 1.313 – 1.353 |
| 30 boss:life-leech | default | Second Wind + Homing Rockets   | 2000    | 1.19 | 1.12 | **1.329** | 1.311 – 1.347 |
| 30 boss:life-leech | default | Phase Step + Second Wind       | 2000    | 1.07 | 1.23 | **1.324** | 1.305 – 1.344 |
| 15 boss:ghost      | default | Guard Shell + Opening Salvo    | 2000    | 1.11 | 1.19 | **1.323** | 1.303 – 1.343 |
| 15 boss:ghost      | default | Second Wind + Opening Salvo    | 2000    | 1.11 | 1.19 | **1.322** | 1.303 – 1.341 |
| 95 boss:partners   | default | Guard Shell + Second Wind      | 2000    | 1.00 | 1.32 | **1.321** | 1.302 – 1.341 |
| 30 boss:life-leech | default | Guard Shell + Phase Step       | 2000    | 1.07 | 1.21 | **1.303** | 1.283 – 1.324 |
| 30 boss:life-leech | glass   | Phase Step + Mirror Plate      | 2000    | 1.27 | 1.12 | **1.431** | 1.404 – 1.459 |
| 30 boss:life-leech | glass   | Mirror Plate + Lucky Edge      | 2000    | 1.33 | 1.05 | **1.394** | 1.369 – 1.418 |
| 30 boss:life-leech | glass   | Mirror Plate + Homing Rockets  | 2000    | 1.32 | 1.04 | **1.370** | 1.348 – 1.392 |
| 30 boss:life-leech | glass   | Guard Shell + Mirror Plate     | 2000    | 1.19 | 1.13 | **1.347** | 1.321 – 1.373 |
| 30 boss:life-leech | tank    | Phase Step + Lucky Edge        | 2000    | 1.41 | 1.10 | **1.546** | 1.476 – 1.620 |
| 30 boss:life-leech | tank    | Phase Step + Static Charge     | 2000    | 0.97 | 1.58 | **1.533** | 1.455 – 1.615 |
| 30 boss:life-leech | tank    | Lucky Edge + Static Charge     | 2000    | 1.07 | 1.43 | **1.530** | 1.455 – 1.609 |
| 30 boss:life-leech | tank    | Second Wind + Lucky Edge       | 2000    | 1.31 | 1.16 | **1.512** | 1.445 – 1.583 |
| 30 boss:life-leech | tank    | Mirror Plate + Static Charge   | 2000    | 1.01 | 1.49 | **1.499** | 1.422 – 1.580 |

Default-team rows below 1.30 omitted (22 more).

### 3.6 Why not 2 slots *per spinner* (4 different skills)

The rejected alternative, measured the same way: each spinner gets its own L10 pair, no
skill repeats (Spinner 1 = Star/Balanced, Spinner 2 = Round/Balanced). Eight loadouts are
built from the strongest pairs of §3.5, ten are deliberately specialised (an offensive pair on
one spinner, a defensive pair on the other, both ways round):

| Spinner 1 ‖ Spinner 2                                          | S15  | S17  | S30  | S31  | S35  | S49  | S50  | S55  | S77  | S80  | S95  | S99  | S100 | median | **worst**       |
|----------------------------------------------------------------|------|------|------|------|------|------|------|------|------|------|------|------|------|--------|-----------------|
| Lucky Edge + Opening Salvo  ‖  Guard Shell + Second Wind       | 1.53 | 1.53 | 1.44 | 1.49 | 1.52 | 1.57 | 1.65 | 1.58 | 1.28 | 1.56 | 1.63 | 1.53 | 1.65 | 1.53   | **1.65** (S50)  |
| Lucky Edge + Opening Salvo  ‖  Second Wind + Static Charge     | 1.39 | 1.41 | 1.61 | 1.32 | 1.46 | 1.45 | 1.44 | 1.47 | 1.19 | 1.49 | 1.43 | 1.38 | 1.49 | 1.44   | **1.61** (S30)  |
| Homing Rockets + Opening Salvo  ‖  Guard Shell + Second Wind   | 1.48 | 1.52 | 1.55 | 1.53 | 1.53 | 1.56 | 1.60 | 1.55 | 1.26 | 1.52 | 1.60 | 1.52 | 1.58 | 1.53   | **1.60** (S50)  |
| Homing Rockets + Opening Salvo  ‖  Phase Step + Second Wind    | 1.47 | 1.46 | 1.58 | 1.49 | 1.48 | 1.53 | 1.57 | 1.52 | 1.24 | 1.49 | 1.55 | 1.51 | 1.58 | 1.51   | **1.58** (S30)  |
| Opening Salvo + Homing Rockets  ‖  Guard Shell + Phase Step    | 1.45 | 1.45 | 1.56 | 1.47 | 1.46 | 1.50 | 1.55 | 1.50 | 1.23 | 1.48 | 1.53 | 1.49 | 1.55 | 1.49   | **1.56** (S30)  |
| Lucky Edge + Homing Rockets  ‖  Guard Shell + Second Wind      | 1.41 | 1.40 | 1.52 | 1.42 | 1.48 | 1.45 | 1.54 | 1.47 | 1.19 | 1.40 | 1.51 | 1.39 | 1.51 | 1.45   | **1.54** (S50)  |
| Lucky Edge + Opening Salvo  ‖  Phase Step + Mirror Plate       | 1.36 | 1.36 | 1.44 | 1.32 | 1.36 | 1.41 | 1.44 | 1.50 | 1.17 | 1.44 | 1.43 | 1.42 | 1.49 | 1.42   | **1.50** (S55)  |
| Lucky Edge + Homing Rockets  ‖  Phase Step + Mirror Plate      | 1.26 | 1.25 | 1.49 | 1.29 | 1.32 | 1.31 | 1.37 | 1.32 | 1.10 | 1.29 | 1.33 | 1.26 | 1.39 | 1.31   | **1.49** (S30)  |
| Homing Rockets + Static Charge  ‖  Second Wind + Opening Salvo | 1.32 | 1.39 | 1.44 | 1.38 | 1.41 | 1.41 | 1.42 | 1.40 | 1.16 | 1.39 | 1.38 | 1.34 | 1.43 | 1.39   | **1.44** (S30)  |
| Homing Rockets + Static Charge  ‖  Phase Step + Second Wind    | 1.34 | 1.33 | 1.40 | 1.28 | 1.38 | 1.35 | 1.38 | 1.33 | 1.17 | 1.28 | 1.36 | 1.27 | 1.41 | 1.34   | **1.41** (S100) |
| Homing Rockets + Static Charge  ‖  Phase Step + Mirror Plate   | 1.20 | 1.22 | 1.38 | 1.19 | 1.26 | 1.23 | 1.26 | 1.19 | 1.10 | 1.20 | 1.24 | 1.21 | 1.29 | 1.22   | **1.38** (S30)  |
| Guard Shell + Second Wind  ‖  Mirror Plate + Static Charge     | 1.19 | 1.10 | 1.31 | 1.08 | 1.24 | 1.11 | 1.10 | 1.07 | 1.13 | 1.19 | 1.14 | 1.07 | 1.11 | 1.11   | **1.31** (S30)  |
| Guard Shell + Second Wind  ‖  Lucky Edge + Opening Salvo       | 1.26 | 1.22 | 1.15 | 1.22 | 1.19 | 1.23 | 1.15 | 1.16 | 1.14 | 1.24 | 1.25 | 1.21 | 1.19 | 1.21   | **1.26** (S15)  |
| Guard Shell + Phase Step  ‖  Homing Rockets + Static Charge    | 1.14 | 1.08 | 1.24 | 1.03 | 1.17 | 1.07 | 1.04 | 1.06 | 1.07 | 1.15 | 1.07 | 1.03 | 1.07 | 1.07   | **1.24** (S30)  |
| Guard Shell + Second Wind  ‖  Homing Rockets + Static Charge   | 1.14 | 1.07 | 1.24 | 1.06 | 1.17 | 1.07 | 1.02 | 1.00 | 1.06 | 1.18 | 1.08 | 1.02 | 1.06 | 1.07   | **1.24** (S30)  |
| Guard Shell + Second Wind  ‖  Lucky Edge + Static Charge       | 1.16 | 1.09 | 1.23 | 1.05 | 1.17 | 1.06 | 1.00 | 1.07 | 1.07 | 1.12 | 1.07 | 1.03 | 1.03 | 1.07   | **1.23** (S30)  |
| Guard Shell + Second Wind  ‖  Phase Step + Homing Rockets      | 1.23 | 1.11 | 1.16 | 1.15 | 1.17 | 1.15 | 1.16 | 1.12 | 1.11 | 1.17 | 1.21 | 1.13 | 1.17 | 1.16   | **1.23** (S15)  |
| Phase Step + Mirror Plate  ‖  Lucky Edge + Homing Rockets      | 1.10 | 1.09 | 1.21 | 1.10 | 1.10 | 1.09 | 1.05 | 1.05 | 1.08 | 1.09 | 1.09 | 1.05 | 1.07 | 1.09   | **1.21** (S30)  |

Specialisation breaks the cap: an offensive pair on the damage dealer (the Star) plus a
defensive pair on the survivor (the Round Guard) multiplies across spinners — the same four
skills assigned the other way round stay low. This is why the design ships **one** shared
2-slot loadout.

### 3.7 Robustness

- **Lockstep part level (enemy-matched, weaker player)** (N = 250, 13 stages): strongest single Second Wind 1.26 (S95);
  strongest pair Second Wind + Opening Salvo **1.44** (S95); pairs above 1.45: 0 of 10.
- **Glass-cannon team (Star/Speedy + Piercer/Speedy)** (N = 250, 13 stages): strongest single Mirror Plate 1.24 (S30);
  strongest pair Phase Step + Mirror Plate **1.44** (S30); pairs above 1.45: 0 of 10.
- **Tank team (Soft Shell/Tanky + Round/Tanky) — all 10 singles and all 45 pairs on stages 15/30/31** (N = 300, 3
  stages): strongest single Phase Step 1.21 (S30); strongest pair Lucky Edge + Static Charge **1.43** (S30); pairs above
  1.45: 0 of 45.
    - Tank × stage 30 is a high-variance heal race (rare very long fights dominate the mean): the paired N = 2000 re-run
      of its top pairs reads up to **1.55** (Phase Step + Lucky Edge, CI 1.48–1.62) — see the corner discussion below.

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
Phase Step + Lucky Edge 1.55, Phase Step + Static Charge 1.53, Lucky Edge + Static Charge 1.53, i.e. they are worth
about the same as a plain +15 % damage / +15 % defence buff —
**≈ 1.32× in damage × tankiness terms**, which is what the brief's cap is about. Everywhere
else (all 13 stages for the default and glass builds and the lockstep level) the raw metric
itself stays ≤ 1.5.

### 3.8 Why no pair can run away (structure) — and where the proof actually comes from

The **proof is the measurement** (§3.5 all 45 pairs, §3.5 paired confirmation on the worst
stages, §3.6 real teams, §3.7 other levels/builds). The structure below explains *why* the
measured numbers stay flat and why no untested situation can make them explode.

Expected-value size of each skill at L10 (continuous approximation — ignores that HP comes
in discrete one-shot chunks, which is why measured values can sit a few % above these):

| skill          | EV argument                                                               | L10 size            | measured median / worst |
|----------------|---------------------------------------------------------------------------|---------------------|-------------------------|
| Guard Shell    | DEF ≈ 1 + shield% (the shield is extra HP)                                | 1.16                | 1.15 / 1.20             |
| Phase Step     | DEF ≈ 1 / (1 − p) (all damage from collisions, cooldown never binds)      | 1.111               | 1.11 / 1.18             |
| Mirror Plate   | DEF ≈ 1 / (1 − p·½) = 1.087; plus reflected damage ÷ attacker defence     | 1.09 × small        | 1.09 / 1.19             |
| Second Wind    | DEF ≈ 1 + heal% (once per battle, only if the threshold is reached alive) | ≤ 1.18              | 1.16 / 1.20             |
| Lucky Edge     | OFF ≈ 1 + p·(m − 1) on collision damage                                   | 1.13                | 1.08 / 1.13             |
| Momentum       | OFF ≤ 1 + 3·k even if **every** hit is at 3 stacks (perfect bank shots)   | 1.225               | 1.04 / 1.08             |
| Homing Rockets | OFF ≈ 1 + volley ÷ (contacts per volley × damage per contact)             | ~1.15               | 1.08 / 1.20             |
| Opening Salvo  | OFF ≈ 1 / (1 − pct) (one chunk of the enemy's total HP)                   | 1.163               | 1.13 / 1.16             |
| Static Charge  | DEF ≤ 1 + p (one skipped enemy turn per proc, never two in a row)         | 1.18                | 1.02 / 1.16             |
| Hazard Ward    | DEF ≈ 1 / (1 − w × hazard share of damage)                                | 1.0 – ~1.2 by arena | 1.04 / 1.09             |

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
       to 1.513) and needed a pairing rule; after the v7 trims it is 1.407 (paired 95 % CI 1.373–1.442), so v7 ships
       **without** any mutual exclusion. If a later buff brings it back, the rule is ready:
       `excludes: ['static_charge']` on Phase Step (and vice versa), refused in `equip()`.
    2. **Heal races — life-leech bosses** (stage 30, 71 and their cycle copies) heal 30 % of
       the damage they deal, so any extra damage *or* denied hit shortens the kill
       super-linearly (Phase Step alone gets OFF 1.08 there). Every top pair peaks on
       that stage — see §3.7 for how strongly it amplifies *any* power source, skills or not.

### 3.9 Win rate ("easiness") at L10

Win rate of the full battle (both sides mortal), same seeds:

| loadout                            | S15 | S17 | S30 | S31 | S35 | S49 | S50 | S55 | S77 | S80 | S95 | S99 | S100 |
|------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| none                               | 58% | 53% | 10% | 88% | 0%  | 44% | 0%  | 0%  | 93% | 0%  | 0%  | 30% | 0%   |
| Guard Shell L10                    | 70% | 69% | 14% | 96% | 0%  | 62% | 0%  | 0%  | 97% | 0%  | 0%  | 45% | 0%   |
| Phase Step L10                     | 72% | 61% | 16% | 93% | 0%  | 60% | 0%  | 0%  | 95% | 0%  | 0%  | 40% | 0%   |
| Mirror Plate L10                   | 71% | 60% | 16% | 95% | 1%  | 61% | 0%  | 0%  | 97% | 0%  | 0%  | 37% | 0%   |
| Second Wind L10                    | 68% | 72% | 15% | 96% | 0%  | 64% | 0%  | 0%  | 96% | 0%  | 0%  | 47% | 0%   |
| Lucky Edge L10                     | 65% | 59% | 18% | 94% | 1%  | 57% | 1%  | 0%  | 94% | 0%  | 0%  | 38% | 0%   |
| Momentum L10                       | 60% | 56% | 12% | 91% | 0%  | 54% | 0%  | 0%  | 94% | 0%  | 0%  | 36% | 0%   |
| Homing Rockets L10                 | 61% | 61% | 13% | 95% | 0%  | 57% | 0%  | 0%  | 94% | 0%  | 0%  | 37% | 0%   |
| Opening Salvo L10                  | 66% | 68% | 16% | 95% | 0%  | 62% | 0%  | 0%  | 96% | 0%  | 0%  | 49% | 0%   |
| Static Charge L10                  | 56% | 58% | 17% | 93% | 0%  | 53% | 0%  | 0%  | 95% | 0%  | 0%  | 36% | 0%   |
| Hazard Ward L10                    | 60% | 66% | 10% | 93% | 0%  | 45% | 0%  | 0%  | 95% | 0%  | 0%  | 31% | 0%   |
| Phase Step + Static Charge L10     | 70% | 61% | 31% | 97% | 2%  | 67% | 0%  | 0%  | 96% | 0%  | 0%  | 45% | 0%   |
| Homing Rockets + Static Charge L10 | 59% | 62% | 22% | 97% | 1%  | 65% | 0%  | 0%  | 96% | 0%  | 0%  | 39% | 0%   |
| Guard Shell + Second Wind L10      | 79% | 82% | 22% | 99% | 1%  | 78% | 1%  | 0%  | 98% | 0%  | 0%  | 64% | 0%   |
| Second Wind + Opening Salvo L10    | 78% | 82% | 23% | 99% | 2%  | 82% | 2%  | 0%  | 98% | 0%  | 0%  | 68% | 0%   |
| Mirror Plate + Static Charge L10   | 68% | 62% | 31% | 97% | 1%  | 66% | 0%  | 0%  | 97% | 0%  | 0%  | 44% | 0%   |

### 3.10 Early game — the Stage-10 unlock

Skills now arrive at stage 10, so the early stages were checked separately: every single
skill and every pair at L1, L3 and L5 (a player at stage 10–20 cannot own more — the first
levels cost 150–350 coins against a stage win of 140–500), default team at the economic part
level, stages 10 (split boss), 11 (shock + thunder boss), 12 (lava), 13 (ice), 14 (thunder),
15 (ghost boss), 17 (lava) and 20 (partners boss). Slot 2 only opens at stage 20, so the pair
rows before 20 are a worst case that cannot happen in the game — as are skills that unlock
later than the stage shown (all ten are tested everywhere).

| level               | 10 boss:split                             | 11 shock                                       | 12 lava                                     | 13 ice                                      | 14 thunder                                  | 15 boss:ghost                             | 17 lava                                     | 20 boss:partners                               |
|---------------------|-------------------------------------------|------------------------------------------------|---------------------------------------------|---------------------------------------------|---------------------------------------------|-------------------------------------------|---------------------------------------------|------------------------------------------------|
| L1 worst single     | 1.05 <sub>Second Wind</sub>               | 1.08 <sub>Homing Rockets</sub>                 | 1.05 <sub>Second Wind</sub>                 | 1.06 <sub>Second Wind</sub>                 | 1.05 <sub>Second Wind</sub>                 | 1.07 <sub>Second Wind</sub>               | 1.05 <sub>Opening Salvo</sub>               | 1.06 <sub>Homing Rockets</sub>                 |
| L1 worst pair       | 1.11 <sub>Guard Shell + Second Wind</sub> | 1.15 <sub>Homing Rockets + Opening Salvo</sub> | 1.09 <sub>Second Wind + Opening Salvo</sub> | 1.12 <sub>Second Wind + Opening Salvo</sub> | 1.09 <sub>Second Wind + Opening Salvo</sub> | 1.14 <sub>Guard Shell + Second Wind</sub> | 1.10 <sub>Second Wind + Opening Salvo</sub> | 1.11 <sub>Homing Rockets + Opening Salvo</sub> |
| L3 worst single     | 1.09 <sub>Second Wind</sub>               | 1.09 <sub>Opening Salvo</sub>                  | 1.07 <sub>Opening Salvo</sub>               | 1.07 <sub>Second Wind</sub>                 | 1.07 <sub>Second Wind</sub>                 | 1.09 <sub>Second Wind</sub>               | 1.08 <sub>Second Wind</sub>                 | 1.08 <sub>Opening Salvo</sub>                  |
| L3 worst pair       | 1.15 <sub>Phase Step + Second Wind</sub>  | 1.20 <sub>Opening Salvo + Hazard Ward</sub>    | 1.14 <sub>Second Wind + Opening Salvo</sub> | 1.15 <sub>Guard Shell + Second Wind</sub>   | 1.13 <sub>Phase Step + Second Wind</sub>    | 1.19 <sub>Guard Shell + Second Wind</sub> | 1.16 <sub>Second Wind + Opening Salvo</sub> | 1.16 <sub>Second Wind + Opening Salvo</sub>    |
| L5 worst single     | 1.11 <sub>Second Wind</sub>               | 1.14 <sub>Hazard Ward</sub>                    | 1.09 <sub>Opening Salvo</sub>               | 1.09 <sub>Second Wind</sub>                 | 1.08 <sub>Second Wind</sub>                 | 1.13 <sub>Guard Shell</sub>               | 1.10 <sub>Opening Salvo</sub>               | 1.11 <sub>Opening Salvo</sub>                  |
| L5 worst pair       | 1.23 <sub>Guard Shell + Second Wind</sub> | 1.26 <sub>Homing Rockets + Opening Salvo</sub> | 1.17 <sub>Guard Shell + Second Wind</sub>   | 1.19 <sub>Guard Shell + Second Wind</sub>   | 1.17 <sub>Mirror Plate + Second Wind</sub>  | 1.25 <sub>Guard Shell + Second Wind</sub> | 1.19 <sub>Guard Shell + Second Wind</sub>   | 1.21 <sub>Second Wind + Opening Salvo</sub>    |
| win rate, no skills | 39%                                       | 36%                                            | 36%                                         | 24%                                         | 69%                                         | 58%                                       | 53%                                         | 0%                                             |

N = 400 battles per cell and mode; the highest value anywhere in the grid is **1.26**.

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

### 4.1 Mirror Plate — `mirror_plate` · DEF · drop: stage 10 · The Bear Mother

*The Bear Mother's hide: half the blow comes back where it came from.*

- **Effect:** When an enemy collision hit lands on the bearer (not phased), roll `chance`: the bearer takes `dmg × 0.5`,
  and the attacker takes `dmg × 0.5 / max(1, attacker.defenseMultiplier)` as damage from the bearer (kind `reflect`).
- **Proc / rules:** Reflect can kill (split-on-death runs), is mirrored by ghost links, never triggers skills, never
  crits. Life-leech heals only from the halved hit it actually dealt.
- **Counterplay / limits:** Reflected damage is divided by the attacker's defence — weak against tanks, strong against
  glass cannons; no effect on hazards.
- **Softens:** Tanks that get rammed a lot (Round Guard, Soft Shell, Tanky bottom): turns being hit into damage.
- **Edge cases:** Stat-switch boss: its huge attack-phase hit is halved; the reflect is divided by its defence (5.4 at
  stage 80), so it cannot be farmed. Multiple procs per battle are allowed (no cooldown).
- **Measured PI:** L1 median 1.03 · L5 median 1.05 · **L10 median 1.09, worst 1.19 (stage 30)** · L10 split OFF 1.03 ×
  DEF 1.06
- **Icon / colour:** hex plate with a return arrow, `#e2e8f0`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.mirror_plate`, `skills.desc.mirror_plate` — params: `chance`.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| proc chance                            | 5%  | 6%  | 7%  | 8%  | 10% | 11% | 12% | 13% | 15% | 16% |
| blocked / reflected share              | 50% | 50% | 50% | 50% | 50% | 50% | 50% | 50% | 50% | 50% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

### 4.2 Phase Step — `phase_step` · DEF · drop: stage 15 · The Phantom Twin

*Learned from the Phantom Twin: for a heartbeat the spinner turns to mist and the hit passes straight through.*

- **Effect:** When an **enemy collision hit** would damage the bearer (step 3 of §5) and the bearer is off cooldown,
  roll `chance`: on success the hit deals **0**, the bearer is **phased for 300 ms** (ignores enemy collision rolls
  *and* Spiky chip) and the cooldown starts (`dodgeReadyAt = now + cooldownMs`).
- **Proc / rules:** Game-time cooldown. Does not apply to hazards (lava, thunder aura), friendly fire, or skill damage.
  A phased hit cannot also be mirrored. A dodged hit has no side effects at all: no hit flash, no crit cooldown on the
  bearer, no life-leech heal for the attacker.
- **Counterplay / limits:** Cooldown makes multi-hit swarms (split children, 4-enemy squads) chew through it; hazards
  ignore it; the chance is capped at 10 %.
- **Softens:** Low-defence glass cannons (Star/Piercer tops, Speedy bottoms) against heavy hitters; every build against
  the one-shot bosses (stat-switch attack phase, life-leech — a dodged hit also denies the leech heal).
- **Edge cases:** Ghost twins: each twin's hit rolls separately (one roll per armed contact). Split children / emitted
  minions: each contact rolls, cooldown bounds it. Thunder boss: aura damage is a hazard (not dodgeable). Two-way
  contact (both moving): only the incoming half can be dodged; the bearer's own hit still lands. Simultaneous procs:
  Phase is resolved before Mirror; if it fires, Mirror does not roll.
- **Measured PI:** L1 median 1.04 · L5 median 1.07 · **L10 median 1.11, worst 1.18 (stage 30)** · L10 split OFF 1.00 ×
  DEF 1.11
- **Icon / colour:** ghost silhouette with two motion lines, `#c4b5fd`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.phase_step`, `skills.desc.phase_step` — params: `chance` = chance×100 (1 decimal max), `cd` =
  cooldownMs/1000 (1 decimal).

| level                                  | L1    | L2    | L3    | L4    | L5    | L6    | L7    | L8    | L9    | L10   |
|----------------------------------------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| dodge chance                           | 3.5%  | 4%    | 4.5%  | 5%    | 6%    | 6.5%  | 7%    | 8%    | 9%    | 10%   |
| cooldown                               | 4.0 s | 3.8 s | 3.7 s | 3.5 s | 3.3 s | 3.2 s | 3.0 s | 2.8 s | 2.7 s | 2.5 s |
| coins to reach this level (L1 = learn) | 150   | 100   | 125   | 150   | 200   | 250   | 300   | 350   | 450   | 575   |

### 4.3 Guard Shell — `guard_shell` · DEF · drop: stage 20 · The Iron Brotherhood

*An iron carapace forged from the Brotherhood's plating — the first hits of every fight bounce off it.*

- **Effect:** At battle start (`initGame`) the bearer gets `shield = round(maxHp × shield)` (min 1). **Every** HP loss
  of any kind (collision, chip, lava, thunder aura, friendly fire, reflect) is taken from the shield first, the
  remainder from HP. The shield never regenerates.
- **Proc / rules:** Absorbed amounts pop as cyan numbers. The anti-draw rule in `resolveCollision` must use
  `hp + shield` as the survivability check. Second Wind watches HP only (it can fire after the shield is gone).
- **Counterplay / limits:** Spent on the first 1–2 hits; long fights (healers, stage 50/100) dilute it; no regeneration.
- **Softens:** Low-HP builds (Star and Piercer tops, Speedy bottom: +0 HP bonus) and first-strike losses (the enemy
  starts 70 % of the time after a win).
- **Edge cases:** Bosses: absorbs the stat-switch one-shot partially at L10 (16 % of max HP). Lava: absorbs lava burns (
  they are small, so the shield lasts). Forest heal restores HP, never the shield. Split/emitted minions chip it down
  like anything else.
- **Measured PI:** L1 median 1.05 · L5 median 1.09 · **L10 median 1.15, worst 1.20 (stage 100)** · L10 split OFF 1.00 ×
  DEF 1.15
- **Icon / colour:** heater shield, `#67e8f9`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.guard_shell`, `skills.desc.guard_shell` — params: `pct` = shield×100.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| shield (% max HP)                      | 5%  | 6%  | 7%  | 8%  | 10% | 11% | 12% | 13% | 15% | 16% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

### 4.4 Second Wind — `second_wind` · SUS · drop: stage 25 · The Mending Choir

*The Choir's hymn: when the spinner wobbles, it catches its breath and spins back up.*

- **Effect:** Once per battle per bearer: after any HP loss that leaves `0 < hp ≤ threshold × maxHp` (35 %), heal
  `heal × maxHp` immediately (capped at max HP).
- **Proc / rules:** Checked inside `applyHpLoss` after every kind of damage. Never on the killing blow (overkill = no
  heal). Resets per battle.
- **Counterplay / limits:** Big one-shots skip the window; it fires once; a player who is already healthy gets nothing
  from it.
- **Softens:** Everyone, most of all tanky builds (Round/Soft Shell tops, Tanky bottom) that survive long enough to
  reach the threshold; turns near-losses into comebacks.
- **Edge cases:** Forest arena heals add on top. Guard Shell absorbs first. Stat-switch and ghost one-shots often skip
  it (by design — the other defensive skills cover those). Each spinner has its own once-per-battle trigger.
- **Measured PI:** L1 median 1.06 · L5 median 1.11 · **L10 median 1.16, worst 1.20 (stage 100)** · L10 split OFF 1.00 ×
  DEF 1.16
- **Icon / colour:** heart with an up-arrow (heart from the shared icon set), `#4ade80`. VFX, audio, budget and
  `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.second_wind`, `skills.desc.second_wind` — params: `threshold` = 35, `pct` = heal×100.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| heal (% max HP)                        | 6%  | 7%  | 9%  | 10% | 11% | 13% | 14% | 15% | 17% | 18% |
| trigger at HP ≤                        | 35% | 35% | 35% | 35% | 35% | 35% | 35% | 35% | 35% | 35% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

### 4.5 Lucky Edge — `lucky_edge` · OFF · drop: stage 30 · Chaos Incarnate

*Chaos favours the bold: now and then a glancing blow lands like a sledgehammer.*

- **Effect:** On every armed collision where the bearer deals damage > 0 to an enemy **and the hit is not already a crit
  ** (positional back-hit or the Star's hidden 8 % crit), roll `chance`: on success multiply that hit by `mult`.
- **Proc / rules:** Does not set `lastCritAt` (never blocks the game's own crits). Never on chip, rockets, reflect,
  salvo. Combined with Momentum it is clamped by `SKILL_HIT_MUL_CAP = 2.2`. Rendered like a crit number (orange, 1.5×
  size) but **without** `shadowBlur`.
- **Counterplay / limits:** Pure variance; worth nothing against a resting target you cannot reach.
- **Softens:** Low-damage tanks (Round Guard, Soft Shell, Quad Core) that rarely land decisive hits; also shortens long
  boss fights.
- **Edge cases:** Ghost link: the boosted amount is mirrored to the twin (as with any hit). Thunder combo: multiplies as
  usual (the clamp covers only skill multipliers). Healers/partners: no interaction.
- **Measured PI:** L1 median 1.03 · L5 median 1.05 · **L10 median 1.08, worst 1.13 (stage 30)** · L10 split OFF 1.08 ×
  DEF 1.00
- **Icon / colour:** four-leaf clover, `#fbbf24`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.lucky_edge`, `skills.desc.lucky_edge` — params: `chance`, `mult` (2 decimals, trailing zeros
  trimmed).

| level                                  | L1     | L2     | L3     | L4     | L5     | L6     | L7     | L8     | L9     | L10    |
|----------------------------------------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| chance                                 | 7%     | 8%     | 8%     | 9%     | 10%    | 10%    | 11%    | 12%    | 12%    | 13%    |
| damage ×                               | ×1.50  | ×1.55  | ×1.60  | ×1.65  | ×1.70  | ×1.80  | ×1.85  | ×1.90  | ×1.95  | ×2.00  |
| EV on hits                             | ×1.035 | ×1.044 | ×1.048 | ×1.058 | ×1.070 | ×1.080 | ×1.093 | ×1.108 | ×1.114 | ×1.130 |
| coins to reach this level (L1 = learn) | 150    | 100    | 125    | 150    | 200    | 250    | 300    | 350    | 450    | 575    |

### 4.6 Homing Rockets — `homing_rockets` · OFF · drop: stage 35 · The Ravenous Swarm

*Scavenged from the Swarm: every few clashes the spinner vents a volley of micro-rockets at whoever is weakest.*

- **Effect:** Each **armed contact** between the bearer and an enemy (hit dealt *or* taken) adds 1 to a counter. At
  `everyN` the counter resets and a volley fires at up to 3 living, non-invulnerable enemies, **lowest current HP first
  **, ghost-linked twins counting as one target. The volley deals `frac × refHit(bearer, target)` in total, **split
  evenly** across its targets (min 1 each); each rocket lands **400 ms** later (game time).
- **Proc / rules:** `refHit` = the collision formula at 50 % of the bearer's max speed, with the speed factor capped at
  1.5 (`0.5 × 14 × min(speedMultiplier, 1.5)` — without the cap Speedy builds, whose multiplier reaches 2.5+ by stage
  30, inflated rockets past the pair cap), no crit/combo/speed-advantage, with the bearer's Piercer/Star defence rule
  and the target's weight and defence (split-child modifiers apply). Rockets can kill (split-on-death runs). A rocket
  whose target died fizzles. Rocket damage never triggers skills.
- **Counterplay / limits:** Damage respects the target's defence (weak vs Soft Shell tanks), is split across targets,
  and needs contacts — a spinner that is never touched fires nothing.
- **Softens:** Multi-enemy stages, healer squads, split and child-emitter swarms (finishes low-HP minions); tanky
  players who get hit a lot (hits taken also charge it).
- **Edge cases:** Ghost boss: twins deduped (otherwise the damage link would double it). Split children: invulnerable
  ones are skipped. Child-emitter: minions count as contacts and as targets. Pool of 6 visual rockets; if full, damage
  still applies (no visual).
- **Measured PI:** L1 median 1.04 · L5 median 1.05 · **L10 median 1.08, worst 1.20 (stage 30)** · L10 split OFF 1.08 ×
  DEF 1.00
- **Icon / colour:** small diagonal rocket, `#fb923c`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.homing_rockets`, `skills.desc.homing_rockets` — params: `n` = everyN, `pct` = frac×100.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| contacts per volley                    | 7   | 7   | 7   | 6   | 6   | 6   | 6   | 5   | 5   | 5   |
| volley (× ref hit)                     | 9%  | 10% | 11% | 12% | 13% | 14% | 14% | 15% | 16% | 17% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

### 4.7 Opening Salvo — `opening_salvo` · OFF · drop: stage 40 · The Dragon Specter

*The Dragon's breath rides the meteor shower in: the fight starts with the enemy already scorched.*

- **Effect:** At the moment the meteor intro ends (`updatePhysics`, `meteor_intro → deciding_turn`), every living enemy
  loses `pct × maxHp` (min 1), **non-lethal** (`min(amount, hp − 1)`). Fires once per battle per team.
- **Proc / rules:** Applied before the ghost twin exists (the twin inherits the reduced HP) and after the boss rubber
  band (percent of the reduced max HP). Kind `salvo` (no skill recursion).
- **Counterplay / limits:** Healers heal it back by contact (2 HP / 250 ms); non-lethal; one-time.
- **Softens:** Bosses and high-HP tank rosters (percent damage ignores defence) — exactly the stages where players get
  stuck.
- **Edge cases:** Daily lone enemy with boss stats: percent of the doubled HP. Split boss: hits the parent only (
  children don't exist yet). PvP: off. Visual: explosion spritesheet at 0.5 scale per enemy (≤ 5), one `explosion-1`
  sound.
- **Measured PI:** L1 median 1.04 · L5 median 1.08 · **L10 median 1.13, worst 1.16 (stage 95)** · L10 split OFF 1.13 ×
  DEF 1.00
- **Icon / colour:** three falling meteors, `#f87171`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.opening_salvo`, `skills.desc.opening_salvo` — params: `pct`.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| enemy max HP lost                      | 5%  | 6%  | 7%  | 8%  | 9%  | 10% | 11% | 12% | 13% | 14% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

### 4.8 Momentum — `momentum` · OFF · drop: stage 45 · The Unbroken Trio

*An unbroken chain: every rebound winds the spinner tighter.*

- **Effect:** Only during the bearer's **own launch** (`launchedBladeId === bearer.id`): every wall rebound, every
  bouncer rebound and every hit on an enemy adds a stack (max 3). Each collision hit on an enemy is multiplied by
  `1 + perStack × stacks` (stacks counted **before** that hit adds its own). Stacks reset in `beginLaunch`.
- **Proc / rules:** Clamped together with Lucky Edge by `SKILL_HIT_MUL_CAP`. No effect on chip/rockets/reflect.
- **Counterplay / limits:** Needs deliberate bank shots; a straight shot into the first enemy gets nothing; Teleporter
  skin (wall pass) never rebounds.
- **Softens:** Speedy bottoms, ice arena and bouncer stages, skilled players who aim off walls — the skill-expression
  pick of the ten. The simulated player never aims off walls on purpose, so its measured median (~1.04) is a floor;
  1.225 (every hit at 3 stacks) is the ceiling.
- **Edge cases:** Worst case every hit at 3 stacks = ×1.225 at L10 (§3.8). (The shock-wall and thunder-arena combo
  interactions are gone with those arenas.)
- **Measured PI:** L1 median 1.01 · L5 median 1.03 · **L10 median 1.04, worst 1.08 (stage 95)** · L10 split OFF 1.04 ×
  DEF 1.00
- **Icon / colour:** double chevron », `#38bdf8`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.momentum`, `skills.desc.momentum` — params: `pct` = perStack×100 (1 decimal).

| level                                  | L1     | L2     | L3     | L4     | L5     | L6     | L7     | L8     | L9     | L10    |
|----------------------------------------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| per stack                              | 2.5%   | 3%     | 3.5%   | 4%     | 4.5%   | 5%     | 5.5%   | 6%     | 7%     | 7.5%   |
| at 3 stacks                            | ×1.075 | ×1.090 | ×1.105 | ×1.120 | ×1.135 | ×1.150 | ×1.165 | ×1.180 | ×1.210 | ×1.225 |
| coins to reach this level (L1 = learn) | 150    | 100    | 125    | 150    | 200    | 250    | 300    | 350    | 450    | 575    |

### 4.9 Hazard Ward — `hazard_ward` · UTL · drop: stage 50 · The Eternal Grove

*The Grove's bark-weave: fire, lightning and thorns slide off.*

- **Effect:** Against the bearer: lava wall burn ×(1 − `lava`), thunder-boss aura ×(1 − `thunder`), Spiky chip ×(1 −
  `chip`); on a Frost Lock cold touch the bearer keeps `10 % + 90 % × shockKeep` of its speed instead of 10 % (shock walls were retired).
- **Proc / rules:** Applied first in `applyHpLoss` for kinds `lava`, `thunder`, `chip`; shock handled in
  `bounceOffWalls`/`bounceOffBouncers`. The lava popup shows the reduced amount (cyan tint).
- **Counterplay / limits:** Does nothing on default/ice/forest arenas without Spiky or thunder enemies — a loadout
  choice per stage, not a permanent pick.
- **Softens:** the 17 lava stages (12, 17, 27, 32, 36, 42, 47, 52, 57, 62, 67, 72, 77, 82, 86, 92, 97), the 10 shock
  stages and the 46 of 100 stages with a Spiky enemy; players who ricochet a lot.
- **Edge cases:** Stage 95 (thunder boss + partners): the aura is the main hazard. Lava lethal touch: reduced burn may
  no longer be lethal (fine). Forest: no effect.
- **Measured PI:** L1 median 1.01 · L5 median 1.02 · **L10 median 1.04, worst 1.09 (stage 95)** · L10 split OFF 1.00 ×
  DEF 1.04
- **Icon / colour:** hexagon ward with a flame notch, `#a3e635`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.hazard_ward`, `skills.desc.hazard_ward` — params: `hazard` = lava×100, `chip` = chip×100,
  `shock` = round((0.1 + 0.9×shockKeep)×100).

| level                                  | L1    | L2    | L3    | L4    | L5    | L6    | L7    | L8    | L9    | L10 |
|----------------------------------------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-----|
| lava/thunder −                         | 15%   | 18%   | 21%   | 24%   | 27%   | 30%   | 33%   | 36%   | 38%   | 40% |
| Spiky chip −                           | 5%    | 6%    | 7%    | 8%    | 9%    | 10%   | 11%   | 12%   | 14%   | 15% |
| speed kept on shock (base 10%)         | 11.8% | 12.7% | 13.6% | 13.6% | 14.5% | 15.4% | 16.3% | 17.2% | 18.1% | 19% |
| coins to reach this level (L1 = learn) | 150   | 100   | 125   | 150   | 200   | 250   | 300   | 350   | 450   | 575 |

### 4.10 Static Charge — `static_charge` · CTL · drop: stage 55 · The Dread Scorpion

*The Scorpion's sting, bottled: whoever rams the spinner gets zapped stiff.*

- **Effect:** On an armed contact between the bearer and an enemy blade **that is taking its own turn** (
  `launchedBladeId === enemy.id`) and still moving after the bounce, roll `chance` (shared 250 ms shock cooldown
  `lastShockMs`): the enemy loses 90 % of its speed and is **Stunned** — it cannot be picked in the
  enemy team's next turn. If every living enemy is stunned, that enemy turn is skipped. A blade stunned for turn T
  cannot be stunned for T + 1.
- **Proc / rules:** `launchNpc` increments `npcTurnIndex` and filters `stunnedForTurn === npcTurnIndex`. Skipped turn =
  the normal `npc_launched → player_turn` bookkeeping (stat-switch back to defence). The stun is shown as a bolt glyph
  over the enemy until its turn passes.
- **Counterplay / limits:** Only procs on enemies that ram the bearer; squads simply launch another member; never two
  stuns in a row on the same blade.
- **Softens:** A boss specialist: lone bosses (a stun is a skipped boss turn — stages 30/35/80 measure 1.11–1.16) and
  heavy rammers. Near-neutral against squads, where another member simply launches instead (median 1.02) — a loadout
  pick for boss stages, like Hazard Ward is for hazard arenas.
- **Edge cases:** Ghost twins are separate blades (one stunned, the other acts). Split children: each separately.
  Teleporter enemies: normal. Proc on the first contact of a launch usually ends that launch (speed drained) — intended.
- **Measured PI:** L1 median 1.01 · L5 median 1.01 · **L10 median 1.02, worst 1.16 (stage 30)** · L10 split OFF 0.98 ×
  DEF 1.04
- **Icon / colour:** lightning bolt, `#facc15`. VFX, audio, budget and `FX.low`: §8.2–8.3.
- **i18n:** `skills.names.static_charge`, `skills.desc.static_charge` — params: `chance`.

| level                                  | L1  | L2  | L3  | L4  | L5  | L6  | L7  | L8  | L9  | L10 |
|----------------------------------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| stun chance                            | 7%  | 8%  | 10% | 11% | 12% | 13% | 14% | 15% | 17% | 18% |
| coins to reach this level (L1 = learn) | 150 | 100 | 125 | 150 | 200 | 250 | 300 | 350 | 450 | 575 |

---

## 5. Stacking, order of operations, governor

Inside `resolveCollision`, for each direction A→B, **in this order**:

1. Base damage exactly as today (closing speed, crits, Piercer/Star defence, speed
   advantage, thunder combo, split-sibling 25 %).
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

| stage s | econ part level | typical income of the neighbouring regular stage (s ± 1) | cumulative campaign-only | cumulative typical | cumulative engaged |
|---------|-----------------|----------------------------------------------------------|--------------------------|--------------------|--------------------|
| 15      | 6               | 470                                                      | 3,456                    | 5,718              | 7,344              |
| 20      | 8               | 434                                                      | 5,297                    | 8,817              | 11,334             |
| 25      | 10              | 488                                                      | 6,910                    | 11,793             | 15,339             |
| 30      | 12              | 597                                                      | 8,993                    | 15,603             | 20,420             |
| 35      | 13              | 658                                                      | 11,370                   | 19,848             | 26,124             |
| 40      | 15              | 724                                                      | 13,989                   | 24,505             | 32,391             |
| 50      | 18              | 833                                                      | 20,077                   | 35,567             | 47,164             |
| 60      | 21              | 961                                                      | 26,828                   | 47,769             | 63,535             |
| 70      | 23              | 1075                                                     | 34,825                   | 62,046             | 82,642             |
| 80      | 25              | 1208                                                     | 43,920                   | 78,197             | 104,233            |
| 90      | 27              | 1365                                                     | 56,258                   | 98,679             | 131,096            |
| 100     | 29              | 1552                                                     | 69,423                   | 121,005            | 160,672            |

Income earned **during stages 10–80**: campaign-only 42,494, typical 75,791, engaged 101,141 coins. All ten skills (
26,500) = 35 % of the typical figure.

Projection — spend a fixed share of every coin earned after the unlock on skill upgrades,
learning each skill as soon as it unlocks and finishing one before starting the next, in unlock order (stage 10 → 200):

| profile      | share of income to skills | first 2 maxed | 4 slotted maxed | all 10 maxed |
|--------------|---------------------------|---------------|-----------------|--------------|
| campaignOnly | 25%                       | stage 55      | stage 80        | stage 162    |
| campaignOnly | 35%                       | stage 45      | stage 67        | stage 121    |
| campaignOnly | 50%                       | stage 37      | stage 55        | stage 90     |
| typical      | 25%                       | stage 40      | stage 59        | stage 95     |
| typical      | 35%                       | stage 33      | stage 49        | stage 80     |
| typical      | 50%                       | stage 27      | stage 40        | stage 66     |
| engaged      | 25%                       | stage 35      | stage 50        | stage 83     |
| engaged      | 35%                       | stage 29      | stage 41        | stage 69     |
| engaged      | 50%                       | stage 24      | stage 35        | stage 56     |

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
   `npc_launched → player_turn` transition (stat-switch phase back to `'defense'`,
   `comboState.clear()`).
6. **`bounceOffWalls` (≈2974):** after `blade.wallBounceCount++` → `onOwnBounce(blade)`
   (Momentum, only if `launchedBladeId === blade.id`). Lava branch: replace the direct
   `blade.hp = …` with `applyHpLoss(blade, lavaDmg, 'lava')` (the number shown is the
   post-ward, post-shield amount). Shock branch: `const keep = 0.1 + 0.9 ·
   hazardShockKeep(blade)`; `vx *= keep; vy *= keep`.
7. **`bounceOffBouncers` (≈3092):** after the reflect → `onOwnBounce(blade)`; shock keep
   as above.
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

Runs used for this doc: single skills L1/L5/L10 (N=400, 13 stages); 45 pairs at L10 (N=600, 13 stages); 45 pairs at L1
and L5 (N=200, 7 stages); 4-skill teams (N=300, 13 stages); lockstep level (N=250, 13 stages); glass team (N=250, 13
stages); tank team (N=300, 3 stages). Battles are counted per mode (real, player-immortal, enemy-immortal).

## Appendix B — strings for all 8 locales

Paste as a top-level `skills` entry of each locale file (English first). Strings contain no `|`, `@` or raw `{`/`}`
other than named params. French uses `’` (no escaping needed).

**en.ts**

```ts
  'skills': {
    'title': 'Skills',
    'slotEmpty': 'Empty',
    'slotAria': 'Skill slot {n}',
    'unlockAt': 'Stage {n}',
    'teaser': 'Beat the Stage {n} boss to unlock skills!',
    'lockedSkill': 'Unlocks after the Stage {n} boss',
    'equip': 'Equip',
    'remove': 'Remove',
    'equipped': 'Equipped',
    'max': 'MAX',
    'new': 'NEW',
    'now': 'Now',
    'next': 'Next',
    'unlockedTitle': 'Skills unlocked!',
    'newSkillTitle': 'New skill!',
    'newSlotTitle': 'New skill slot!',
    'bossDrop': 'Beat this boss to unlock {name}',
    'learn': 'Learn',
    'opponentSkills': 'Opponent\'s skills',
    'hint': 'Your equipped skills work on both spinners. Learn and upgrade skills with coins up to level 10.',
    'upgradeAria': 'Upgrade {name} for {cost} coins',
    'hudAria': '{name}, level {n}',
    'names': {
      'phase_step': 'Phase Step',
      'guard_shell': 'Guard Shell',
      'second_wind': 'Second Wind',
      'lucky_edge': 'Lucky Edge',
      'homing_rockets': 'Homing Rockets',
      'opening_salvo': 'Opening Salvo',
      'momentum': 'Momentum',
      'hazard_ward': 'Hazard Ward',
      'static_charge': 'Static Charge',
      'mirror_plate': 'Mirror Plate'
    },
    'desc': {
      'phase_step': '{chance}% chance to phase through an enemy hit and take no damage. Cooldown {cd}s.',
      'guard_shell': 'Start every battle with a shield worth {pct}% of max HP. It absorbs damage before HP.',
      'second_wind': 'Once per battle, when HP drops to {threshold}% or less: heal {pct}% of max HP.',
      'lucky_edge': '{chance}% chance for a hit to become a lucky crit dealing ×{mult} damage.',
      'homing_rockets': 'Every {n} clashes with enemies: rockets hit up to 3 enemies for {pct}% of a solid hit, shared.',
      'opening_salvo': 'When the battle starts, every enemy loses {pct}% of its max HP.',
      'momentum': 'During your launch, each wall bounce or hit adds +{pct}% damage to your next hits (max 3).',
      'hazard_ward': 'Lava and thunder auras hurt {hazard}% less, spikes {chip}% less; shock walls leave you {shock}% speed instead of 10%.',
      'static_charge': '{chance}% chance to zap an enemy that rams you: it stops and skips its next turn.',
      'mirror_plate': '{chance}% chance to block half of an enemy hit and send it back.'
    }
  },
```

**de.ts**

```ts
  'skills': {
    'title': 'Fähigkeiten',
    'slotEmpty': 'Leer',
    'slotAria': 'Fähigkeitsplatz {n}',
    'unlockAt': 'Etappe {n}',
    'teaser': 'Besiege den Boss von Etappe {n}, um Fähigkeiten freizuschalten!',
    'lockedSkill': 'Wird nach dem Boss von Etappe {n} freigeschaltet',
    'equip': 'Ausrüsten',
    'remove': 'Entfernen',
    'equipped': 'Ausgerüstet',
    'max': 'MAX',
    'new': 'NEU',
    'now': 'Jetzt',
    'next': 'Nächste',
    'unlockedTitle': 'Fähigkeiten freigeschaltet!',
    'newSkillTitle': 'Neue Fähigkeit!',
    'newSlotTitle': 'Neuer Fähigkeitsplatz!',
    'bossDrop': 'Besiege diesen Boss, um {name} freizuschalten',
    'learn': 'Erlernen',
    'opponentSkills': 'Fähigkeiten des Gegners',
    'hint': 'Ausgerüstete Fähigkeiten wirken auf beide Spinner. Erlerne und verbessere sie mit Münzen bis Stufe 10.',
    'upgradeAria': '{name} für {cost} Münzen verbessern',
    'hudAria': '{name}, Stufe {n}',
    'names': {
      'phase_step': 'Phasenschritt',
      'guard_shell': 'Schutzschale',
      'second_wind': 'Zweiter Atem',
      'lucky_edge': 'Glücksklinge',
      'homing_rockets': 'Lenkraketen',
      'opening_salvo': 'Eröffnungssalve',
      'momentum': 'Schwung',
      'hazard_ward': 'Gefahrenschutz',
      'static_charge': 'Statische Ladung',
      'mirror_plate': 'Spiegelplatte'
    },
    'desc': {
      'phase_step': '{chance}% Chance, durch einen gegnerischen Treffer hindurchzugleiten – kein Schaden. Abklingzeit {cd} s.',
      'guard_shell': 'Beginnt jeden Kampf mit einem Schild von {pct}% der max. HP. Er fängt Schaden vor den HP ab.',
      'second_wind': 'Einmal pro Kampf, wenn die HP auf {threshold}% oder weniger fallen: heilt {pct}% der max. HP.',
      'lucky_edge': '{chance}% Chance, dass ein Treffer zum Glückstreffer mit ×{mult} Schaden wird.',
      'homing_rockets': 'Alle {n} Zusammenstöße mit Gegnern: Raketen treffen bis zu 3 Gegner mit zusammen {pct}% eines kräftigen Treffers.',
      'opening_salvo': 'Zu Kampfbeginn verliert jeder Gegner {pct}% seiner max. HP.',
      'momentum': 'Während deines Starts gibt jeder Wandabpraller oder Treffer +{pct}% Schaden für die nächsten Treffer (max. 3×).',
      'hazard_ward': 'Lava und Donner-Auren schaden {hazard}% weniger, Stacheln {chip}% weniger; Schockwände lassen dir {shock}% Tempo statt 10%.',
      'static_charge': '{chance}% Chance, einen Gegner zu schocken, der dich rammt: Er stoppt und setzt seinen nächsten Zug aus.',
      'mirror_plate': '{chance}% Chance, die Hälfte eines gegnerischen Treffers abzublocken und zurückzuschicken.'
    }
  },
```

**es.ts**

```ts
  'skills': {
    'title': 'Habilidades',
    'slotEmpty': 'Vacío',
    'slotAria': 'Espacio de habilidad {n}',
    'unlockAt': 'Etapa {n}',
    'teaser': '¡Vence al jefe de la etapa {n} para desbloquear habilidades!',
    'lockedSkill': 'Se desbloquea tras el jefe de la etapa {n}',
    'equip': 'Equipar',
    'remove': 'Quitar',
    'equipped': 'Equipada',
    'max': 'MÁX',
    'new': 'NUEVO',
    'now': 'Ahora',
    'next': 'Siguiente',
    'unlockedTitle': '¡Habilidades desbloqueadas!',
    'newSkillTitle': '¡Nueva habilidad!',
    'newSlotTitle': '¡Nuevo espacio de habilidad!',
    'bossDrop': 'Vence a este jefe para desbloquear {name}',
    'learn': 'Aprender',
    'opponentSkills': 'Habilidades del rival',
    'hint': 'Las habilidades equipadas funcionan en ambas peonzas. Apréndelas y mejóralas con monedas hasta el nivel 10.',
    'upgradeAria': 'Mejorar {name} por {cost} monedas',
    'hudAria': '{name}, nivel {n}',
    'names': {
      'phase_step': 'Paso fantasma',
      'guard_shell': 'Escudo guardián',
      'second_wind': 'Segundo aliento',
      'lucky_edge': 'Filo afortunado',
      'homing_rockets': 'Cohetes teledirigidos',
      'opening_salvo': 'Salva inicial',
      'momentum': 'Impulso',
      'hazard_ward': 'Guarda de peligros',
      'static_charge': 'Carga estática',
      'mirror_plate': 'Placa espejo'
    },
    'desc': {
      'phase_step': '{chance}% de probabilidad de atravesar un golpe enemigo sin recibir daño. Recarga {cd} s.',
      'guard_shell': 'Empieza cada combate con un escudo del {pct}% de la vida máxima. Absorbe daño antes que la vida.',
      'second_wind': 'Una vez por combate, cuando la vida baja al {threshold}% o menos: cura el {pct}% de la vida máxima.',
      'lucky_edge': '{chance}% de probabilidad de que un golpe sea un crítico afortunado de ×{mult} daño.',
      'homing_rockets': 'Cada {n} choques con enemigos: cohetes golpean hasta 3 enemigos con el {pct}% de un golpe fuerte, repartido.',
      'opening_salvo': 'Al empezar el combate, cada enemigo pierde el {pct}% de su vida máxima.',
      'momentum': 'Durante tu lanzamiento, cada rebote en la pared o golpe añade +{pct}% de daño a tus siguientes golpes (máx. 3).',
      'hazard_ward': 'La lava y las auras de trueno dañan un {hazard}% menos, los pinchos un {chip}% menos; las paredes eléctricas te dejan un {shock}% de velocidad en vez del 10%.',
      'static_charge': '{chance}% de probabilidad de electrocutar a un enemigo que te embiste: se detiene y pierde su siguiente turno.',
      'mirror_plate': '{chance}% de probabilidad de bloquear la mitad de un golpe enemigo y devolverla.'
    }
  },
```

**fr.ts**

```ts
  'skills': {
    'title': 'Compétences',
    'slotEmpty': 'Vide',
    'slotAria': 'Emplacement de compétence {n}',
    'unlockAt': 'Étape {n}',
    'teaser': 'Bats le boss de l’étape {n} pour débloquer les compétences !',
    'lockedSkill': 'Débloquée après le boss de l’étape {n}',
    'equip': 'Équiper',
    'remove': 'Retirer',
    'equipped': 'Équipée',
    'max': 'MAX',
    'new': 'NOUVEAU',
    'now': 'Actuel',
    'next': 'Suivant',
    'unlockedTitle': 'Compétences débloquées !',
    'newSkillTitle': 'Nouvelle compétence !',
    'newSlotTitle': 'Nouvel emplacement de compétence !',
    'bossDrop': 'Bats ce boss pour débloquer {name}',
    'learn': 'Apprendre',
    'opponentSkills': 'Compétences de l’adversaire',
    'hint': 'Les compétences équipées agissent sur tes deux toupies. Apprends-les et améliore-les avec des pièces jusqu’au niveau 10.',
    'upgradeAria': 'Améliorer {name} pour {cost} pièces',
    'hudAria': '{name}, niveau {n}',
    'names': {
      'phase_step': 'Pas fantôme',
      'guard_shell': 'Coque de garde',
      'second_wind': 'Second souffle',
      'lucky_edge': 'Lame chanceuse',
      'homing_rockets': 'Roquettes guidées',
      'opening_salvo': 'Salve d’ouverture',
      'momentum': 'Élan',
      'hazard_ward': 'Garde anti-danger',
      'static_charge': 'Charge statique',
      'mirror_plate': 'Plaque miroir'
    },
    'desc': {
      'phase_step': '{chance} % de chances de traverser un coup ennemi sans dégâts. Recharge {cd} s.',
      'guard_shell': 'Commence chaque combat avec un bouclier de {pct} % des PV max. Il absorbe les dégâts avant les PV.',
      'second_wind': 'Une fois par combat, quand les PV tombent à {threshold} % ou moins : soigne {pct} % des PV max.',
      'lucky_edge': '{chance} % de chances qu’un coup devienne un critique chanceux à ×{mult} dégâts.',
      'homing_rockets': 'Tous les {n} chocs avec des ennemis : des roquettes frappent jusqu’à 3 ennemis pour {pct} % d’un coup franc, partagés.',
      'opening_salvo': 'Au début du combat, chaque ennemi perd {pct} % de ses PV max.',
      'momentum': 'Pendant ton lancer, chaque rebond sur un mur ou coup ajoute +{pct} % de dégâts à tes coups suivants (max. 3).',
      'hazard_ward': 'La lave et les auras de foudre font {hazard} % de dégâts en moins, les piquants {chip} % en moins ; les murs électriques te laissent {shock} % de vitesse au lieu de 10 %.',
      'static_charge': '{chance} % de chances d’électrocuter un ennemi qui te percute : il s’arrête et passe son prochain tour.',
      'mirror_plate': '{chance} % de chances de bloquer la moitié d’un coup ennemi et de la renvoyer.'
    }
  },
```

**jp.ts**

```ts
  'skills': {
    'title': 'スキル',
    'slotEmpty': '空き',
    'slotAria': 'スキルスロット{n}',
    'unlockAt': 'ステージ{n}',
    'teaser': 'ステージ{n}のボスを倒してスキルを解放しよう！',
    'lockedSkill': 'ステージ{n}のボスを倒すと解放',
    'equip': '装備',
    'remove': '外す',
    'equipped': '装備中',
    'max': 'MAX',
    'new': 'NEW',
    'now': '現在',
    'next': '次',
    'unlockedTitle': 'スキル解放！',
    'newSkillTitle': '新しいスキル！',
    'newSlotTitle': '新しいスキルスロット！',
    'bossDrop': 'このボスを倒すと{name}が解放',
    'learn': '習得',
    'opponentSkills': '相手のスキル',
    'hint': '装備したスキルは両方のスピナーに効果があります。コインで習得し、レベル10まで強化できます。',
    'upgradeAria': '{cost}コインで{name}を強化',
    'hudAria': '{name}、レベル{n}',
    'names': {
      'phase_step': 'ファントムステップ',
      'guard_shell': 'ガードシェル',
      'second_wind': 'セカンドウィンド',
      'lucky_edge': 'ラッキーエッジ',
      'homing_rockets': 'ホーミングロケット',
      'opening_salvo': '開幕砲撃',
      'momentum': 'モメンタム',
      'hazard_ward': 'ハザードガード',
      'static_charge': 'スタティックチャージ',
      'mirror_plate': 'ミラープレート'
    },
    'desc': {
      'phase_step': '{chance}%の確率で敵の攻撃をすり抜け、ダメージを受けない。クールダウン{cd}秒。',
      'guard_shell': 'バトル開始時に最大HPの{pct}%のシールドを得る。HPより先にダメージを吸収する。',
      'second_wind': 'バトル中1回、HPが{threshold}%以下になると最大HPの{pct}%を回復。',
      'lucky_edge': '{chance}%の確率で攻撃がラッキークリティカルになり、×{mult}のダメージ。',
      'homing_rockets': '敵と{n}回ぶつかるごとに、ロケットが最大3体の敵に強打の{pct}%分のダメージを分配。',
      'opening_salvo': 'バトル開始時、すべての敵が最大HPの{pct}%を失う。',
      'momentum': '自分の発射中、壁での跳ね返りや攻撃ごとに以降の攻撃ダメージ+{pct}%（最大3回）。',
      'hazard_ward': '溶岩と雷のオーラのダメージ-{hazard}%、トゲ-{chip}%。電撃壁でも速度が10%ではなく{shock}%残る。',
      'static_charge': '体当たりしてきた敵を{chance}%の確率で感電させる：敵は止まり、次のターンを休む。',
      'mirror_plate': '{chance}%の確率で敵の攻撃の半分を防ぎ、相手に跳ね返す。'
    }
  },
```

**kr.ts**

```ts
  'skills': {
    'title': '스킬',
    'slotEmpty': '비어 있음',
    'slotAria': '스킬 슬롯 {n}',
    'unlockAt': '스테이지 {n}',
    'teaser': '스테이지 {n} 보스를 물리치고 스킬을 해금하세요!',
    'lockedSkill': '스테이지 {n} 보스를 물리치면 해금',
    'equip': '장착',
    'remove': '해제',
    'equipped': '장착됨',
    'max': 'MAX',
    'new': 'NEW',
    'now': '현재',
    'next': '다음',
    'unlockedTitle': '스킬 해금!',
    'newSkillTitle': '새 스킬!',
    'newSlotTitle': '새 스킬 슬롯!',
    'bossDrop': '이 보스를 물리치면 {name} 해금',
    'learn': '습득',
    'opponentSkills': '상대 스킬',
    'hint': '장착한 스킬은 두 스피너 모두에 적용됩니다. 코인으로 습득하고 최대 10레벨까지 강화하세요.',
    'upgradeAria': '{cost} 코인으로 {name} 강화',
    'hudAria': '{name}, 레벨 {n}',
    'names': {
      'phase_step': '페이즈 스텝',
      'guard_shell': '가드 셸',
      'second_wind': '기사회생',
      'lucky_edge': '럭키 엣지',
      'homing_rockets': '유도 로켓',
      'opening_salvo': '개전 포격',
      'momentum': '모멘텀',
      'hazard_ward': '위험 방어막',
      'static_charge': '정전기 충전',
      'mirror_plate': '미러 플레이트'
    },
    'desc': {
      'phase_step': '{chance}% 확률로 적의 공격을 통과해 피해를 받지 않습니다. 재사용 대기시간 {cd}초.',
      'guard_shell': '매 전투 시작 시 최대 HP의 {pct}%만큼 보호막을 얻습니다. HP보다 먼저 피해를 흡수합니다.',
      'second_wind': '전투당 한 번, HP가 {threshold}% 이하로 떨어지면 최대 HP의 {pct}%를 회복합니다.',
      'lucky_edge': '{chance}% 확률로 공격이 ×{mult} 피해의 행운 치명타가 됩니다.',
      'homing_rockets': '적과 {n}번 부딪힐 때마다 로켓이 최대 3명의 적에게 강타의 {pct}%만큼 피해를 나누어 줍니다.',
      'opening_salvo': '전투가 시작되면 모든 적이 최대 HP의 {pct}%를 잃습니다.',
      'momentum': '발사 중 벽에 튕기거나 적을 맞힐 때마다 다음 공격 피해 +{pct}% (최대 3회).',
      'hazard_ward': '용암과 번개 오라 피해 -{hazard}%, 가시 피해 -{chip}%. 전기 벽에 닿아도 속도가 10% 대신 {shock}% 남습니다.',
      'static_charge': '나를 들이받은 적을 {chance}% 확률로 감전시킵니다: 적은 멈추고 다음 턴을 쉽니다.',
      'mirror_plate': '{chance}% 확률로 적 공격의 절반을 막고 되돌려 줍니다.'
    }
  },
```

**ru.ts**

```ts
  'skills': {
    'title': 'Навыки',
    'slotEmpty': 'Пусто',
    'slotAria': 'Слот навыка {n}',
    'unlockAt': 'Этап {n}',
    'teaser': 'Победи босса этапа {n}, чтобы открыть навыки!',
    'lockedSkill': 'Открывается после босса этапа {n}',
    'equip': 'Надеть',
    'remove': 'Снять',
    'equipped': 'Надето',
    'max': 'МАКС',
    'new': 'НОВОЕ',
    'now': 'Сейчас',
    'next': 'Далее',
    'unlockedTitle': 'Навыки открыты!',
    'newSkillTitle': 'Новый навык!',
    'newSlotTitle': 'Новый слот навыка!',
    'bossDrop': 'Победи этого босса, чтобы открыть «{name}»',
    'learn': 'Изучить',
    'opponentSkills': 'Навыки соперника',
    'hint': 'Надетые навыки действуют на оба спиннера. Изучай и улучшай навыки за монеты до 10 уровня.',
    'upgradeAria': 'Улучшить {name} за {cost} монет',
    'hudAria': '{name}, уровень {n}',
    'names': {
      'phase_step': 'Фазовый шаг',
      'guard_shell': 'Защитный панцирь',
      'second_wind': 'Второе дыхание',
      'lucky_edge': 'Счастливая грань',
      'homing_rockets': 'Самонаводящиеся ракеты',
      'opening_salvo': 'Первый залп',
      'momentum': 'Инерция',
      'hazard_ward': 'Защита от стихий',
      'static_charge': 'Статический заряд',
      'mirror_plate': 'Зеркальная пластина'
    },
    'desc': {
      'phase_step': '{chance}% шанс пройти сквозь удар врага без урона. Перезарядка {cd} с.',
      'guard_shell': 'В начале каждого боя даёт щит в {pct}% от макс. здоровья. Он поглощает урон раньше здоровья.',
      'second_wind': 'Раз за бой, когда здоровье падает до {threshold}% или ниже: лечит {pct}% макс. здоровья.',
      'lucky_edge': '{chance}% шанс, что удар станет счастливым критом с уроном ×{mult}.',
      'homing_rockets': 'Каждые {n} столкновений с врагами: ракеты бьют до 3 врагов на {pct}% сильного удара, поровну.',
      'opening_salvo': 'В начале боя каждый враг теряет {pct}% макс. здоровья.',
      'momentum': 'Во время твоего запуска каждый отскок от стены или удар даёт +{pct}% урона следующим ударам (макс. 3).',
      'hazard_ward': 'Лава и грозовые ауры наносят на {hazard}% меньше урона, шипы — на {chip}% меньше; электростены оставляют тебе {shock}% скорости вместо 10%.',
      'static_charge': '{chance}% шанс ударить током врага, который таранит тебя: он останавливается и пропускает следующий ход.',
      'mirror_plate': '{chance}% шанс заблокировать половину удара врага и вернуть её обратно.'
    }
  },
```

**zh.ts**

```ts
  'skills': {
    'title': '技能',
    'slotEmpty': '空',
    'slotAria': '技能槽 {n}',
    'unlockAt': '第{n}关',
    'teaser': '击败第{n}关首领即可解锁技能！',
    'lockedSkill': '击败第{n}关首领后解锁',
    'equip': '装备',
    'remove': '卸下',
    'equipped': '已装备',
    'max': 'MAX',
    'new': 'NEW',
    'now': '当前',
    'next': '下一级',
    'unlockedTitle': '技能已解锁！',
    'newSkillTitle': '新技能！',
    'newSlotTitle': '新技能槽！',
    'bossDrop': '击败此首领解锁{name}',
    'learn': '学习',
    'opponentSkills': '对手的技能',
    'hint': '已装备的技能对两个陀螺都生效。用金币学习并升级技能，最高 10 级。',
    'upgradeAria': '花费 {cost} 金币升级{name}',
    'hudAria': '{name}，{n} 级',
    'names': {
      'phase_step': '相位步',
      'guard_shell': '守护护盾',
      'second_wind': '绝地回生',
      'lucky_edge': '幸运之刃',
      'homing_rockets': '追踪火箭',
      'opening_salvo': '开场齐射',
      'momentum': '动量',
      'hazard_ward': '灾害结界',
      'static_charge': '静电充能',
      'mirror_plate': '镜面装甲'
    },
    'desc': {
      'phase_step': '{chance}% 几率穿过敌人的攻击，不受伤害。冷却 {cd} 秒。',
      'guard_shell': '每场战斗开始时获得最大生命值 {pct}% 的护盾，优先于生命值吸收伤害。',
      'second_wind': '每场战斗一次：生命值降至 {threshold}% 或以下时，恢复最大生命值的 {pct}%。',
      'lucky_edge': '{chance}% 几率使攻击成为幸运暴击，造成 ×{mult} 伤害。',
      'homing_rockets': '每与敌人碰撞 {n} 次，火箭攻击最多 3 个敌人，共造成一次重击 {pct}% 的伤害（平分）。',
      'opening_salvo': '战斗开始时，每个敌人损失最大生命值的 {pct}%。',
      'momentum': '发射期间，每次撞墙反弹或命中都使之后的攻击伤害 +{pct}%（最多 3 层）。',
      'hazard_ward': '熔岩和雷电光环伤害降低 {hazard}%，尖刺伤害降低 {chip}%；撞到电击墙后保留 {shock}% 速度（原为 10%）。',
      'static_charge': '{chance}% 几率电击撞向你的敌人：它会停下并跳过下一回合。',
      'mirror_plate': '{chance}% 几率挡住敌人攻击的一半并反弹回去。'
    }
  },
```



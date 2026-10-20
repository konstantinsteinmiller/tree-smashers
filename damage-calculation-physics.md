# Collision Damage Calculation

This document explains how damage is computed when two blades collide in
Tree Smashers. All source references point at `src/use/useSpinnerGame.ts`
(physics + collision) and `src/use/useSpinnerConfig.ts` (part stats).

---

## 1. The core formula

Damage is computed **per attacker, per collision**. If A hits B and both
are moving, both directions are evaluated independently (A → B and B → A),
so a single collision can deal damage in both directions.

For attacker `A` hitting defender `B`:

```
dmg(A → B) =
    ( speed(A) · A.damageMul · atkMul · A.weight )
  / ( B.weight · defMul )
  · DAMAGE_SCALE
  · speedAdv(B)
  · comboMul(A)
```

Factor by factor:

| Term           | Where it comes from                                          | Notes                                                                                                                                      |
|----------------|--------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `speed(A)`     | `Math.sqrt(vx² + vy²)` at the moment of contact (pre-bounce) | Fast blades hit harder; stationary blades (speed ≤ `STOP_THRESHOLD = 0.25`) deal **zero** damage.                                          |
| `A.damageMul`  | Top-part `damageMultiplier` + top-level upgrade bonus        | See `TOP_PARTS` in `useSpinnerConfig.ts`. Star 1.8, Piercer 1.7, Spiky 1.1, Quad 1.0, Round 0.8, Soft Shell 0.6.                           |
| `atkMul`       | `1.25` on a crit, `1` otherwise                              | Crits are back-hits — see §3.                                                                                                              |
| `A.weight`     | Bottom-part `weight`                                         | Speedy 80, Balanced 110, Tanky 150. Heavier attacker → more damage.                                                                        |
| `B.weight`     | Same                                                         | Heavier defender → less damage taken.                                                                                                      |
| `defMul`       | `B.defenseMultiplier` on a normal hit, **`1` on a crit**     | Crits ignore defense entirely. Piercer attacker halves the defender's bonus: `defMul = 1 + (defMul − 1) · 0.5`.                            |
| `DAMAGE_SCALE` | Global constant: `1` in release, `10` in debug               | Lets the dev build see 1-shot kills.                                                                                                       |
| `speedAdv(B)`  | `0.75` if B is ≥ 2× A's speed, else `1`                      | Makes head-on ramming vs. a much-faster defender cheaper for the defender — you can't tank-slam something that's already blowing past you. |
| `comboMul(A)`  | `1 + stacks · 0.1` (Thunder arena only)                      | Same attacker keeps hitting the same target within 3s → +10% per stack. First hit is stack 0, so no bonus until the second hit.            |

HP bars in the game are small integers (base `20` + part bonuses + upgrades),
so a single `dmg` value of `4–10` is already a meaningful chunk.

---

## 2. Where the speed comes from

Collision resolution happens in `resolveCollision()` around
`useSpinnerGame.ts:1325`. The important ordering:

1. **Compute `aSpeed`, `bSpeed`** from pre-bounce velocity.
2. **Apply elastic bounce** (swap normal-velocity components, multiply by
   `BOUNCE_DAMPENING = 0.75`) and separate the overlap.
3. **Compute damage** using the speeds captured in step 1.

This matters: the elastic bounce happens **before** the damage calc, but
the damage still uses the speed from **before** the bounce. So killing
blows still produce a visible ricochet, and the defender's post-collision
speed doesn't affect the damage of the hit that just killed them.

`speed` maxes out at `BASE_MAX_FORCE · A.speedMultiplier = 14 · speedMul`.
For a speedy-bottom blade (`1.5×`) that's a cap of `21`; for tanky (`0.7×`)
it's `9.8`.

---

## 3. Crits (back-hits)

A hit is a crit when **all** of these are true (checked around
`useSpinnerGame.ts:1523`):

1. The attacker is not *itself* being hit in the back (symmetric — see §4).
2. The **contact point lies in the defender's rear 90° cone** — i.e. the
   defender is moving roughly *away* from the attacker along the contact
   normal.
3. The defender is moving fast enough to have a meaningful "forward"
   direction: `defenderSpeed ≥ 25% of its max speed`.
4. The attacker is **at least 2× faster** than the defender (prevents a
   love-tap chaser from critting).
5. The defender has not been crit in the last `CRIT_COOLDOWN_MS = 1500 ms`.

On a crit:

- `atkMul = 1.25` (+25% raw damage)
- `defMul = 1` (defender's defense is ignored entirely)
- The camera shake is the "big" variant.

So the full crit amplification is `1.25 / defenseMul`. Against a Round
Guard (1.5 def) that's a **~2.08×** multiplier vs. a non-crit. Against
Soft Shell (1.8 def) it's **2.25×**. Against Star (0.8 def) it's **1.56×**.

---

## 4. Back-hit protection (no damage when rear-ended)

The `aHitInBack` / `bHitInBack` flags serve two purposes:

- They **flip the crit** onto the other side (getting caught from behind
  means the catcher crits *you*).
- They **suppress your own attack**. If you're being hit in the back, the
  `if (!aHitInBack)` guard at line 1523 means *you* don't get a damage
  roll back on the attacker. Rear-ending is a pure one-way exchange.

Spiky chip damage (§6) respects the same rule — you can't chip someone by
getting rear-ended into them.

---

## 5. Worked examples

All examples assume the non-debug `DAMAGE_SCALE = 1`, Arena = not Thunder
(so `comboMul = 1`), and no crit cooldowns / speed-caps in effect.

### Example 1 — Star/Balanced rams Round/Balanced at full speed

- A: Star + Balanced, level 0 — `damageMul = 1.8`, `defMul = 0.8`, `weight = 110`, max speed `14`.
- B: Round + Balanced, level 0 — `damageMul = 0.8`, `defMul = 1.5`, `weight = 110`, max speed `14`.
- A is launched, B is sitting at rest (`speed < STOP_THRESHOLD`), head-on
  (not a back-hit):
    - `speed(A) ≈ 14`
    - `aHitInBack = false`, `bHitInBack = false` (B not moving fast enough)
    - `isCrit = false` (no back-hit)
    - `atkMul = 1`, `defMul = B.defMul = 1.5`
    - `speedAdv(B) = 1` (B is basically 0, so the "2× faster" check trips: B
      is not ≥ 2× A, the check is `B ≥ A × 2`, so `bSpeedAdv = 1`)

```
dmg(A → B) = (14 · 1.8 · 1 · 110) / (110 · 1.5) · 1 · 1 · 1
           = 2772 / 165
           ≈ 16.8
```

B's `maxHp = 20 (base) + 15 (round) + 10 (balanced) = 45`, so a clean
broadside takes B from 45 → ~28. Meanwhile B deals 0 damage back because
`speed(B) ≤ STOP_THRESHOLD`.

### Example 2 — Same hit but on B's back (crit)

Same A and B, but now B is moving away from A at 80% of its max speed
(`speed(B) ≈ 11.2`), so it's fast enough for a back-hit check and the
contact lies in its rear cone. A chases it down.

- Is A ≥ 2× faster than B? `14 ≥ 2·11.2 = 22.4` → **false**. Not a crit.

So raising the speed threshold back up: suppose B is moving away at only
`25% = 3.5`. Now A `14 ≥ 2·3.5 = 7` → true, crit fires.

- `atkMul = 1.25`, `defMul = 1`
- `bSpeedAdv = 1` (B is nowhere near 2× A).

```
dmg(A → B) = (14 · 1.8 · 1.25 · 110) / (110 · 1) · 1 · 1 · 1
           = 3465 / 110
           ≈ 31.5
```

That's nearly B's entire 45 HP in a single rear-ram. Meanwhile B's own
counter-hit is **suppressed** (`!bHitInBack` is false on B's side), so
B deals zero damage this frame even though it's moving.

### Example 3 — Tank-piercer vs. Soft Shell defender

- A: Piercer + Tanky, level 0 — `damageMul = 1.7`, `defMul = 0.8`, `weight = 150`, max speed `14 · 0.7 = 9.8`.
- B: Cushioned (Soft Shell) + Balanced, level 0 — `damageMul = 0.6`,
  `defMul = 1.8`, `weight = 110`.
- A launches at ~9 into a parked B, not a back-hit:

Piercer halves the defender's bonus: `defMul = 1 + (1.8 − 1) · 0.5 = 1.4`.

```
dmg(A → B) = (9 · 1.7 · 1 · 150) / (110 · 1.4) · 1 · 1 · 1
           = 2295 / 154
           ≈ 14.9
```

Without the piercer passive that would be `2295 / (110 · 1.8) ≈ 11.6`,
so piercer is worth about **+28% damage** into a heavy defensive top.

### Example 4 — Thunder-arena combo

Same matchup as Example 1 (A: Star/Balanced, B: Round/Balanced), but now
in a Thunder arena. A chains three hits on B within 3 s, each separated
by at least `COMBO_GRACE_MS = 100 ms`:

- Hit 1 — no combo set yet, `aComboMul = 1` → ~16.8 dmg.
- Hit 2 — stacks incremented to 1, `aComboMul = 1.1` → `~16.8 · 1.1 ≈ 18.5`.
- Hit 3 — stacks incremented to 2, `aComboMul = 1.2` → `~16.8 · 1.2 ≈ 20.2`.

The combo resets if A hits a different target or more than
`COMBO_WINDOW_MS = 3000 ms` elapse between hits.

### Example 5 — Speed-advantage reduction

A: Speedy/Star at 20 speed, B: Tanky/Piercer at 8 speed. A rams B head-on.

- `aSpeed = 20`, `bSpeed = 8`.
- A attacking B: is A ≥ 2× B? `20 ≥ 16` → yes, so `bSpeedAdv = 0.75`
  applied to A's damage against B. A's damage is reduced by 25% because
  it is blowing past a relatively stationary target.
- B attacking A: `aSpeedAdv = 0.75` applied to B's damage against A.
  The slower B counter-punch also loses 25%. (The name is confusing — the
  factor is attached to the *receiver* of the attack.)

The net effect: when there's a big speed gap, both sides trade at 75% of
the normal exchange. This is a soft anti-snowball: a fully-kited blade
can still trade chip damage on each pass instead of getting trivially
out-DPSed.

---

## 6. Spiky chip damage (Triangle top)

Independent of the formula above. Every collision pair where at least one
side has the `triangle` (Spiky) top applies a **flat 1 HP** (`SPIKY_FLAT_DAMAGE`)
chip from the spiky blade to the other side, throttled per-pair by
`SPIKY_CHIP_COOLDOWN_MS = 150 ms`. The chip is suppressed if the spiky
blade is the one being rear-hit, and it doesn't care about speed at all —
hugging / slow-chasing a target turns into constant pressure. Low DPS in
absolute terms, but unavoidable without separation.

---

## 7. Friendly-fire / same-group contacts

Blades sharing a `groupId` (boss partners, healer allies, ghost twins,
split children) never damage each other. Depending on their
`bouncesAllies` flag they either:

- **Bounce** elastically and get separated (partners, healers), so they
  can't stack on top of each other, or
- **Phase through** (ghost twins, split siblings).

Healer allies on contact heal each other for up to
`HEALER_CONTACT_HEAL = 2` HP, capped to the missing HP, with a
`HEALER_HEAL_COOLDOWN_MS = 250 ms` throttle per pair. Heal values are
rounded to integers (`Math.round`) so the damage-number popup never shows
fractional HP.

---

## 8. Ghost-link mirror (split / ghost bosses)

Some bosses maintain a "ghost link" across cloned halves. Any damage
applied to one half is mirrored 1:1 to the linked half inside
`applyBladeDamage()`. So the *formula* stays the same — the amount the
player rolls is computed once, then each tied half eats the same amount.

---

## 9. First-game boost

If `firstGameBoost` is active and the attacker is the player, the
attacker's `damageMultiplier` is doubled inside `statsFor()` (and their
`maxHp` is also doubled at spawn time). This is a pity-timer for brand-new
players and layers multiplicatively on top of everything in §1.

---

## 10. Summary cheat sheet

- **Base formula**: damage scales linearly with `attackerSpeed`,
  `attackerDamageMul`, and the `attackerWeight / defenderWeight` ratio,
  and inversely with `defenderDefenseMul`.
- **Crits**: ignore defense and add +25% attack. Require back-hit in a
  90° rear cone **and** attacker ≥ 2× defender speed, with a 1.5 s
  per-target cooldown.
- **Piercer top** halves the defender's defense *bonus*, not the full
  multiplier.
- **Thunder arena**: same attacker → same target → +10% per stack, up to
  3 s between hits.
- **Speed gap ≥ 2×**: both sides' damage to each other scaled by 0.75.
- **Spiky top**: flat +1 chip HP on every pair every 150 ms, independent
  of speed.
- **Stationary blades (< STOP_THRESHOLD)**: deal **zero** damage.
- **Back-hit victim**: no counter-damage this frame.
- **Same-group allies**: no damage ever (bounce or phase through).
- **Debug build**: `DAMAGE_SCALE = 10` — everything one-shots.

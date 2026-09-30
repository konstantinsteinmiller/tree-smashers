# WP10 balance re-verification (2026-09-30)

Sim state: skill tables read from `src/data/skillCatalog.ts` (single source); collision
pairs in post-WP0 syncKey order; star-top crit on the seeded match stream.

| check                                                   | target                  | measured                                          | result                    |
|---------------------------------------------------------|-------------------------|---------------------------------------------------|---------------------------|
| quick: Phase Step + Static Charge, stage 30, N 600      | ≈ 1.43                  | 1.43 (max+2SE 1.52)                               | pass                      |
| confirm.mjs, same pair, stage 30, N 2000                | CI hi ≤ 1.50            | PI 1.407, 95 % CI 1.373–1.442                     | pass                      |
| confirm, 14 top pairs × stages 15/30/95                 | all ≤ 1.50              | max 1.407 (all 42 rows bit-identical to v7)       | pass                      |
| full 45-pair sweep, L10, 13 stages, N 600               | max ≤ 1.50              | max 1.43, median of per-pair worst 1.32, min 1.17 | pass                      |
| tank vs life-leech boss (stage 30), 5 top pairs, N 2000 | ≈ ≤ 1.55 (accepted)     | 1.546 / 1.533 / 1.530 / 1.512 / 1.499             | pass (accepted exception) |
| skillecon, typical @ 35 % share                         | all 10 maxed ≈ stage 80 | 2 maxed @33, 4 @49, all 10 @80                    | pass                      |

The v10 sweep equals `v7_pairs10.json` on every PI/OFF/DEF/win-rate field; the only diffs
are float-summation noise (≤ 3e-16 relative) in the diagnostic `taken`/`dealt`
accumulators and `procs` key order, caused by a different worker count (3 vs 10).
No number moved, so `skills-feature.md` was not regenerated.

Files: `v10_pairs10.json`, `v10_confirm_default.json`, `v10_confirm_tank.json`,
`v10_skillecon.txt`. The v7 files stay as fill.mjs inputs (numerically identical).

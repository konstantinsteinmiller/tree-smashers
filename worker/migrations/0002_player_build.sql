-- 0002 — the player's BUILD on their leaderboard row (league plan LG-SNAP).
--
-- Run ONCE against the live database BEFORE deploying the Worker that writes
-- these columns (see SETUP.md, "Upgrading: player builds"):
--
--   npx wrangler d1 execute leaderboard-tree-smashers --remote --file=./migrations/0002_player_build.sql
--
-- All three columns are nullable: every existing row, and every post from a
-- client that predates builds, simply has none. SQLite's ADD COLUMN cannot be
-- made idempotent, so a second run fails with "duplicate column name" — that
-- error means it was already applied and is harmless.

-- PlayerBuildV1 as canonical JSON (src/utils/playerBuild.ts), validated
-- structurally by the Worker on write.
ALTER TABLE scores ADD COLUMN build TEXT;
-- When the build was last stored (ms). Refreshes are throttled to one per 6 h
-- per row, and a refresh NEVER touches `score` or `updated_at`.
ALTER TABLE scores ADD COLUMN build_at INTEGER;
-- Server-computed league power of `build`: Σ part levels + round(0.8 × Σ skill
-- levels). What league opponents are matched by.
ALTER TABLE scores ADD COLUMN lpower INTEGER;

-- Opponent lookup: rows WITH a build, nearest power, freshest first. Partial,
-- so the (many) build-less legacy rows cost the index nothing.
CREATE INDEX IF NOT EXISTS idx_scores_lpower ON scores (lpower, build_at DESC) WHERE build IS NOT NULL;

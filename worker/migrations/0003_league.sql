-- 0003 — the simulated-PvP LEAGUE (league plan LG4).
--
-- Run ONCE against the live database, AFTER 0002 and BEFORE deploying the
-- Worker that serves /league/* (see SETUP.md, "Upgrading: the league"):
--
--   npx wrangler d1 execute leaderboard-chaos-arena --remote --file=./migrations/0003_league.sql
--
-- Only CREATE ... IF NOT EXISTS, so a second run is a harmless no-op. Nothing
-- here touches `scores`: league opponents are READ from it (the 0002 build
-- columns and their partial index), never written.

-- One row per player who has started a ranked fight. Season-scoped fields are
-- reset lazily by the Worker (leagueMath.rollover) on the player's next write,
-- so a player who sits a season out keeps an old `season` and simply drops out
-- of the current season's /league/top.
CREATE TABLE IF NOT EXISTS league
(
    id          TEXT PRIMARY KEY,
    season      INTEGER NOT NULL,
    lp          INTEGER NOT NULL DEFAULT 0,
    -- Highest LP this season (floor, first-reach, season reward).
    peak_lp     INTEGER NOT NULL DEFAULT 0,
    -- Highest tier ever reached, any season (0 = wood … 6 = champion).
    best_tier   INTEGER NOT NULL DEFAULT 0,
    -- This season's results (streak = consecutive wins).
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    streak      INTEGER NOT NULL DEFAULT 0,
    -- Loss-proof fights left after a promotion.
    shields     INTEGER NOT NULL DEFAULT 0,
    -- seasonFloorLp(peak_lp), stored for reading convenience.
    floor       INTEGER NOT NULL DEFAULT 0,
    -- UTC day (days since 1970) of `fights` and `gained`.
    day         INTEGER NOT NULL DEFAULT 0,
    -- /league/start calls today (SERVER_DAILY_CAP) and LP gained today (DAILY_LP_CAP).
    fights      INTEGER NOT NULL DEFAULT 0,
    gained      INTEGER NOT NULL DEFAULT 0,
    -- The one battle in flight: token, issue time (ms), opponent id
    -- (`p:<scores rowid>`, `npc:<band>:<seed>` or `gate:<tier>`) and expected
    -- score. NULL when none. An expired one counts as a loss (plan O10).
    pend_tok    TEXT,
    pend_at     INTEGER,
    pend_opp    TEXT,
    pend_e      REAL,
    -- Display name as last sent to /league/start (sanitised on write AND read).
    name        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    -- The last finished season the player fought in, and its peak tier index —
    -- kept so /league/me can report it after the lazy reset rewrote the row.
    last_season INTEGER,
    last_tier   INTEGER
);

-- /league/top and the LP histogram: this season, highest LP first.
CREATE INDEX IF NOT EXISTS idx_league_season_lp ON league (season, lp DESC);

-- Materialised league reads (opponent pools per power band, the league top,
-- its histogram, the bake export), one JSON blob per row — same idea as
-- `board_cache`, kept apart so the two features never evict each other.
CREATE TABLE IF NOT EXISTS league_cache
(
    id         TEXT PRIMARY KEY,
    json       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);

-- One row per player. `id` is an anonymous, client-generated, stable-per-save
-- string — never an account, never a device fingerprint.
CREATE TABLE IF NOT EXISTS scores
(
    id
    TEXT
    PRIMARY
    KEY,
    name
    TEXT
    NOT
    NULL,
    -- THE score: the highest campaign stage this player has ever reached.
    score
    INTEGER
    NOT
    NULL,
    -- Flavour shown beside the rank: the summed upgrade levels of their team.
    power
    INTEGER
    NOT
    NULL,
    updated_at
    INTEGER
    NOT
    NULL,
    -- The player's build (team + skins + skills) as canonical JSON, the time
    -- it was stored, and its server-computed league power. NULL for rows that
    -- never posted one. Added by migrations/0002_player_build.sql on an
    -- existing database; a fresh database gets them here.
    build
    TEXT,
    build_at
    INTEGER,
    lpower
    INTEGER
);

-- League opponent lookup (rows with a build, by power, freshest first).
CREATE INDEX IF NOT EXISTS idx_scores_lpower ON scores (lpower, build_at DESC) WHERE build IS NOT NULL;

-- The board is always read in exactly this order, and rank is
-- `COUNT(*) WHERE score > ?`, so one index serves both.
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, updated_at ASC);

-- The materialised top-N, as ONE row of JSON.
--
-- Reading the top 100 as 100 rows would burn 100 of D1's 5M daily row reads per
-- board view — about 50 000 views a day. As a single blob it is one read, and
-- zero on an edge-cache hit.
CREATE TABLE IF NOT EXISTS board_cache
(
    id
    TEXT
    PRIMARY
    KEY,
    json
    TEXT
    NOT
    NULL,
    updated_at
    INTEGER
    NOT
    NULL
);


-- ─── League (also migrations/0003_league.sql on an existing database) ───────

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

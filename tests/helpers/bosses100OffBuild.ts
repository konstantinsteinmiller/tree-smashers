// ─── Bosses100-OFF build test harness ───────────────────────────────────────
//
// Import FIRST in a test that pins the bosses100-off build: the bosses gate
// reads VITE_APP_FEATURE_BOSSES100 once, when it is evaluated. (The base .env
// already says "false"; this makes the test independent of the developer's env.)

import { vi } from 'vitest'

vi.stubEnv('VITE_APP_FEATURE_BOSSES100', 'false')

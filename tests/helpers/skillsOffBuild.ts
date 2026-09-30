// ─── Skills-OFF build test harness ──────────────────────────────────────────
//
// Import FIRST in a test that pins the skills-off build: the skills gate reads
// VITE_APP_FEATURE_SKILLS once, when it is evaluated. (The base .env already
// says "false"; this makes the test independent of the developer's env.)

import { vi } from 'vitest'

vi.stubEnv('VITE_APP_FEATURE_SKILLS', 'false')

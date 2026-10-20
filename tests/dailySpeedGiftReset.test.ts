// useUser FIRST: resetAllProgress' import graph reaches useModels, which trips
// the useMatch ↔ useModels ↔ useUser cycle under Vitest otherwise.
import useUser from '@/use/useUser'
import { afterEach, describe, expect, it } from 'vitest'
import { DAILY_SPEED_GIFT_KEY, DAILY_SPEED_GIFT_LOCAL_KEY, SPEED_GIFT_KEY } from '@/use/speedGiftGate'
import { resetAllProgress } from '@/use/useResetProgress'

void useUser

describe('resetAllProgress keeps the free speed-up anti-farm keys', () => {
  afterEach(() => localStorage.clear())

  it('a reset cannot buy back today\'s daily gift or the first-time gift', async () => {
    localStorage.setItem('smashers_campaign_stage', '9')
    localStorage.setItem(SPEED_GIFT_KEY, 'used')
    localStorage.setItem(DAILY_SPEED_GIFT_KEY, '2026-09-30')
    localStorage.setItem(DAILY_SPEED_GIFT_LOCAL_KEY, '2026-09-30')
    await resetAllProgress()
    expect(localStorage.getItem('smashers_campaign_stage')).not.toBe('9')
    expect(localStorage.getItem(SPEED_GIFT_KEY)).toBe('used')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_KEY)).toBe('2026-09-30')
    expect(localStorage.getItem(DAILY_SPEED_GIFT_LOCAL_KEY)).toBe('2026-09-30')
  })
})

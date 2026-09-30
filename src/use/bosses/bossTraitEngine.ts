// ─── The engine's boss-trait port (bosses-100-feature.md §4, §7.3, §12.2) ────
//
// Everything useSpinnerGame needs to RUN a trait encounter — the pure trait
// rules (bossTraits.ts) and their VFX / SFX (bossTraitVfx.ts → bossTraitSfx.ts)
// — handed to the engine as ONE module object through the bosses gate
// (`loadBossTraitEngine`, src/bosses/bosses100Gate.ts) and installed with
// `installBossTraitEngine`. The engine imports none of it statically, so a
// bosses100-off build (`VITE_APP_FEATURE_BOSSES100=false`) bundles no trait
// rule, no trait VFX and no boss SFX name at all.
//
// The two factories below keep the event-kind / trait literals of the engine's
// preallocated event objects out of the engine module as well.

import type { BossTraitEvent } from '@/use/bosses/bossTraitVfx'
import { BOSS_TRAIT_EVENT_BUFFER } from '@/use/bosses/bossTraitVfx'

export {
  BOSS_TRAIT_TUNING, applyEmberBurn, beginTeamTurnTraits, bossClockHashPart, createBossClock,
  createTraitContactResult, createTraitHudRow, emberVictimMask, endTeamTurnTraits, hasBossTraits,
  hasLivingEmberCarrier, chillSpeedMul, initTraitVictim, isFrostLockedFor, novaCharge, onTraitContact, resetBossClock,
  tickBossClock, traitHashPart, writeTraitHud
} from '@/use/bosses/bossTraits'
export {
  BOSS_TRAIT_EVENT_BUFFER, bossTraitVfxEvent, createBossTraitVfx, prepareBossTraitVfx, renderBossAura,
  renderBossTraitLayer, renderChillOverlay, renderEmberCharge, renderIceShell, resetBossTraitVfx,
  tickBossTraitVfx, drawBossTraitGlyph, isBossTraitGlyph
} from '@/use/bosses/bossTraitVfx'

const blankEvent = (kind: BossTraitEvent['kind'], trait: BossTraitEvent['trait']): BossTraitEvent => ({
  seq: 0, t: 0, kind, trait,
  bladeId: -1, syncKey: -1, owner: 'player', x: 0, y: 0, radius: 0, value: 0
})

/** The engine's trait event ring (VFX/SFX feed, HUD, QA) — overwritten in place. */
export const createBossTraitEventRing = (): BossTraitEvent[] =>
  Array.from({ length: BOSS_TRAIT_EVENT_BUFFER }, () => blankEvent('nova', 'ember'))

/** The render-only crack a refused tap on a frozen spinner plays (never in the ring). */
export const createTapCrackEvent = (): BossTraitEvent => blankEvent('freeze_crack', 'frost')

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import {
  combatLogVersion,
  getCombatLogSnapshot,
  MAX_COMBAT_LOG_ENTRIES,
  type CombatLogEntry
} from '@/use/useCombatLog'

// Minimised-by-default combat log. The toggle is a small, quiet button (the
// parent pins it above the Spinner 1 stat card); tapping it opens the full,
// scrollable feed of the last 200 hits. Deliberately unobtrusive — this is a
// strategist tool, not something casual players should notice.

const { t } = useSfcI18n('CombatLog')
const open = ref(false)

// One human-readable side label, e.g. "Enemy Tank Piercer" / "Spinner 1 Star
// Blade". The blade "skin name" is its top-part archetype — the strategically
// meaningful identity (crit / pierce / tank …), and the only fully-translated
// blade name the game ships.
const sideLabel = (owner: 'player' | 'npc', spinner: number | null, part: string): string => {
  const type = t(`types.${part}`)
  return owner === 'npc'
    ? t('enemy', { type })
    : t('spinner', { n: spinner ?? 1, type })
}

// Short label without the type, used inside the "speed favors …" tag.
const shortSide = (owner: 'player' | 'npc', spinner: number | null): string =>
  owner === 'npc' ? t('whoEnemy') : t('whoSpinner', { n: spinner ?? 1 })

const renderEntry = (e: CombatLogEntry): string => {
  const attacker = sideLabel(e.attackerOwner, e.attackerSpinner, e.attackerPart)
  const target = sideLabel(e.targetOwner, e.targetSpinner, e.targetPart)
  let line = t('line', { attacker, dmg: e.dmg, target })
  const tags: string[] = []
  if (e.crit) tags.push(t('crit'))
  if (e.speedFavors) {
    const name = e.speedFavors === 'attacker'
      ? shortSide(e.attackerOwner, e.attackerSpinner)
      : shortSide(e.targetOwner, e.targetSpinner)
    tags.push(t('speedFavors', { name }))
  }
  if (tags.length) line += ` — ${tags.join(', ')}`
  return line
}

// Newest-first, re-derived whenever a hit lands (via the version bump). Only
// materialises the strings while the panel is actually open.
const rendered = computed(() => {
  void combatLogVersion.value
  if (!open.value) return []
  return getCombatLogSnapshot().map(e => ({
    id: e.id,
    text: renderEntry(e),
    mine: e.attackerOwner === 'player',
    crit: e.crit
  }))
})

const maxEntries = MAX_COMBAT_LOG_ENTRIES
</script>

<template lang="pug">
  //- Minimised toggle — a small wood plate with a "list" glyph (it sits on the arena).
  button.combat-log-toggle.pointer-events-auto.flex.items-center(
    type="button"
    class="gap-1 px-1.5 py-0.5 active:scale-95 transition-transform"
    :aria-label="t('aria')"
    :title="t('title')"
    @click="open = true"
  )
    svg(viewBox="0 0 24 24" class="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true")
      path(fill="currentColor" d="M4 5h16v2H4zM4 9h16v2H4zM4 13h10v2H4zM4 17h10v2H4z")
    span.combat-log-toggle-text.ui-outline-sm(class="text-[0.7rem] sm:text-[0.75rem] tracking-wide") {{ t('short') }}

  //- Expanded feed
  FModal(
    :model-value="open"
    :is-closable="true"
    :title="t('title')"
    @update:model-value="open = false"
  )
    div(class="px-1 sm:px-3 py-1")
      div.text-center.ui-body(class="text-[0.75rem] sm:text-xs mb-2") {{ t('hint', { n: maxEntries }) }}
      //- No local scroll cap — FModal's content slot scrolls (see the
      //- `.modal-content-slot` rule there). A `max-h-[60vh]` here produced a
      //- second, nested scroller whose bar stopped well short of the frame.
      div.combat-log-list.flex.flex-col(class="gap-1 pr-1")
        div.text-center.ui-body(
          v-if="rendered.length === 0"
          class="text-xs py-6"
        ) {{ t('empty') }}
        //- Mine = sky (defense/info), theirs = berry (attack).
        div.combat-log-line.text-left(
          v-for="r in rendered"
          :key="r.id"
          :class="[            r.mine ? 'is-mine' : 'is-theirs',            r.crit ? 'font-black' : 'font-bold'          ]"
          class="text-[0.85rem] sm:text-sm leading-snug"
        ) {{ r.text }}
</template>

<style scoped lang="sass">
.combat-log-toggle
  color: var(--color-cream-50)
  background-color: var(--color-wood-600)
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui-sm)
  box-shadow: inset 0 2px 0 var(--color-wood-400), 0 2px 0 var(--color-ink)

  &:hover
    background-color: var(--color-wood-500)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

.combat-log-line
  padding: 0.15rem 0.45rem
  border-radius: var(--radius-ui-sm)
  border-left: 4px solid transparent
  background-color: var(--color-cream-200)

  &.is-mine
    color: var(--color-sky-700)
    border-left-color: var(--color-sky-500)

  &.is-theirs
    color: var(--color-berry-700)
    border-left-color: var(--color-berry-500)
</style>

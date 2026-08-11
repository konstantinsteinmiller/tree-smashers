<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
  //- Minimised toggle — quiet dark pill with a "list" glyph.
  button.combat-log-toggle.pointer-events-auto.flex.items-center.rounded-md.border(
    class="gap-1 px-1.5 py-0.5 bg-black/55 border-white/15 backdrop-blur-sm active:scale-95 transition-transform"
    :aria-label="t('aria')"
    :title="t('title')"
    @click="open = true"
  )
    svg(viewBox="0 0 24 24" class="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true")
      path(fill="currentColor" d="M4 5h16v2H4zM4 9h16v2H4zM4 13h10v2H4zM4 17h10v2H4z")
    span.combat-log-toggle-text.game-text.uppercase(class="text-[0.7rem] sm:text-[0.75rem] tracking-wide") {{ t('short') }}

  //- Expanded feed
  FModal(
    :model-value="open"
    :is-closable="true"
    :title="t('title')"
    @update:model-value="open = false"
  )
    div(class="px-1 sm:px-3 py-1")
      div.text-center.text-slate-400.game-text(class="text-[0.75rem] sm:text-xs mb-2") {{ t('hint', { n: maxEntries }) }}
      //- No local scroll cap — FModal's content slot scrolls (see the
      //- `.modal-content-slot` rule there). A `max-h-[60vh]` here produced a
      //- second, nested scroller whose bar stopped well short of the frame.
      div.combat-log-list.flex.flex-col(class="gap-1 pr-1")
        div.text-center.text-slate-400.game-text(
          v-if="rendered.length === 0"
          class="text-xs py-6"
        ) {{ t('empty') }}
        div.combat-log-line.game-text.text-left(
          v-for="r in rendered"
          :key="r.id"
          :class="[\
            r.mine ? 'text-cyan-200' : 'text-red-200',\
            r.crit ? 'font-black' : 'font-medium'\
          ]"
          class="text-[0.85rem] sm:text-sm leading-snug"
        ) {{ r.text }}
</template>

<style scoped lang="sass">
.combat-log-toggle
  color: rgba(255, 255, 255, 0.75)
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5)

  &:hover
    color: rgba(255, 255, 255, 0.95)

.combat-log-line
  padding: 0.15rem 0.35rem
  border-radius: 4px
  background: rgba(255, 255, 255, 0.04)
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.8)
</style>

<i18n lang="yaml">
en:
  title: "Combat Log"
  short: "Log"
  aria: "Open combat log"
  hint: "For strategists · last {n} hits, newest first"
  empty: "No combat yet — the log fills in as blades clash."
  line: "{attacker} deals {dmg} damage to {target}"
  enemy: "Enemy {type}"
  spinner: "Spinner {n} {type}"
  whoEnemy: "Enemy"
  whoSpinner: "Spinner {n}"
  crit: "Critical strike"
  speedFavors: "speed favors {name}"
  types:
    star: "Star Blade"
    triangle: "Spiky"
    round: "Round Guard"
    quadratic: "Quad Core"
    cushioned: "Soft Shell"
    piercer: "Tank Piercer"
de:
  title: "Kampfprotokoll"
  short: "Log"
  aria: "Kampfprotokoll öffnen"
  hint: "Für Strategen · letzte {n} Treffer, neueste zuerst"
  empty: "Noch kein Kampf — das Protokoll füllt sich, sobald die Klingen aufeinandertreffen."
  line: "{attacker} fügt {target} {dmg} Schaden zu"
  enemy: "Gegner {type}"
  spinner: "Spinner {n} {type}"
  whoEnemy: "Gegner"
  whoSpinner: "Spinner {n}"
  crit: "Kritischer Treffer"
  speedFavors: "Tempo begünstigt {name}"
  types:
    star: "Sternklinge"
    triangle: "Stachel"
    round: "Rundschutz"
    quadratic: "Quad-Kern"
    cushioned: "Weichpanzer"
    piercer: "Panzerbrecher"
fr:
  title: "Journal de combat"
  short: "Journal"
  aria: "Ouvrir le journal de combat"
  hint: "Pour les stratèges · {n} derniers coups, du plus récent"
  empty: "Pas encore de combat — le journal se remplit au fil des chocs."
  line: "{attacker} inflige {dmg} dégâts à {target}"
  enemy: "Ennemi {type}"
  spinner: "Toupie {n} {type}"
  whoEnemy: "Ennemi"
  whoSpinner: "Toupie {n}"
  crit: "Coup critique"
  speedFavors: "la vitesse favorise {name}"
  types:
    star: "Lame étoile"
    triangle: "Épineux"
    round: "Bouclier rond"
    quadratic: "Noyau carré"
    cushioned: "Carapace"
    piercer: "Perce-blindage"
es:
  title: "Registro de combate"
  short: "Registro"
  aria: "Abrir registro de combate"
  hint: "Para estrategas · últimos {n} golpes, más recientes primero"
  empty: "Aún no hay combate — el registro se llena cuando las cuchillas chocan."
  line: "{attacker} inflige {dmg} de daño a {target}"
  enemy: "Enemigo {type}"
  spinner: "Peonza {n} {type}"
  whoEnemy: "Enemigo"
  whoSpinner: "Peonza {n}"
  crit: "Golpe crítico"
  speedFavors: "la velocidad favorece a {name}"
  types:
    star: "Cuchilla estelar"
    triangle: "Espinoso"
    round: "Guardia redonda"
    quadratic: "Núcleo cuádruple"
    cushioned: "Coraza blanda"
    piercer: "Perforador"
jp:
  title: "戦闘ログ"
  short: "ログ"
  aria: "戦闘ログを開く"
  hint: "戦略家向け · 直近{n}ヒット（新しい順）"
  empty: "まだ戦闘はありません — ブレードがぶつかると記録されます。"
  line: "{attacker} が {target} に {dmg} ダメージ"
  enemy: "敵 {type}"
  spinner: "スピナー{n} {type}"
  whoEnemy: "敵"
  whoSpinner: "スピナー{n}"
  crit: "クリティカル"
  speedFavors: "速度は{name}に有利"
  types:
    star: "スターブレード"
    triangle: "スパイキー"
    round: "ラウンドガード"
    quadratic: "クアッドコア"
    cushioned: "ソフトシェル"
    piercer: "アーマーブレイク"
kr:
  title: "전투 로그"
  short: "로그"
  aria: "전투 로그 열기"
  hint: "전략가용 · 최근 {n}회 타격, 최신순"
  empty: "아직 전투가 없습니다 — 블레이드가 충돌하면 기록됩니다."
  line: "{attacker}이(가) {target}에게 {dmg} 피해를 입힘"
  enemy: "적 {type}"
  spinner: "스피너 {n} {type}"
  whoEnemy: "적"
  whoSpinner: "스피너 {n}"
  crit: "치명타"
  speedFavors: "속도는 {name}에게 유리"
  types:
    star: "스타 블레이드"
    triangle: "가시"
    round: "라운드 가드"
    quadratic: "쿼드 코어"
    cushioned: "소프트 쉘"
    piercer: "관통자"
zh:
  title: "战斗记录"
  short: "记录"
  aria: "打开战斗记录"
  hint: "面向策略玩家 · 最近{n}次命中，最新在前"
  empty: "暂无战斗 — 刀刃碰撞时会记录到这里。"
  line: "{attacker} 对 {target} 造成 {dmg} 点伤害"
  enemy: "敌方 {type}"
  spinner: "陀螺 {n} {type}"
  whoEnemy: "敌方"
  whoSpinner: "陀螺 {n}"
  crit: "暴击"
  speedFavors: "速度更有利于{name}"
  types:
    star: "星刃"
    triangle: "尖刺"
    round: "圆盾"
    quadratic: "方核"
    cushioned: "软甲"
    piercer: "穿甲者"
ru:
  title: "Журнал боя"
  short: "Лог"
  aria: "Открыть журнал боя"
  hint: "Для стратегов · последние {n} ударов, сначала новые"
  empty: "Боя ещё не было — журнал заполнится, когда клинки столкнутся."
  line: "{attacker} наносит {dmg} урона по {target}"
  enemy: "Враг {type}"
  spinner: "Спиннер {n} {type}"
  whoEnemy: "Враг"
  whoSpinner: "Спиннер {n}"
  crit: "Критический удар"
  speedFavors: "скорость на стороне {name}"
  types:
    star: "Звёздный клинок"
    triangle: "Шипастый"
    round: "Круглый щит"
    quadratic: "Квадро-ядро"
    cushioned: "Мягкий панцирь"
    piercer: "Бронебой"
</i18n>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import { playUiSfx } from '@/use/uiSfx'
import usePVP, { revealBots, setLocalPvpProfile, type PvPGameConfig } from '@/use/usePVP'
import usePvpStats from '@/use/usePvpStats'
import useSpinnerCampaign, { ARENA_TYPES, sanitizeArenaType, type ArenaType } from '@/use/useSpinnerCampaign'
// The bracket pip borrows only the shared tier palette — never the league's
// components (a league-off build ships no league marker; leagueFlagPurity).
import { LEAGUE_TIER_META } from '@/use/leagueTiers'
import { playerDisplayName } from '@/use/usePlayerIdentity'
import { unlockedSmashers } from '@/use/useSmashers'
import {
  bracketTier,
  createBotOpponent,
  rememberBotName,
  teamDisplayLevel,
  type BotOpponent,
  type OpponentProfile
} from '@/use/pvpBots'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { getSelectedSkin } from '@/use/useModels'
import { isSdkActive } from '@/use/useCrazyGames'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
// Skills: lazy through the skills gate — null / [] on a skills-off build,
// where the lobby sends an empty loadout and keeps its plain ready dots.
import { PvpReadySkillsUi } from '@/skills/skillsGate'
import { fieldTeam, teamConfigs } from '@/use/useSmashers'
import { PVP_DEFAULT_TEAM_SIZE, TEAM_SIZES, type TeamSize } from '@/data/teamSize'
import { smasherConfig, smasherLoadout, isSmasherId } from '@/data/smasherCatalog'
import type { SkillLoadout } from '@/types/skills'

interface Props {
  isOpen: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start-pvp'): void
}>()

const { t } = useI18n()

const {
  status,
  role,
  peerId,
  inviteLink,
  expirySeconds,
  errorMessage,
  gameConfig,
  hostReady,
  guestReady,
  hostTeam,
  guestTeam,
  bothReady,
  pendingInviteCode,
  createLobby,
  joinLobby,
  setReady,
  setUnready,
  updateGameConfig,
  startMatch,
  copyInviteLink,
  leavePvP,
  matchKind,
  searchElapsedMs,
  opponentProfile,
  joiningFriendName,
  startQuickMatch,
  cancelQuickMatch,
} = usePVP()

const { wins, losses, honor, botSkill } = usePvpStats()
const { currentStageId } = useSpinnerCampaign()

// Folded out of a CrazyGames build (the env literal): CG invites go through
// the platform, and no external share target ships there.
const whatsappShareLink = computed(() => {
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true' || !inviteLink.value) return ''
  const text = encodeURIComponent(`${t('pvp.shareText')}\n${inviteLink.value}`)
  return `https://wa.me/?text=${text}`
})

// ─── Local UI State ──────────────────────────────────────────────────────

const { playerTeam } = useSpinnerConfig()

const selectedArena = ref<ArenaType>('default')
const selectedTeamSize = ref<TeamSize>(PVP_DEFAULT_TEAM_SIZE)
const levelOne = ref(false)
const copied = ref(false)
const codeCopied = ref(false)
const joiningPeerId = ref('')
const clipboardHighlight = ref(false)

// Arena display config — flat cozy tints (tokens), one hue per arena
const ARENA_CARDS: Record<string, { color: string; bg: string; border: string }> = {
  default: { color: 'var(--color-sky-400)', bg: 'bg-sky-200', border: 'border-ink' },
  lava: { color: 'var(--color-berry-500)', bg: 'bg-berry-300', border: 'border-ink' },
  ice: { color: 'var(--color-sky-300)', bg: 'bg-sky-200', border: 'border-ink' },
  forest: { color: 'var(--color-leaf-500)', bg: 'bg-leaf-300', border: 'border-ink' }
}

// Filter out 'boss' — not selectable for PvP
const selectableArenas = ARENA_TYPES.filter(a => a !== 'boss')

const expiryFormatted = computed(() => {
  const m = Math.floor(expirySeconds.value / 60)
  const s = expirySeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

// ─── Random search, found card, invite join ──────────────────────────────────

/** CrazyGames full build: the platform's invite system replaces the
 *  WhatsApp / native share links (no external share targets on CG). */
const isCrazyInvites = computed(() => isSdkActive.value && isCrazyGamesFullRelease)

/** m:ss for the search timer. */
const searchElapsedLabel = computed(() => {
  const total = Math.floor(searchElapsedMs.value / 1000)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
})

/** Found: a bot's card (status 'found'), or a human pairing from the random
 *  search before its first match starts (auto-ready, then the host starts). */
const showFoundCard = computed(() =>
  opponentProfile.value !== null && (
    (status.value === 'found' && matchKind.value === 'bot')
    || (matchKind.value === 'quick' && (status.value === 'lobby' || status.value === 'ready'))
  ))

/** This player's own card (name from the identity — the CrazyGames username
 *  when signed in — and the team they would field). */
const myName = ref('')
const myProfile = computed<OpponentProfile>(() => {
  const level = teamDisplayLevel(buildPvpTeam())
  return { name: myName.value || t('you'), level, tier: bracketTier(level) }
})
const refreshMyProfile = async () => {
  try {
    myName.value = await playerDisplayName()
  } catch {
    myName.value = ''
  }
  setLocalPvpProfile({ name: myName.value, level: myProfile.value.level })
}

/** Monogram avatar colour per name — the same for humans and bots. */
const AVATAR_TINTS = ['sky', 'berry', 'leaf', 'sun', 'plum', 'royal'] as const
const avatarTint = (name: string): string => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length] as string
}
const monogram = (name: string): string => (Array.from(name.trim())[0] ?? '?').toUpperCase()

/** The last bot names shown (never repeated within BOT_RECENT_NAMES). */
let recentBotNames: string[] = []

/** No human in time: a bot at this player's power (src/use/pvpBots.ts). */
const createBot = (): BotOpponent | null => {
  const team = buildPvpTeam()
  if (!team.length) return null
  const bot = createBotOpponent({
    seed: Math.floor(Math.random() * 0x100000000) >>> 0,
    skill: botSkill.value,
    playerTeam: team,
    // Smashers a player around this stage could field (a little ahead).
    pool: unlockedSmashers(currentStageId.value + 5),
    levelOne: false,
    recentNames: recentBotNames
  })
  recentBotNames = rememberBotName(recentBotNames, bot.profile.name)
  return bot
}

/** Retry target for the failed view ("Try again" re-runs the search). */
const lastSearchSize = ref<TeamSize | null>(null)

const onFindMatch = () => {
  lastSearchSize.value = selectedTeamSize.value
  joiningPeerId.value = ''
  void refreshMyProfile()
  startQuickMatch({
    teamSize: selectedTeamSize.value,
    teamFor: () => buildPvpTeam(),
    createBot
  })
}

const onCancelSearch = () => {
  cancelQuickMatch()
}

const onRetrySearch = () => {
  if (lastSearchSize.value !== null) selectedTeamSize.value = lastSearchSize.value
  onFindMatch()
}

/** Joining a friend's invite (link or CrazyGames). */
const joiningLabel = computed(() =>
  joiningFriendName.value ? t('pvp.joiningFriend', { name: joiningFriendName.value }) : t('pvp.joiningMatch'))

/** CrazyGames: the invite link (crazygames.com) was copied for a friend. */
const inviteSent = ref(false)
const onCopyCrazyInvite = async () => {
  if (await copyInviteLink()) {
    inviteSent.value = true
  }
}
watch(status, (s) => {
  if (s !== 'waiting') inviteSent.value = false
})

const isHost = computed(() => role.value === 'host')
const isGuest = computed(() => role.value === 'guest')
const localReady = computed(() => isHost.value ? hostReady.value : guestReady.value)

// Extract just the short code from the peer ID for display
const inviteCode = computed(() => peerId.value || '')

// ─── Clipboard Auto-Paste ─────────────────────────────────────────────────

const PEER_ID_PREFIX = 'ca-'

/** Try reading clipboard for a PvP invite code when the modal opens in idle state */
const tryReadClipboard = async () => {
  if (joiningPeerId.value) return // already has input
  try {
    const text = await navigator.clipboard.readText()
    const code = extractPeerCode(text)
    if (code) {
      joiningPeerId.value = code
      clipboardHighlight.value = true
      setTimeout(() => {
        clipboardHighlight.value = false
      }, 1500)
    }
  } catch {
    // Clipboard read denied or unavailable — silently ignore
  }
}

// ─── Invite Code Extraction ───────────────────────────────────────────────

/** Extract a peer ID from a raw code or a full invite URL */
const extractPeerCode = (input: string): string | null => {
  const trimmed = input.trim()
  if (trimmed.startsWith(PEER_ID_PREFIX)) return trimmed
  const match = trimmed.match(/[?&]pvp=([^&\s]+)/)
  if (match && match[1] !== undefined) return decodeURIComponent(match[1])
  return null
}

// Auto-extract code when user pastes a full invite URL into the input
watch(joiningPeerId, (val) => {
  if (!val) return
  // Only attempt extraction if the value looks like a URL (not a raw code)
  if (val.includes('://') || val.includes('?pvp=')) {
    const code = extractPeerCode(val)
    if (code && code !== val) {
      joiningPeerId.value = code
    }
  }
})

// ─── Team Resolution ──────────────────────────────────────────────────────

/** Build the player's PvP team: the roster's smashers at their current
 *  levels ("level 1" lobbies: level 1), each with its colourway. */
const buildPvpTeam = (): import('@/types/spinner').SpinnerConfig[] => {
  const size = gameConfig.value.teamSize
  const isLvl1 = gameConfig.value.levelOne
  // Exactly the lobby's team size: the picks first, padded in catalog
  // order (a 3v3 lobby works before the campaign opens slot 3).
  const team = teamConfigs(fieldTeam(playerTeam.value, size), (c, i) => getSelectedSkin(c.topPartId, i))
  return isLvl1 ? team.map(c => smasherConfig(c.smasherId!, 1, c.modelId)) : team
}

/** Smashers carry their own skills, so the side loadout sent with
 *  player-ready is always empty (old peers still accept it). */
const buildPvpSkills = (): SkillLoadout => []

/** A team's skills for the ready card: every smasher's unlocked skills. */
const teamSkills = (team: import('@/types/spinner').SpinnerConfig[]): SkillLoadout =>
  team.flatMap(c => (isSmasherId(c.smasherId) ? smasherLoadout(c) : []))

// ─── Ready card: both sides' skills ────────────────────────────────────────

const previewSkills = ref<SkillLoadout>([])
const refreshPreviewSkills = () => {
  previewSkills.value = teamSkills(buildPvpTeam())
}
watch(
  () => [status.value, gameConfig.value.levelOne, props.isOpen] as const,
  ([s]) => {
    if (s === 'lobby' || s === 'ready') refreshPreviewSkills()
  },
  { immediate: true }
)

const mySkills = computed<SkillLoadout>(() => {
  if (!localReady.value) return previewSkills.value
  return teamSkills(isHost.value ? hostTeam.value : guestTeam.value)
})
const opponentReady = computed(() => isHost.value ? guestReady.value : hostReady.value)
const opponentSkills = computed<SkillLoadout>(() => {
  if (!opponentReady.value) return []
  return teamSkills(isHost.value ? guestTeam.value : hostTeam.value)
})
const showSkillRows = computed(() => PvpReadySkillsUi !== null)

type ReadySide = 'host' | 'guest'
const READY_SIDES: readonly ReadySide[] = ['host', 'guest']
const isMine = (side: ReadySide) => (side === 'host') === isHost.value
const sideReady = (side: ReadySide) => side === 'host' ? hostReady.value : guestReady.value
const sideSkills = (side: ReadySide): SkillLoadout => isMine(side) ? mySkills.value : opponentSkills.value

const onToggleReady = () => {
  if (localReady.value) {
    setUnready()
    return
  }
  refreshPreviewSkills()
  setReady(buildPvpTeam(), buildPvpSkills())
}

// ─── Actions ───────────────────────────────────────────────────────────────

const onCreateLobby = () => {
  const config: PvPGameConfig = {
    arenaType: selectedArena.value,
    teamSize: selectedTeamSize.value,
    levelOne: levelOne.value
  }
  void refreshMyProfile()
  void createLobby(config)
  joiningPeerId.value = ''
}

const onJoinLobby = () => {
  const code = (extractPeerCode(joiningPeerId.value) || joiningPeerId.value.trim()).toLowerCase()
  if (code) {
    void joinLobby(code)
    joiningPeerId.value = ''
  }
}

const clearJoinInput = () => {
  joiningPeerId.value = ''
}

const onSelectArena = (arena: ArenaType) => {
  if (!isHost.value && status.value === 'lobby') return
  selectedArena.value = arena
  if (status.value === 'lobby') {
    updateGameConfig({ arenaType: arena, teamSize: selectedTeamSize.value, levelOne: levelOne.value })
  }
}

const onSelectTeamSize = (size: TeamSize) => {
  if (!isHost.value && status.value === 'lobby') return
  selectedTeamSize.value = size
  if (status.value === 'lobby') {
    updateGameConfig({ arenaType: selectedArena.value, teamSize: size, levelOne: levelOne.value })
  }
}

const onToggleLevelOne = () => {
  if (!isHost.value && status.value === 'lobby') return
  levelOne.value = !levelOne.value
  if (status.value === 'lobby') {
    updateGameConfig({ arenaType: selectedArena.value, teamSize: selectedTeamSize.value, levelOne: levelOne.value })
  }
}

// The Level-1 box is a custom checkbox: it plays the switch ticks itself.
const onToggleLevelOneTick = () => {
  if (!isHost.value && status.value === 'lobby') {
    playUiSfx('deny')
    return
  }
  playUiSfx(levelOne.value ? 'toggleOff' : 'toggleOn')
  onToggleLevelOne()
}

const onCopyLink = async () => {
  if (await copyInviteLink()) {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

const onCopyCode = async () => {
  try {
    await navigator.clipboard.writeText(inviteCode.value)
    codeCopied.value = true
    setTimeout(() => {
      codeCopied.value = false
    }, 2000)
  } catch {
  }
}

const canNativeShare = computed(() => !!navigator.share)

const onNativeShare = async () => {
  try {
    await navigator.share({
      title: t('pvp.shareTitle'),
      text: t('pvp.shareText'),
      url: inviteLink.value
    })
  } catch { /* user cancelled or share failed — ignore */
  }
}

const onStartMatch = () => {
  startMatch()
  emit('start-pvp')
}

const onClose = () => {
  if (status.value === 'playing') return // can't close during match
  leavePvP()
  lastSearchSize.value = null
  emit('close')
}

// Sync game config from host to guest's local UI
watch(gameConfig, (cfg) => {
  selectedArena.value = sanitizeArenaType(cfg.arenaType)
  selectedTeamSize.value = cfg.teamSize
  levelOne.value = cfg.levelOne
}, { deep: true })

// Auto-read clipboard when modal opens in idle state.
// Also populate join input from URL invite code if available.
watch(() => props.isOpen, (open) => {
  if (open) void refreshMyProfile()
  if (open && status.value === 'idle') {
    if (pendingInviteCode.value) {
      joiningPeerId.value = pendingInviteCode.value
      clipboardHighlight.value = true
      setTimeout(() => {
        clipboardHighlight.value = false
      }, 1500)
    } else {
      tryReadClipboard()
    }
  }
})
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :title="t('pvp.title')"
    @update:model-value="onClose"
  )
    //- Scrolling is FModal's job (single scroll authority — see the
    //- `.modal-content-slot` rule there). The old `max-h-[55vh]` capped this
    //- panel at just over half the screen even when the modal had far more
    //- room, and nested a second scrollbar inside the slot's.
    div.pvp-scroll(class="p-4 sm:p-6 overflow-x-hidden")

      //- ── Idle: Create or Join ─────────────────────────────────────────
      template(v-if="status === 'idle'")
        div.flex.flex-col.gap-4

          //- Random search ("Find opponent") — the hero action; the team
          //- size below applies to it and to a private room.
          div.pvp-quick.flex.flex-col.items-center.gap-2.p-3
            div.text-ink.font-black.text-center(class="text-sm") {{ t('pvp.quickMatch') }}
            button.w-full(
              type="button"
              data-testid="pvp-find-match"
              @click="onFindMatch"
              class="ui-btn ui-btn--primary ui-btn--hero ui-shine text-base"
            ) {{ t('pvp.findMatch') }}

          div.pvp-divider.text-ink-soft.font-black.uppercase.text-center(class="text-[0.7rem]") {{ t('pvp.orPlayFriend') }}

          //- Arena Selection
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.selectArena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              button.pvp-arena(
                v-for="arena in selectableArenas"
                :key="arena"
                type="button"
                data-press
                :aria-pressed="selectedArena === arena"
                @click="onSelectArena(arena)"
                class="relative cursor-pointer p-2 text-center"
                :class="selectedArena === arena ? ['is-picked', ARENA_CARDS[arena]?.bg] : ''"
                :style="{ '--arena': ARENA_CARDS[arena]?.color }"
              )
                //- Color dot
                div.mx-auto.rounded-full.mb-1.border-2.border-ink(
                  class="w-4 h-4 sm:w-5 sm:h-5"
                  :style="{ backgroundColor: ARENA_CARDS[arena]?.color }"
                )
                div.text-ink.font-black.truncate(class="text-[0.7rem] sm:text-xs") {{ t('arenas.' + arena) }}

          //- Team Size
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.teamSize') }}
            div.flex.gap-2
              button.pvp-seg(
                v-for="size in TEAM_SIZES"
                :key="size"
                type="button"
                role="radio"
                :aria-checked="selectedTeamSize === size"
                @click="onSelectTeamSize(size)"
                class="flex-1 min-h-[2.75rem] py-2 font-black cursor-pointer text-sm"
                :class="{ 'is-picked': selectedTeamSize === size }"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle
          div.pvp-check.flex.items-center.gap-3.cursor-pointer(
            role="checkbox"
            tabindex="0"
            :aria-checked="levelOne"
            @click="onToggleLevelOneTick"
            @keydown.enter.prevent="onToggleLevelOneTick"
            @keydown.space.prevent="onToggleLevelOneTick"
          )
            div.pvp-check__box.flex.items-center.justify-center(
              :class="{ 'is-on': levelOne }"
            )
              svg(
                v-if="levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="var(--color-cream-50)"
                class="w-4 h-4"
              )
                path(fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd")
            span.text-ink.font-black(class="text-sm") {{ t('pvp.levelOne') }}

          //- Join section
          div.flex.flex-col.gap-2
            div.text-ink-soft.uppercase.font-black(class="text-xs") {{ t('pvp.joinLobby') }}
            div.flex.gap-2
              div.relative.min-w-0.flex-1
                input.w-full.rounded-lg.border-2.bg-cream-50.text-ink.py-2.font-mono(
                  v-model="joiningPeerId"
                  :placeholder="t('pvp.enterCode')"
                  class="text-sm focus:outline-none focus:border-sky-500 placeholder:text-ink-soft pl-3 pr-8"
                  :class="clipboardHighlight \
                    ? 'border-sun-500 ring-2 ring-sun-400' \
                    : 'border-wood-700'"
                )
                //- Clear button
                button.absolute.flex.items-center.justify-center.text-ink-soft.cursor-pointer(
                  v-if="joiningPeerId"
                  @click="clearJoinInput"
                  class="right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:text-ink hover:bg-cream-300 transition-colors"
                )
                  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3")
                    path(d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z")
              button.shrink-0(
                @click="onJoinLobby"
                :disabled="!joiningPeerId.trim()"
                class="ui-btn ui-btn--primary uppercase text-sm"
              ) {{ t('pvp.join') }}

      //- ── Random search: looking for a human (a bot fills in after 15–25 s)
      template(v-else-if="status === 'searching'")
        div.flex.flex-col.items-center.gap-4.py-6(data-testid="pvp-searching")
          div.pvp-radar(aria-hidden="true")
            span.pvp-radar__ring
            span.pvp-radar__ring.pvp-radar__ring--late
            span.pvp-radar__dot
          div.text-ink.font-black.text-center(class="text-lg" role="status") {{ t('pvp.searching') }}
          div.pvp-timer.ui-inset.px-4.py-1(aria-live="off") {{ searchElapsedLabel }}
          div.ui-chip.ui-chip--sun.uppercase(class="text-[0.7rem]") {{ gameConfig.teamSize }}v{{ gameConfig.teamSize }}

      //- ── Found: the opponent's card (human pairing or bot) ───────────────
      template(v-else-if="showFoundCard && opponentProfile")
        div.flex.flex-col.items-center.gap-4.py-4(data-testid="pvp-found")
          div.pvp-connected.ui-slam(role="status") {{ t('pvp.opponentFound') }}
          div.pvp-faceoff.w-full
            div.pvp-player(
              v-for="(p, i) in [myProfile, opponentProfile]"
              :key="i"
              :class="i === 0 ? 'is-me' : 'is-them'"
            )
              div.pvp-avatar(:class="'tint-' + avatarTint(p.name)" aria-hidden="true") {{ monogram(p.name) }}
              div.pvp-player__name.text-ink.font-black.truncate {{ p.name || t('pvp.guest') }}
              div.flex.items-center.gap-1
                span.pvp-bracket(
                  :style="{ '--tier': LEAGUE_TIER_META[p.tier].accent }"
                  role="img"
                  :aria-label="t(LEAGUE_TIER_META[p.tier].nameKey)"
                )
                span.text-ink-soft.font-black(class="text-xs") {{ t('pvp.level', { n: p.level }) }}
              //- Debug builds only: tag a bot (never shown in production).
              span.ui-chip.ui-chip--sun(v-if="i === 1 && revealBots && opponentProfile.bot" class="text-[0.6rem]") BOT
            div.pvp-vs(aria-hidden="true") {{ t('vs') }}
          div.text-ink-soft.font-bold(class="text-sm") {{ t('pvp.startingMatch') }}

      //- ── Creating / Connecting ──────────────────────────────────────────
      template(v-else-if="status === 'creating' || status === 'connecting'")
        div.flex.flex-col.items-center.gap-4.py-8
          div.animate-spin.rounded-full.border-4.border-leaf-500(
            class="border-t-transparent w-10 h-10"
          )
          div.text-ink.font-black.text-center(
            v-if="status === 'connecting' && joiningFriendName !== null"
            data-testid="pvp-joining"
            role="status"
          ) {{ joiningLabel }}
          div.text-ink.font-black(v-else) {{ status === 'creating' ? t('pvp.creatingLobby') : t('pvp.connecting') }}

      //- ── Waiting for Guest ──────────────────────────────────────────────
      template(v-else-if="status === 'waiting'")
        div.flex.flex-col.gap-4
          //- Countdown
          div.text-center
            div.text-ink.font-black(class="text-lg") {{ t('pvp.waitingForPlayer') }}
            div.text-ink-soft.font-bold(class="text-sm mt-1") {{ t('pvp.inviteExpires') }}
              span.text-sun-600.font-black.ml-1 {{ expiryFormatted }}

          //- Invite code (easy to copy on mobile)
          div.ui-inset.p-3
            div.text-ink-soft.uppercase.font-black.mb-1(class="text-[0.75rem]") {{ t('pvp.inviteCode') }}
            div.flex.items-center.gap-2
              div.text-ink.font-mono.font-black.truncate.flex-1.select-all.tracking-wider(class="text-base") {{ inviteCode }}
              button.shrink-0.cursor-pointer(
                @click="onCopyCode"
                class="ui-btn ui-btn--secondary text-xs"
              ) {{ codeCopied ? t('pvp.copied') : t('pvp.copy') }}

          //- Invite link actions
          div.flex.flex-col.gap-2
            //- Copy full link (on CrazyGames the invite button below does it)
            button.w-full(
              v-if="!isCrazyInvites"
              @click="onCopyLink"
              class="ui-btn ui-btn--secondary text-sm"
            )
              span(v-if="copied") {{ t('pvp.copied') }}
              span(v-else) {{ t('pvp.copyLink') }}

            //- WhatsApp share (off CrazyGames: there the platform invites)
            a.flex.items-center.justify-center.gap-2.w-full(
              v-if="!isCrazyInvites"
              :href="whatsappShareLink"
              target="_blank"
              rel="noopener"
              class="ui-btn ui-btn--secondary text-sm"
            )
              svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 shrink-0 text-leaf-600")
                path(d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z")
              span {{ t('pvp.shareWhatsApp') }}

            //- Browser native share
            button.flex.items-center.justify-center.gap-2.w-full(
              v-if="canNativeShare && !isCrazyInvites"
              @click="onNativeShare"
              class="ui-btn ui-btn--secondary text-sm"
            )
              svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 shrink-0")
                path(d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z")
              span {{ t('pvp.shareNative') }}

            //- CrazyGames: the friends list invites through the platform's
            //- Invite button (Room Data + showInviteButton, usePVP); this
            //- copies the crazygames.com invite link for anyone else.
            template(v-if="isCrazyInvites")
              div.text-ink-soft.font-bold.text-center(class="text-xs") {{ t('pvp.inviteHintCg') }}
              button.w-full(
                data-testid="pvp-cg-invite"
                @click="onCopyCrazyInvite"
                class="ui-btn ui-btn--primary text-sm"
              ) {{ t('pvp.inviteFriend') }}
              div.pvp-sent.text-center.font-black(
                v-if="inviteSent"
                role="status"
                class="text-sm"
              ) {{ t('pvp.inviteSent') }}

      //- ── Lobby: Both Connected ──────────────────────────────────────────
      template(v-else-if="(status === 'lobby' || status === 'ready') && !showFoundCard")
        div.flex.flex-col.gap-4

          //- Status badge
          div.text-center
            div.pvp-connected.ui-slam {{ t('pvp.connected') }}
            div.text-ink.font-black.truncate(v-if="opponentProfile && opponentProfile.name" class="text-sm mt-1") {{ t('vs') }} {{ opponentProfile.name }}
            div.text-ink-soft.font-bold(class="text-xs mt-1")
              span(v-if="isHost") {{ t('pvp.youAreHost') }}
              span(v-else) {{ t('pvp.youAreGuest') }}

          //- Win:Loss stats
          div.ui-inset.flex.items-center.justify-center.gap-4.py-2.px-4
            div.flex.flex-col.items-center
              span.pvp-stat.pvp-stat--win {{ wins }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.wins') }}
            div.text-ink-soft.font-black(class="text-lg") :
            div.flex.flex-col.items-center
              span.pvp-stat.pvp-stat--loss {{ losses }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.losses') }}
            div.border-l-2.border-cream-400.h-8
            div.flex.flex-col.items-center
              span.pvp-stat.pvp-stat--honor {{ honor }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.honor') }}

          //- Arena Selection (host can change, guest sees read-only)
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.arena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              button.pvp-arena(
                v-for="arena in selectableArenas"
                :key="arena"
                type="button"
                data-press
                :aria-pressed="gameConfig.arenaType === arena"
                :aria-disabled="!isHost ? 'true' : undefined"
                @click="onSelectArena(arena)"
                class="relative p-2 text-center"
                :class="[gameConfig.arenaType === arena ? ['is-picked', ARENA_CARDS[arena]?.bg] : '', isHost ? 'cursor-pointer' : 'is-readonly']"
                :style="{ '--arena': ARENA_CARDS[arena]?.color }"
              )
                div.mx-auto.rounded-full.mb-1.border-2.border-ink(
                  class="w-4 h-4 sm:w-5 sm:h-5"
                  :style="{ backgroundColor: ARENA_CARDS[arena]?.color }"
                )
                div.text-ink.font-black.truncate(class="text-[0.7rem] sm:text-xs") {{ t('arenas.' + arena) }}

          //- Team size (host can change)
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.teamSize') }}
            div.flex.gap-2
              button.pvp-seg(
                v-for="size in TEAM_SIZES"
                :key="size"
                type="button"
                role="radio"
                :aria-checked="gameConfig.teamSize === size"
                @click="onSelectTeamSize(size)"
                :disabled="!isHost"
                class="flex-1 min-h-[2.75rem] py-2 font-black text-sm"
                :class="[{ 'is-picked': gameConfig.teamSize === size }, isHost ? 'cursor-pointer' : 'is-readonly']"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle (host can change, guest sees read-only)
          div.pvp-check.flex.items-center.gap-3(
            role="checkbox"
            :tabindex="isHost ? 0 : -1"
            :aria-checked="gameConfig.levelOne"
            :aria-disabled="!isHost ? 'true' : undefined"
            :class="isHost ? 'cursor-pointer' : 'is-readonly'"
            @click="onToggleLevelOneTick"
            @keydown.enter.prevent="onToggleLevelOneTick"
            @keydown.space.prevent="onToggleLevelOneTick"
          )
            div.pvp-check__box.flex.items-center.justify-center(
              :class="{ 'is-on': gameConfig.levelOne }"
            )
              svg(
                v-if="gameConfig.levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="var(--color-cream-50)"
                class="w-4 h-4"
              )
                path(fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd")
            span.text-ink.font-black(class="text-sm") {{ t('pvp.levelOne') }}

          //- Ready card: ready dot per side; with skills on, each side's
          //- skill loadout (icon + level). The local side previews what
          //- Ready will send; the opponent's shows once they are ready.
          div.grid.grid-cols-2.gap-2(v-if="showSkillRows")
            div.ready-side.px-2.py-2.flex.flex-col.items-center(
              v-for="side in READY_SIDES"
              :key="side"
              class="gap-1.5"
              :class="{ 'is-ready': sideReady(side) }"
              :data-side="side"
            )
              div.flex.items-center.gap-2
                div.rounded-full(
                  class="w-3 h-3"
                  :class="sideReady(side) ? 'bg-leaf-500 border-2 border-ink' : 'bg-cream-400 border-2 border-wood-700'"
                )
                span.text-ink.font-black(class="text-sm") {{ t('pvp.' + side) }}
                span.ui-chip.ui-chip--sun.uppercase(
                  v-if="isMine(side)"
                  class="text-[0.65rem]"
                ) {{ t('you') }}
              component(
                :is="PvpReadySkillsUi"
                :loadout="sideSkills(side)"
                :mine="isMine(side)"
              )
          div.flex.gap-3.items-center.justify-center(v-else)
            div.flex.items-center.gap-2
              div.rounded-full(
                class="w-3 h-3"
                :class="hostReady ? 'bg-leaf-500 border-2 border-ink' : 'bg-cream-400 border-2 border-wood-700'"
              )
              span.text-ink.font-black(class="text-sm") {{ t('pvp.host') }}
            div.flex.items-center.gap-2
              div.rounded-full(
                class="w-3 h-3"
                :class="guestReady ? 'bg-leaf-500 border-2 border-ink' : 'bg-cream-400 border-2 border-wood-700'"
              )
              span.text-ink.font-black(class="text-sm") {{ t('pvp.guest') }}

      //- ── Disconnected / Error / Expired ──────────────────────────────────
      template(v-else-if="status === 'disconnected' || status === 'error' || status === 'expired'")
        div.flex.flex-col.items-center.gap-4.py-6
          div.text-berry-600.font-black(class="text-lg") {{ t('pvp.' + status) }}
          div.text-ink-soft.font-bold.text-center(class="text-sm") {{ errorMessage }}

    //- ── Sticky Footer Actions (always visible) ─────────────────────────
    template(#footer)
      //- Idle: Create Lobby (a private room; the random search is the hero
      //- button in the body)
      template(v-if="status === 'idle'")
        button.w-full(
          @click="onCreateLobby"
          class="ui-btn ui-btn--secondary text-base"
        ) {{ t('pvp.createLobby') }}

      //- Searching / joining: a way back at any time
      template(v-else-if="status === 'searching' || status === 'connecting'")
        button.w-full(
          data-testid="pvp-cancel"
          @click="status === 'searching' ? onCancelSearch() : onClose()"
          class="ui-btn ui-btn--secondary text-sm"
        ) {{ t('pvp.cancel') }}

      //- Found: nothing to press — the match starts on its own
      template(v-else-if="showFoundCard")

      //- Lobby: Ready / Start
      template(v-else-if="status === 'lobby' || status === 'ready'")
        div.w-full.ui-breathe(v-if="isHost && bothReady")
          button.w-full(
            @click="onStartMatch"
            class="ui-btn ui-btn--primary ui-btn--hero ui-shine text-base"
          ) {{ t('pvp.startMatch') }}
        div.w-full(v-else :class="{ 'ui-breathe': !localReady }")
          button.w-full(
            @click="onToggleReady"
            class="ui-btn uppercase text-sm"
            :class="localReady ? 'ui-btn--secondary' : 'ui-btn--primary ui-btn--hero ui-shine'"
          ) {{ localReady ? t('pvp.ready') : t('pvp.setReady') }}

      //- Error states: Back to Menu (and, after a failed search, Try Again)
      template(v-else-if="status === 'disconnected' || status === 'error' || status === 'expired'")
        div.flex.w-full.gap-2
          button.flex-1(
            @click="onClose"
            class="ui-btn ui-btn--secondary text-sm"
          ) {{ t('pvp.backToMenu') }}
          button.flex-1(
            v-if="lastSearchSize !== null"
            data-testid="pvp-retry"
            @click="onRetrySearch"
            class="ui-btn ui-btn--primary text-sm"
          ) {{ t('pvp.tryAgain') }}
</template>

<style scoped lang="sass">
// Always show the scrollbar on touch devices so content below the fold
// is discoverable. Desktop keeps the default auto-hide behaviour.
@media (pointer: coarse)
  .pvp-scroll
    scrollbar-width: thin
    scrollbar-color: var(--color-royal-500) transparent

    &::-webkit-scrollbar
      width: 6px

    &::-webkit-scrollbar-thumb
      background: var(--color-royal-500)
      border-radius: 3px

    &::-webkit-scrollbar-track
      background: transparent

// ── Arena tiles: selectable mini cards ───────────────────────────────────
// Idle: recessed ice well with the arena's colour dot. Hover: lifts 2px.
// Pressed: sinks (70 ms). Picked: stands up — arena tint, ink outline, a
// hard drop and a sun corner flag, popping in with an overshoot. Read-only
// (guest): flat and dimmed; a tap gets the refusal shake + bonk.
.pvp-arena
  min-height: 2.75rem
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)
  transition: transform 0.26s var(--ui-spring)
  -webkit-tap-highlight-color: transparent

  @media (hover: hover)
    &:not(.is-readonly):hover
      transform: translateY(-2px)
      border-color: var(--color-royal-400)

  &:not(.is-readonly):active, &:not(.is-readonly).is-pressed
    transform: translateY(2px) scale(0.95)
    transition-duration: var(--ui-press-down)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

  &.is-picked
    border: 3px solid var(--color-ink)
    background-image: var(--ui-facet)
    box-shadow: inset 0 0 0 2px var(--arena), inset 0 -4px 0 rgba(22, 26, 64, 0.18), 0 4px 0 var(--color-ink)
    transform: translateY(-2px)
    animation: pvp-pick 0.34s var(--ui-spring)

    &::after
      content: ''
      position: absolute
      top: -2px
      right: -2px
      width: 0.95rem
      height: 0.95rem
      background-color: var(--color-sun-400)
      border-left: 2px solid var(--color-ink)
      border-bottom: 2px solid var(--color-ink)
      border-radius: 0 calc(var(--radius-ui) - 3px) 0 0.3rem

  &.is-readonly
    cursor: default
    opacity: 0.7

@keyframes pvp-pick
  0%
    transform: translateY(2px) scale(0.86)
  100%
    transform: translateY(-2px) scale(1)

// ── Team size: segmented 3D buttons (the picked one is a raised lime key) ─
.pvp-seg
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  color: var(--color-ink)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)
  transition: transform 0.26s var(--ui-spring)
  -webkit-tap-highlight-color: transparent

  @media (hover: hover)
    &:not(.is-readonly):not(.is-picked):hover
      transform: translateY(-2px)
      border-color: var(--color-royal-400)

  &:not(:disabled):active
    transform: translateY(2px) scale(0.96)
    transition-duration: var(--ui-press-down)

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

  &.is-picked
    border: 3px solid var(--color-ink)
    background-color: var(--color-leaf-500)
    color: var(--color-ice-50)
    text-shadow: var(--ui-stroke-sm)
    box-shadow: inset 0 3px 0 var(--color-leaf-300), inset 0 0.9em 0 rgba(255, 255, 255, 0.16), inset 0 -4px 0 var(--color-leaf-700), 0 4px 0 var(--color-ink)
    transform: translateY(-2px)
    animation: pvp-pick 0.34s var(--ui-spring)

  &.is-readonly
    cursor: default

// ── Level 1: a chunky check box ──────────────────────────────────────────
.pvp-check
  min-height: 2.75rem
  -webkit-tap-highlight-color: transparent

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
    border-radius: var(--radius-ui-sm)

  &.is-readonly
    cursor: default
    opacity: 0.7

.pvp-check__box
  width: 1.75rem
  height: 1.75rem
  flex: 0 0 auto
  border: 3px solid var(--color-ink)
  border-radius: 0.45rem
  background-color: var(--color-ice-50)
  box-shadow: inset 0 -3px 0 var(--color-ice-300), 0 3px 0 var(--color-ink)
  transition: transform 0.26s var(--ui-spring), background-color 0.1s ease

  &.is-on
    background-color: var(--color-leaf-500)
    box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700), 0 3px 0 var(--color-ink)
    animation: pvp-pick 0.34s var(--ui-spring)

  svg
    filter: drop-shadow(0 1.5px 0 var(--color-ink))

.pvp-check:not(.is-readonly):active .pvp-check__box
  transform: translateY(2px) scale(0.92)
  transition-duration: var(--ui-press-down)

// ── Stats + connected ────────────────────────────────────────────────────
.pvp-stat
  font-size: 1.6rem
  font-weight: 900
  line-height: 1.05
  font-variant-numeric: tabular-nums
  text-shadow: var(--ui-stroke)

.pvp-stat--win
  color: var(--color-leaf-400)
.pvp-stat--loss
  color: var(--color-berry-400)
.pvp-stat--honor
  color: var(--color-plum-400)

.pvp-connected
  font-size: 1.3rem
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.03em
  color: var(--color-leaf-400)
  text-shadow: var(--ui-stroke)

// ── Ready cards: ice until ready, then a lime card that pops ─────────────
.ready-side
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)

  &.is-ready
    border: 3px solid var(--color-ink)
    background-color: var(--color-leaf-300)
    background-image: var(--ui-facet)
    box-shadow: inset 0 0 0 2px var(--color-leaf-500), 0 4px 0 var(--color-ink)
    animation: pvp-ready 0.4s cubic-bezier(0.2, 1.6, 0.4, 1)

@keyframes pvp-ready
  0%
    transform: scale(0.9) rotate(-2deg)
  100%
    transform: none

// ── Random search block + divider ────────────────────────────────────────
.pvp-quick
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)

.pvp-divider
  display: flex
  align-items: center
  gap: 0.6rem
  letter-spacing: 0.04em

  &::before, &::after
    content: ''
    flex: 1
    height: 2px
    background-color: var(--color-cream-400)

// ── Searching: a radar pulse + the elapsed timer ─────────────────────────
.pvp-radar
  position: relative
  width: 4.5rem
  height: 4.5rem

.pvp-radar__ring
  position: absolute
  inset: 0
  border: 3px solid var(--color-leaf-500)
  border-radius: 50%
  opacity: 0
  animation: pvp-radar 1.8s ease-out infinite

.pvp-radar__ring--late
  animation-delay: 0.9s

.pvp-radar__dot
  position: absolute
  inset: 32%
  border: 3px solid var(--color-ink)
  border-radius: 50%
  background-color: var(--color-leaf-500)
  box-shadow: 0 3px 0 var(--color-ink)

@keyframes pvp-radar
  0%
    transform: scale(0.35)
    opacity: 0.9
  100%
    transform: scale(1)
    opacity: 0

.pvp-timer
  font-size: 1.35rem
  font-weight: 900
  font-variant-numeric: tabular-nums
  color: var(--color-ink)

// ── Found: two player cards face to face ─────────────────────────────────
.pvp-faceoff
  position: relative
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0.75rem

.pvp-player
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  min-width: 0
  padding: 0.75rem 0.5rem
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  box-shadow: 0 4px 0 var(--color-ink)
  animation: pvp-ready 0.4s cubic-bezier(0.2, 1.6, 0.4, 1)

  &.is-me
    background-color: var(--color-sky-200)

  &.is-them
    background-color: var(--color-berry-300)

.pvp-player__name
  max-width: 100%
  font-size: 0.95rem

.pvp-avatar
  display: flex
  align-items: center
  justify-content: center
  width: 2.75rem
  height: 2.75rem
  border: 3px solid var(--color-ink)
  border-radius: 50%
  font-size: 1.3rem
  font-weight: 900
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  box-shadow: 0 3px 0 var(--color-ink)

  &.tint-sky
    background-color: var(--color-sky-400)
  &.tint-berry
    background-color: var(--color-berry-500)
  &.tint-leaf
    background-color: var(--color-leaf-500)
  &.tint-sun
    background-color: var(--color-sun-500)
  &.tint-plum
    background-color: var(--color-plum-400)
  &.tint-royal
    background-color: var(--color-royal-500)

.pvp-vs
  position: absolute
  left: 50%
  top: 50%
  transform: translate(-50%, -50%)
  font-size: 1.2rem
  font-weight: 900
  color: var(--color-sun-400)
  text-shadow: var(--ui-stroke)
  pointer-events: none

.pvp-sent
  color: var(--color-leaf-600)

// Bracket pip: a small faceted shield in the tier's colour.
.pvp-bracket
  display: inline-block
  width: 1.15rem
  height: 1.3rem
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem 0.3rem 50% 50%
  background-color: var(--tier)
  background-image: var(--ui-facet)
  box-shadow: 0 2px 0 var(--color-ink)

@media (prefers-reduced-motion: reduce)
  .pvp-arena, .pvp-seg, .pvp-check__box, .ready-side, .pvp-player
    animation: none !important
  .pvp-radar__ring
    animation-duration: 3.6s
</style>

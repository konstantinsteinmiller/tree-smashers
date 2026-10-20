<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import usePVP, { type PvPGameConfig } from '@/use/usePVP'
import usePvpStats from '@/use/usePvpStats'
import { ARENA_TYPES, type ArenaType } from '@/use/useSpinnerCampaign'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { getSelectedSkin } from '@/use/useModels'
import { isSdkActive } from '@/use/useCrazyGames'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
// Skills: lazy through the skills gate — null / [] on a skills-off build,
// where the lobby sends an empty loadout and keeps its plain ready dots.
import { PvpReadySkillsUi } from '@/skills/skillsGate'
import { teamConfigs } from '@/use/useSmashers'
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
  sendCrazyGamesInvite,
  leavePvP,
} = usePVP()

const { wins, losses, honor } = usePvpStats()

const whatsappShareLink = computed(() => {
  if (!inviteLink.value) return ''
  const text = encodeURIComponent(`${t('pvp.shareText')}\n${inviteLink.value}`)
  return `https://wa.me/?text=${text}`
})

// ─── Local UI State ──────────────────────────────────────────────────────

const { playerTeam } = useSpinnerConfig()

const selectedArena = ref<ArenaType>('default')
const selectedTeamSize = ref<1 | 2>(1)
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
  forest: { color: 'var(--color-leaf-500)', bg: 'bg-leaf-300', border: 'border-ink' },
  thunder: { color: 'var(--color-sun-400)', bg: 'bg-sun-200', border: 'border-ink' },
  shock: { color: 'var(--color-plum-400)', bg: 'bg-plum-300', border: 'border-ink' }
}

// Filter out 'boss' — not selectable for PvP
const selectableArenas = ARENA_TYPES.filter(a => a !== 'boss')

const expiryFormatted = computed(() => {
  const m = Math.floor(expirySeconds.value / 60)
  const s = expirySeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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
  const team = teamConfigs(playerTeam.value.slice(0, size), (c, i) => getSelectedSkin(c.topPartId, i))
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

const onSelectTeamSize = (size: 1 | 2) => {
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
  emit('close')
}

// Sync game config from host to guest's local UI
watch(gameConfig, (cfg) => {
  selectedArena.value = cfg.arenaType
  selectedTeamSize.value = cfg.teamSize
  levelOne.value = cfg.levelOne
}, { deep: true })

// Auto-read clipboard when modal opens in idle state.
// Also populate join input from URL invite code if available.
watch(() => props.isOpen, (open) => {
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

          //- Arena Selection
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.selectArena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              div(
                v-for="arena in selectableArenas"
                :key="arena"
                @click="onSelectArena(arena)"
                class="relative cursor-pointer rounded-lg p-2 text-center transition-all duration-150 hover:scale-105 active:scale-95 border-2"
                :class="selectedArena === arena \
                  ? [ARENA_CARDS[arena]?.bg, ARENA_CARDS[arena]?.border, 'shadow-[0_3px_0_var(--color-ink)]'] \
                  : 'bg-cream-200 border-cream-400 hover:border-wood-500'"
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
              button(
                v-for="size in [1, 2]"
                :key="size"
                @click="onSelectTeamSize(size)"
                class="flex-1 min-h-[2.75rem] py-2 rounded-lg border-2 font-black transition-all cursor-pointer text-sm"
                :class="selectedTeamSize === size \
                  ? 'bg-leaf-500 border-ink ui-outline-sm shadow-[0_3px_0_var(--color-ink)]' \
                  : 'bg-cream-200 border-cream-400 text-ink hover:border-wood-500'"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle
          div.flex.items-center.gap-3.cursor-pointer(@click="onToggleLevelOne")
            div.rounded-full.border-2.flex.items-center.justify-center.transition-colors(
              class="w-5 h-5"
              :class="levelOne ? 'bg-leaf-500 border-ink' : 'bg-cream-50 border-wood-700'"
            )
              svg(
                v-if="levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="var(--color-cream-50)"
                class="w-3 h-3"
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

      //- ── Creating / Connecting ──────────────────────────────────────────
      template(v-else-if="status === 'creating' || status === 'connecting'")
        div.flex.flex-col.items-center.gap-4.py-8
          div.animate-spin.rounded-full.border-4.border-leaf-500(
            class="border-t-transparent w-10 h-10"
          )
          div.text-ink.font-black {{ status === 'creating' ? t('pvp.creatingLobby') : t('pvp.connecting') }}

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
            //- Copy full link
            button.w-full(
              @click="onCopyLink"
              class="ui-btn ui-btn--secondary text-sm"
            )
              span(v-if="copied") {{ t('pvp.copied') }}
              span(v-else) {{ t('pvp.copyLink') }}

            //- WhatsApp share
            a.flex.items-center.justify-center.gap-2.w-full(
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
              v-if="canNativeShare"
              @click="onNativeShare"
              class="ui-btn ui-btn--secondary text-sm"
            )
              svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 shrink-0")
                path(d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z")
              span {{ t('pvp.shareNative') }}

            //- CrazyGames invite (only on platform)
            button.w-full(
              v-if="isSdkActive && isCrazyGamesFullRelease"
              @click="sendCrazyGamesInvite"
              class="ui-btn ui-btn--secondary text-sm"
            ) {{ t('pvp.inviteFriend') }}

      //- ── Lobby: Both Connected ──────────────────────────────────────────
      template(v-else-if="status === 'lobby' || status === 'ready'")
        div.flex.flex-col.gap-4

          //- Status badge
          div.text-center
            div.text-leaf-700.font-black(class="text-lg") {{ t('pvp.connected') }}
            div.text-ink-soft.font-bold(class="text-xs mt-1")
              span(v-if="isHost") {{ t('pvp.youAreHost') }}
              span(v-else) {{ t('pvp.youAreGuest') }}

          //- Win:Loss stats
          div.ui-inset.flex.items-center.justify-center.gap-4.py-2.px-4
            div.flex.flex-col.items-center
              span.text-leaf-700.font-black(class="text-lg") {{ wins }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.wins') }}
            div.text-ink-soft.font-black(class="text-lg") :
            div.flex.flex-col.items-center
              span.text-berry-600.font-black(class="text-lg") {{ losses }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.losses') }}
            div.border-l-2.border-cream-400.h-8
            div.flex.flex-col.items-center
              span.text-plum-700.font-black(class="text-lg") {{ honor }}
              span.text-ink-soft.font-black.uppercase(class="text-[0.7rem]") {{ t('pvp.honor') }}

          //- Arena Selection (host can change, guest sees read-only)
          div
            div.text-ink-soft.uppercase.font-black.mb-2(class="text-xs") {{ t('pvp.arena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              div(
                v-for="arena in selectableArenas"
                :key="arena"
                @click="onSelectArena(arena)"
                class="relative rounded-lg p-2 text-center transition-all duration-150 border-2"
                :class="[\
                  gameConfig.arenaType === arena \
                    ? [ARENA_CARDS[arena]?.bg, ARENA_CARDS[arena]?.border, 'shadow-[0_3px_0_var(--color-ink)]'] \
                    : 'bg-cream-200 border-cream-400',\
                  isHost ? 'cursor-pointer hover:scale-105 active:scale-95 hover:border-wood-500' : 'cursor-default opacity-70'\
                ]"
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
              button(
                v-for="size in [1, 2]"
                :key="size"
                @click="onSelectTeamSize(size)"
                :disabled="!isHost"
                class="flex-1 min-h-[2.75rem] py-2 rounded-lg border-2 font-black transition-all text-sm"
                :class="[\
                  gameConfig.teamSize === size \
                    ? 'bg-leaf-500 border-ink ui-outline-sm shadow-[0_3px_0_var(--color-ink)]' \
                    : 'bg-cream-200 border-cream-400 text-ink',\
                  isHost ? 'cursor-pointer hover:border-wood-500' : 'cursor-default'\
                ]"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle (host can change, guest sees read-only)
          div.flex.items-center.gap-3(
            :class="isHost ? 'cursor-pointer' : 'cursor-default opacity-70'"
            @click="onToggleLevelOne"
          )
            div.rounded-full.border-2.flex.items-center.justify-center.transition-colors(
              class="w-5 h-5"
              :class="gameConfig.levelOne ? 'bg-leaf-500 border-ink' : 'bg-cream-50 border-wood-700'"
            )
              svg(
                v-if="gameConfig.levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="var(--color-cream-50)"
                class="w-3 h-3"
              )
                path(fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd")
            span.text-ink.font-black(class="text-sm") {{ t('pvp.levelOne') }}

          //- Ready card: ready dot per side; with skills on, each side's
          //- skill loadout (icon + level). The local side previews what
          //- Ready will send; the opponent's shows once they are ready.
          div.grid.grid-cols-2.gap-2(v-if="showSkillRows")
            div.ready-side.rounded-lg.border-2.px-2.py-2.flex.flex-col.items-center(
              v-for="side in READY_SIDES"
              :key="side"
              class="gap-1.5"
              :class="sideReady(side) \
                ? 'border-leaf-600 bg-leaf-300' \
                : 'border-cream-400 bg-cream-200'"
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
      //- Idle: Create Lobby
      template(v-if="status === 'idle'")
        button.w-full(
          @click="onCreateLobby"
          class="ui-btn ui-btn--primary uppercase text-sm"
        ) {{ t('pvp.createLobby') }}

      //- Lobby: Ready / Start
      template(v-else-if="status === 'lobby' || status === 'ready'")
        button.w-full(
          v-if="isHost && bothReady"
          @click="onStartMatch"
          class="ui-btn ui-btn--primary uppercase text-sm"
        ) {{ t('pvp.startMatch') }}
        button.w-full(
          v-else
          @click="onToggleReady"
          class="ui-btn uppercase text-sm"
          :class="localReady ? 'ui-btn--secondary' : 'ui-btn--primary'"
        ) {{ localReady ? t('pvp.ready') : t('pvp.setReady') }}

      //- Error states: Back to Menu
      template(v-else-if="status === 'disconnected' || status === 'error' || status === 'expired'")
        button.w-full(
          @click="onClose"
          class="ui-btn ui-btn--secondary text-sm"
        ) {{ t('pvp.backToMenu') }}
</template>

<style scoped lang="sass">
// Always show the scrollbar on touch devices so content below the fold
// is discoverable. Desktop keeps the default auto-hide behaviour.
@media (pointer: coarse)
  .pvp-scroll
    scrollbar-width: thin
    scrollbar-color: var(--color-wood-500) transparent

    &::-webkit-scrollbar
      width: 6px

    &::-webkit-scrollbar-thumb
      background: var(--color-wood-500)
      border-radius: 3px

    &::-webkit-scrollbar-track
      background: transparent
</style>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import usePVP, { type PvPGameConfig } from '@/use/usePVP'
import usePvpStats from '@/use/usePvpStats'
import { ARENA_TYPES, type ArenaType } from '@/use/useSpinnerCampaign'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { getSelectedSkin } from '@/use/useModels'
import { isSdkActive } from '@/use/useCrazyGames'
import { isCrazyGamesFullRelease } from '@/use/useMatch'

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
const { playerUpgrades } = useSpinnerCampaign()

const selectedArena = ref<ArenaType>('default')
const selectedTeamSize = ref<1 | 2>(1)
const levelOne = ref(false)
const copied = ref(false)
const codeCopied = ref(false)
const joiningPeerId = ref('')
const clipboardHighlight = ref(false)

// Arena display config — colors matching ARENA_THEMES
const ARENA_CARDS: Record<string, { color: string; bg: string; border: string }> = {
  default: { color: '#4fdfff', bg: 'from-[#1c2a3d] to-[#161b22]', border: 'border-[#4fdfff]' },
  lava: { color: '#ff6622', bg: 'from-[#2a1508] to-[#1a0c04]', border: 'border-[#ff6622]' },
  ice: { color: '#88ccff', bg: 'from-[#0e2238] to-[#081828]', border: 'border-[#88ccff]' },
  forest: { color: '#44cc66', bg: 'from-[#0a1a0c] to-[#061208]', border: 'border-[#44cc66]' },
  thunder: { color: '#ffcc22', bg: 'from-[#1a1a08] to-[#12120a]', border: 'border-[#ffcc22]' },
  shock: { color: '#ff66cc', bg: 'from-[#2a0a2a] to-[#150518]', border: 'border-[#ff66cc]' }
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

/** Build the player's PvP team with the correct levels and team size */
const buildPvpTeam = (): import('@/types/spinner').SpinnerConfig[] => {
  const size = gameConfig.value.teamSize
  const isLvl1 = gameConfig.value.levelOne
  const team = playerTeam.value.slice(0, size)
  return team.map((c, i) => ({
    ...c,
    topLevel: isLvl1 ? 1 : (playerUpgrades.value.tops[c.topPartId] ?? 0),
    bottomLevel: isLvl1 ? 1 : (playerUpgrades.value.bottoms[c.bottomPartId] ?? 0),
    modelId: getSelectedSkin(c.topPartId, i)
  }))
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
    div.pvp-scroll(class="p-4 sm:p-6 max-h-[55vh] overflow-y-auto overflow-x-hidden")

      //- ── Idle: Create or Join ─────────────────────────────────────────
      template(v-if="status === 'idle'")
        div.flex.flex-col.gap-4

          //- Arena Selection
          div
            div.text-gray-400.game-text.uppercase.font-bold.mb-2(class="text-xs") {{ t('pvp.selectArena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              div(
                v-for="arena in selectableArenas"
                :key="arena"
                @click="onSelectArena(arena)"
                class="relative cursor-pointer rounded-lg p-2 text-center transition-all duration-150 hover:scale-105 active:scale-95 border-2"
                :class="selectedArena === arena \
                  ? ['bg-gradient-to-b', ARENA_CARDS[arena]?.bg, ARENA_CARDS[arena]?.border, 'ring-1 ring-white/20'] \
                  : 'bg-slate-700 border-slate-600 hover:border-slate-400'"
              )
                //- Color dot
                div.mx-auto.rounded-full.mb-1(
                  class="w-4 h-4 sm:w-5 sm:h-5"
                  :style="{ backgroundColor: ARENA_CARDS[arena]?.color }"
                )
                div.text-white.font-bold.game-text.truncate(class="text-[9px] sm:text-xs") {{ t('arenas.' + arena) }}

          //- Team Size
          div
            div.text-gray-400.game-text.uppercase.font-bold.mb-2(class="text-xs") {{ t('pvp.teamSize') }}
            div.flex.gap-2
              button(
                v-for="size in [1, 2]"
                :key="size"
                @click="onSelectTeamSize(size)"
                class="flex-1 py-2 rounded-lg border-2 font-bold game-text transition-all cursor-pointer text-sm"
                :class="selectedTeamSize === size \
                  ? 'bg-gradient-to-b from-yellow-500 to-yellow-600 border-yellow-300 text-white' \
                  : 'bg-slate-700 border-slate-600 text-gray-300 hover:border-slate-400'"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle
          div.flex.items-center.gap-3.cursor-pointer(@click="onToggleLevelOne")
            div.rounded-full.border-2.flex.items-center.justify-center.transition-colors(
              class="w-5 h-5"
              :class="levelOne ? 'bg-yellow-500 border-yellow-400' : 'bg-slate-700 border-slate-600'"
            )
              svg(
                v-if="levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white"
                class="w-3 h-3"
              )
                path(fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd")
            span.text-gray-300.game-text.font-bold(class="text-sm") {{ t('pvp.levelOne') }}

          //- Join section
          div.flex.flex-col.gap-2
            div.text-gray-400.game-text.uppercase.font-bold(class="text-xs") {{ t('pvp.joinLobby') }}
            div.flex.gap-2
              div.relative.min-w-0.flex-1
                input.w-full.rounded-lg.border-2.bg-slate-800.text-white.py-2.font-mono.tracking-wider(
                  v-model="joiningPeerId"
                  :placeholder="t('pvp.enterCode')"
                  class="text-sm focus:outline-none focus:border-blue-400 pl-3 pr-8"
                  :class="clipboardHighlight \
                    ? 'border-yellow-400 ring-2 ring-yellow-400/40' \
                    : 'border-slate-600'"
                )
                //- Clear button
                button.absolute.flex.items-center.justify-center.text-gray-400.cursor-pointer(
                  v-if="joiningPeerId"
                  @click="clearJoinInput"
                  class="right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:text-white hover:bg-slate-600 transition-colors"
                )
                  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3")
                    path(d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z")
              button.shrink-0(
                @click="onJoinLobby"
                :disabled="!joiningPeerId.trim()"
                class="px-4 py-2 rounded-lg border-2 border-[#0f1a30] bg-gradient-to-b from-[#50aaff] to-[#2266ff] text-white font-bold game-text uppercase cursor-pointer hover:from-[#60bbff] hover:to-[#3377ff] transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              ) {{ t('pvp.join') }}

      //- ── Creating / Connecting ──────────────────────────────────────────
      template(v-else-if="status === 'creating' || status === 'connecting'")
        div.flex.flex-col.items-center.gap-4.py-8
          div.animate-spin.rounded-full.border-4.border-blue-400(
            class="border-t-transparent w-10 h-10"
          )
          div.text-white.game-text.font-bold {{ status === 'creating' ? t('pvp.creatingLobby') : t('pvp.connecting') }}

      //- ── Waiting for Guest ──────────────────────────────────────────────
      template(v-else-if="status === 'waiting'")
        div.flex.flex-col.gap-4
          //- Countdown
          div.text-center
            div.text-yellow-400.font-bold.game-text(class="text-lg") {{ t('pvp.waitingForPlayer') }}
            div.text-gray-400.game-text(class="text-sm mt-1") {{ t('pvp.inviteExpires') }}
              span.text-yellow-300.font-bold.ml-1 {{ expiryFormatted }}

          //- Invite code (easy to copy on mobile)
          div.rounded-lg.border-2.border-slate-600.bg-slate-800.p-3
            div.text-gray-400.game-text.uppercase.font-bold.mb-1(class="text-[10px]") {{ t('pvp.inviteCode') }}
            div.flex.items-center.gap-2
              div.text-yellow-300.font-mono.font-bold.truncate.flex-1.select-all.tracking-widest(class="text-base") {{ inviteCode }}
              button.shrink-0.cursor-pointer(
                @click="onCopyCode"
                class="px-3 py-1 rounded border border-slate-500 bg-slate-700 text-white game-text font-bold text-xs hover:bg-slate-600 transition-colors"
              ) {{ codeCopied ? t('pvp.copied') : t('pvp.copy') }}

          //- Invite link actions
          div.flex.flex-col.gap-2
            //- Copy full link
            button.w-full(
              @click="onCopyLink"
              class="py-2 rounded-lg border-2 border-slate-600 bg-slate-700 text-white font-bold game-text transition-all cursor-pointer text-sm hover:bg-slate-600"
            )
              span(v-if="copied") {{ t('pvp.copied') }}
              span(v-else) {{ t('pvp.copyLink') }}

            //- WhatsApp share
            a.flex.items-center.justify-center.gap-2.w-full(
              :href="whatsappShareLink"
              target="_blank"
              rel="noopener"
              class="py-2 rounded-lg border-2 border-[#25D366] bg-[#25D366] text-white font-bold game-text transition-all cursor-pointer text-sm hover:bg-[#20bd5a]"
            )
              svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 shrink-0")
                path(d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z")
              span {{ t('pvp.shareWhatsApp') }}

            //- Browser native share
            button.flex.items-center.justify-center.gap-2.w-full(
              v-if="canNativeShare"
              @click="onNativeShare"
              class="py-2 rounded-lg border-2 border-blue-500 bg-blue-600 text-white font-bold game-text transition-all cursor-pointer text-sm hover:bg-blue-500"
            )
              svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 shrink-0")
                path(d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z")
              span {{ t('pvp.shareNative') }}

            //- CrazyGames invite (only on platform)
            button.w-full(
              v-if="isSdkActive && isCrazyGamesFullRelease"
              @click="sendCrazyGamesInvite"
              class="py-2 rounded-lg border-2 border-purple-500 bg-purple-600 text-white font-bold game-text transition-all cursor-pointer text-sm hover:bg-purple-500"
            ) {{ t('pvp.inviteFriend') }}

      //- ── Lobby: Both Connected ──────────────────────────────────────────
      template(v-else-if="status === 'lobby' || status === 'ready'")
        div.flex.flex-col.gap-4

          //- Status badge
          div.text-center
            div.text-green-400.font-bold.game-text(class="text-lg") {{ t('pvp.connected') }}
            div.text-gray-400.game-text(class="text-xs mt-1")
              span(v-if="isHost") {{ t('pvp.youAreHost') }}
              span(v-else) {{ t('pvp.youAreGuest') }}

          //- Win:Loss stats
          div.flex.items-center.justify-center.gap-4.rounded-lg.border-2.border-slate-600.bg-slate-800.py-2.px-4
            div.flex.flex-col.items-center
              span.text-green-400.font-black.game-text(class="text-lg") {{ wins }}
              span.text-gray-400.font-bold.uppercase(class="text-[9px]") {{ t('pvp.wins') }}
            div.text-slate-500.font-bold.game-text(class="text-lg") :
            div.flex.flex-col.items-center
              span.text-red-400.font-black.game-text(class="text-lg") {{ losses }}
              span.text-gray-400.font-bold.uppercase(class="text-[9px]") {{ t('pvp.losses') }}
            div.border-l.border-slate-600.h-8
            div.flex.flex-col.items-center
              span.text-yellow-400.font-black.game-text(class="text-lg") {{ honor }}
              span.text-gray-400.font-bold.uppercase(class="text-[9px]") {{ t('pvp.honor') }}

          //- Arena Selection (host can change, guest sees read-only)
          div
            div.text-gray-400.game-text.uppercase.font-bold.mb-2(class="text-xs") {{ t('pvp.arena') }}
            div.grid.gap-2(class="grid-cols-3 sm:grid-cols-6")
              div(
                v-for="arena in selectableArenas"
                :key="arena"
                @click="onSelectArena(arena)"
                class="relative rounded-lg p-2 text-center transition-all duration-150 border-2"
                :class="[\
                  gameConfig.arenaType === arena \
                    ? ['bg-gradient-to-b', ARENA_CARDS[arena]?.bg, ARENA_CARDS[arena]?.border, 'ring-1 ring-white/20'] \
                    : 'bg-slate-700 border-slate-600',\
                  isHost ? 'cursor-pointer hover:scale-105 active:scale-95 hover:border-slate-400' : 'cursor-default opacity-70'\
                ]"
              )
                div.mx-auto.rounded-full.mb-1(
                  class="w-4 h-4 sm:w-5 sm:h-5"
                  :style="{ backgroundColor: ARENA_CARDS[arena]?.color }"
                )
                div.text-white.font-bold.game-text.truncate(class="text-[9px] sm:text-xs") {{ t('arenas.' + arena) }}

          //- Team size (host can change)
          div
            div.text-gray-400.game-text.uppercase.font-bold.mb-2(class="text-xs") {{ t('pvp.teamSize') }}
            div.flex.gap-2
              button(
                v-for="size in [1, 2]"
                :key="size"
                @click="onSelectTeamSize(size)"
                :disabled="!isHost"
                class="flex-1 py-2 rounded-lg border-2 font-bold game-text transition-all text-sm"
                :class="[\
                  gameConfig.teamSize === size \
                    ? 'bg-gradient-to-b from-yellow-500 to-yellow-600 border-yellow-300 text-white' \
                    : 'bg-slate-700 border-slate-600 text-gray-300',\
                  isHost ? 'cursor-pointer hover:border-slate-400' : 'cursor-default'\
                ]"
              ) {{ size }}v{{ size }}

          //- Level 1 toggle (host can change, guest sees read-only)
          div.flex.items-center.gap-3(
            :class="isHost ? 'cursor-pointer' : 'cursor-default opacity-70'"
            @click="onToggleLevelOne"
          )
            div.rounded-full.border-2.flex.items-center.justify-center.transition-colors(
              class="w-5 h-5"
              :class="gameConfig.levelOne ? 'bg-yellow-500 border-yellow-400' : 'bg-slate-700 border-slate-600'"
            )
              svg(
                v-if="gameConfig.levelOne"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white"
                class="w-3 h-3"
              )
                path(fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd")
            span.text-gray-300.game-text.font-bold(class="text-sm") {{ t('pvp.levelOne') }}

          //- Ready status
          div.flex.gap-3.items-center.justify-center
            div.flex.items-center.gap-2
              div.rounded-full(
                class="w-3 h-3"
                :class="hostReady ? 'bg-green-400' : 'bg-gray-600'"
              )
              span.text-white.game-text.font-bold(class="text-sm") {{ t('pvp.host') }}
            div.flex.items-center.gap-2
              div.rounded-full(
                class="w-3 h-3"
                :class="guestReady ? 'bg-green-400' : 'bg-gray-600'"
              )
              span.text-white.game-text.font-bold(class="text-sm") {{ t('pvp.guest') }}

      //- ── Disconnected / Error / Expired ──────────────────────────────────
      template(v-else-if="status === 'disconnected' || status === 'error' || status === 'expired'")
        div.flex.flex-col.items-center.gap-4.py-6
          div.text-red-400.font-bold.game-text(class="text-lg") {{ t('pvp.' + status) }}
          div.text-gray-400.game-text.text-center(class="text-sm") {{ errorMessage }}

    //- ── Sticky Footer Actions (always visible) ─────────────────────────
    template(#footer)
      //- Idle: Create Lobby
      template(v-if="status === 'idle'")
        button.w-full(
          @click="onCreateLobby"
          class="py-3 rounded-lg border-2 border-[#0f1a30] bg-gradient-to-b from-[#ff8800] to-[#dd5500] text-white font-bold game-text uppercase cursor-pointer hover:from-[#ff9922] hover:to-[#ee6600] transition-all text-sm"
        ) {{ t('pvp.createLobby') }}

      //- Lobby: Ready / Start
      template(v-else-if="status === 'lobby' || status === 'ready'")
        button.w-full(
          v-if="isHost && bothReady"
          @click="onStartMatch"
          class="py-3 rounded-lg border-2 border-[#0f1a30] bg-gradient-to-b from-[#44cc66] to-[#22aa44] text-white font-bold game-text uppercase cursor-pointer hover:from-[#55dd77] hover:to-[#33bb55] transition-all text-sm"
        ) {{ t('pvp.startMatch') }}
        button.w-full(
          v-else
          @click="localReady ? setUnready() : setReady(buildPvpTeam())"
          class="py-3 rounded-lg border-2 border-[#0f1a30] text-white font-bold game-text uppercase cursor-pointer transition-all text-sm"
          :class="localReady \
            ? 'bg-gradient-to-b from-green-500 to-green-600' \
            : 'bg-gradient-to-b from-[#50aaff] to-[#2266ff] hover:from-[#60bbff] hover:to-[#3377ff]'"
        ) {{ localReady ? t('pvp.ready') : t('pvp.setReady') }}

      //- Error states: Back to Menu
      template(v-else-if="status === 'disconnected' || status === 'error' || status === 'expired'")
        button.w-full(
          @click="onClose"
          class="px-6 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 text-gray-300 font-bold game-text cursor-pointer hover:bg-slate-700 transition-all text-sm"
        ) {{ t('pvp.backToMenu') }}
</template>

<style scoped lang="sass">
// Always show the scrollbar on touch devices so content below the fold
// is discoverable. Desktop keeps the default auto-hide behaviour.
@media (pointer: coarse)
  .pvp-scroll
    scrollbar-width: thin
    scrollbar-color: rgba(148, 163, 184, 0.5) transparent

    &::-webkit-scrollbar
      width: 6px

    &::-webkit-scrollbar-thumb
      background: rgba(148, 163, 184, 0.5)
      border-radius: 3px

    &::-webkit-scrollbar-track
      background: transparent
</style>

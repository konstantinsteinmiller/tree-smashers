// ─── usePVP no-op stub (PvP-disabled builds only) ───────────────────────────
//
// Replaces `@/use/usePVP` via `resolve.alias` in `vite.config.ts` on every
// build where `VITE_APP_PVP_ENABLED` is not "true" — i.e. every portal build.
//
// WHY: `isPvpEnabled` already hides the PvP button, and PeerJS itself is behind
// an env-literal ternary, so nothing could reach PvP on those builds. But
// `SpinnerArena`, `BattlePass` and the engine import this module statically,
// so all ~950 lines of it shipped anyway: the lobby/connection state machine,
// the STUN / TURN host list with the TURN credentials from the env, and the
// WhatsApp invite link (`https://wa.me/…`). An outbound link and third-party
// relay hosts in a portal bundle are exactly what a reviewer greps for, and
// "unreachable" is not an argument that survives that.
//
// Paired with `PvPLobbyModal.stub.vue`, `PvPButton.stub.vue` and
// `PvpReadySkills.stub.vue`. The real modules are untouched; a PvP build
// (`VITE_APP_PVP_ENABLED=true`: dev, the GitHub Pages build) uses them.
//
// Must match the real module's full export surface. The default export is
// typed against the real composable, so a key added there fails type-check
// here until it is mirrored. No PeerJS, STUN/TURN or share-link literal
// anywhere in this file.

import { computed, ref, type Ref } from 'vue'
import type usePVPReal from './usePVP'
import type { PvPGameConfig, PvPMessage, PvPRole, PvPStatus } from './usePVP'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

export type { PvPGameConfig, PvPMessage, PvPRole, PvPStatus } from './usePVP'

export const whenPvpSkillsReady = (): Promise<void> => Promise.resolve()
export const isPvpEnabled = false
export const PVP_PROTOCOL_VERSION = 3
export const currentPvpRole = (): PvPRole => null
export const pendingInviteCode: Ref<string | null> = ref(null)
export const receivePvpMessage = (_msg: PvPMessage): void => {
}

const status: Ref<PvPStatus> = ref('idle')
const role: Ref<PvPRole> = ref(null)
const peerId = ref('')
const inviteLink = ref('')
const expirySeconds = ref(0)
const errorMessage = ref('')
const gameConfig: Ref<PvPGameConfig> = ref({ arenaType: 'default', teamSize: 1, levelOne: false })
const hostReady = ref(false)
const guestReady = ref(false)
const hostTeam: Ref<SpinnerConfig[]> = ref([])
const guestTeam: Ref<SpinnerConfig[]> = ref([])
const hostSkills: Ref<SkillLoadout> = ref([])
const guestSkills: Ref<SkillLoadout> = ref([])
const remotePlayerName = ref('')

const noop = (): void => {
}

const usePVP: typeof usePVPReal = () => ({
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
  hostSkills,
  guestSkills,
  remotePlayerName,
  canShowPvP: computed(() => false),
  bothReady: computed(() => false),
  whatsappShareLink: computed(() => ''),

  pendingInviteCode,
  createLobby: async () => {
  },
  joinLobby: async () => {
  },
  setReady: noop,
  setUnready: noop,
  startMatch: noop,
  sendLaunch: noop,
  sendSurrender: noop,
  sendStateCheck: noop,
  updateGameConfig: noop,
  registerCallbacks: noop,
  copyInviteLink: async () => false,
  sendCrazyGamesInvite: noop,
  checkInviteFromUrl: () => null,
  returnToLobby: noop,
  leavePvP: noop
})

export default usePVP

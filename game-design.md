# Casual Game Feature Playbook

> A reusable reference for recreating the proven features of Chaos Arena in a new casual game project using **Vue 3 +
Pug + Tailwind CSS v4 + TypeScript + Vite**.

---

## Table of Contents

1. [Tech Stack & Project Scaffold](#1-tech-stack--project-scaffold)
2. [Mobile-First Responsiveness & Safe-Area](#2-mobile-first-responsiveness--safe-area)
3. [Asset Preloader with Logo Progress](#3-asset-preloader-with-logo-progress)
4. [Sound System (SFX + Music)](#4-sound-system-sfx--music)
5. [Coin Economy & CoinBadge](#5-coin-economy--coinbadge)
6. [Treasure Chest (Timed Reward + Coin Explosion VFX)](#6-treasure-chest-timed-reward--coin-explosion-vfx)
7. [Daily Rewards (7-Day Streak)](#7-daily-rewards-7-day-streak)
8. [Battle Pass (XP-Driven Stage Track)](#8-battle-pass-xp-driven-stage-track)
9. [Upgrade Shop & Skin Shop](#9-upgrade-shop--skin-shop)
10. [Post-Game Reward Modal](#10-post-game-reward-modal)
11. [Surrender Icon](#11-surrender-icon)
12. [Settings Button & Options Modal](#12-settings-button--options-modal)
13. [Leaderboard (Fake NPC Progression)](#13-leaderboard-fake-npc-progression)
14. [Meteor Shower & 3-2-1-GO Countdown](#14-meteor-shower--3-2-1-go-countdown)
15. [Virtual Joystick](#15-virtual-joystick)
16. [Pull-String Launch Helper (Hint Timer)](#16-pull-string-launch-helper-hint-timer)
17. [Screen Shake Effect](#17-screen-shake-effect)
18. [PvP Peer-to-Peer Multiplayer](#18-pvp-peer-to-peer-multiplayer)
19. [CrazyGames SDK v3 Integration](#19-crazygames-sdk-v3-integration)
20. [Internationalization (i18n)](#20-internationalization-i18n)
21. [Mute Button with SDK Sync](#21-mute-button-with-sdk-sync)
22. [Dark-Mode Extension Guard](#22-dark-mode-extension-guard)
23. [Feature Impact on KPIs](#23-feature-impact-on-kpis)
24. [Claude Code Skills](#24-claude-code-skills)

---

## 1. Tech Stack & Project Scaffold

### Core Dependencies

```json
{
  "dependencies": {
    "vue": "^3.5",
    "vue-router": "^5",
    "vue-i18n": "^11",
    "peerjs": "^1.5"
  },
  "devDependencies": {
    "vite": "^7",
    "@vitejs/plugin-vue": "^6",
    "@tailwindcss/vite": "^4",
    "pug": "^3",
    "sass": "^1",
    "typescript": "~5.9",
    "@vue/language-plugin-pug": "^3"
  }
}
```

### Project Structure (Atomic Design)

```
src/
├── assets/
│   ├── css/
│   │   ├── tailwind.css        # @import "tailwindcss"
│   │   ├── index.sass          # Global resets, safe-area, animations
│   │   ├── components.sass     # Dark-mode extension guard
│   │   └── fonts.sass          # Custom font faces
│   └── (images, audio)
├── components/
│   ├── atoms/                  # FIconButton, FReward, FLogoProgress, FMuteButton, FButtonSwitch, FTabs
│   ├── molecules/              # FModal
│   ├── organisms/              # BattlePass, DailyRewards, TreasureChest, CoinBadge, SurrenderIcon, etc.
│   └── icons/                  # SVG icon components (IconCoin, IconAttack, etc.)
├── use/                        # Composables (singleton state pattern)
│   ├── useSound.ts
│   ├── useCrazyGames.ts
│   ├── useBottomSafe.ts
│   ├── useLeaderboard.ts
│   ├── useBattlePass.ts
│   ├── useAssets.ts
│   ├── useHint.ts
│   ├── useScreenshake.ts
│   ├── usePVP.ts
│   └── ...
├── i18n/
│   └── translations.ts
├── views/
│   └── GameArena.vue           # Main game view
├── types/                      # TypeScript interfaces
├── utils/                      # Constants, enums, helper functions
├── router/
│   └── index.ts
├── App.vue
└── main.ts
```

### Key Patterns

- **Singleton composables**: Module-level `ref()` outside the exported function = shared state across all components
  that call the composable. No Pinia/Vuex needed.
- **Pug templates**: All `.vue` files use `<template lang="pug">` with Tailwind utility classes.
- **SASS styles**: Scoped `<style scoped lang="sass">` for component-specific styles.
- **Canvas-based game**: The game loop uses `requestAnimationFrame` + HTML5 Canvas, with Vue reactivity for HUD overlay
  only.

---

## 2. Mobile-First Responsiveness & Safe-Area

### Prompt

> Set up full mobile responsiveness with safe-area support for iOS PWA, Android Chrome, and desktop. The game must
> handle portrait, landscape, notch/Dynamic Island, home indicator, and dynamic browser chrome.

### Implementation Details

**index.html meta tags:**

```html

<meta name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

**Global CSS (index.sass):**

```sass
html, body
  touch-action: manipulation
  -ms-touch-action: manipulation
  margin: 0
  padding: 0
  overflow: hidden
  position: fixed
  width: 100%
  height: 100%
  background-color: #0d1117
```

**App-level touch prevention (App.vue script):**

- Block multitouch pinch: `event.touches.length > 1 → event.preventDefault()`
- Block Safari zoom gestures: `gesturestart → event.preventDefault()`
- Block right-click context menu: `contextmenu → event.preventDefault()`
- Disable user-select: `* { user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent }`
- Disable image dragging: `img { pointer-events: none }`

**Reactive window dimensions (useUser.ts):**

```ts
export const windowWidth = ref(window.innerWidth)
export const windowHeight = ref(window.innerHeight)
export const orientation = ref(mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait')
export const isMobileLandscape = computed(() => mobileCheck() && windowWidth.value > 500 && orientation.value === 'landscape')
export const isMobilePortrait = computed(() => mobileCheck() && windowWidth.value <= 500)
```

Update on `resize`, `orientationchange`, and poll every 400ms for iOS edge cases.

**Safe-area insets on every fixed/absolute HUD element:**

```pug
div(
  :style="{\
    paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
    paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
    paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
  }"
)
```

**Bottom-safe composable (useBottomSafe.ts):**

- Measures `window.innerHeight - visualViewport.height` to detect dynamic browser chrome overlap.
- Probes actual `env(safe-area-inset-bottom)` via a hidden div.
- On iOS PWA standalone, adds a 36px floor for the home indicator when `env()` under-reports.
- Exposes `bottomGapPx` reactive value that every bottom-anchored element adds to its offset.

**Canvas sizing:**

```ts
const vv = window.visualViewport
canvasWidth.value = vv?.width ?? window.innerWidth
canvasHeight.value = vv?.height ?? window.innerHeight
```

Listen to `visualViewport` resize/scroll events to keep canvas in sync with what's actually visible.

**Responsive size classes pattern:**

```pug
//- Mobile-first, scale up for desktop
div(class="text-sm sm:text-base")
button(class="scale-80 sm:scale-100")
div(class="p-1.5 sm:p-2")
```

---

## 3. Asset Preloader with Logo Progress

### Prompt

> Create a logo-based preloader that shows loading progress as a circular reveal (conic-gradient mask) on the game logo.
> It starts centered at 40% viewport, then smoothly transitions to a small corner position when loading completes.

### Implementation Details

**useAssets.ts composable:**

- Shared `loadingProgress` ref (0-100), `areAllAssetsLoaded` boolean.
- `resourceCache` object with `images: Map<string, HTMLImageElement>` and `audio: Map<string, HTMLAudioElement>` —
  prevents garbage collection.
- Preloads in chunks of 10 to avoid portal DDOS detection.
- Lists static images, all skin model images, SFX, and music.

**FLogoProgress.vue atom:**

- Two stacked `<img>` tags — grayscale background + color foreground.
- Foreground masked with `mask-image: conic-gradient(black ${progress}%, transparent ${progress}%)`.
- Position: starts at `top: 50%; left: 50%; transform: translate(-50%, -50%)` (centered).
- On completion: transitions to
  `top: calc(52px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left))` with
  `transition-all duration-700`.
- Size: starts at `viewportSize * 0.4`, shrinks to `64px`.
- Safety timeout: forces done state after 2s in case loading stalls.
- Shows `Math.round(progress)%` text below logo during loading.

---

## 4. Sound System (SFX + Music)

### Prompt

> Create a sound system with separate SFX and music volume controls, background battle music with fade in/out,
> visibility change handling (pause when tab hidden), and multiple random battle tracks. Use HTML5 Audio, not Howler.

### Implementation Details

**useSound.ts:**

- **Music singleton**: `bgMusic` ref outside the hook — true singleton.
- `initMusic()` creates an `Audio` element on mount, cleans up on unmount.
- `startBattleMusic()` picks a random track (`battle-1.ogg` to `battle-3.ogg`), fades in with setInterval volume
  ramping.
- `stopBattleMusic()` fades out, then pauses.
- `pauseMusic()` / `continueMusic()` for visibility change (only resumes if `shouldPlay` is true).
- `fadeIn()` / `fadeOut()` use `setInterval` with 50ms ticks, stepping volume by 0.005.
- Music volume scaling: `userMusicVolume.value * 0.025` (low multiplier for game music).
- Autoplay fallback: catches `play()` rejection, adds one-time click listener.

**SFX:**

- `playSound(effect, ratio)` — creates a new `Audio` per play (fire-and-forget).
- Sets volume before `.play()` (iOS requirement).
- Sounds stored as `.ogg` files in `public/audio/sfx/`.

---

## 5. Coin Economy & CoinBadge

### Prompt

> Create a coin badge HUD element that shows the player's coin count with a polished mobile-game look: blue gradient
> background, gold coin icon with radial gradient, animated shine effect, yellow border, and text shadow. Expose the DOM
> element for fly-to VFX targeting.

### Implementation Details

**useSpinnerConfig.ts:**

- `coins: Ref<number>` persisted in localStorage.
- `addCoins(amount)` — can be negative for purchases.

**CoinBadge.vue:**

- Exposes `rootEl` via `defineExpose({ rootEl })` so siblings (TreasureChest) can read it for VFX.
- Styling: blue gradient background, gold border, `coin-shine` animation (3.5s linear infinite, moving a 250%
  background-size linear-gradient).
- Coin icon: radial gradient from white to gold to dark gold, with box-shadow glow.
- Text: `#fff7d6` color with gold text-shadow.

---

## 6. Treasure Chest (Timed Reward + Coin Explosion VFX)

### Prompt

> Create a treasure chest that gives 100 coins every 10 minutes. Show a circular cooldown overlay on the chest icon.
> When collected, spawn 20 coin SVGs that explode outward then fly to the CoinBadge with easing. Play a happy sound.

### Implementation Details

**TreasureChest.vue:**

- Props: `targetEl` (HTMLElement for coin fly-to destination).
- 10-minute cooldown stored in localStorage (`spinner_chest_ready_at` timestamp).
- Cooldown overlay: SVG circle with `stroke-dasharray/dashoffset` animated by cooldown percentage, rotated -90deg and
  flipped.
- Timer display: `MM:SS` format, updated every second via `setInterval`.
- Pulse animation when ready.

**Coin explosion VFX:**

1. Spawn 20 `div` elements with inline SVG coins at the chest's position.
2. Phase 1 (600ms): Explode outward to random angles and distances (40-80px).
3. Phase 2 (500ms per coin, staggered 0-300ms): Fly to CoinBadge element with quadratic easing, fading out.
4. Clean up DOM elements when animation completes.
5. All animation done via `requestAnimationFrame` — no CSS transitions.

---

## 7. Daily Rewards (7-Day Streak)

### Prompt

> Create a 7-day daily rewards system with escalating coin rewards (100→1000), skin rewards on days 3/5/7, streak reset
> on missed day, and a bouncing hint button when uncollected. Use a modal grid showing all 7 days with status indicators.

### Implementation Details

**DailyRewards.vue (self-contained organism):**

- `DAILY_REWARDS = [100, 200, 300, 400, 500, 750, 1000]`
- `SKIN_REWARD_DAYS = Set([2, 4, 6])` (0-indexed for days 3, 5, 7)
- State in localStorage: `{ currentDay: number, lastCollected: ISO-date-string }`
- Streak logic: On modal open, if `lastCollected` is not today or yesterday → reset to day 0.
- Skin preview: Sample distinct unowned skins for each skin day, refreshed on modal open.
- Skin unlock: `unlockSkinEverywhere(modelId)` — unlocks across all applicable categories.
- Fallback: If no unowned skins remain, skin days pay coins instead.
- Open button: Gold gradient, shows `+{nextReward}` with coin icon, `hint-bounce` CSS class when uncollected.
- Grid: 7 columns, color-coded (green=claimed, yellow=current, purple=skin, gray=locked).
- i18n: component copy under `sfc.DailyRewards` in the locale files (`useSfcI18n`).

---

## 8. Battle Pass (XP-Driven Stage Track)

### Prompt

> Create a 50-stage battle pass with XP progression (100xp per stage), coin rewards scaling 30→300, skin rewards at
> stages 10/20/30/40, horizontal scroll strip, auto-scroll to current stage, and an unclaimed-count badge on the open
> button. XP sources: campaign win 50xp, leaderboard win 25xp, loss 12.5xp.

### Implementation Details

**useBattlePass.ts composable:**

- Tunables: `BP_TOTAL_STAGES=50`, `BP_XP_PER_STAGE=100`.
- State: `{ xp, unlockedStages, claimedStages[] }` in localStorage.
- `addXp(amount)` — accumulates XP, auto-promotes stages via while loop.
- `claimStage(stage)` — returns `{ coins, skin }`, handles skin fallback to coins.
- `bpCoinReward(stage)` — linear interpolation `30 + ((stage-1) * 270) / 49`, rounded to nearest 5.
- Computed: `pendingClaimCount`, `hasUnclaimedReward`, `isMaxed`.

**BattlePass.vue organism:**

- Open button: Purple gradient, shows `BP` label + `unlockedStages/50`, red unclaimed badge.
- Modal: Summary row with stage number + XP progress bar (purple-to-gold gradient).
- Horizontal scroll strip of 50 stage cards, auto-scrolls to current stage via `nextTick` + `scrollTo`.
- Each card: stage number, reward icon (coin or skin preview with halo), coin amount, claim button.
- Hidden scrollbar: `scrollbar-width: none`.
- i18n: component copy under `sfc.<Component>` in the locale files (`useSfcI18n`).

---

## 9. Upgrade Shop & Skin Shop

### Prompt

> Create a team configuration modal with tab-based blade selection, part selection grids with stat displays, upgrade
> purchasing with coin costs, and a skin picker with buy/select mechanics. Parts have stats (damage, defense, HP, speed,
> weight). Upgrades cost escalating amounts.

### Implementation Details

**SpinnerConfigModal.vue (the shop):**

- v-model for open/close, tabs for each blade in the team.
- Part selection grids: Top parts (6 types) and bottom parts (3 types), each with stat icons.
- Stat display: computed from `computeStats(config, topLevel, bottomLevel)`.
- Upgrade button per part: shows cost (`upgradeCost(level+1)`), grayed out if not enough coins, plays `level-up` sound
  on purchase.
- Skin picker: Grid of model images, owned vs locked states, buy for `SKIN_COST` coins.

**useSpinnerConfig.ts:**

- `computeStats()` — combines part base stats + upgrade bonuses.
- `playerTeam`, `coins`, `hasFirstWin` persisted in localStorage.

**useSpinnerCampaign.ts:**

- `playerUpgrades` — per-part-id upgrade levels.
- `upgradeCost(level)` — escalating formula.
- `upgradeTop(id)`, `upgradeBottom(id)` — increment + save.

**useModels.ts:**

- `SKINS_PER_TOP` — catalog of skins per part type.
- `isSkinOwned()`, `buySkin()`, `selectSkin()`, `getSelectedSkin()`.
- `modelImgPath(modelId)` — resolves to `/images/skins/{id}.webp`.

---

## 10. Post-Game Reward Modal

### Prompt

> Create a full-screen reward overlay with a parchment ribbon header, game result text (win green / lose red), coin
> reward display, and "tap/click to continue" prompt. Handle PvP vs campaign reward variants. Include a fade transition
> and backdrop blur.

### Implementation Details

**FReward.vue atom:**

- Full-screen fixed overlay: `z-[100] bg-black/60 backdrop-blur-md`.
- Safe-area padding on all edges.
- Parchment ribbon: actual `.webp` image with absolutely-positioned text overlay.
- Named slots: `#ribbon` for header text, default slot for reward content.
- `showContinue` prop → shows pulsing "Tap to continue" / "Click to continue" (detects touch capability).
- Click anywhere to emit `continue`.
- Responsive: ribbon scales down in landscape via media queries.

**Usage in GameArena.vue:**

```pug
FReward(v-model="showReward" :show-continue="true" @continue="onRewardContinue")
  template(#ribbon)
    span.game-text {{ pvpMode ? t('pvp.title') : t('spinner.rewards') }}
  div.flex.flex-col.items-center.gap-4
    div.game-text(:class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'") {{ resultText }}
    div.flex.items-center.gap-3
      IconCoin(class="w-8 h-8")
      span.text-yellow-400.game-text +{{ rewardAmount }}
```

---

## 11. Surrender Icon

### Prompt

> Create a surrender button with a white flag SVG icon on a red gradient background, with a confirmation modal. The
> modal should have a flag icon, title, subtitle, and cancel/quit buttons.

### Implementation Details

**SurrenderIcon.vue:**

- Red gradient button: `from-[#ff5555] to-[#cc2222]`, dark shadow underneath.
- White flag SVG: pole (line) + waving flag (path with fill `rgba(255,255,255,0.3)`).
- Confirmation modal via `<Teleport to="body">`:
    - Dark backdrop with blur.
    - Larger red flag icon.
    - "Surrender?" title + "You will not receive any rewards." subtitle.
    - Cancel (dark blue) + Quit (red gradient) buttons.
    - Full safe-area padding.
- Emits `surrender` event on confirm.

---

## 12. Settings Button & Options Modal

### Prompt

> Create a gear icon button that opens a settings/options modal with volume sliders for music and sound, language
> selector, and a reset progress button.

### Implementation Details

**FIconButton.vue atom:**

- Props: `type` (primary/secondary), `size` (sm/md/lg), `imgSrc`, `icon`.
- Shadow-underneath 3D effect pattern.
- Scale transitions on hover/active.

**OptionsModal.vue:**

- Uses `FModal` with sliders for music/sound volume.
- Language dropdown with flag icons.
- Calls `setSettingValue('music', val)` etc. via `useUser`.
- All settings persisted to IndexedDB via `useUserDb`.

---

## 13. Leaderboard (Fake NPC Progression)

### Prompt

> Create a fake leaderboard with 200+ NPC entries that naturally progress over time — a few NPCs climb 1-2 stages per
> hour, daily climb caps, newcomers join, proximity protection around the player's rank. Support ghost fights (1v1 against
> NPC builds) with daily fight limits. Use pagination, "Jump to Me" button, and fight buttons per entry.

### Implementation Details

**useLeaderboard.ts composable:**

- Seeds 212 NPCs on a smooth descending curve (stage 126→1).
- Hourly tick (`refreshLeaderboardIfDue`): picks `CLIMBERS_PER_UPDATE` random NPCs, each climbs 1-2 stages.
- Daily climb cap: 5 stages per 24h rolling window per NPC.
- Proximity protection: skips NPCs within ±2 stages of player.
- Newcomers: ~5 per day, joining at stages 1-4.
- Ghost fights: daily per-NPC limit tracked in localStorage.
- Player entry merged into sorted list with player-wins-ties logic.
- Names: mix of 60% silly/childish + 40% edgy names, with random prefix/suffix.

**FakeLeaderBoard.vue organism:**

- Modal with paginated list (20 per page), pagination buttons, "Jump to Me".
- Each entry: rank, name, stage, fight button (grayed if already fought today).
- Player row highlighted differently.

---

## 14. Meteor Shower & 3-2-1-GO Countdown

### Prompt

> Create a meteor shower particle effect that spawns on match start and game-over wins. Every 5th match, overlay a "3,
> 2, 1, GO!" countdown with pop-scale animation inside the meteor ring. Meteors should spawn in staggered waves with
> random angles and decay over time.

### Implementation Details

**Meteor shower (in useSpinnerGame.ts):**

- `spawnMeteorShower(count, spawnRadius, maxLife)` — creates particle array.
- Particles have: position, velocity, angle, life, maxLife, delay.
- Staggered spawn: delay spread across 60% of maxLife.
- Updated in physics loop, rendered as glowing circles with trail.
- `meteor_intro` phase: runs 1600ms of meteor + countdown before gameplay begins.

**Countdown (in useSpinnerGame.ts):**

- Counter: `gameStartCount` persisted in localStorage, incremented each match.
- Every 5th match: `triggerCountdown()` fires `['3', '2', '1', 'GO!']` at 375ms intervals.
- `countdownText` reactive ref consumed by the template.

**Countdown styling (SpinnerArena.vue):**

```sass
.countdown-number
  text-shadow: 0 0 24px rgba(255, 200, 0, 0.85), 0 0 6px rgba(255, 255, 255, 0.6), 0 4px 0 #000
  animation: countdown-pop 375ms ease-out forwards

@keyframes countdown-pop
  0%
    transform: scale(0.4)
    opacity: 0
  20%
    transform: scale(1)
    opacity: 1
  100%
    transform: scale(2.6)
    opacity: 0
```

Use `:key="countdownText"` on the element to retrigger the animation on each step.

---

## 15. Virtual Joystick

### Prompt

> Create a virtual joystick that appears when the selected game element is near the edge of the arena (>55% from
> center). The joystick lets the player aim and launch without fighting the screen boundary. Show a base circle and
> draggable knob with force indicator.

### Implementation Details

**In the game composable:**

- `JOYSTICK_EDGE_THRESHOLD = 0.55` — blade distance from center / arena radius.
- `isJoystickVisible` computed: true when `phase === 'player_turn'` and selected blade is near edge.
- `joystickCenter` — placed below-left of arena, recomputed per frame.
- `beginJoystickDrag(x, y)` — hit test against joystick base radius.
- `updateJoystickDrag(x, y)` — clamps knob to max pull distance (28 game units).
- `releaseJoystickDrag()` — if `joystickMagnitude > cancelRadius`, launches the blade using joystick vector.
- Force ratio: `min(magnitude / JOYSTICK_MAX_PULL, 1)`.

**Rendering:**

- Base circle: semi-transparent, rendered in canvas.
- Knob: smaller filled circle at joystick position.
- Direction line: from blade to projected launch direction.
- Force arc: visual indicator of launch power.

**Pointer event priority:**

```ts
const onPointerDown = (e) => {
  if (isJoystickVisible.value && beginJoystickDrag(coords.x, coords.y)) return
  beginDrag(coords.x, coords.y)  // fallback to direct drag
}
```

---

## 16. Pull-String Launch Helper (Hint Timer)

### Prompt

> Create a hint system that shows a bouncing "drag to launch" animation after the player hasn't interacted for a
> configurable delay (e.g., 2.5 seconds during their turn). Hint clears on any interaction and can be permanently
> disabled.

### Implementation Details

**useHint.ts composable:**

```ts
export function useHint(delay = 5000) {
  const showHint = ref(false)
  const isHintDisabled = ref(false)
  let hintTimeout = null

  const startHintTimer = () => { /* setTimeout → showHint = true */
  }
  const clearHint = () => { /* clearTimeout + showHint = false */
  }
  const disableHintPermanently = () => { /* isHintDisabled = true */
  }

  onUnmounted(() => clearHint())
  return { showHint, isHintDisabled, startHintTimer, clearHint, disableHintPermanently }
}
```

**Usage:**

- Start timer when phase enters `player_turn`.
- Clear on any other phase or pointer interaction.
- Pass `showHint.value` to the render function for visual overlay.

**CSS hint-bounce animation (components.sass):**

```sass
.hint-bounce
  animation: hint-bounce-cycle 6s infinite ease-in-out

@keyframes hint-bounce-cycle
  0%, 7.5%, 18.75%, 30%, 37.5%
    transform: translateY(0) scale(1)
  22%
    transform: translateY(-15px) scale(1.06)
  34.5%
    transform: translateY(-7px) scale(1.03)
  50%, 100%
    transform: translateY(0) scale(1)
```

---

## 17. Screen Shake Effect

### Prompt

> Create a screen shake effect with intensity levels (small/strong/big) that applies to the game canvas only (not the
> HUD), with decaying amplitude and smooth snap-back.

### Implementation Details

**useScreenshake.ts:**

```ts
const shakeStyle = ref<CSSProperties>({ transform: 'translate(0px, 0px)', transition: 'none' })

const triggerShake = (intensity: 'small' | 'strong' | 'big') => {
  const duration = { big: 700, strong: 500, small: 300 }[intensity]
  const force = { big: 22, strong: 14, small: 5 }[intensity]
  // requestAnimationFrame loop with decaying random offsets
  // Reset with transition: 'transform 0.1s ease-out' on completion
}
```

**Key**: Apply `shakeStyle` to the canvas element only, NOT to the parent `.arena` div. Putting transform on the arena
would promote it to a containing block for fixed descendants and `overflow-hidden` would clip them.

```pug
canvas(:style="shakeStyle")
```

---

## 18. PvP Peer-to-Peer Multiplayer

### Prompt

> Create a PvP system using PeerJS (WebRTC) for direct browser-to-browser connections. Include: lobby creation with
> expiring invite codes, join via code/link/URL, host/guest roles, game config sync (arena selection, team size, level-one
> toggle), ready-up flow, WhatsApp share, ping/pong keepalive, disconnect detection, and honor points ranking.

### Implementation Details

**usePVP.ts composable:**

- Feature-gated: `VITE_APP_PVP_ENABLED=true`.
- Peer ID format: `chaos-arena-{random8chars}`.
- Invite link: `{baseUrl}#/battle?pvp={encodedPeerId}`.
- Invite expiry: 2 minutes with countdown timer.
- Message protocol (typed union):
    - `game-config` — host→guest arena/teamSize/levelOne sync.
    - `player-ready` / `player-unready` — with team data.
    - `game-start` — host sends `firstTurn: 'host' | 'guest'` (random 50/50).
    - `launch` — `{ bladeIndex, ax, ay }` for remote blade launches.
    - `ping` / `pong` — keepalive, 5s interval, 10s timeout → disconnect.
- Cleanup: destroys peer + connection on leave, handles all error states.

**PvPLobbyModal.vue:**

- States: idle → creating → waiting → lobby/ready → playing → disconnected/error/expired.
- Idle: arena grid (6 arenas with color-coded cards), team size buttons, level-one toggle, join input with clipboard
  auto-paste.
- Waiting: invite code display, copy code, copy link, WhatsApp share, CrazyGames invite.
- Lobby: ready status dots, host controls, win/loss/honor stats.
- Smart clipboard: auto-reads clipboard for invite codes on modal open.

**usePvpStats.ts:**

- Tracks: wins, losses, honor points, honor stages (3 total, 300 HP each).
- `calcHonorPoints(myLevel, enemyLevel)` — base 100, ±10 per level difference, clamped 25-200.
- Honor track: 3 skin rewards, progress bar, claim mechanics.

---

## 19. CrazyGames SDK v3 Integration

### Prompt

> Integrate CrazyGames SDK v3 with: initialization before Vue app loads, localStorage mirroring to SDK data module for
> cross-device progress, mute button sync, player name/locale detection, gameplay lifecycle (start/stop), rewarded video
> ads, and interstitial (midgame) ads.

### Implementation Details

**index.html:**

```html

<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
```

**useCrazyGames.ts composable:**

1. **Init (must run before Vue app loads in main.ts):**
   ```ts
   export const initCrazyGames = async () => {
     const sdk = window.CrazyGames?.SDK
     await sdk?.init?.()
     if (isActiveEnv(sdk)) {
       isSdkActive.value = true
       await hydrateFromSdk()   // SDK → localStorage
       patchLocalStorage()       // localStorage → SDK mirror
       await captureSdkProfile() // mute, name, locale
     }
   }
   ```

2. **Data Module — localStorage mirroring:**
    - On init: read keys manifest from SDK, hydrate localStorage with all stored values.
    - Monkey-patch `localStorage.setItem` / `removeItem` to also write to SDK data module.
    - Maintain a keys manifest (`__ca_keys__`) so we know which keys to hydrate next session.
    - Use raw `setItem`/`removeItem` bindings captured before patching to avoid recursion.

3. **Mute sync:**
   ```ts
   export const addCrazyMuteListener = (cb: MuteCallback) => {
     sdk.game?.addMuteListener?.(wrapped)
     return () => sdk?.game?.removeMuteListener?.(wrapped)
   }
   export const setCrazyMuted = (muted: boolean) => {
     sdk.game.muteAudio = muted
   }
   ```

4. **User info:**
   ```ts
   const u = await sdk?.user?.getUser?.()
   crazyPlayerName.value = u?.username
   const info = sdk?.user?.systemInfo ?? await sdk?.user?.getSystemInfo?.()
   crazyLocale.value = info?.locale?.split(/[-_]/)[0]
   ```

5. **Gameplay lifecycle:**
   ```ts
   export const startGameplay = () => sdk.game?.gameplayStart?.()
   export const stopGameplay = () => sdk.game?.gameplayStop?.()
   ```
   Call `startGameplay()` on mount, `stopGameplay()` on unmount.

6. **Rewarded ads:**
   ```ts
   export const showRewardedAd = (): Promise<boolean> => {
     return new Promise((resolve) => {
       sdk.ad?.requestAd?.('rewarded', {
         adStarted: () => stopGameplay(),
         adFinished: () => { startGameplay(); resolve(true) },
         adError: () => { startGameplay(); resolve(false) }
       })
     })
   }
   ```

7. **Interstitial (midgame) ads:**
   Same pattern as rewarded but with `'midgame'` type, resolves `void`.
   Trigger cadence: every 2 battles for ghost/PvP, every 3 for campaign.

**Content-Security-Policy (index.html):**

```html

<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' https://*.crazygames.com;
           script-src 'self' https://sdk.crazygames.com https://*.crazygames.com;
           style-src 'self' 'unsafe-inline' https://*.crazygames.com;
           connect-src 'self' https://*.crazygames.com wss://0.peerjs.com https://0.peerjs.com;
           frame-src https://*.crazygames.com;">
```

---

## 20. Internationalization (i18n)

### Prompt

> Set up vue-i18n with 8+ languages (en, de, fr, es, jp, kr, zh, ru), global translation file for shared strings, SFC
`<i18n>` blocks for component-specific translations, and CrazyGames locale detection that overrides the default.

### Implementation Details

**Global translations (src/i18n/translations.ts):**

```ts
export default {
  en: { gameName: 'Game Title', cancel: 'Cancel', ... },
  de: { gameName: 'Spieltitel', cancel: 'Abbrechen', ... },
  // ... 8 languages
}
```

**Component copy (no SFC `<i18n>` blocks any more):** it lives in the lazy per-locale files under
`sfc.<ComponentName>` (e.g. `sfc.DailyRewards.dailyRewards`) and is read with `const { t } = useSfcI18n('DailyRewards')`
(`src/i18n/sfc.ts`: own key first, then global); `<i18n-t>` takes the full `sfc.…` keypath with `scope="global"`.

**main.ts setup:**

```ts
const i18n = createI18n({
  locale: userLanguage.value || 'en',
  fallbackLocale: 'en',
  messages: translations,
  missingWarn: false,
  fallbackWarn: false
})
```

**CrazyGames locale integration:**

- Read `crazyLocale` from SDK before creating the app.
- If the locale is in the supported `LANGUAGES` list, use it as initial locale.
- Store in sessionStorage + update i18n global locale.

---

## 21. Mute Button with SDK Sync

### Prompt

> Create a mute toggle button (emoji-based 🔊/🔇) that mutes both SFX and music, syncs with CrazyGames SDK mute state,
> remembers previous volume levels for unmute, and only shows on desktop (hidden on mobile where OS controls handle
> audio).

### Implementation Details

**FMuteButton.vue:**

- `isMuted` computed from `userMusicVolume === 0 && userSoundVolume === 0`.
- Stores previous volumes in refs for restore on unmute.
- On mount: adopts SDK initial mute state if different, subscribes to `addCrazyMuteListener`.
- On click: toggles mute via `applyMute()` + `setCrazyMuted()`.
- Hidden on mobile: `v-if="!mobileCheck()"`.

---

## 22. Dark-Mode Extension Guard

### Prompt

> Protect game UI from browser dark-mode extensions (like Dark Reader) that can break gradients, alpha channels, and
> animations. Force the browser to use dark color scheme natively so extensions stay passive.

### Implementation Details

**components.sass:**

```sass
:root
  color-scheme: dark only
  forced-color-adjust: none !important

// Override extension CSS variables
:root, ::after, ::before, ::backdrop
  --native-dark-bg-image-filter: none !important
  --native-dark-brightness: 1 !important

// Protect alpha/gradient backgrounds
[class*="bg-white/"], [class*="bg-black/"], [class*="from-"], [class*="to-"]
  --native-dark-bg-color: transparent !important
  filter: none !important
```

Also set `<meta name="color-scheme" content="dark only">` in index.html.

---

## 23. Feature Impact on KPIs

### Feature → PlayTime Contribution

| Feature                      | PlayTime Impact | Mechanism                                                              |
|------------------------------|-----------------|------------------------------------------------------------------------|
| **Campaign stages**          | ★★★★★           | Core loop — each fight is 30-90s, players progress through 100+ stages |
| **Upgrade shop**             | ★★★★            | Coin grinding motivation — players replay stages to afford upgrades    |
| **Battle Pass**              | ★★★★            | Long-term progression — 50 stages keep players engaged for weeks       |
| **Leaderboard ghost fights** | ★★★             | Side content — challenge NPCs near your rank for coins                 |
| **PvP multiplayer**          | ★★★             | Social engagement — matches are replayable indefinitely                |
| **Skin shop**                | ★★              | Cosmetic motivation — coin sink that extends the grind                 |
| **2x speed boost (ad)**      | ★★              | Quality-of-life — makes grinding faster, increases session length      |

### Feature → D1–D7 Retention Contribution

| Feature                  | Retention Impact | Mechanism                                                           |
|--------------------------|------------------|---------------------------------------------------------------------|
| **Daily rewards**        | ★★★★★            | D1-D7 driver — escalating rewards (100→1000) + streak reset penalty |
| **Battle Pass**          | ★★★★★            | D1-D30 driver — slow XP accrual requires multi-day engagement       |
| **Treasure chest**       | ★★★★             | 10-min cooldown creates micro check-in loops within a session       |
| **Campaign progression** | ★★★★             | Curiosity about next stage/boss drives return visits                |
| **Leaderboard**          | ★★★              | Competition — "I was rank 45, have NPCs passed me?" drives return   |
| **Skin rewards**         | ★★★              | Collection motivation — "only 3 skins left" drives completionism    |
| **PvP honor track**      | ★★               | Social competitive loop for PvP-focused players                     |

### Feature → Player Conversion (min. 1 minute played)

| Feature                          | Conversion Impact | Mechanism                                                                |
|----------------------------------|-------------------|--------------------------------------------------------------------------|
| **Logo preloader**               | ★★★★★             | First impression — professional feel, shows game is loading (not broken) |
| **Tap-to-start + meteor shower** | ★★★★★             | Immediate spectacle on first interaction — "wow" moment                  |
| **3-2-1-GO countdown**           | ★★★★              | Excitement/anticipation — makes the game feel polished and energetic     |
| **Low tutorial friction**        | ★★★★              | No lengthy tutorial — "tap, drag, release" learned in 10 seconds         |
| **First win within 60s**         | ★★★★              | Early win designed to be easy — reward overlay + coins feel rewarding    |
| **Sound effects**                | ★★★               | Satisfying clash sounds + win fanfare make combat feel impactful         |
| **Coin badge + first reward**    | ★★★               | Visible progression from second 1 — "I earned something"                 |
| **Responsive mobile UX**         | ★★★               | No broken layout = no ragequit on first load                             |

---

## 24. Claude Code Skills

The following `.claude/skills/` files can be created to encode project patterns as reusable Claude Code skills.

### Skill: `pug-tailwind-component.md`

```markdown
---
name: pug-tailwind-component
description: Create Vue 3 SFC components using Pug template syntax with Tailwind CSS v4
---

When creating Vue components in this project, follow these patterns:

1. **Template syntax**: Always use `<template lang="pug">`.
2. **Styling**: Use `<style scoped lang="sass">` for component styles.
3. **Tailwind classes in Pug**: Use parenthesized `class=""` attribute for complex classes:
   ```pug
   div.flex.items-center(class="gap-2 sm:gap-4 text-sm sm:text-base")
   ```

4. **Dynamic classes**: Use `:class` with array or object syntax, escape line breaks with `\`:
   ```pug
   div(
     :class="[\
       isActive ? 'bg-yellow-500' : 'bg-slate-700',\
       'rounded-lg border-2'\
     ]"
   )
   ```
5. **Dynamic styles with safe-area**: Use `:style` with template literals:
   ```pug
   div(
     :style="{\
       bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
       left: 'calc(0.5rem + env(safe-area-inset-left, 0px))'\
     }"
   )
   ```
6. **Responsive sizing**: Always mobile-first: `text-sm sm:text-base`, `scale-80 sm:scale-100`.
7. **3D button pattern**: Shadow div underneath + gradient body:
   ```pug
   div.relative
     div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
     div.relative.rounded-lg.border-2(class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]")
   ```
8. **Game text**: Use `.game-text` class for text-shadow on game UI text.
9. **Transitions**: Use Vue `<Transition>` with Tailwind utility classes for enter/leave.
10. **Modals**: Always use `FModal` molecule with v-model, safe-area padding, and optional `#footer` slot.

```

### Skill: `safe-area-responsive.md`

```markdown
---
name: safe-area-responsive
description: Ensure full mobile responsiveness with safe-area support for iOS PWA, Android, and desktop
---

When building mobile-responsive game UI:

1. **index.html** must have:
   - `viewport-fit=cover` in viewport meta
   - `apple-mobile-web-app-capable` and `mobile-web-app-capable`
   - `black-translucent` status bar style

2. **Global CSS**: Fixed html/body, no overflow, touch-action manipulation, no user-select.

3. **Every fixed/absolute HUD element** must include safe-area insets:
   ```pug
   div(
     :style="{\
       paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
       paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
       paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
     }"
   )
   ```

4. **Bottom elements** need the `useBottomSafe` composable gap on top of env():
   ```pug
   div(:style="{ bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)` }")
   ```

5. **Canvas sizing** must use `visualViewport` dimensions, not `window.innerHeight`.

6. **Orientation handling**: Track via `matchMedia('(orientation: portrait)')` + reactive refs.

7. **Touch prevention**: Block multitouch, gesture zoom, context menu, tap highlight.

8. **Responsive breakpoints**: Use `sm:` prefix for desktop, base for mobile. Common patterns:
    - Text: `text-xs sm:text-sm`, `text-sm sm:text-base`
    - Spacing: `p-1 sm:p-2`, `gap-1 sm:gap-2`
    - Scale: `scale-80 sm:scale-100`
    - Landscape mobile: special handling with `isMobileLandscape` computed

```

### Skill: `translation-i18n.md`

```markdown
---
name: translation-i18n
description: Add internationalization with vue-i18n, supporting 8 languages with global and SFC translations
---

When adding translations:

1. **Global strings** go in `src/i18n/translations.ts` as a nested object:
   ```ts
   export default {
     en: { cancel: 'Cancel', ... },
     de: { cancel: 'Abbrechen', ... },
   }
   ```

2. **Component-specific strings** go in every locale file under `sfc.<ComponentName>` (English first) and are read via
   `useSfcI18n('<ComponentName>')` — never an SFC `<i18n>` block, which would ship every language in the component
   chunk.

3. **Always support 8 languages**: en, de, fr, es, jp, kr, zh, ru.

4. **Usage in templates**: `{{ t('key') }}` or `{{ t('nested.key') }}`.

5. **Pluralization**: Use `{n}` interpolation: `t('rewardsReady', { n: count })`.

6. **Setup**:
   ```ts
   import { createI18n } from 'vue-i18n'
   const i18n = createI18n({
     locale: 'en',
     fallbackLocale: 'en',
     messages: translations,
     missingWarn: false,
     fallbackWarn: false
   })
   ```

7. **Locale detection**: Check CrazyGames SDK locale → sessionStorage → navigator.language → 'en'.

```

### Skill: `singleton-composable.md`

```markdown
---
name: singleton-composable
description: Create Vue 3 singleton composables for shared state without Pinia/Vuex
---

Pattern for creating singleton composables (shared state without a store library):

```ts
// src/use/useFeature.ts
import { ref, computed } from 'vue'
import type { Ref } from 'vue'

// ─── Persistence ─────────────────────────────────────────────────
const STORAGE_KEY = 'game_feature_state'

interface FeatureState { /* ... */ }

const loadState = (): FeatureState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { /* parse and validate */ }
  } catch { /* fall through */ }
  return defaultState()
}

// Module-level refs = singleton (shared across all component instances)
const state: Ref<FeatureState> = ref(loadState())

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
}

// ─── Derived ─────────────────────────────────────────────────────
const derivedValue = computed(() => /* ... */)

// ─── Actions ─────────────────────────────────────────────────────
const doSomething = () => {
  state.value = { ...state.value, /* changes */ }
  saveState()
}

// ─── Public API ──────────────────────────────────────────────────
export default function useFeature() {
  return { state, derivedValue, doSomething }
}
```

Key rules:

1. `ref()` and `computed()` at module level (outside the function) = singleton.
2. Always validate localStorage data with type guards.
3. Save after every mutation.
4. Export named composable function that returns the shared refs.
5. Never use reactive() for the root state — use ref() so `.value` assignment replaces atomically.

```

### Skill: `browser-optimization.md`

```markdown
---
name: browser-optimization
description: Optimize canvas game rendering and physics for cross-browser performance, especially Firefox
---

When optimizing canvas-based game rendering:

### shadowBlur — Avoid on Firefox
Firefox software-renders canvas shadows with Gaussian blur. Every `stroke()`/`fill()` with `shadowBlur > 0`
costs 2-5x more than the same call without shadows.

- **Detection**: `const isFirefox = /firefox/i.test(navigator.userAgent)`
- **Guard all shadowBlur**: `if (!isFirefox) { ctx.shadowColor = ...; ctx.shadowBlur = ... }`
- **Alternative**: Use wider translucent strokes for glow effects, or pre-rendered gradient halos.
- **Lightning/glow VFX**: If you already render a separate "glow pass" (wider translucent stroke),
  canvas shadowBlur is redundant — remove it for ALL browsers.

### Particle/VFX Array Management
Every array that grows per-frame MUST have a hard cap:
```ts
if (particles.length >= MAX_PARTICLES) return
particles.push(newParticle)
```

Use in-place compaction instead of `.splice(i, 1)` in reverse loops:

```ts
let w = 0
for (let i = 0; i < arr.length; i++) {
  update(arr[i])
  if (arr[i].alive) arr[w++] = arr[i]
}
arr.length = w
```

Use batch `splice(0, count)` instead of repeated `.shift()` for queue pruning.

### Draw Call Batching

Each `ctx.stroke()` / `ctx.fill()` is a GPU draw call. Trail rendering with per-segment
stroke calls (unique color per point) creates hundreds of draw calls per frame.

Batch ~4 consecutive segments per `stroke()` using the midpoint's color/alpha:

```ts
const BATCH = 4
for (let i = 1; i < pts.length; i += BATCH) {
  // compute style from midpoint
  ctx.beginPath()
  ctx.moveTo(pts[i-1].x, pts[i-1].y)
  for (let j = i; j < Math.min(i + BATCH, pts.length); j++) {
    ctx.lineTo(pts[j].x, pts[j].y)
  }
  ctx.stroke()
}
```

### Per-Frame Allocation Reduction

- **Gradients**: `createRadialGradient()` allocates every call. Cache when parameters don't change.
- **Font strings**: Pre-compute `bold ${size}px Arial` at spawn time, not per-frame render.
- **`performance.now()`**: Call once per frame, pass as parameter — not per-particle/per-blade.
- **`statsFor()` caching**: Functions called per-blade in O(n²) collision loops should be cached
  per physics tick via a Map cleared at the top of `updatePhysics()`.

### Firefox Audio Quirks

- `audio.volume` must be in `[0, 1]` — Firefox throws `DOMException` on `NaN` or out-of-range.
  Always clamp: `Math.max(0, Math.min(1, (volume ?? fallback) * ratio))`
- Wrap `playSound` calls in physics/collision hot paths with `try/catch` — sound is best-effort.
- `cloneNode()` on audio elements can throw if the source hasn't loaded yet.

### Firefox VFX Reduction

For expensive recursive VFX (lightning bolts, branching particles), reduce count and complexity
on Firefox to ~1/5 of normal output:

```ts
const boltCount = isFirefox ? 1 : 5
const segments = isFirefox ? 4 : 8
const maxDepth = isFirefox ? 1 : 3
const branchChance = isFirefox ? 0.2 : 0.55
```

### Physics Loop Safety

Wrap the physics loop body in `try/catch` so a single-frame error doesn't permanently kill
the `requestAnimationFrame` chain:

```ts
const loop = (now) => {
  try { updatePhysics() }
  catch (e) { console.error('[physics loop]', e) }
  if (running) requestAnimationFrame(loop)
}
```

```

---

*This document is a living reference. Each section can be used as a standalone prompt for Claude Code to recreate the feature in a new project.*
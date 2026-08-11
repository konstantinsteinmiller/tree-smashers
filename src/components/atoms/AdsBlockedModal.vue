<script setup lang="ts">
// ─── AdsBlockedModal ────────────────────────────────────────────────────
//
// Shown when the player tapped a "watch ad" button and:
//   1. The active ad provider returned `false` (no reward granted), AND
//   2. That provider has detected an ad-blocker is interfering with its
//      ad-fetch chain.
//
// Same component services every ad backend the game ships with
// (CrazyGames, GameDistribution, LevelPlay-on-native, Noop) — each
// provider populates its own `isAdsBlocked` ref via SDK-specific
// detection (CG's `sdk.ad.hasAdblock()`, GD's SDK_ERROR `Blocked:`
// pattern, etc.) and `useAds.showRewardedAd()` is the single seam that
// flips the modal-visible flag. Mounted unconditionally in App.vue;
// visibility is purely reactive on the flag.
//
// Wording is kid-safe because chaos-arena targets ages 6+. No mention
// of "ad blocker brand X", no urging to disable site-wide — just a
// gentle "we couldn't show your ad, please allow ads here to earn the
// reward". Adult-audience games can swap copy via a simple text edit.

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dismissAdsBlockedModal, isAdsBlockedModalShown } from '@/use/useAds'

const { t } = useI18n()

// Hostname surfaced to the player so they know which site to allowlist.
// Falls back gracefully when running in a non-browser context (SSR,
// Node tests, Workers) where `window.location` is not a string.
const host = computed(() => {
  try {
    return window.location.host || 'this game'
  } catch {
    return 'this game'
  }
})
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(
      name="ads-blocked-modal"
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    )
      div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4(
        v-if="isAdsBlockedModalShown"
        @click="dismissAdsBlockedModal"
      )
        //- Backdrop
        div.absolute.inset-0(class="bg-black/70 backdrop-blur-sm")

        //- Card
        div.relative.w-full.max-w-md.rounded-2xl.text-white.shadow-2xl.text-center(
          class="bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-slate-500 p-6"
          @click.stop
        )
          div.mb-2.text-5xl 🛡️
          h2.text-2xl.font-bold.mb-2 {{ t('adsBlocked.title') }}
          p.text-base.mb-4(class="text-slate-200") {{ t('adsBlocked.body') }}
          //- The hostname is interpolated INSIDE the i18n message rather than
          //- concatenated around it — word order around "allow ads on <host>"
          //- differs per language (in ja/ko/zh the host comes first).
          p.text-sm.mb-5(class="text-slate-300")
            i18n-t(keypath="adsBlocked.allowHost" tag="span" scope="local")
              template(#host)
                span.font-mono.font-bold(class="text-amber-300") {{ host }}

          button.w-full.rounded-lg.font-bold.text-lg.text-white.shadow-lg(
            class="bg-amber-500 hover:bg-amber-400 active:translate-y-px py-3"
            @click="dismissAdsBlockedModal"
          ) {{ t('adsBlocked.gotIt') }}
</template>

<i18n lang="yaml">
en:
  adsBlocked:
    title: "Couldn't show ad"
    body: "We tried to show you a video so you could earn your reward, but something on your browser is blocking ads."
    allowHost: "Please allow ads on {host} (or pause your ad-blocker for this game) and try again."
    gotIt: "Got it"
de:
  adsBlocked:
    title: "Werbung konnte nicht geladen werden"
    body: "Wir wollten dir ein Video zeigen, damit du deine Belohnung bekommst, aber etwas in deinem Browser blockiert Werbung."
    allowHost: "Bitte erlaube Werbung auf {host} (oder pausiere deinen Adblocker für dieses Spiel) und versuche es erneut."
    gotIt: "Alles klar"
fr:
  adsBlocked:
    title: "Impossible d'afficher la pub"
    body: "Nous voulions te montrer une vidéo pour que tu obtiennes ta récompense, mais quelque chose dans ton navigateur bloque les publicités."
    allowHost: "Autorise les publicités sur {host} (ou mets ton bloqueur de pub en pause pour ce jeu) puis réessaie."
    gotIt: "Compris"
es:
  adsBlocked:
    title: "No se pudo mostrar el anuncio"
    body: "Queríamos mostrarte un vídeo para que consiguieras tu recompensa, pero algo en tu navegador está bloqueando los anuncios."
    allowHost: "Permite los anuncios en {host} (o pausa tu bloqueador para este juego) e inténtalo de nuevo."
    gotIt: "Entendido"
jp:
  adsBlocked:
    title: "広告を表示できませんでした"
    body: "報酬を受け取れるように動画を表示しようとしましたが、ブラウザの何かが広告をブロックしています。"
    allowHost: "{host} で広告を許可する（またはこのゲームだけ広告ブロックを一時停止する）と、もう一度お試しください。"
    gotIt: "OK"
kr:
  adsBlocked:
    title: "광고를 표시하지 못했습니다"
    body: "보상을 받을 수 있도록 동영상을 보여드리려 했지만, 브라우저의 무언가가 광고를 차단하고 있습니다."
    allowHost: "{host} 에서 광고를 허용하거나 이 게임에 대해 광고 차단을 일시 중지한 뒤 다시 시도해 주세요."
    gotIt: "확인"
zh:
  adsBlocked:
    title: "无法显示广告"
    body: "我们想向你展示一段视频，好让你获得奖励，但你浏览器中的某些设置屏蔽了广告。"
    allowHost: "请在 {host} 上允许广告（或为本游戏暂停广告拦截器），然后重试。"
    gotIt: "知道了"
ru:
  adsBlocked:
    title: "Не удалось показать рекламу"
    body: "Мы хотели показать вам видео, чтобы вы получили награду, но что-то в вашем браузере блокирует рекламу."
    allowHost: "Разрешите рекламу на {host} (или приостановите блокировщик для этой игры) и попробуйте снова."
    gotIt: "Понятно"
</i18n>

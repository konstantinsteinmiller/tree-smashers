<script setup lang="ts">
// ─── RewardedAdIntroModal ───────────────────────────────────────────────────
//
// The intro screen every rewarded ad on the native build must pass through.
// See `useRewardedIntro.ts` for why it exists (AdMob rewarded-interstitial
// contract + Google Play Families "unclear ads/offers"). Mounted once in
// App.vue; visibility is purely reactive on `isRewardedIntroOpen`.
//
// Three things this markup has to get right, all of them policy rather than
// taste:
//
//   1. The word "Advertisement" is the heading. The Families policy rejects
//      ads that "aren't clearly distinguishable from your app's content", so
//      the label leads — it is not a footnote under the reward.
//   2. The decline button is a real, full-width, equally-tappable button.
//      "Sufficient time to opt out" and "must not be hidden, obstructed, or
//      non-functional" are the policy's words. Backdrop tap and Escape also
//      decline, so there is no way to get stuck here.
//   3. The body promises the ad is closeable. Rewarded interstitial units
//      serve skippable creatives only, so this is a claim we can actually
//      keep.
//
// Kid-safe wording throughout: chaos-arena declares a child-directed
// audience (ages 6+), so no urgency language, no dark patterns, no
// "LAST CHANCE" framing.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  acceptRewardedIntro,
  declineRewardedIntro,
  isRewardedIntroOpen,
  rewardedIntroReward
} from '@/use/useRewardedIntro'

const { t } = useI18n()

// The reward text is built by i18n, not by string concatenation: each kind
// has its own message with `{count}` inside it, so plural forms and word
// order stay in the translation files. Falls back to generic copy when the
// placement did not name a reward.
const rewardText = computed(() => {
  const reward = rewardedIntroReward.value
  if (!reward) return ''
  const count = reward.amount ?? 0
  switch (reward.kind) {
    case 'coins':
      return t('rewardedIntro.rewardCoins', { count })
    case 'diamonds':
      return t('rewardedIntro.rewardDiamonds', { count })
    case 'speed':
      return t('rewardedIntro.rewardSpeed')
    case 'respin':
      return t('rewardedIntro.rewardRespin')
    default:
      return ''
  }
})
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(
      name="rewarded-intro-modal"
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    )
      div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4(
        v-if="isRewardedIntroOpen"
        role="dialog"
        aria-modal="true"
        :aria-label="t('rewardedIntro.title')"
        tabindex="-1"
        @click="declineRewardedIntro"
        @keydown.esc="declineRewardedIntro"
      )
        //- Backdrop
        div.absolute.inset-0(class="bg-black/70 backdrop-blur-sm")

        //- Card
        div.relative.w-full.max-w-md.rounded-2xl.text-white.shadow-2xl.text-center(
          class="bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-slate-500 p-6"
          @click.stop
        )
          //- Ad disclosure badge — leads the card so the player knows what is
          //- about to happen BEFORE the reward is dangled.
          div.inline-block.rounded.font-bold.tracking-widest.uppercase.mb-3(
            class="bg-slate-900/80 border border-slate-400 text-slate-200 text-[11px] px-2 py-0.5"
          ) {{ t('rewardedIntro.badge') }}

          div.mb-2.text-5xl 🎬
          h2.text-2xl.font-bold.mb-2 {{ t('rewardedIntro.title') }}

          //- Reward is interpolated INSIDE the i18n message, never concatenated
          //- around it — word order differs per language.
          p.text-base.mb-2(v-if="rewardText" class="text-slate-200")
            i18n-t(keypath="rewardedIntro.bodyReward" tag="span" scope="parent")
              template(#reward)
                span.font-bold(class="text-amber-300") {{ rewardText }}
          p.text-base.mb-2(v-else class="text-slate-200") {{ t('rewardedIntro.body') }}

          p.text-sm.mb-5(class="text-slate-300") {{ t('rewardedIntro.closeable') }}

          button.w-full.rounded-lg.font-bold.text-lg.text-white.shadow-lg.mb-2(
            class="bg-amber-500 hover:bg-amber-400 active:translate-y-px py-3"
            @click="acceptRewardedIntro"
          ) {{ t('rewardedIntro.watch') }}

          //- Equal-weight decline. Same width, same hit area, no colour trick
          //- to make it look disabled.
          button.w-full.rounded-lg.font-bold.text-base.shadow(
            class="bg-slate-600 hover:bg-slate-500 active:translate-y-px py-3 text-slate-100"
            @click="declineRewardedIntro"
          ) {{ t('rewardedIntro.decline') }}
</template>

<i18n lang="yaml">
en:
  rewardedIntro:
    badge: "Advertisement"
    title: "Watch a video ad?"
    body: "Watch a short video ad to earn your reward."
    bodyReward: "Watch a short video ad to earn {reward}."
    closeable: "You can close the ad after a few seconds. Closing it early means no reward."
    rewardCoins: "{count} coins"
    rewardDiamonds: "{count} diamonds"
    rewardSpeed: "2x battle speed"
    rewardRespin: "another spin"
    watch: "Watch ad"
    decline: "No thanks"
de:
  rewardedIntro:
    badge: "Werbung"
    title: "Ein Werbevideo ansehen?"
    body: "Sieh dir ein kurzes Werbevideo an, um deine Belohnung zu erhalten."
    bodyReward: "Sieh dir ein kurzes Werbevideo an und erhalte {reward}."
    closeable: "Du kannst die Werbung nach ein paar Sekunden schließen. Wenn du sie früher schließt, gibt es keine Belohnung."
    rewardCoins: "{count} Münzen"
    rewardDiamonds: "{count} Diamanten"
    rewardSpeed: "2x Kampftempo"
    rewardRespin: "einen weiteren Dreh"
    watch: "Werbung ansehen"
    decline: "Nein, danke"
fr:
  rewardedIntro:
    badge: "Publicité"
    title: "Regarder une pub vidéo ?"
    body: "Regarde une courte pub vidéo pour obtenir ta récompense."
    bodyReward: "Regarde une courte pub vidéo pour obtenir {reward}."
    closeable: "Tu peux fermer la pub après quelques secondes. Si tu la fermes trop tôt, pas de récompense."
    rewardCoins: "{count} pièces"
    rewardDiamonds: "{count} diamants"
    rewardSpeed: "vitesse de combat x2"
    rewardRespin: "un tour de plus"
    watch: "Regarder la pub"
    decline: "Non merci"
es:
  rewardedIntro:
    badge: "Publicidad"
    title: "¿Ver un anuncio en vídeo?"
    body: "Mira un breve anuncio en vídeo para conseguir tu recompensa."
    bodyReward: "Mira un breve anuncio en vídeo para conseguir {reward}."
    closeable: "Puedes cerrar el anuncio después de unos segundos. Si lo cierras antes, no hay recompensa."
    rewardCoins: "{count} monedas"
    rewardDiamonds: "{count} diamantes"
    rewardSpeed: "velocidad de combate x2"
    rewardRespin: "otro giro"
    watch: "Ver anuncio"
    decline: "No, gracias"
jp:
  rewardedIntro:
    badge: "広告"
    title: "動画広告を見ますか？"
    body: "短い動画広告を見ると報酬がもらえます。"
    bodyReward: "短い動画広告を見ると {reward} がもらえます。"
    closeable: "広告は数秒後に閉じられます。早く閉じると報酬はもらえません。"
    rewardCoins: "コイン {count} 枚"
    rewardDiamonds: "ダイヤ {count} 個"
    rewardSpeed: "バトル速度2倍"
    rewardRespin: "もう1回スピン"
    watch: "広告を見る"
    decline: "見ない"
kr:
  rewardedIntro:
    badge: "광고"
    title: "동영상 광고를 볼까요?"
    body: "짧은 동영상 광고를 보면 보상을 받을 수 있어요."
    bodyReward: "짧은 동영상 광고를 보면 {reward} 을(를) 받을 수 있어요."
    closeable: "광고는 몇 초 뒤에 닫을 수 있어요. 먼저 닫으면 보상은 없어요."
    rewardCoins: "코인 {count}개"
    rewardDiamonds: "다이아 {count}개"
    rewardSpeed: "전투 속도 2배"
    rewardRespin: "한 번 더 돌리기"
    watch: "광고 보기"
    decline: "괜찮아요"
zh:
  rewardedIntro:
    badge: "广告"
    title: "观看视频广告？"
    body: "观看一段简短的视频广告即可获得奖励。"
    bodyReward: "观看一段简短的视频广告即可获得 {reward}。"
    closeable: "几秒后就可以关闭广告。提前关闭将无法获得奖励。"
    rewardCoins: "{count} 金币"
    rewardDiamonds: "{count} 钻石"
    rewardSpeed: "2 倍战斗速度"
    rewardRespin: "再转一次"
    watch: "观看广告"
    decline: "不用了"
ru:
  rewardedIntro:
    badge: "Реклама"
    title: "Посмотреть видеорекламу?"
    body: "Посмотри короткую видеорекламу, чтобы получить награду."
    bodyReward: "Посмотри короткую видеорекламу и получи {reward}."
    closeable: "Рекламу можно закрыть через несколько секунд. Если закрыть раньше, награды не будет."
    rewardCoins: "{count} монет"
    rewardDiamonds: "{count} алмазов"
    rewardSpeed: "двойная скорость боя"
    rewardRespin: "ещё один спин"
    watch: "Смотреть рекламу"
    decline: "Нет, спасибо"
</i18n>

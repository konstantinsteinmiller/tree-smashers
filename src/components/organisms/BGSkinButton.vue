<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BGSkinModal from '@/components/organisms/BGSkinModal.vue'
import useBgSkins from '@/use/useBgSkins'
import { prependBaseUrl } from '@/utils/function'

// Compact "change background" button — a small framed thumbnail of the
// currently-equipped bg skin. Opens the (encapsulated) BGSkinModal.

const { t } = useI18n()
const { selectedBgSkin } = useBgSkins()
const open = ref(false)

const swatchStyle = computed(() => {
  const skin = selectedBgSkin.value
  return skin.img
    ? { backgroundImage: `url(${prependBaseUrl(skin.img)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: `linear-gradient(135deg, ${skin.colors[0]}, ${skin.colors[1]}, ${skin.colors[2]})` }
})
</script>

<template lang="pug">
  button.bg-skin-button.relative.flex.items-center.justify-center.rounded-md.border-2.cursor-pointer.transition-transform(
    class="border-cyan-300/80 hover:scale-110 active:scale-95"
    :title="t('bgButton.title')"
    :aria-label="t('bgButton.title')"
    @click="open = true"
  )
    //- Current bg preview swatch
    div.bg-skin-button__swatch.rounded(:style="swatchStyle")
    //- Tiny "picture" glyph so the button reads as 'change background'
    svg.bg-skin-button__glyph(viewBox="0 0 24 24" aria-hidden="true")
      path(fill="currentColor" d="M21 5H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zm-1 11l-4.5-6-3.5 4.5-2.5-3L5 16V7h15z")
      circle(cx="8" cy="9" r="1.4" fill="currentColor")

  BGSkinModal(v-model="open")
</template>

<style scoped lang="sass">
.bg-skin-button
  width: 2.1rem
  height: 1.6rem
  padding: 2px
  background: #0f1a30
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5)

.bg-skin-button__swatch
  position: absolute
  inset: 2px
  border-radius: 3px

.bg-skin-button__glyph
  position: relative
  width: 0.85rem
  height: 0.85rem
  color: rgba(255, 255, 255, 0.92)
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.9))
</style>

<i18n lang="yaml">
en:
  bgButton:
    title: "Change background"
de:
  bgButton:
    title: "Hintergrund ändern"
fr:
  bgButton:
    title: "Changer l'arrière-plan"
es:
  bgButton:
    title: "Cambiar fondo"
jp:
  bgButton:
    title: "背景を変更"
kr:
  bgButton:
    title: "배경 변경"
zh:
  bgButton:
    title: "更换背景"
ru:
  bgButton:
    title: "Сменить фон"
</i18n>

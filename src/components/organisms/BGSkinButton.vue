<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import BGSkinModal from '@/components/organisms/BGSkinModal.vue'
import useBgSkins from '@/use/useBgSkins'
import { prependBaseUrl } from '@/utils/function'

// Compact "change background" button — a small framed thumbnail of the
// currently-equipped bg skin. Opens the (encapsulated) BGSkinModal.

const { t } = useSfcI18n('BGSkinButton')
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
  //- The <button> is a transparent PADDING RING; the visible frame is the
  //- inner span. That split matters: this button sits in the config modal's
  //- "TOP BLADE" header, directly above the floating "+" skin bubbles of the
  //- third card. Growing the visible frame to a 44px tap target made the two
  //- collide. Padding the button and cancelling it with an equal negative
  //- margin gives the same 44px hit area while the frame — and therefore the
  //- header row's height — stays exactly where it was.
  button.bg-skin-button.relative.flex.items-center.justify-center.cursor-pointer.transition-transform(
    class="hover:scale-110 active:scale-95"
    :title="t('bgButton.title')"
    :aria-label="t('bgButton.title')"
    @click="open = true"
  )
    span.bg-skin-button__frame.relative.flex.items-center.justify-center.rounded-md.border-2(
      class="border-cyan-300/80"
    )
      //- Current bg preview swatch
      span.bg-skin-button__swatch.rounded(:style="swatchStyle")
      //- Tiny "picture" glyph so the button reads as 'change background'
      svg.bg-skin-button__glyph(viewBox="0 0 24 24" aria-hidden="true")
        path(fill="currentColor" d="M21 5H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zm-1 11l-4.5-6-3.5 4.5-2.5-3L5 16V7h15z")
        circle(cx="8" cy="9" r="1.4" fill="currentColor")

  BGSkinModal(v-model="open")
</template>

<style scoped lang="sass">
// The button is the hit area only — padding it out to >=44px and cancelling
// that padding with an equal negative margin keeps the header row's layout
// identical to before. `overflow: visible` is implicit; nothing here paints.
.bg-skin-button
  padding: 0.5rem
  margin: -0.5rem
  background: none
  border: none

// The visible frame. Slightly larger than the pre-2026-08 2.1 x 1.6rem so it
// reads clearly, but small enough to clear the skin-plus bubbles below it.
.bg-skin-button__frame
  width: 2.35rem
  height: 1.8rem
  padding: 2px
  background: #0f1a30
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5)

.bg-skin-button__swatch
  position: absolute
  inset: 2px
  border-radius: 3px

.bg-skin-button__glyph
  position: relative
  width: 1.05rem
  height: 1.05rem
  color: rgba(255, 255, 255, 0.92)
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.9))
</style>

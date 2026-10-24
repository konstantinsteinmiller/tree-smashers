<template lang="pug">
  //- Fight glyph — two chunky white toy bats crossed in an X under a sun impact
  //- star. Very bold (reads at 14–20 px on the green CTA). Fallback for the
  //- painted sprite, see UiIcon.vue; decorative.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round")
      //- Bats: thin handle end bottom, fat rounded barrel top.
      path(d="M3.6 26.2L6 28.6L18.6 17.4C21.4 19 25.6 15.8 28 12.6C29.8 10.2 29.4 8.6 28.4 7.6C27.4 6.6 25.8 6.2 23.4 8C20.2 10.4 17 14.6 18.6 17.4" fill="var(--color-ice-50)")
      path(d="M28.4 26.2L26 28.6L13.4 17.4C10.6 19 6.4 15.8 4 12.6C2.2 10.2 2.6 8.6 3.6 7.6C4.6 6.6 6.2 6.2 8.6 8C11.8 10.4 15 14.6 13.4 17.4" fill="var(--color-ice-50)")
      //- Impact star on the crossing.
      polygon(
        points="16,7.4 18.6,12.8 24.4,13.6 20.2,17.6 21.2,23.4 16,20.6 10.8,23.4 11.8,17.6 7.6,13.6 13.4,12.8"
        fill="var(--color-sun-400)"
      )
</template>

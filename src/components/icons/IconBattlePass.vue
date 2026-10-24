<template lang="pug">
  //- Battle pass — a chunky sun ticket tilted ~12°, its thickness showing as a
  //- darker edge toward the lower-right (light from the top-left), round
  //- notches on the short sides, a solid tear rule before the stub (a printed
  //- line, not a stitch), a white star with a berry centre. Fallback for the
  //- painted sprite, see UiIcon.vue; decorative (the button carries the
  //- translated aria-label).
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(transform="rotate(-12 16 16)")
      g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
        path(
          transform="translate(0.9 1.6)"
          d="M4.6 8.6H27.4A1.8 1.8 0 0 1 29.2 10.4V13.4A2.6 2.6 0 0 0 29.2 18.6V21.6A1.8 1.8 0 0 1 27.4 23.4H4.6A1.8 1.8 0 0 1 2.8 21.6V18.6A2.6 2.6 0 0 0 2.8 13.4V10.4A1.8 1.8 0 0 1 4.6 8.6Z"
          fill="var(--color-sun-600)"
        )
        path(
          d="M4.6 8.6H27.4A1.8 1.8 0 0 1 29.2 10.4V13.4A2.6 2.6 0 0 0 29.2 18.6V21.6A1.8 1.8 0 0 1 27.4 23.4H4.6A1.8 1.8 0 0 1 2.8 21.6V18.6A2.6 2.6 0 0 0 2.8 13.4V10.4A1.8 1.8 0 0 1 4.6 8.6Z"
          fill="var(--color-sun-400)"
        )
      //- Stub shade + tear rule.
      path(d="M22.6 9.6H27.4A0.8 0.8 0 0 1 28.2 10.4V12.8A3.6 3.6 0 0 0 28.2 19.2V21.6A0.8 0.8 0 0 1 27.4 22.4H22.6Z" fill="var(--color-sun-500)")
      path(d="M22.6 9.4V22.6" stroke="var(--color-ink)" stroke-width="1.4")
      //- Star with a berry centre.
      polygon(
        points="12.6,9.8 14.3,13.3 18.1,13.8 15.3,16.4 16,20.2 12.6,18.4 9.2,20.2 9.9,16.4 7.1,13.8 10.9,13.3"
        fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="1.4" stroke-linejoin="round"
      )
      circle(cx="12.6" cy="15.8" r="1.3" fill="var(--color-berry-500)")
</template>

<template lang="pug">
  //- PvP clash — two toy spinning discs (blue vs red) tilted into each other
  //- with a sun spark burst where the rims meet. Front 3/4, light top-left.
  //- Fallback for the painted sprite, see UiIcon.vue; decorative.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="1.8" stroke-linejoin="round")
      //- Blue disc (left): royal rim under a sky top face.
      ellipse(cx="9.6" cy="18.4" rx="8.2" ry="5.6" fill="var(--color-royal-600)" transform="rotate(-24 9.6 18.4)")
      ellipse(cx="9" cy="16.6" rx="8.2" ry="5.6" fill="var(--color-sky-400)" transform="rotate(-24 9 16.6)")
      //- Red disc (right).
      ellipse(cx="22.4" cy="18.4" rx="8.2" ry="5.6" fill="var(--color-berry-600)" transform="rotate(24 22.4 18.4)")
      ellipse(cx="23" cy="16.6" rx="8.2" ry="5.6" fill="var(--color-berry-400)" transform="rotate(24 23 16.6)")
      //- Spark burst (eight blunt rays) in front of the clash.
      polygon(
        points="16,5.4 17.7,10.4 22.2,8.6 20.4,13.2 25.4,15 20.4,16.8 22.2,21.4 17.7,19.6 16,24.6 14.3,19.6 9.8,21.4 11.6,16.8 6.6,15 11.6,13.2 9.8,8.6 14.3,10.4"
        fill="var(--color-sun-400)"
      )
    circle(cx="16" cy="15" r="2.6" fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="1.2")
</template>

<template lang="pug">
  //- Smasher upgrade — a smasher's spinning disc (3/4 view, sky top face,
  //- royal rim) with a white paw on it and a chunky leaf up-arrow rising out
  //- of it: "level your smashers up". Light from the top-left: the darker
  //- tone sits on the lower-right faces. Fallback for the painted sprite, see
  //- UiIcon.vue; decorative (the button carries the aria-label).
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      //- Disc: rim (thickness) then the top face.
      path(d="M2 19.5V23.2C2 27 7.6 30 14.5 30S27 27 27 23.2V19.5Z" fill="var(--color-royal-600)")
      ellipse(cx="14.5" cy="19.5" rx="12.5" ry="6.6" fill="var(--color-sky-400)")
    //- Lower-right shade on the top face (flat second tone, no outline).
    path(d="M24.6 16.2C26.5 18.7 25 22.6 18.8 24.9C22.5 22.9 24.2 19.6 24.6 16.2Z" fill="var(--color-sky-600)")
    //- Paw: one pad + four toe beans, foreshortened onto the disc face.
    g(fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="1.1")
      path(d="M10.2 22C10.2 19.8 12 18.4 13.8 18.4S17.4 19.8 17.4 22C17.4 23.6 15.8 23.4 13.8 23.4S10.2 23.6 10.2 22Z")
      ellipse(cx="8.2" cy="18.4" rx="1.6" ry="1.2")
      ellipse(cx="10.9" cy="16.2" rx="1.6" ry="1.2")
      ellipse(cx="14.6" cy="15.6" rx="1.6" ry="1.2")
      ellipse(cx="17.9" cy="16.9" rx="1.5" ry="1.15")
    //- Up-arrow: a darker extrusion (lower-right) under the leaf face.
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      path(d="M24.6 2.2L31 9.8L27.9 9.8L27.9 17.2L22.1 17.2L22.1 9.8L19 9.8L24.6 2.2Z" fill="var(--color-leaf-700)" transform="translate(0.9 1.3)")
      path(d="M24.6 2.2L31 9.8L27.9 9.8L27.9 17.2L22.1 17.2L22.1 9.8L19 9.8L24.6 2.2Z" fill="var(--color-leaf-400)")
    path(d="M24.6 4.6L20.9 9L23.2 9" fill="none" stroke="var(--color-leaf-300)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round")
</template>

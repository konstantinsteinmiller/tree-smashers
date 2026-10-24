<template lang="pug">
  //- League emblem — a heater shield (the LeagueTierIcon silhouette family):
  //- sky rim, royal face, sun star, white wings, a little sun crown. Painted
  //- toy look, not metal. The player's TIER stays on the HUD button as its
  //- accent lip + division tag (LeagueHudButton). Fallback for the painted
  //- sprite, see UiIcon.vue; decorative.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="1.8" stroke-linejoin="round" fill="var(--color-ice-50)")
      //- Wings (three rounded feathers each), behind the shield.
      path(d="M8 10.2C4.6 9 1.6 9.8 0.9 12.2C2.3 12.2 2.8 12.6 2 14C3.5 14 4 14.6 3.2 16.2C4.8 16.4 5.6 17 5.4 18.6C6.6 18 7.4 17.4 8 16.6Z")
      path(d="M24 10.2C27.4 9 30.4 9.8 31.1 12.2C29.7 12.2 29.2 12.6 30 14C28.5 14 28 14.6 28.8 16.2C27.2 16.4 26.4 17 26.6 18.6C25.4 18 24.6 17.4 24 16.6Z")
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      //- Shield: sky rim, royal face.
      path(d="M16 4.4L25.6 7.2V15.4C25.6 21.6 21.4 26 16 29.6C10.6 26 6.4 21.6 6.4 15.4V7.2Z" fill="var(--color-sky-400)")
      path(d="M16 7.6L22.6 9.5V15.4C22.6 19.8 19.8 23.2 16 25.8C12.2 23.2 9.4 19.8 9.4 15.4V9.5Z" fill="var(--color-royal-500)")
    //- Lower-right shade on the face.
    path(d="M16 7.6L22.6 9.5V15.4C22.6 19.8 19.8 23.2 16 25.8Z" fill="var(--color-royal-700)")
    //- Star
    polygon(
      points="16,10.6 17.75,14.2 21.6,14.7 18.8,17.4 19.5,21.3 16,19.4 12.5,21.3 13.2,17.4 10.4,14.7 14.25,14.2"
      fill="var(--color-sun-400)" stroke="var(--color-ink)" stroke-width="1.4" stroke-linejoin="round"
    )
    //- Crown on the shield's top point.
    path(
      d="M11.6 5.6L11.9 1.2L14 3.2L16 0.6L18 3.2L20.1 1.2L20.4 5.6Z"
      fill="var(--color-sun-400)" stroke="var(--color-ink)" stroke-width="1.6" stroke-linejoin="round"
    )
</template>

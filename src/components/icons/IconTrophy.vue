<template lang="pug">
  //- Leaderboard trophy — a round-bellied toy cup in flat sun plastic (not
  //- metal), white star, royal block base. 3/4 view, light from the top-left.
  //- Fallback for the painted sprite, see UiIcon.vue; decorative.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    //- Handles: an ink tube with a sun core.
    g(fill="none" stroke-linecap="round")
      path(d="M8.4 7.6C3.2 7.2 2.6 14.4 9.4 15" stroke="var(--color-ink)" stroke-width="4.6")
      path(d="M23.6 7.6C28.8 7.2 29.4 14.4 22.6 15" stroke="var(--color-ink)" stroke-width="4.6")
      path(d="M8.4 7.6C3.2 7.2 2.6 14.4 9.4 15" stroke="var(--color-sun-400)" stroke-width="2")
      path(d="M23.6 7.6C28.8 7.2 29.4 14.4 22.6 15" stroke="var(--color-sun-500)" stroke-width="2")
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      //- Base block: front face + lighter top face.
      path(d="M7.5 24H24.5V29.4H7.5Z" fill="var(--color-royal-600)")
      path(d="M9 21.6H23L24.5 24H7.5Z" fill="var(--color-royal-400)")
      //- Stem
      path(d="M13.8 17.8H18.2L19 21.6H13Z" fill="var(--color-sun-500)")
      //- Cup
      path(d="M7.2 4.2H24.8V8.6C24.8 14.6 21 18.6 16 18.6S7.2 14.6 7.2 8.6Z" fill="var(--color-sun-400)")
    //- Lower-right shade + the dark mouth of the cup.
    path(d="M20.6 5.2H23.8V8.6C23.8 13.8 20.6 17.2 16.6 17.6C19.4 15.8 20.6 12.4 20.6 8.6Z" fill="var(--color-sun-500)")
    path(d="M8.2 4.2C8.2 2.9 12 2.2 16 2.2S23.8 2.9 23.8 4.2C23.8 5.5 20 6 16 6S8.2 5.5 8.2 4.2Z" fill="var(--color-sun-600)" stroke="var(--color-ink)" stroke-width="1.6")
    //- Star
    polygon(
      points="16,7.6 17.35,10.4 20.4,10.8 18.2,12.9 18.7,15.9 16,14.5 13.3,15.9 13.8,12.9 11.6,10.8 14.65,10.4"
      fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="1.2" stroke-linejoin="round"
    )
</template>

<template lang="pug">
  //- Speaker with two waves — the HUD mute button's speaker (FMuteButton),
  //- with outlined sky waves so it reads on the ice AND the royal tab.
  //- Fallback for the painted sprite, see UiIcon.vue.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true")
    path(d="M3 11.5h5.4L16 5v22l-7.6-6.5H3z" fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round")
    path(d="M3 11.5h5.4v9H3z" fill="var(--color-royal-400)" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round")
    g(fill="none" stroke-linecap="round")
      path(d="M20.5 11.6a6.2 6.2 0 0 1 0 8.8M24.6 7.6a11.8 11.8 0 0 1 0 16.8" stroke="var(--color-ink)" stroke-width="5")
      path(d="M20.5 11.6a6.2 6.2 0 0 1 0 8.8M24.6 7.6a11.8 11.8 0 0 1 0 16.8" stroke="var(--color-sky-300)" stroke-width="2")
</template>

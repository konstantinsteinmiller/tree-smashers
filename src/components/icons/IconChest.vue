<template lang="pug">
  //- Treasure chest — a bright toy chest in 3/4 view: honey-orange painted
  //- planks (sun-500 / -600, never brown), sky bands over the domed lid and
  //- down the front, a sun lock plate with an ink keyhole. Painted toy, not
  //- metal; no stitches. Light from the top-left. Fallback for the painted
  //- sprite, see UiIcon.vue; decorative.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      //- Right side: body + lid dome.
      path(d="M22.4 16.4L28.6 13.2V25.4L22.4 28.6Z" fill="var(--color-sun-600)")
      path(d="M22.4 11.6C22.4 8.4 20.8 6.8 18.6 5.8L24.2 3C26.8 3.8 28.6 5.8 28.6 8.6V13.2L22.4 16.4Z" fill="var(--color-sun-500)")
      //- Front: body + domed lid face.
      path(d="M3.4 16.4H22.4V28.6H3.4Z" fill="var(--color-sun-500)")
      path(d="M3.4 16.4V11.6C3.4 8 7.6 5.8 12.9 5.8S22.4 8 22.4 11.6V16.4Z" fill="var(--color-sun-400)")
    //- Plank seam (a painted groove).
    path(d="M3.4 22.4H22.4" stroke="var(--color-sun-600)" stroke-width="1.2")
    //- Sky bands over the lid and down the front, one on the side.
    g(fill="var(--color-sky-400)" stroke="var(--color-ink)" stroke-width="1.4" stroke-linejoin="round")
      path(d="M6.4 28.6V8.1C7.2 7.6 8 7.2 8.9 6.9V28.6Z")
      path(d="M16.9 28.6V6.9C17.8 7.2 18.6 7.6 19.4 8.1V28.6Z")
      path(d="M23.4 15.9L25.4 14.9V26.9L23.4 27.9Z")
    //- Lid / body seam over the bands.
    path(d="M3.4 16.4H22.4L28.6 13.2" fill="none" stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
    //- Lock plate + keyhole.
    circle(cx="12.9" cy="16.6" r="3.1" fill="var(--color-sun-300)" stroke="var(--color-ink)" stroke-width="1.6")
    path(d="M12.9 15.2V17.8" stroke="var(--color-ink)" stroke-width="1.6" stroke-linecap="round")
</template>

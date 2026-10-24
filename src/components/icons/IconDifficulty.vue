<template lang="pug">
  //- Difficulty gauge — leaf / sun / berry dial on an ice base, ink needle
  //- leaning into the hard end. Fallback for the painted sprite, see UiIcon.vue.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true")
    rect(x="2.5" y="20" width="27" height="5.5" rx="2" fill="var(--color-ice-200)" stroke="var(--color-ink)" stroke-width="2.2")
    g(stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round")
      path(d="M3 21A13 13 0 0 1 9.5 9.74L12.75 15.37A6.5 6.5 0 0 0 9.5 21Z" fill="var(--color-leaf-400)")
      path(d="M9.5 9.74A13 13 0 0 1 22.5 9.74L19.25 15.37A6.5 6.5 0 0 0 12.75 15.37Z" fill="var(--color-sun-400)")
      path(d="M22.5 9.74A13 13 0 0 1 29 21L22.5 21A6.5 6.5 0 0 0 19.25 15.37Z" fill="var(--color-berry-500)")
      path(d="M23.33 12.14L17.7 22.4L14.3 19.6Z" fill="var(--color-ink)")
    circle(cx="16" cy="21" r="2.6" fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="2.2")
</template>

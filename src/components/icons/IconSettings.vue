<template lang="pug">
  //- Settings cog — sky gear, ink outline, ice hub (DESIGN.md: bold outline,
  //- flat fills). Fallback for the painted sprite, see UiIcon.vue.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true")
    path(
      d="M12.87 5.87L13.22 2.28L18.78 2.28L19.13 5.87A10.6 10.6 0 0 1 20.95 6.62L23.74 4.33L27.67 8.26L25.38 11.05A10.6 10.6 0 0 1 26.13 12.87L29.72 13.22L29.72 18.78L26.13 19.13A10.6 10.6 0 0 1 25.38 20.95L27.67 23.74L23.74 27.67L20.95 25.38A10.6 10.6 0 0 1 19.13 26.13L18.78 29.72L13.22 29.72L12.87 26.13A10.6 10.6 0 0 1 11.05 25.38L8.26 27.67L4.33 23.74L6.62 20.95A10.6 10.6 0 0 1 5.87 19.13L2.28 18.78L2.28 13.22L5.87 12.87A10.6 10.6 0 0 1 6.62 11.05L4.33 8.26L8.26 4.33L11.05 6.62A10.6 10.6 0 0 1 12.87 5.87Z"
      fill="var(--color-sky-400)" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round"
    )
    //- Flat shade on the lower-right half of the rim.
    path(d="M24.5 11.5A9 9 0 0 1 11.5 24.5" fill="none" stroke="var(--color-sky-600)" stroke-width="2.6" stroke-linecap="round")
    circle(cx="16" cy="16" r="4.6" fill="var(--color-ice-50)" stroke="var(--color-ink)" stroke-width="2.2")
</template>

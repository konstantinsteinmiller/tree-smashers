<template lang="pug">
  //- Daily gift — a 3/4 berry gift box (lighter lid top, darker right side),
  //- sun ribbon both ways, sun bow with two looped holes. It sits on the LEAF
  //- daily button, so no green in it. Light from the top-left. Fallback for
  //- the painted sprite, see UiIcon.vue; decorative (the button carries the
  //- translated aria-label).
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false")
    g(stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round")
      //- Box: front + right side.
      path(d="M4.8 15H20.6V29.4H4.8Z" fill="var(--color-berry-500)")
      path(d="M20.6 15L27 12.4V26.8L20.6 29.4Z" fill="var(--color-berry-600)")
      //- Lid: top, front, right side (a touch wider than the box).
      path(d="M3.4 11.2L10 8.4H28.4L21.8 11.2Z" fill="var(--color-berry-300)")
      path(d="M3.4 11.2H21.8V15.8H3.4Z" fill="var(--color-berry-400)")
      path(d="M21.8 11.2L28.4 8.4V13L21.8 15.8Z" fill="var(--color-berry-600)")
    //- Ribbon: down the front, across the right side, both ways on the lid.
    g(stroke="var(--color-ink)" stroke-width="1.3" stroke-linejoin="round")
      path(d="M10.9 11.2H14.5V29.4H10.9Z" fill="var(--color-sun-400)")
      path(d="M21.8 13.1L28.4 10.3V11.9L21.8 14.7Z" fill="var(--color-sun-500)")
      path(d="M20.6 20.6L27 18V21.2L20.6 23.8Z" fill="var(--color-sun-500)")
      path(d="M10.9 11.2L17.5 8.4H21.1L14.5 11.2Z" fill="var(--color-sun-300)")
    //- Bow: two loops with holes, a knot in the middle.
    g(fill="var(--color-sun-400)" stroke="var(--color-ink)" stroke-width="1.5" stroke-linejoin="round" fill-rule="evenodd")
      path(d="M15.6 9.2C12.4 9.6 8.4 8.4 9 5.6C9.5 3.4 12.6 3.4 15.6 9.2ZM14 7.8C12.8 6 11.4 5.2 10.9 6.1C10.6 7 12.2 7.7 14 7.8Z")
      path(d="M16.4 9.2C19.6 9.6 23.6 8.4 23 5.6C22.5 3.4 19.4 3.4 16.4 9.2ZM18 7.8C19.2 6 20.6 5.2 21.1 6.1C21.4 7 19.8 7.7 18 7.8Z")
    ellipse(cx="16" cy="9" rx="1.8" ry="1.4" fill="var(--color-sun-500)" stroke="var(--color-ink)" stroke-width="1.4")
</template>

<template lang="pug">
  //- Gift box: bow on top, lid, box — the ribbon is the gap punched down the
  //- middle, so it stays one solid colour like IconBattlePass.
  //- Decorative — the button that holds it carries the translated aria-label.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false")
    //- Bow loops, each with a hole so they read as loops, not blobs
    path(
      fill-rule="evenodd"
      d="M11.3 7.7C9.2 7.7 5.6 7.4 5.6 5C5.6 3.3 7.3 2.4 8.9 3.2C10.4 4 11.1 5.8 11.3 7.7ZM9.6 6.3C9.3 5.3 8.8 4.6 8.2 4.3C7.6 4 7.1 4.4 7.1 5C7.1 5.8 8.3 6.2 9.6 6.3Z"
    )
    path(
      fill-rule="evenodd"
      d="M12.7 7.7C14.8 7.7 18.4 7.4 18.4 5C18.4 3.3 16.7 2.4 15.1 3.2C13.6 4 12.9 5.8 12.7 7.7ZM14.4 6.3C14.7 5.3 15.2 4.6 15.8 4.3C16.4 4 16.9 4.4 16.9 5C16.9 5.8 15.7 6.2 14.4 6.3Z"
    )
    //- Lid (two halves either side of the ribbon)
    path(d="M3 9.4A1.2 1.2 0 0 1 4.2 8.2H10.8V12.6H3Z")
    path(d="M13.2 8.2H19.8A1.2 1.2 0 0 1 21 9.4V12.6H13.2Z")
    //- Box
    path(d="M4.2 14H10.8V21.5H5.4A1.2 1.2 0 0 1 4.2 20.3Z")
    path(d="M13.2 14H19.8V20.3A1.2 1.2 0 0 1 18.6 21.5H13.2Z")
</template>

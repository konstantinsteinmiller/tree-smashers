<template lang="pug">
  //- The earlier version positioned the `$` at y=18 with no explicit
  //- font-family, which (a) shifted the glyph below the coin's vertical
  //- center and (b) let the browser fall back to a default serif (Times
  //- on most engines) — the thick serifs created a chunky outline that
  //- read as a drop shadow next to the dark-green fill.
  //-
  //- Fix: center optically via `dominant-baseline="central"` and pin the
  //- font to a sans-serif stack so every browser renders the same clean
  //- glyph.
  svg(xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24")
    circle(cx="12" cy="12" r="11" fill="black")
    circle(cx="12" cy="12" r="10" fill="currentColor")
    text(
      x="12" y="12"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="Arial, Helvetica, sans-serif"
      font-size="14"
      font-weight="bold"
      fill="#2f920e"
    ) $
</template>

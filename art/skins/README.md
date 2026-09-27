# Skin art: re-paint kit

Source for the 24 skins added in 2026-09 (design notes: `/skins-new-designs.md`).
Run every command from the repo root.

| file                | what                                                                                                                                                                                                  |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `concepts.mjs`      | the single source: per class the silhouette text, style refs, and per skin the subject/colour/badge + template                                                                                        |
| `build-refs.mjs`    | draws `<class>/sheet.png` (2x2 layout) and `<class>/single-<id>.png` (committed); `style-*.png` / `finish-*.png` plates are generated on demand from `public/images/models` (gitignored)              |
| `build-prompts.mjs` | writes `<class>/prompt-sheet.txt`, `prompt-<id>.txt` (with layout) and `prompt-<id>-free.txt` (no layout — the one that works best for re-paints); `--md` adds a combined `PROMPTS-skins.md`          |
| `fit-skins.mjs`     | keyed PNG → 256x256 WebP, fitted so the farthest solid pixel sits on the in-game clip circle. Don't use `--box` for shipped art: it lets diagonal tips reach the corners and the game clips them flat |

## Re-paint one skin (example: `lionfish`, class `triangle`)

```sh
node art/skins/build-refs.mjs --plates-only          # finish/style plates from the shipped art
node art/skins/build-prompts.mjs                     # only needed after editing concepts.mjs
T=$TEMP/skins; A=$PWD/art/skins
node tools/art-desk/paint.mjs --prompt-file "$A/triangle/prompt-lionfish-free.txt" --out "$T/lionfish.png" \
  --ref "$A/triangle/finish-porcupine.png" --ref "$A/triangle/finish-cactus.png"
node tools/art-desk/slice.mjs --in "$T/lionfish.png" --out-dir "$T/sliced" --names lionfish --size 600x600 --png --pad 0
node art/skins/fit-skins.mjs --out-dir public/images/models "$T/sliced/lionfish.png"
```

- All `paint.mjs` paths must be absolute (see `tools/art-desk/READY.md`). The free prompt is sent
  WITHOUT a layout sheet: with one attached, Gemini paints a grey backing plate under any subject that
  does not fill the grey silhouette. Attach 2-3 finish refs of the SAME class (accepted siblings first).
- To re-paint a whole class as a 2x2 sheet instead: `--prompt-file <class>/prompt-sheet.txt
  --ref <class>/sheet.png --ref <class>/style-*.png` (layout first; the desk attaches it last), then
  `slice.mjs --grid 2x2 --names a,b,c,d --size 400x400 --png --pad 0`.
- Look at every return keyed on the dark ground next to the shipped skins of its class before it
  replaces a file. The catalog test (`tests/skinCatalog.newSkins.test.ts`) fails if any catalog skin
  has no image or no name in a locale.

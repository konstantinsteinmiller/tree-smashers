/** Run `fn` once `img` (already loaded) is DECODED, so the first draw of it
 *  never decodes on the main thread; `fn` runs even when decode() is missing
 *  or rejects. */
export const whenDecoded = (img: HTMLImageElement, fn: () => void): void => {
  const d = typeof img.decode === 'function' ? img.decode() : Promise.resolve()
  d.catch(() => undefined).then(fn)
}

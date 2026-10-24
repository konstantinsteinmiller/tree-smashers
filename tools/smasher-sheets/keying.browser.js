// Shared in-page keying for painted smasher parts — injected into the headless
// page by slice-painted.mjs (runtime sheets) and portraits.mjs (hi-res VS
// portraits) so both cut a painting with the SAME key, despill, part-b colour
// gain and bbox registration. Plain browser script: defines globalThis.SmasherKeying.
(() => {
  const G = 4
  const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i }
  const grab = (img) => {
    const c = new OffscreenCanvas(img.width, img.height)
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0)
    return x.getImageData(0, 0, img.width, img.height)
  }
  // key one painting at its own size, against the ground measured on its border
  const keyPainting = (P) => {
    const pd = grab(P)
    const d = pd.data
    const edge = []
    for (let x = 0; x < P.width; x += 4) {
      for (const y of [0, 1, P.height - 2, P.height - 1]) {
        const i = (y * P.width + x) * 4
        edge.push([d[i], d[i + 1], d[i + 2]])
      }
    }
    const med = k => edge.map(e => e[k]).sort((p, q) => p - q)[edge.length >> 1]
    const Gr = [med(0), med(1), med(2)]
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - Gr[0], d[i + 1] - Gr[1], d[i + 2] - Gr[2])
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - 80) / 110)) * 255)
    }
    // despill: the JPEG return mixes magenta into every contour pixel, so
    // within 3 px of the keyed ground take the magenta component (the part
    // of R and B above G) out — only there, so a plum or rose body survives
    const W = P.width
    const H = P.height
    const near = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] === 255) continue
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= H) continue
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx
            if (xx >= 0 && xx < W) near[yy * W + xx] = 1
          }
        }
      }
    }
    for (let p = 0; p < W * H; p++) {
      if (!near[p]) continue
      const i = p * 4
      const spill = Math.min(d[i], d[i + 2]) - d[i + 1]
      if (spill > 0) {
        d[i] -= spill
        d[i + 2] -= spill
      }
    }
    const keyed = new OffscreenCanvas(P.width, P.height)
    keyed.getContext('2d').putImageData(pd, 0, 0)
    return { keyed, data: d, W: P.width, H: P.height, G: Gr }
  }
  const bbox = (D, W, x0, y0, w, h, solid) => {
    let l = 1e9; let t = 1e9; let r = -1; let bt = -1; let n = 0
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (solid(D, (y * W + x) * 4)) {
          n++
          if (x < l) l = x
          if (x > r) r = x
          if (y < t) t = y
          if (y > bt) bt = y
        }
      }
    }
    return n < 30 ? null : { l: l - x0, t: t - y0, r: r - x0 + 1, b: bt - y0 + 1, n }
  }
  const refSolid = (D, i) => !(D[i] > 200 && D[i + 1] < 60 && D[i + 2] > 200)
  const paintSolid = (D, i) => D[i + 3] > 140
  // mean opaque colour of one 4 × 4 cell of a keyed painting
  const meanRGB = (Q, idx) => {
    const x0 = Math.round((idx % G) * Q.W / G)
    const y0 = Math.round(Math.floor(idx / G) * Q.H / G)
    const m = [0, 0, 0]
    let n = 0
    for (let y = y0; y < y0 + Q.H / G - 1; y++) {
      for (let x = x0; x < x0 + Q.W / G - 1; x++) {
        const i = (y * Q.W + x) * 4
        if (Q.data[i + 3] < 250) continue
        m[0] += Q.data[i]; m[1] += Q.data[i + 1]; m[2] += Q.data[i + 2]; n++
      }
    }
    return m.map(v => v / Math.max(1, n))
  }
  // colour match: cell 9 is a side view in both parts (frame 8 / frame 24,
  // mirror images, so the same mean colour); part a sets the look and part b
  // is gained per channel to agree with it there. Returns the gain.
  const matchPartB = (P, sideA) => {
    const mb = meanRGB(P, 8)
    const gain = mb.map((v, c) => Math.max(0.8, Math.min(1.25, sideA[c] / Math.max(1, v))))
    for (let i = 0; i < P.data.length; i += 4) {
      for (let c = 0; c < 3; c++) P.data[i + c] = Math.min(255, P.data[i + c] * gain[c])
    }
    P.keyed.getContext('2d').putImageData(new ImageData(P.data, P.W, P.H), 0, 0)
    return gain
  }
  // registration of painted cell `idx` (of a 4 × 4 part) onto reference frame
  // `f` (8 × 4 sheet of RC px cells): solid-bbox height → scale, bottom +
  // centre x → offset. Returns null for an empty cell.
  const register = (P, rd, RW, RC, f, idx) => {
    const col = f % 8
    const row = f >> 3
    const pcw = P.W / G
    const pch = P.H / G
    const rb = bbox(rd, RW, col * RC, row * RC, RC, RC, refSolid)
    const x0 = Math.round((idx % G) * pcw)
    const y0 = Math.round(Math.floor(idx / G) * pch)
    const cw = Math.min(Math.round(pcw), P.W - x0)
    const ch = Math.min(Math.round(pch), P.H - y0)
    const pb = bbox(P.data, P.W, x0, y0, cw, ch, paintSolid)
    return { rb, pb, x0, y0, cw, ch, pcw, pch }
  }
  globalThis.SmasherKeying = { G, load, grab, keyPainting, bbox, refSolid, paintSolid, meanRGB, matchPartB, register }
})()

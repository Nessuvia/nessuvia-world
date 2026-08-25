// Magic-wand region picking: flood-fill same-colored pixels from a clicked point on the base
// image, then take the bounding box of the fill — the region-drawing workflow (drag to
// reposition, snap to middle, click-out to commit) takes over from there unchanged.

export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

function colorDistSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr + dg * dg + db * db
}

/** 4-connected flood fill over RGBA image data, starting at (x, y), matching pixels within
 *  `tolerance` (euclidean, 0–441) of the start pixel's color. Returns a same-size boolean mask
 *  (1 = filled). Out-of-bounds start returns an all-zero mask. */
export function floodFillMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  if (x < 0 || y < 0 || x >= width || y >= height) return mask
  const idx = (px: number, py: number) => (py * width + px) * 4
  const start = idx(x, y)
  const r0 = data[start]
  const g0 = data[start + 1]
  const b0 = data[start + 2]
  const tolSq = tolerance * tolerance
  const stack: number[] = [x, y]
  mask[y * width + x] = 1
  while (stack.length) {
    const py = stack.pop()!
    const px = stack.pop()!
    const neighbors: [number, number][] = [
      [px + 1, py],
      [px - 1, py],
      [px, py + 1],
      [px, py - 1],
    ]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const mi = ny * width + nx
      if (mask[mi]) continue
      const di = idx(nx, ny)
      if (colorDistSq(data[di], data[di + 1], data[di + 2], r0, g0, b0) > tolSq) continue
      mask[mi] = 1
      stack.push(nx, ny)
    }
  }
  return mask
}

/** Bounding box of the set pixels in a mask. Null when the mask is empty. `x1`/`y1` are
 *  exclusive, matching how the rest of the authoring tool treats drag bounds. */
export function maskBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (!mask[py * width + px]) continue
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
    }
  }
  if (x1 < x0) return null
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

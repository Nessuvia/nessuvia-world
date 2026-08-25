// Run: node --experimental-strip-types src/modules/bodyMap/checkWandSelect.ts
import assert from 'node:assert'
import { floodFillMask, maskBounds } from './wandSelect.ts'

function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return data
}

// 4x3 grid: a 2x2 black square (top-left) on a white background.
const W = 4
const H = 3
// prettier-ignore
const data = rgba([
  [0, 0, 0], [0, 0, 0], [255, 255, 255], [255, 255, 255],
  [0, 0, 0], [0, 0, 0], [255, 255, 255], [255, 255, 255],
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
])

// --- fill stays within the matching color, doesn't leak across the boundary ---
const mask = floodFillMask(data, W, H, 0, 0, 24)
assert.deepStrictEqual(
  [...mask],
  [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
)

// --- bounding box of the fill --------------------------------------------
assert.deepStrictEqual(maskBounds(mask, W, H), { x0: 0, y0: 0, x1: 2, y1: 2 })

// --- clicking the white background fills the rest ------------------------
const bg = floodFillMask(data, W, H, 3, 2, 24)
assert.deepStrictEqual(maskBounds(bg, W, H), { x0: 0, y0: 0, x1: 4, y1: 3 })

// --- out-of-bounds start returns an empty mask ----------------------------
const empty = floodFillMask(data, W, H, -1, 0, 24)
assert.strictEqual(maskBounds(empty, W, H), null)

// --- tolerance widens the match: a near-black pixel joins the black fill -
// prettier-ignore
const near = rgba([
  [0, 0, 0], [10, 10, 10], [255, 255, 255],
])
const nearMask = floodFillMask(near, 3, 1, 0, 0, 24)
assert.deepStrictEqual([...nearMask], [1, 1, 0])
const strictMask = floodFillMask(near, 3, 1, 0, 0, 5)
assert.deepStrictEqual([...strictMask], [1, 0, 0])

console.log('ok')

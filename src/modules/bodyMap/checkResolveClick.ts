// Run: node --experimental-strip-types src/modules/bodyMap/checkResolveClick.ts
import assert from 'node:assert'
import type { Region } from './types.ts'
import { pointInPolygon, resolvePolygon, toImageSpace } from './resolveClick.ts'

// --- toImageSpace: displayed -> natural pixels --------------------------
const rect = { left: 100, top: 50, width: 200, height: 400 }
// image is natural 400x800 shown at 200x400 (half size); a click at the display center
assert.deepStrictEqual(toImageSpace(200, 250, rect, 400, 800), { x: 200, y: 400 })
// top-left corner of the image
assert.deepStrictEqual(toImageSpace(100, 50, rect, 400, 800), { x: 0, y: 0 })

// --- point in polygon ---------------------------------------------------
const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]
assert.strictEqual(pointInPolygon(5, 5, square), true)
assert.strictEqual(pointInPolygon(15, 5, square), false)

const polyRegions: Region[] = [
  { partId: 'head_front', name: 'Head', view: 'front', polygon: square },
  { partId: 'head_back', name: 'Head', view: 'back', polygon: square },
]
assert.strictEqual(resolvePolygon(5, 5, polyRegions, 'front'), 'head_front')
assert.strictEqual(resolvePolygon(5, 5, polyRegions, 'back'), 'head_back')
assert.strictEqual(resolvePolygon(50, 50, polyRegions, 'front'), null)

console.log('ok')

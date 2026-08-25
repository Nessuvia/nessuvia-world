import assert from 'node:assert'
import { edgeState } from './tabScroll.ts'

// Everything fits: no carets either side.
assert.deepStrictEqual(edgeState(0, 300, 300), { atStart: true, atEnd: true, scrollable: false })

// Overflowing, parked at the left.
assert.deepStrictEqual(edgeState(0, 800, 300), { atStart: true, atEnd: false, scrollable: true })

// Mid-scroll: both carets.
assert.deepStrictEqual(edgeState(200, 800, 300), { atStart: false, atEnd: false, scrollable: true })

// Scrolled to the end.
assert.deepStrictEqual(edgeState(500, 800, 300), { atStart: false, atEnd: true, scrollable: true })

// Sub-pixel layout leaves scrollLeft just shy of max; still counts as the end.
assert.deepStrictEqual(edgeState(499.4, 800, 300), { atStart: false, atEnd: true, scrollable: true })

console.log('checkTabScroll ok')

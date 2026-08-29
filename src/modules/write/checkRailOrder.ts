import assert from 'node:assert'
import { railOrder, togglePin } from './railOrder.ts'

const ids = ['beats', 'direction', 'characters', 'connection', 'promptStack']

// Nothing pinned: declared order, untouched.
assert.deepStrictEqual(railOrder(ids, []), ids)

// Pinned ids come first, in pin order, not declared order.
assert.deepStrictEqual(railOrder(ids, ['promptStack', 'direction']), [
  'promptStack',
  'direction',
  'beats',
  'characters',
  'connection',
])

// Everything pinned: pin order wins outright.
assert.deepStrictEqual(railOrder(ids, [...ids].reverse()), [...ids].reverse())

// A pinned id that no longer names a section is dropped, not rendered.
assert.deepStrictEqual(railOrder(ids, ['gone', 'beats']), [
  'beats',
  'direction',
  'characters',
  'connection',
  'promptStack',
])

// Pinning appends to the end of the pinned group.
assert.deepStrictEqual(togglePin(['beats'], 'promptStack'), ['beats', 'promptStack'])

// Pinning again unpins, and the rest keep their order.
assert.deepStrictEqual(togglePin(['beats', 'promptStack'], 'beats'), ['promptStack'])

console.log('checkRailOrder ok')

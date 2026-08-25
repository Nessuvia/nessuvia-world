// Run: node --experimental-strip-types src/core/storage/checkActiveDescription.ts
import assert from 'node:assert'
import type { Character } from './types.ts'
import { activeDescription } from './types.ts'

const base = { description: 'plain' } as Character
const two = [
  { title: 'a', content: 'first' },
  { title: 'b', content: 'second' },
]

assert.strictEqual(activeDescription({ ...base, altDescriptions: two, activeDescriptionIndex: -1 }), 'plain')
assert.strictEqual(activeDescription({ ...base, altDescriptions: two, activeDescriptionIndex: 1 }), 'second')
assert.strictEqual(activeDescription({ ...base, altDescriptions: two, activeDescriptionIndex: 5 }), 'plain')
assert.strictEqual(activeDescription({ ...base, altDescriptions: [], activeDescriptionIndex: 0 }), 'plain')

console.log('ok')

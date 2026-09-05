// Run: node --experimental-strip-types src/core/storage/checkSeedFlags.ts
import assert from 'node:assert'
import { seedFlags, withSeedFlags } from './seedFlags.ts'

type Blob = { state: Record<string, unknown>; version?: number }
const parse = (json: string) => JSON.parse(json) as Blob

// Every flag is on, whatever the blob said. seededStacks is the one that was missing: without it a
// restore reseeds two prompt stacks and overwrites the restored active-stack choice.
assert.deepStrictEqual(seedFlags.slice().sort(), [
  'seededCharacters',
  'seededPalettes',
  'seededParamDefs',
  'seededStacks',
])
for (const flag of seedFlags) {
  assert.strictEqual(parse(withSeedFlags(null)).state[flag], true, `${flag} on an absent blob`)
  const off = JSON.stringify({ state: { [flag]: false } })
  assert.strictEqual(parse(withSeedFlags(off)).state[flag], true, `${flag} forced on`)
}

// The rest of the blob survives, version included.
const full = JSON.stringify({ state: { connections: [{ id: 'a' }], activeStackId: 7 }, version: 3 })
const restored = parse(withSeedFlags(full))
assert.deepStrictEqual(restored.state.connections, [{ id: 'a' }])
assert.strictEqual(restored.state.activeStackId, 7)
assert.strictEqual(restored.version, 3)

// Unparseable input is replaced rather than thrown on: a garbled blob must not block a restore.
assert.deepStrictEqual(Object.keys(parse(withSeedFlags('{oops')).state).sort(), [...seedFlags].sort())

console.log('checkSeedFlags ok')

import assert from 'node:assert'
import { mergeConnections, renameConnections } from './shareable.ts'

const mine = JSON.stringify({
  state: {
    connections: [
      { id: 'a', name: 'work openrouter', endpointUrl: 'https://x', apiKey: 'secret' },
    ],
  },
  version: 0,
})

// Rename: the label goes, the endpoint stays, the shape is untouched otherwise.
const renamed = renameConnections(mine)
assert(renamed !== null)
const out = JSON.parse(renamed).state.connections[0]
assert.notEqual(out.name, 'work openrouter')
assert.match(out.name, /^[a-z]+-[a-z]+-[a-z]+$/)
assert.equal(out.endpointUrl, 'https://x')
assert.equal(renameConnections(null), null)

// Merge: a new id is appended, a known id is not, and the importer's own key survives.
const theirs = JSON.stringify({
  state: { connections: [{ id: 'a', name: 'dup', apiKey: '' }, { id: 'b', name: 'new' }] },
})
const merged = mergeConnections(mine, theirs)
assert(merged !== null)
const list = JSON.parse(merged).state.connections
assert.equal(list.length, 2)
assert.equal(list[0].apiKey, 'secret')
assert.equal(list[0].name, 'work openrouter')
assert.equal(list[1].id, 'b')
assert.equal(mergeConnections(null, theirs), theirs)
assert.equal(mergeConnections(mine, null), mine)

console.log('checkShareable ok')

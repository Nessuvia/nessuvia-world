// Run: node --experimental-strip-types src/modules/bodyMap/checkOutput.ts
import assert from 'node:assert'
import type { BodyMap, TrackerState } from './types.ts'
import { buildBlock, collapseActions, resolveTemplate } from './output.ts'

const ctx = { user: 'Alex', char: 'Mara' }

// --- template resolution ------------------------------------------------
assert.strictEqual(
  resolveTemplate('{{user}} bandages {{char}}’s {{part}}', 'left arm', ctx),
  'Alex bandages Mara’s left arm',
)
// case-insensitive, unknown tokens left alone
assert.strictEqual(resolveTemplate('{{PART}} {{unknown}}', 'head', ctx), 'head {{unknown}}')

assert.strictEqual(collapseActions(['a', 'b', 'c']), 'a, b, c')

const map: BodyMap = {
  id: 'm',
  name: 'Test',
  images: { front: '', back: '' },
  regions: [
    { partId: 'left_shoulder_front', name: 'left shoulder', view: 'front' },
    { partId: 'right_shoulder_front', name: 'right shoulder', view: 'front' },
    { partId: 'left_arm_front', name: 'left arm', view: 'front' },
  ],
  actions: [],
}

function state(parts: TrackerState['parts'], over: Partial<TrackerState> = {}): TrackerState {
  return { parts, enabled: true, sendMode: 'persistent', tag: 'bodyState', ...over }
}

// --- one line per part, ordered by region order -------------------------
const s = state({
  // deliberately out of region order to prove sorting
  left_arm_front: [{ state: 'bandaged', resolvedDescription: '{{part}} is bandaged' }],
  left_shoulder_front: [{ state: 'massaged', resolvedDescription: 'deep-tissue on {{part}}' }],
})
assert.strictEqual(
  buildBlock(s, map, ctx),
  '<bodyState>\ndeep-tissue on left shoulder\nleft arm is bandaged\n</bodyState>',
)

// --- multiple actions on one part collapse to one line ------------------
const collapsed = state({
  left_shoulder_front: [
    { state: 'a', resolvedDescription: 'sore' },
    { state: 'b', resolvedDescription: 'bruised' },
  ],
})
assert.strictEqual(buildBlock(collapsed, map, ctx), '<bodyState>\nsore, bruised\n</bodyState>')

// --- configurable tag ---------------------------------------------------
assert.strictEqual(
  buildBlock(state({ left_arm_front: [{ state: 'x', resolvedDescription: 'hurt' }] }, { tag: 'cond' }), map, ctx),
  '<cond>\nhurt\n</cond>',
)

// --- an empty tag sends the lines bare ----------------------------------
assert.strictEqual(
  buildBlock(state({ left_arm_front: [{ state: 'x', resolvedDescription: 'hurt' }] }, { tag: '' }), map, ctx),
  'hurt',
)

// --- omitted when disabled or empty -------------------------------------
assert.strictEqual(buildBlock(state({}, { enabled: false }), map, ctx), '')
assert.strictEqual(buildBlock(state({}), map, ctx), '')
// a part whose actions were all removed leaves no line
assert.strictEqual(buildBlock(state({ left_arm_front: [] }), map, ctx), '')

console.log('ok')

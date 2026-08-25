// Run: node --experimental-strip-types src/modules/bodyMap/checkQA.ts
// Section 9 scenarios that are testable without a browser. Persistence round-trip and the
// accessibility floor need the real app — handed off for manual check.
import assert from 'node:assert'
import { defaultBodyMap } from './defaultMap.ts'
import { buildBlock } from './output.ts'
import { emptyTracker, type AppliedAction, type TrackerState } from './types.ts'

const ctx = { user: 'Alex', char: 'Mara' }
const map = defaultBodyMap

function set(t: TrackerState, partId: string, action: AppliedAction): TrackerState {
  return { ...t, parts: { ...t.parts, [partId]: [...(t.parts[partId] ?? []), action] } }
}

// --- multi-action on one part collapses to one line ---------------------
let t = { ...emptyTracker(), enabled: true }
t = set(t, 'left_forearm_front', { state: 'bruised', resolvedDescription: 'left forearm is bruised' })
t = set(t, 'left_forearm_front', { state: 'bandaged', resolvedDescription: 'left forearm is bandaged' })
assert.strictEqual(
  buildBlock(t, map, ctx),
  '<bodyState>\nleft forearm is bruised, left forearm is bandaged\n</bodyState>',
)

// --- flip preserves independent front/back state ------------------------
// Front and back shoulders are distinct parts; setting front leaves back untouched.
let f = { ...emptyTracker(), enabled: true }
f = set(f, 'left_shoulder_front', { state: 'a', resolvedDescription: 'front shoulder' })
assert.deepStrictEqual(Object.keys(f.parts), ['left_shoulder_front'])
f = set(f, 'left_shoulder_back', { state: 'b', resolvedDescription: 'back shoulder' })
assert.strictEqual(f.parts['left_shoulder_front'].length, 1)
assert.strictEqual(f.parts['left_shoulder_back'].length, 1)
// both appear in the block regardless of which view is showing (the block is the whole body)
const block = buildBlock(f, map, ctx)
assert.ok(block.includes('front shoulder') && block.includes('back shoulder'))

// --- toggle off → block disappears --------------------------------------
assert.strictEqual(buildBlock({ ...f, enabled: false }, map, ctx), '')

console.log('ok')

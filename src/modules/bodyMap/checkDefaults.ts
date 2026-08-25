// Run: node --experimental-strip-types src/modules/bodyMap/checkDefaults.ts
import assert from 'node:assert'
import { defaultBodyMap } from './defaultMap.ts'
import { buildBlock } from './output.ts'
import { emptyTracker, type TrackerState } from './types.ts'

const ctx = { user: 'Alex', char: 'Mara' }
const map = defaultBodyMap

// --- map shape: front + back, distinct parts, down to hands/feet --------
const front = map.regions.filter((r) => r.view === 'front')
const back = map.regions.filter((r) => r.view === 'back')
assert.ok(front.length > 0 && back.length > 0, 'both views populated')
assert.ok(map.regions.some((r) => r.partId === 'left_hand_front'))
assert.ok(map.regions.some((r) => r.partId === 'left_foot_front'))
// front/back shoulders are distinct parts
assert.ok(map.regions.some((r) => r.partId === 'left_shoulder_front'))
assert.ok(map.regions.some((r) => r.partId === 'left_shoulder_back'))
// every region has geometry and every partId is unique
assert.strictEqual(new Set(map.regions.map((r) => r.partId)).size, map.regions.length)
assert.ok(map.regions.every((r) => (r.polygon?.length ?? 0) >= 3))

function apply(t: TrackerState, partId: string, actionId: string): TrackerState {
  const def = map.actions.find((a) => a.id === actionId)!
  const part = map.regions.find((r) => r.partId === partId)!.name
  const resolved = def.descriptionTemplate
    .replaceAll('{{user}}', ctx.user)
    .replaceAll('{{char}}', ctx.char)
    .replaceAll('{{part}}', part)
  return { ...t, parts: { ...t.parts, [partId]: [{ state: def.state, resolvedDescription: resolved }] } }
}

// --- massage walkthrough: both shoulders, deep-tissue -------------------
let t = { ...emptyTracker(), enabled: true }
t = apply(t, 'left_shoulder_front', 'massage')
t = apply(t, 'right_shoulder_front', 'massage')
const massage = buildBlock(t, map, ctx)
assert.strictEqual(
  massage,
  '<bodyState>\n' +
    'Alex gives Mara a deep-tissue massage on the left shoulder\n' +
    'Alex gives Mara a deep-tissue massage on the right shoulder\n' +
    '</bodyState>',
)

// --- wound/bandage walkthrough ------------------------------------------
let w = { ...emptyTracker(), enabled: true }
w = apply(w, 'left_forearm_front', 'bandage')
assert.strictEqual(
  buildBlock(w, map, ctx),
  '<bodyState>\nMara’s left forearm is wrapped in a clean bandage\n</bodyState>',
)

// every default action uses at least one template token
assert.ok(map.actions.every((a) => /\{\{(user|char|part)\}\}/.test(a.descriptionTemplate)))

console.log('ok')

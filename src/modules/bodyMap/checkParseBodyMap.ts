// Run: node --experimental-strip-types src/modules/bodyMap/checkParseBodyMap.ts
import assert from 'node:assert'
import { coerceBodyMap, firstJsonObject, parseBodyMapReply } from './parseBodyMap.ts'

// --- firstJsonObject: cut the object out of fenced / chatty text --------
assert.strictEqual(firstJsonObject('```json\n{"a":1}\n```'), '{"a":1}')
assert.strictEqual(firstJsonObject('Sure! {"a":{"b":2}} done'), '{"a":{"b":2}}')
// braces inside strings don't confuse the balance
assert.strictEqual(firstJsonObject('{"s":"a}b"}'), '{"s":"a}b"}')
assert.strictEqual(firstJsonObject('no object here'), '')

// --- a good paste parses ------------------------------------------------
const good = JSON.stringify({
  id: 'x',
  name: 'X',
  images: { front: '', back: '' },
  regions: [
    { partId: 'head_front', name: 'head', view: 'front', polygon: [[0, 0], [10, 0], [5, 10]] },
    { partId: 'head_back', name: 'head', view: 'back', polygon: [[0, 0], [10, 0], [5, 10]] },
  ],
  actions: [{ id: 'a', state: 'hurt', descriptionTemplate: '{{char}}’s {{part}} hurts' }],
})
const map = parseBodyMapReply('Here you go:\n' + good)
assert.strictEqual(map.regions.length, 2)
assert.strictEqual(map.actions.length, 1)

// --- bad regions are dropped, not fatal ---------------------------------
const mixed = coerceBodyMap({
  regions: [
    { partId: 'ok_front', name: 'ok', view: 'front', polygon: [[0, 0], [1, 0], [1, 1]] },
    { partId: 'bad', name: 'bad', view: 'front', polygon: [[0, 0]] }, // too few points
    { partId: 'noview', name: 'nv', view: 'sideways', polygon: [[0, 0], [1, 0], [1, 1]] }, // bad view
    { name: 'noid', view: 'front', polygon: [[0, 0], [1, 0], [1, 1]] }, // missing partId
  ],
  actions: [
    { id: 'a', state: 's', descriptionTemplate: 't' },
    { id: 'b', descriptionTemplate: 'no state' }, // dropped
  ],
})
assert.deepStrictEqual(mixed.regions.map((r) => r.partId), ['ok_front'])
assert.strictEqual(mixed.actions.length, 1)
// defaults fill in for a sparse object
assert.strictEqual(mixed.name, 'Generated map')
assert.strictEqual(mixed.images.front, '')

// --- empty / no-region pastes throw -------------------------------------
assert.throws(() => parseBodyMapReply('no json'), /no map/)
assert.throws(() => coerceBodyMap({ regions: [] }), /no usable regions/)

console.log('ok')

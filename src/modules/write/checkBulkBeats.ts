// Run: node --experimental-strip-types src/modules/write/checkBulkBeats.ts
import assert from 'node:assert'
import { mapWeights, parseBulkBeats } from './bulkBeats.ts'

const ok = (input: string) => {
  const out = parseBulkBeats(input)
  assert.strictEqual(out.error, '', `${input} -> ${out.error}`)
  return out
}
const bad = (input: string) => {
  const out = parseBulkBeats(input)
  assert.notStrictEqual(out.error, '', `${input} should not parse`)
  return out.error
}

// --- the documented shape -----------------------------------------------------
const full = ok(`[
  {
    "name": "The Inciting Incident",
    "content": "The protagonist discovers a hidden map.",
    "length": "long"
  },
  {
    "name": "Crossing the Threshold",
    "content": "They board the charter boat.",
    "length": "brief"
  }
]`)
assert.deepStrictEqual(full.beats, [
  { name: 'The Inciting Incident', beat: 'The protagonist discovers a hidden map.', length: 'long' },
  { name: 'Crossing the Threshold', beat: 'They board the charter boat.', length: 'brief' },
])
assert.deepStrictEqual(full.unknown, [])
assert.deepStrictEqual(mapWeights(full.beats), [
  { name: 'The Inciting Incident', beat: 'The protagonist discovers a hidden map.', weight: 'long' },
  { name: 'Crossing the Threshold', beat: 'They board the charter boat.', weight: 'brief' },
])

// Casing is not the Author's problem.
assert.strictEqual(ok('[{"content":"a","length":"MAJOR"}]').unknown.length, 0)
assert.strictEqual(mapWeights(ok('[{"content":"a","length":"Major"}]').beats)[0].weight, 'major')

// --- optional fields ------------------------------------------------------------
// No length is a normal beat; no name is an untitled one.
assert.deepStrictEqual(ok('[{"content":"a"}]').beats, [{ name: '', beat: 'a', length: 'normal' }])
// A name with no content is still a beat: it has been planned enough to sit in the list.
assert.deepStrictEqual(ok('[{"name":"Act one"}]').beats, [
  { name: 'Act one', beat: '', length: 'normal' },
])
// A bare array of strings: the strings are the contents.
assert.deepStrictEqual(ok('["a","b"]').beats, [
  { name: '', beat: 'a', length: 'normal' },
  { name: '', beat: 'b', length: 'normal' },
])

// --- unknown lengths: collected for remapping, never guessed --------------------
const odd = ok('[{"content":"a","length":"short"},{"content":"b","length":"epic"},{"content":"c","length":"short"}]')
// Deduplicated, in first-appearance order.
assert.deepStrictEqual(odd.unknown, ['short', 'epic'])
// The raw value survives the parse, so the dialog can show what was actually written.
assert.strictEqual(odd.beats[0].length, 'short')
// Mapped, they become the Author's answers.
assert.deepStrictEqual(
  mapWeights(odd.beats, { short: 'brief', epic: 'major' }).map((b) => b.weight),
  ['brief', 'major', 'brief'],
)
// Unanswered, they fall back rather than losing the beat.
assert.deepStrictEqual(mapWeights(odd.beats).map((b) => b.weight), ['normal', 'normal', 'normal'])
assert.deepStrictEqual(
  mapWeights(odd.beats, { short: 'brief' }).map((b) => b.weight),
  ['brief', 'normal', 'brief'],
)

// --- untrusted input ------------------------------------------------------------
const messy = ok('[{"content":"Two\\n  lines","length":42},null,["nope"],{},{"content":"b"}]')
assert.deepStrictEqual(messy.beats, [
  // Newlines fold: a beat's content is one line. A non-string length is still a value to remap.
  { name: '', beat: 'Two lines', length: '42' },
  { name: '', beat: 'b', length: 'normal' },
])
assert.deepStrictEqual(messy.unknown, ['42'])
// Quotes and backslashes are JSON's problem now, and it handles them.
assert.strictEqual(ok('[{"content":"She says \\"no\\""}]').beats[0].beat, 'She says "no"')
assert.strictEqual(ok('[{"content":"C:\\\\path"}]').beats[0].beat, 'C:\\path')

// --- rejections -------------------------------------------------------------------
assert.match(bad(''), /Nothing to add/)
assert.match(bad('   '), /Nothing to add/)
assert.match(bad('{"content":"a"}'), /array of beats/)
assert.match(bad('[{"content":"a"}'), /not valid JSON/)
assert.match(bad('{"text",200}'), /not valid JSON/)
// An array with nothing usable in it adds nothing, and says so.
assert.match(bad('[]'), /Nothing to add/)
assert.match(bad('[null,{},["x"]]'), /Nothing to add/)

console.log('checkBulkBeats ok')

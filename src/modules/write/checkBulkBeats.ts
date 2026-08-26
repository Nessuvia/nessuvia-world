// Run: node --experimental-strip-types src/modules/write/checkBulkBeats.ts
import assert from 'node:assert'
import { parseBulkBeats } from './bulkBeats.ts'
import { emptyBeat } from './beatSlots.ts'

const ok = (input: string) => {
  const out = parseBulkBeats(input)
  assert.strictEqual(out.error, '', `${input} -> ${out.error}`)
  return out.beats
}
const bad = (input: string) => {
  const out = parseBulkBeats(input)
  assert.notStrictEqual(out.error, '', `${input} should not parse`)
  // A failed parse adds nothing: it is all or nothing, never a half-applied paste.
  assert.deepStrictEqual(out.beats, [])
  return out.error
}

// --- the documented shape ---------------------------------------------------
assert.deepStrictEqual(ok('{"the text of the beat",200},{"second beat text",250}'), [
  { beat: 'the text of the beat', targetWords: 200 },
  { beat: 'second beat text', targetWords: 250 },
])

// --- the count is optional --------------------------------------------------
assert.deepStrictEqual(ok('{"just text"}'), [{ beat: 'just text', targetWords: 0 }])
assert.deepStrictEqual(ok('{"a"},{"b",50},{"c"}'), [
  { beat: 'a', targetWords: 0 },
  { beat: 'b', targetWords: 50 },
  { beat: 'c', targetWords: 0 },
])

// --- whitespace, newlines, missing and trailing separators ------------------
assert.deepStrictEqual(ok('  { "a" , 10 }  ,  { "b" }  ,  '), [
  { beat: 'a', targetWords: 10 },
  { beat: 'b', targetWords: 0 },
])
// One entry per line, no commas between them at all.
assert.deepStrictEqual(ok('{"a",10}\n{"b",20}\n'), [
  { beat: 'a', targetWords: 10 },
  { beat: 'b', targetWords: 20 },
])

// --- escapes ----------------------------------------------------------------
assert.deepStrictEqual(ok('{"She says \\"no\\" and leaves"}'), [
  { beat: 'She says "no" and leaves', targetWords: 0 },
])
assert.deepStrictEqual(ok('{"back\\\\slash"}'), [{ beat: 'back\\slash', targetWords: 0 }])
// An undefined escape keeps its backslash rather than being eaten.
assert.deepStrictEqual(ok('{"C:\\path"}'), [{ beat: 'C:\\path', targetWords: 0 }])

// --- a beat is one line -----------------------------------------------------
assert.deepStrictEqual(ok('{"first\n  second"}'), [{ beat: 'first second', targetWords: 0 }])

// --- an empty beat is still a beat, never free prose ------------------------
assert.deepStrictEqual(ok('{""}'), [{ beat: emptyBeat, targetWords: 0 }])
assert.deepStrictEqual(ok('{"   ",100}'), [{ beat: emptyBeat, targetWords: 100 }])

// --- rejections -------------------------------------------------------------
assert.match(bad(''), /Nothing to add/)
assert.match(bad('   \n  '), /Nothing to add/)
assert.match(bad('the text of the beat, 200'), /Expected \{/)
assert.match(bad('{the text}'), /Expected a quoted beat/)
assert.match(bad('{"unclosed'), /Unclosed quote/)
assert.match(bad('{"a",}'), /Expected a word count/)
assert.match(bad('{"a",two hundred}'), /Expected a word count/)
assert.match(bad('{"a",200'), /Expected \}/)
assert.match(bad('{"a" 200}'), /Expected \}/)
// A good entry followed by a bad one takes the whole paste down, rather than silently adding one.
assert.match(bad('{"a",1},{"b"'), /Expected \}/)

// The position is 1-based and points at the offending character.
assert.strictEqual(parseBulkBeats('{"a"},x').error, 'Expected { at character 7.')

console.log('checkBulkBeats ok')

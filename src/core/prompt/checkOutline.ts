// Run: node --experimental-strip-types src/core/prompt/checkOutline.ts
import assert from 'node:assert'
import { buildOutlineMessages, parseOutlineReply, splitTargets } from './outline.ts'

// --- splitTargets: the parts always add back up to the whole -----------------
assert.deepStrictEqual(splitTargets(1200, 4), [300, 300, 300, 300])
assert.deepStrictEqual(splitTargets(1000, 3), [334, 333, 333])
assert.strictEqual(splitTargets(1000, 3).reduce((a, b) => a + b, 0), 1000)
assert.strictEqual(splitTargets(997, 7).reduce((a, b) => a + b, 0), 997)
// Fewer words than beats still spends every word rather than rounding them all to zero.
assert.deepStrictEqual(splitTargets(2, 5), [1, 1, 0, 0, 0])
// Unset stays unset.
assert.deepStrictEqual(splitTargets(0, 3), [0, 0, 0])
assert.deepStrictEqual(splitTargets(1200, 0), [])

// --- parseOutlineReply: the documented shape ---------------------------------
const plain = parseOutlineReply(
  '{"chapters":[{"title":"The Arrival","summary":"She lands.","beats":["off the boat","the inn"]}]}',
)
assert.deepStrictEqual(plain, [
  { title: 'The Arrival', summary: 'She lands.', beats: ['off the boat', 'the inn'] },
])

// A fenced object, and one wrapped in a sentence, both parse — models do this constantly.
assert.deepStrictEqual(
  parseOutlineReply('```json\n{"chapters":[{"title":"A","summary":"","beats":[]}]}\n```'),
  [{ title: 'A', summary: '', beats: [] }],
)
assert.deepStrictEqual(
  parseOutlineReply('Here you go:\n{"chapters":[{"title":"A"}]}\nHope that helps!'),
  [{ title: 'A', summary: '', beats: [] }],
)

// --- untrusted input: coerced, not taken as written --------------------------
const messy = parseOutlineReply(
  '{"chapters":[' +
    '{"title":"Two\\n  lines","summary":42,"beats":["a",{"x":1},"","  ","b"]},' +
    'null,' +
    '["not an object"],' +
    '{"title":"","summary":"","beats":[]},' +
    '{"title":"Last","beats":"not an array"}' +
    ']}',
)
assert.deepStrictEqual(messy, [
  // Newlines fold: a beat and a title are each one line.
  { title: 'Two lines', summary: '42', beats: ['a', 'b'] },
  // The null, the array, and the entirely empty entry are all gone.
  { title: 'Last', summary: '', beats: [] },
])

// --- rejections ---------------------------------------------------------------
const bad = (input: string) => {
  try {
    parseOutlineReply(input)
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(`${input} should not parse`)
}
assert.match(bad('Sorry, I cannot help with that.'), /no JSON object/)
assert.match(bad('{"chapters":[{"title":"A"'), /never closed it/)
assert.match(bad('{"chapters":[}'), /did not parse/)
assert.match(bad('{"outline":[]}'), /no chapters array/)
assert.match(bad('{"chapters":[]}'), /no chapters\./)
// Every entry unusable is the same as none: nothing is written, the existing chapters survive.
assert.match(bad('{"chapters":[null,{"title":"","beats":[]}]}'), /no chapters\./)

// --- caps ----------------------------------------------------------------------
const huge = JSON.stringify({
  chapters: Array.from({ length: 200 }, () => ({ title: 'x', beats: new Array(100).fill('b') })),
})
const capped = parseOutlineReply(huge)
assert.strictEqual(capped.length, 60)
assert.strictEqual(capped[0].beats.length, 40)

// --- buildOutlineMessages: the slots are filled, none left standing ----------
const messages = buildOutlineMessages({
  premise: 'A locksmith inherits a door.',
  chapters: 5,
  beatsPerChapter: 4,
  wordsPerChapter: 1200,
})
assert.strictEqual(messages.length, 2)
assert.strictEqual(messages[0].role, 'system')
assert.doesNotMatch(messages[0].content, /\{\{/)
assert.match(messages[0].content, /array of 5 objects/)
assert.match(messages[0].content, /exactly 4 beats/)
assert.match(messages[0].content, /about 1200 words/)
assert.match(messages[0].content, /A locksmith inherits a door\./)

// Both optional numbers unset: the model is asked to choose, and no word target is named.
const loose = buildOutlineMessages({
  premise: 'x',
  chapters: 3,
  beatsPerChapter: 0,
  wordsPerChapter: 0,
})
assert.match(loose[0].content, /as many beats as it needs/)
assert.doesNotMatch(loose[0].content, /words/)

// A stack override replaces the wording and still gets its slots filled.
const custom = buildOutlineMessages(
  { premise: 'p', chapters: 2, beatsPerChapter: 0, wordsPerChapter: 0 },
  { outline: 'Write {{chapters}} chapters about: {{premise}}' },
)
assert.strictEqual(custom[0].content, 'Write 2 chapters about: p')

console.log('checkOutline ok')

import assert from 'node:assert/strict'
import { CompromiseTagger, tagsToPos, type Token } from './tagger.ts'

const tagger = new CompromiseTagger()

function tok(tokens: Token[], i: number) {
  const t = tokens[i]
  return t ? { text: t.text, pos: t.pos.join(','), start: t.start, end: t.end } : null
}

// Basic tagging: each word lands in its expected slot.
const a = tagger.tokenize('The quick brown fox jumps swiftly.')
assert.equal(a.length, 6)
assert.deepEqual(tok(a, 0), { text: 'The', pos: 'det', start: 0, end: 3 })
assert.deepEqual(tok(a, 1), { text: 'quick', pos: 'adj', start: 4, end: 9 })
assert.deepEqual(tok(a, 3), { text: 'fox', pos: 'noun', start: 16, end: 19 })
assert.deepEqual(tok(a, 4), { text: 'jumps', pos: 'verb', start: 20, end: 25 })
assert.deepEqual(tok(a, 5), { text: 'swiftly', pos: 'adv', start: 26, end: 33 })

// Sentence boundaries: two sentences get distinct indices; offsets are continuous.
const b = tagger.tokenize('She runs with a graceful elegance. He waits.')
assert.equal(b.length, 8)
// "She runs with a graceful elegance." is sentence 0; "He waits." is sentence 1.
assert.equal(b[0].sentenceIndex, 0) // She
assert.equal(b[5].sentenceIndex, 0) // elegance
assert.equal(b[6].sentenceIndex, 1) // He
assert.equal(b[7].sentenceIndex, 1) // waits
// "with" is a preposition, "a" a determiner, "elegance" a noun.
assert.deepEqual(tok(b, 2), { text: 'with', pos: 'prep', start: 9, end: 13 })
assert.deepEqual(tok(b, 3), { text: 'a', pos: 'det', start: 14, end: 15 })
assert.deepEqual(tok(b, 6), { text: 'He', pos: 'noun,pron', start: 35, end: 37 })
assert.deepEqual(tok(b, 7), { text: 'waits', pos: 'verb', start: 38, end: 43 })

// tagsToPos dedupes and ignores unknown tags.
assert.deepEqual(tagsToPos(['Noun', 'Singular', 'Singular']), ['noun'])
assert.deepEqual(tagsToPos(['Conjunction']), ['conj'])
assert.deepEqual(tagsToPos(['Verb', 'PastTense']), ['verb'])
assert.deepEqual(tagsToPos(['QuestionMark']), [])

// Empty string is a clean empty, not a throw.
assert.deepEqual(tagger.tokenize(''), [])

// Punctuation-only tokens are dropped; surrounding words keep correct offsets.
const c = tagger.tokenize('Hello, world!')
assert.equal(c.length, 2)
// "Hello" has no POS slot (interjection); it survives because it has word characters.
assert.deepEqual(tok(c, 0), { text: 'Hello', pos: '', start: 0, end: 5 })
// "world" is a noun
assert.equal(c[1].text, 'world')
assert.equal(c[1].start, 7)
assert.equal(c[1].end, 12)

console.log('checkTagger OK')

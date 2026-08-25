import assert from 'node:assert/strict'
import { compilePattern, tryCompile, PatternError, POS_TAGS } from './pattern.ts'

// Literal + single POS slot.
let p = compilePattern('with a [adj] [noun]')
assert.equal(p.matchers.length, 4)
assert.equal(p.matchers[0].kind, 'literal')
assert.equal(p.matchers[0].kind === 'literal' && p.matchers[0].value, 'with')
assert.equal(p.matchers[2].kind, 'pos')
assert.equal(p.matchers[2].kind === 'pos' && p.matchers[2].tag, 'adj')
assert.equal(p.matchers[2].kind === 'pos' && p.matchers[2].min, 1)
assert.equal(p.matchers[2].kind === 'pos' && p.matchers[2].max, 1)

// Quantifiers: ?, +, {n}, {n,m}, {n,}
p = compilePattern('[adj]? [noun]+ [verb]{2} [adv]{1,3} [det]{2,}')
const q = (i: number) => {
  const m = p.matchers[i]
  assert.ok(m.kind === 'pos', `matcher ${i} should be pos`)
  return { min: m.min, max: m.max }
}
assert.deepEqual(q(0), { min: 0, max: 1 })
assert.deepEqual(q(1), { min: 1, max: Infinity })
assert.deepEqual(q(2), { min: 2, max: 2 })
assert.deepEqual(q(3), { min: 1, max: 3 })
assert.deepEqual(q(4), { min: 2, max: Infinity })

// Unknown tag is a PatternError.
assert.throws(() => compilePattern('[foobar]'), PatternError)
// Unclosed bracket.
assert.throws(() => compilePattern('[adj'), PatternError)
// Bad quantifier.
assert.throws(() => compilePattern('[adj]x'), PatternError)
// max < min.
assert.throws(() => compilePattern('[adj]{3,1}'), PatternError)
// Empty pattern.
assert.throws(() => compilePattern('   '), PatternError)
// Bracket not wrapping a whole token.
assert.throws(() => compilePattern('foo[bar]'), PatternError)

// Edge punctuation in a pattern token is stripped (source punctuation is dropped at tokenization).
// Seed rule with a comma compiles to literals + slots, no bad-quantifier error.
p = compilePattern('not just [noun], but [noun]')
assert.equal(p.matchers.length, 5)
assert.equal(p.matchers[2].kind === 'pos' && p.matchers[2].tag, 'noun')
assert.equal(p.matchers[3].kind === 'literal' && p.matchers[3].value, 'but')

// tryCompile returns the pattern or an error string.
const ok = tryCompile('[adj] and [adj]')
assert.ok('pattern' in ok)
const bad = tryCompile('[nope]')
assert.ok('error' in bad && typeof bad.error === 'string')

// All declared POS tags are the canonical set the matcher/panel share.
assert.deepEqual([...POS_TAGS], ['adj', 'verb', 'noun', 'adv', 'det', 'prep', 'conj', 'pron'])

// Case-sensitivity flag is carried on literal matchers.
const cs = compilePattern('The [noun]', true)
assert.equal(cs.matchers[0].kind === 'literal' && cs.matchers[0].caseSensitive, true)

console.log('checkPattern OK')

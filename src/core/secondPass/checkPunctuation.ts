import assert from 'node:assert'
import { normalizePunctuation, punctuationStream } from './punctuation.ts'
import { defaultSecondPassRules } from './defaultRules.ts'

const rules = defaultSecondPassRules()
const norm = (t: string) => normalizePunctuation(t, rules)

// The whole point: a dash between clauses becomes a comma.
assert.equal(norm('She paused — then left.'), 'She paused, then left.')
assert.equal(norm('She paused—then left.'), 'She paused, then left.')
assert.equal(norm('She paused – then left.'), 'She paused, then left.')

// A range is arithmetic, not punctuation.
assert.equal(norm('pages 5–10'), 'pages 5-10')

// Cut off mid-line: the sentence just stops, so a comma would be wrong.
assert.equal(norm('"I wasn\'t going to—"'), '"I wasn\'t going to"')
assert.equal(norm('He said, "wait—'), 'He said, "wait')

assert.equal(norm('“Hi,” she said… ‘really’'), '"Hi," she said... \'really\'')

// Code spans and URLs are the author's, not the model's prose.
assert.equal(norm('use `a — b` here'), 'use `a — b` here')

// A user who turned the rule off wants the character.
const off = rules.map((r) => (r.id === 'default:em-dash' ? { ...r, enabled: false } : r))
assert.equal(normalizePunctuation('a — b', off), 'a — b')

// Streaming has to reach the same answer however the chunks fall, which is the failure the tail
// buffer exists to prevent: a chunk ending on the dash has no right-hand side to decide with yet.
for (const size of [1, 2, 3, 5, 11]) {
  const source = 'She paused — then left. Wait—no. pages 5–10 and “done”.'
  const stream = punctuationStream(rules)
  let out = ''
  for (let i = 0; i < source.length; i += size) out += stream.push(source.slice(i, i + size))
  out += stream.flush()
  assert.equal(out, norm(source), `chunk size ${size}`)
}

console.log('checkPunctuation: ok')

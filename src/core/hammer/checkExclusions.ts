import assert from 'node:assert/strict'
import { computeExclusions } from './exclusions.ts'

function ranges(text: string): string {
  return JSON.stringify(computeExclusions(text))
}

// Fenced code block: the whole block is one range.
assert.deepEqual(
  computeExclusions('Before\n```js\nconst x = 1\n```\nAfter'),
  [[7, 28]],
)

// Inline code span.
assert.deepEqual(computeExclusions('Use `foo()` now'), [[4, 11]])

// Bare URL, trailing period trimmed.
assert.deepEqual(computeExclusions('See https://example.com. Then'), [[4, 23]])

// Markdown link: the URL target is excluded (merged with the bare-URL scan into one range).
const link = computeExclusions('See [the docs](https://example.com) now')
assert.equal(link.length, 1)
assert.equal(link[0][0], 15)
assert.equal(link[0][1], 34)

// LaTeX block and inline.
assert.deepEqual(computeExclusions('Math $$a = b$$ done'), [[5, 14]])
const m = computeExclusions('Inline $x + 1$ here')
assert.equal(m.length, 1)
assert.equal(m[0][0], 7)
assert.equal(m[0][1], 14)

// A fenced block shields its contents from inline-code scanning (no double-range inside).
const fenced = computeExclusions('```\n`x`\n```')
assert.equal(fenced.length, 1)

// Unclosed fence excludes to end.
assert.deepEqual(computeExclusions('Text\n```\nrun away'), [[5, 17]])

// No exclusions in plain prose.
assert.deepEqual(computeExclusions('Just a normal sentence.'), [])

// Ranges come back sorted by start.
const mixed = computeExclusions('`a` https://b.com [t](u)')
const starts = mixed.map((r) => r[0])
const sorted = [...starts].sort((x, y) => x - y)
assert.deepEqual(starts, sorted)

// Ranges are merged when overlapping.
void ranges

console.log('checkExclusions OK')

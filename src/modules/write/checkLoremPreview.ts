import assert from 'node:assert'
import { loremParagraphs } from './loremPreview.ts'

const count = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

assert.equal(loremParagraphs(0), '')
assert.equal(loremParagraphs(-5), '')

// Exact word counts, across sizes and enough runs to hit both paragraph shapes and the fold-in
// branch for a short tail.
for (const n of [1, 7, 19, 20, 55, 140, 300, 1200]) {
  for (let i = 0; i < 40; i++) {
    const text = loremParagraphs(n)
    assert.equal(count(text), n, `expected ${n} words`)
    // No empty or whitespace-only paragraph — that would show as a gap with nothing in it.
    for (const p of text.split('\n\n')) assert.ok(p.trim(), 'empty paragraph')
  }
}

// Something long has to actually break into paragraphs, or the feature shows a wall of text.
assert.ok(loremParagraphs(1200).includes('\n\n'))

console.log('checkLoremPreview ok')

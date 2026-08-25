// Run: node --experimental-strip-types src/core/prompt/checkStripDepthTags.ts
import assert from 'node:assert'
import type { TagRule } from '../stores/settingsStore.ts'
import { stripDepthTags } from './buildPrompt.ts'

const ooc: TagRule = { id: '1', open: '<OOC>', close: '</OOC>', mode: 'hide', depth: 1 }
const body = 'hello\n<OOC>meta</OOC>\nworld'

// Within depth: last message (distance 1) keeps the block.
assert.equal(stripDepthTags(body, 1, [ooc]), body)
// Older than depth: distance 2 > 1 strips it; the newlines that flanked it stay as one gap.
assert.equal(stripDepthTags(body, 2, [ooc]), 'hello\n\nworld')

// No depth set = display-only, never stripped even when very old.
const noDepth: TagRule = { id: '2', open: '<x>', close: '</x>', mode: 'hide' }
assert.equal(stripDepthTags('a<x>y</x>b', 99, [noDepth]), 'a<x>y</x>b')

// Unclosed opener is literal, left alone.
assert.equal(stripDepthTags('a<OOC>y', 5, [ooc]), 'a<OOC>y')

// Multiple blocks of the same tag both go.
assert.equal(stripDepthTags('<OOC>a</OOC>x<OOC>b</OOC>', 5, [ooc]), 'x')

// No rules / no change returns the input untouched (whitespace preserved).
assert.equal(stripDepthTags('  keep  ', 5, []), '  keep  ')

console.log('checkStripDepthTags: ok')

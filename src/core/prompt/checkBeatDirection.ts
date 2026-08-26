// Run: node --experimental-strip-types src/core/prompt/checkBeatDirection.ts
import assert from 'node:assert'
import { beatDirection } from './beatDirection.ts'

// --- the plain case: header, beat, nothing else -------------------------------
assert.strictEqual(
  beatDirection("Mary discovers that John isn't who he says he is", 200, ''),
  "Write the next beat in about 200 words:\nMary discovers that John isn't who he says he is",
)

// --- a target of 0 is unset, so the word clause goes -------------------------
assert.strictEqual(beatDirection('Mary escapes', 0, ''), 'Write the next beat:\nMary escapes')

// --- the Direction box rides after the beat, one blank line down -------------
assert.strictEqual(
  beatDirection('Mary escapes', 300, 'Keep it in her point of view.'),
  'Write the next beat in about 300 words:\nMary escapes\n\nKeep it in her point of view.',
)
assert.strictEqual(
  beatDirection('Mary escapes', 0, 'Keep it in her point of view.'),
  'Write the next beat:\nMary escapes\n\nKeep it in her point of view.',
)

// --- whitespace-only inputs behave as empty ----------------------------------
assert.strictEqual(beatDirection('  Mary escapes \n', 0, '   '), 'Write the next beat:\nMary escapes')

// --- an empty beat leaves the box contents as the whole Direction ------------
assert.strictEqual(beatDirection('', 200, 'Something else'), 'Something else')
assert.strictEqual(beatDirection('   ', 200, ''), '')

console.log('ok')

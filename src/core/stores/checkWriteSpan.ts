// Run: node --experimental-strip-types src/core/stores/checkWriteSpan.ts
import assert from 'node:assert'
import { spanChapter, validSpan, type SpanChapter } from './writeSpan.ts'

const chapter = (c: Partial<SpanChapter>): SpanChapter => ({ id: 1, text: '', ...c })

// --- an intact span is usable ------------------------------------------------
{
  // "He opened the door. She was gone." — the generation wrote " She was gone."
  const c = chapter({
    text: 'He opened the door. She was gone.',
    lastGeneration: { start: 19, end: 33, text: ' She was gone.', direction: 'end the scene' },
  })
  const span = validSpan(c)
  assert.ok(span, 'the span reads back exactly, so it is live')
  assert.strictEqual(span!.direction, 'end the scene')
  // The offsets are what Undo would cut, and cutting them restores the prose exactly.
  assert.strictEqual(c.text.slice(0, span!.start) + c.text.slice(span!.end), 'He opened the door.')
}

// --- an edit inside the span kills it ----------------------------------------
{
  const edited = chapter({
    text: 'He opened the door. She was long gone.',
    lastGeneration: { start: 19, end: 33, text: ' She was gone.', direction: 'end the scene' },
  })
  assert.strictEqual(validSpan(edited), null, 'typing inside the generated text drops the span')
}

// --- an edit *before* the span shifts it out of place, which also kills it ----
{
  const shifted = chapter({
    text: 'He slowly opened the door. She was gone.',
    lastGeneration: { start: 19, end: 33, text: ' She was gone.', direction: 'go' },
  })
  assert.strictEqual(validSpan(shifted), null)
}

// --- an edit after the span leaves it alone ----------------------------------
{
  const appended = chapter({
    text: 'He opened the door. She was gone. He sat down.',
    lastGeneration: { start: 19, end: 33, text: ' She was gone.', direction: 'go' },
  })
  assert.ok(validSpan(appended), 'text added after the span does not move it')
}

// --- no span at all ----------------------------------------------------------
assert.strictEqual(validSpan(chapter({ text: 'prose' })), null)
assert.strictEqual(validSpan(undefined), null)
assert.strictEqual(validSpan(null), null)

// --- a truncated Chapter can't produce a false positive ----------------------
{
  // slice() clamps rather than throwing, so a span past the end must be rejected by the compare.
  const cut = chapter({
    text: 'He opened',
    lastGeneration: { start: 19, end: 33, text: ' She was gone.', direction: 'go' },
  })
  assert.strictEqual(validSpan(cut), null)
  // An empty span text would otherwise match the empty slice of any clamped range.
  const empty = chapter({
    text: 'He opened',
    lastGeneration: { start: 50, end: 50, text: '', direction: 'go' },
  })
  assert.strictEqual(validSpan(empty)?.text, '', 'an empty span is degenerate but harmless')
}

// --- spanChapter picks who the buttons act on --------------------------------
{
  const live = { start: 0, end: 5, text: 'alpha', direction: 'd' }
  const dead = { start: 0, end: 5, text: 'omega', direction: 'd' }
  const one = chapter({ id: 1, text: 'alpha one', lastGeneration: live })
  const two = chapter({ id: 2, text: 'alpha two', lastGeneration: live })
  const none = chapter({ id: 3, text: 'alpha three' })
  const stale = chapter({ id: 4, text: 'alpha four', lastGeneration: dead })

  // The active Chapter wins when its own span is intact.
  assert.strictEqual(spanChapter([one, two], 1)?.id, 1)
  assert.strictEqual(spanChapter([one, two], 2)?.id, 2)

  // The active Chapter has no span: fall back to the last Chapter that does. This is the reload
  // case, where activeChapterId resets to the last Chapter.
  assert.strictEqual(spanChapter([one, two, none], 3)?.id, 2)
  assert.strictEqual(spanChapter([one, none], 3)?.id, 1)

  // A stale span is not a candidate, as an active Chapter or as a fallback.
  assert.strictEqual(spanChapter([stale], 4), null)
  assert.strictEqual(spanChapter([one, stale], 4)?.id, 1)

  // Nothing anywhere.
  assert.strictEqual(spanChapter([none], 3), null)
  assert.strictEqual(spanChapter([], null), null)
}

console.log('checkWriteSpan ok')

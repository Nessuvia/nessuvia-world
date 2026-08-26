// Run: node --experimental-strip-types src/modules/write/checkBeatSlots.ts
import assert from 'node:assert'
import { beatText, emptyBeat, storedBeat, withBeats } from './beatSlots.ts'
import { beatBlocks } from '../../core/prompt/chapterGuide.ts'
import type { Block } from '../../core/storage/types.ts'

let n = 0
const beat = (beat: string, content = ''): Block => ({
  id: `b${++n}`,
  beat,
  done: false,
  targetWords: 0,
  content,
  context: 'both',
})
const free = (content: string): Block => ({
  id: `f${++n}`,
  beat: '',
  done: false,
  targetWords: 0,
  content,
  context: 'both',
})
const ids = (blocks: Block[]) => blocks.map((b) => b.id).join(',')

// --- the bug this file exists for: a fresh beat is ' ', and typing into it ----
{
  // A new beat is seeded with ' ' so it is structurally a beat before it says anything. `beatBlocks`
  // counts it; the slot scan has to count it too, or the write appends instead of replacing.
  const fresh = beat(' ')
  const chapter = { blocks: [free('opening'), fresh] }
  assert.strictEqual(beatBlocks(chapter).length, 1)

  let blocks = chapter.blocks
  // Type "Hi", one keystroke at a time, the way the input does.
  for (const typed of ['H', 'Hi']) {
    const beats = beatBlocks({ blocks })
    blocks = withBeats({ blocks }, beats.map((b) => (b.id === fresh.id ? { ...b, beat: typed } : b)))
    assert.strictEqual(blocks.length, 2, `grew to ${blocks.length} blocks on "${typed}"`)
  }
  assert.strictEqual(beatBlocks({ blocks })[0].beat, 'Hi')
}

// --- free stretches keep their positions --------------------------------------
{
  const a = beat('a')
  const b = beat('b')
  const chapter = { blocks: [free('one'), a, free('two'), b, free('three')] }
  const out = withBeats(chapter, [{ ...a, beat: 'A' }, { ...b, beat: 'B' }])
  assert.strictEqual(ids(out), ids(chapter.blocks))
  assert.strictEqual(out[1].beat, 'A')
  assert.strictEqual(out[3].beat, 'B')
}

// --- reordering lands in the slots, it doesn't append -------------------------
{
  const a = beat('a')
  const b = beat('b')
  const chapter = { blocks: [free('one'), a, free('two'), b] }
  const out = withBeats(chapter, [b, a])
  assert.strictEqual(out.length, 4)
  // The free stretches did not move; the beats swapped the slots they sat in.
  assert.strictEqual(ids(out), `${chapter.blocks[0].id},${b.id},${chapter.blocks[2].id},${a.id}`)
}

// --- removing a beat drops its slot, and its prose with it --------------------
{
  const a = beat('a', 'prose a')
  const b = beat('b', 'prose b')
  const chapter = { blocks: [free('one'), a, b, free('two')] }
  const out = withBeats(chapter, [b])
  assert.strictEqual(out.length, 3)
  assert.ok(!out.some((x) => x.id === a.id))
  assert.ok(out.some((x) => x.content === 'one') && out.some((x) => x.content === 'two'))
}

// --- adding a beat lands it after everything ----------------------------------
{
  const a = beat('a')
  const added = beat(' ')
  const chapter = { blocks: [a, free('tail')] }
  const out = withBeats(chapter, [a, added])
  assert.strictEqual(ids(out), `${a.id},${chapter.blocks[1].id},${added.id}`)
}

// --- a Chapter with no beats at all -------------------------------------------
{
  const chapter = { blocks: [free('just prose')] }
  assert.strictEqual(ids(withBeats(chapter, [])), ids(chapter.blocks))
  const added = beat(' ')
  assert.strictEqual(ids(withBeats(chapter, [added])), `${chapter.blocks[0].id},${added.id}`)
}

// --- the empty sentinel round-trips, and never reaches the input ------------
{
  // A fresh beat opens with an empty field, so the placeholder shows and the caret has nothing to
  // push along in front of it.
  assert.strictEqual(beatText(emptyBeat), '')
  assert.strictEqual(storedBeat(''), emptyBeat)
  assert.strictEqual(beatText(storedBeat('')), '')
  // Real text passes through both ways, trailing space and all - it is the Author's.
  assert.strictEqual(beatText('Mary escapes'), 'Mary escapes')
  assert.strictEqual(storedBeat('Mary escapes'), 'Mary escapes')
  assert.strictEqual(beatText('Mary escapes '), 'Mary escapes ')
  // A pasted newline flattens: a beat is one line in the Chapter guide.
  assert.strictEqual(storedBeat('Mary escapes\n  the checkpoint'), 'Mary escapes the checkpoint')
  // Whitespace-only input is still an empty beat, not a Block that quietly became free prose.
  assert.strictEqual(storedBeat('\n'), emptyBeat)
  assert.notStrictEqual(storedBeat(''), '')
}

console.log('checkBeatSlots ok')

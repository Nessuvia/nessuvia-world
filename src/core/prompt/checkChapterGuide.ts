// Run: node --experimental-strip-types src/core/prompt/checkChapterGuide.ts
import assert from 'node:assert'
import { chapterState, hasProse, storyProse, type GuideChapter } from './chapterGuide.ts'
import type { Block } from '../storage/types.ts'

let b = 0
/** A beat Block: instructions, and no prose unless some is given. */
function beat(text: string, content = ''): Block {
  return { id: `b${++b}`, beat: text, weight: 'normal', content, context: 'both' }
}
/** A beat the Author has not planned: prose with no instructions. */
function free(content: string): Block {
  return { id: `f${++b}`, beat: '', weight: 'normal', content, context: 'both' }
}

let n = 0
/** `prose` is shorthand for a trailing free Block. Most cases here only care that the Chapter has
 *  some prose, not which Block holds it. */
function ch(c: Partial<GuideChapter> & { prose?: string; beats?: Block[] }): GuideChapter {
  const { prose, beats, blocks, ...rest } = c
  return {
    id: ++n,
    title: `Chapter ${n}`,
    summary: '',
    blocks: blocks ?? [...(beats ?? []), ...(prose === undefined ? [] : [free(prose)])],
    guideSend: 'both',
    ...rest,
  }
}

// --- has prose is any Block holding non-whitespace text ----------------------
assert.strictEqual(hasProse({ blocks: [] }), false)
assert.strictEqual(hasProse({ blocks: [free(''), beat('a plan')] }), false)
assert.strictEqual(hasProse({ blocks: [free('  \n ')] }), false)
assert.strictEqual(hasProse({ blocks: [free(''), free('a')] }), true)
// A beat carries prose the same way a free stretch does.
assert.strictEqual(hasProse({ blocks: [beat('a plan', 'a')] }), true)

// --- state comes from two facts: prose, and being active ---------------------
{
  const written = ch({ id: 1, prose: 'prose' })
  const planned = ch({ id: 2 })
  assert.strictEqual(chapterState(written, null), 'written')
  assert.strictEqual(chapterState(planned, null), 'notYetWritten')
  // Active wins over both: an active Chapter with prose is still being written.
  assert.strictEqual(chapterState(written, 1), 'writingNow')
  assert.strictEqual(chapterState(planned, 2), 'writingNow')
}

// --- prose stops at the active Chapter, with dividers between ----------------
{
  const chapters = [
    ch({ id: 1, title: 'One', prose: 'first prose' }),
    ch({ id: 2, title: 'Two', prose: 'second prose' }),
    ch({ id: 3, title: 'Three', prose: 'third prose' }),
  ]
  assert.strictEqual(
    storyProse(chapters, 2),
    'first prose\n\n- Chapter 2: Two -\n\nsecond prose',
  )
  // The Chapter after the active one is the future; its prose is not context yet.
  assert.ok(!storyProse(chapters, 2).includes('third prose'))
  // No active Chapter (a Story opened but never clicked into) falls back to the last one.
  assert.ok(storyProse(chapters, null).includes('third prose'))
  // One Chapter looks like plain prose, no divider.
  assert.strictEqual(storyProse([ch({ id: 1, title: 'One', prose: 'prose' })], 1), 'prose')
}

// --- an empty Chapter contributes its divider but no blank gap ---------------
{
  const chapters = [ch({ id: 1, title: 'One', prose: 'prose' }), ch({ id: 2, title: 'Two' })]
  assert.strictEqual(storyProse(chapters, 2), 'prose\n\n- Chapter 2: Two -')
  // A cold-start Story has nothing to send.
  assert.strictEqual(storyProse([ch({ id: 1 })], 1), '')
}

// --- guideSend does nothing while the prose still fits ------------------------
{
  // It is read only by the degrade ladder (see checkStoryProseFit.ts). Undegraded prose sends
  // whatever it says, including 'off'.
  const chapters = [
    ch({ id: 1, title: 'One', guideSend: 'off', prose: 'first prose' }),
    ch({ id: 2, title: 'Two', prose: 'second prose' }),
  ]
  assert.ok(storyProse(chapters, 2).includes('first prose'))
}

console.log('checkChapterGuide ok')

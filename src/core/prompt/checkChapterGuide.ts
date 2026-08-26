// Run: node --experimental-strip-types src/core/prompt/checkChapterGuide.ts
import assert from 'node:assert'
import {
  chapterState,
  hasProse,
  renderChapterGuide,
  storyProse,
  type GuideChapter,
} from './chapterGuide.ts'
import type { Block } from '../storage/types.ts'

let b = 0
/** A beat Block: a plan line, and no prose unless one is given. */
function beat(text: string, done = false, content = ''): Block {
  return { id: `b${++b}`, beat: text, done, targetWords: 0, content, context: 'both' }
}
/** A free Block: prose with no plan line. */
function free(content: string): Block {
  return { id: `f${++b}`, beat: '', done: false, targetWords: 0, content, context: 'both' }
}

let n = 0
/** `prose` is shorthand for a trailing free Block — most cases here only care that the Chapter has
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
assert.strictEqual(hasProse({ blocks: [beat('a plan', false, 'a')] }), true)

// --- state comes from two facts: prose, and being active ---------------------
{
  const written = ch({ id: 1, prose: 'prose' })
  const planned = ch({ id: 2 })
  assert.strictEqual(chapterState(written, null), 'written')
  assert.strictEqual(chapterState(planned, null), 'notYetWritten')
  // Active wins over both — an active Chapter with prose is still being written.
  assert.strictEqual(chapterState(written, 1), 'writingNow')
  assert.strictEqual(chapterState(planned, 2), 'writingNow')
}

// --- the shape of a full guide: summary, then beats, under every Chapter ------
{
  const out = renderChapterGuide(
    [
      ch({ id: 1, title: 'Arrival', summary: 'They meet on the platform.', prose: 'prose' }),
      ch({
        id: 2,
        title: 'Ruin',
        summary: 'He gets her as far as the house.',
        beats: [beat('John invites Mary over', true), beat('Mary discovers the truth')],
      }),
      ch({ id: 3, title: 'Escape', beats: [beat('Mary tries to escape')] }),
    ],
    2,
  )
  assert.strictEqual(
    out,
    [
      'Chapter 1 — Arrival [written]',
      '  They meet on the platform.',
      'Chapter 2 — Ruin [writing now]',
      '  He gets her as far as the house.',
      '  · John invites Mary over [done]',
      '  · Mary discovers the truth',
      'Chapter 3 — Escape [not yet written]',
      '  · Mary tries to escape',
    ].join('\n'),
  )
  // No `Beats:` header any more — the bullets carry it, on every Chapter.
  assert.ok(!out.includes('Beats:'))
}

// --- beats render for non-active Chapters too --------------------------------
{
  const chapters = [ch({ id: 1, beats: [beat('a beat')] }), ch({ id: 2, beats: [beat('another')] })]
  const out = renderChapterGuide(chapters, 2)
  assert.ok(out.includes('a beat'))
  assert.ok(out.includes('another'))
}

// --- each guideSend value emits its own half ---------------------------------
{
  const parts = { summary: 'a recap', beats: [beat('a plan')] }
  const both = renderChapterGuide([ch({ id: 1, title: 'A', ...parts })], null)
  assert.strictEqual(both, 'Chapter 1 — A [not yet written]\n  a recap\n  · a plan')

  const beatsOnly = renderChapterGuide([ch({ id: 1, title: 'A', guideSend: 'beats', ...parts })], null)
  assert.strictEqual(beatsOnly, 'Chapter 1 — A [not yet written]\n  · a plan')

  const summaryOnly = renderChapterGuide([ch({ id: 1, title: 'A', guideSend: 'summary', ...parts })], null)
  assert.strictEqual(summaryOnly, 'Chapter 1 — A [not yet written]\n  a recap')

  assert.strictEqual(renderChapterGuide([ch({ id: 1, guideSend: 'off', ...parts })], null), '')
}

// --- 'off' drops rows without renumbering the rest ---------------------------
{
  const out = renderChapterGuide(
    [ch({ id: 1, title: 'One' }), ch({ id: 2, title: 'Two', guideSend: 'off' }), ch({ id: 3, title: 'Three' })],
    null,
  )
  assert.ok(out.includes('Chapter 1 — One'))
  assert.ok(!out.includes('Two'))
  // Three keeps its position in the Story rather than becoming Chapter 2.
  assert.ok(out.includes('Chapter 3 — Three'))
}

// --- empty pieces drop out ----------------------------------------------------
{
  assert.strictEqual(renderChapterGuide([], null), '')
  // No title, no summary, no beats: still one row, so the model sees the Chapter exists.
  assert.strictEqual(renderChapterGuide([ch({ id: 1, title: '' })], null), 'Chapter 1 [not yet written]')
  // A blank beat contributes no bullet.
  assert.strictEqual(
    renderChapterGuide([ch({ id: 1, title: 'A', beats: [beat('  ')] })], 1),
    'Chapter 1 — A [writing now]',
  )
}

// --- a multi-line summary keeps its indent ------------------------------------
{
  const out = renderChapterGuide([ch({ id: 1, title: 'A', summary: 'one\ntwo' })], null)
  assert.strictEqual(out, 'Chapter 1 — A [not yet written]\n  one\n  two')
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
    'first prose\n\n— Chapter 2: Two —\n\nsecond prose',
  )
  // The Chapter after the active one is the future; its prose is not context yet.
  assert.ok(!storyProse(chapters, 2).includes('third prose'))
  // No active Chapter (a Story opened but never clicked into) falls back to the last one.
  assert.ok(storyProse(chapters, null).includes('third prose'))
  // One Chapter reads as plain prose — no divider.
  assert.strictEqual(storyProse([ch({ id: 1, title: 'One', prose: 'prose' })], 1), 'prose')
}

// --- an empty Chapter contributes its divider but no blank gap ---------------
{
  const chapters = [ch({ id: 1, title: 'One', prose: 'prose' }), ch({ id: 2, title: 'Two' })]
  assert.strictEqual(storyProse(chapters, 2), 'prose\n\n— Chapter 2: Two —')
  // A cold-start Story has nothing to send.
  assert.strictEqual(storyProse([ch({ id: 1 })], 1), '')
}

console.log('checkChapterGuide ok')

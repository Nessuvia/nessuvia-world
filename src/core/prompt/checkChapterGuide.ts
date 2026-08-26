// Run: node --experimental-strip-types src/core/prompt/checkChapterGuide.ts
import assert from 'node:assert'
import {
  chapterState,
  hasProse,
  renderChapterGuide,
  storyProse,
  storyProseSplit,
  type GuideChapter,
} from './chapterGuide.ts'
import type { Beat } from '../storage/types.ts'

let n = 0
function ch(c: Partial<GuideChapter>): GuideChapter {
  return { id: ++n, title: `Chapter ${n}`, summary: '', beats: [], guideSend: 'both', text: '', ...c }
}

let b = 0
function beat(text: string, done = false, targetWords = 0): Beat {
  return { id: `b${++b}`, text, done, targetWords }
}

// --- has prose is any non-whitespace text ------------------------------------
assert.strictEqual(hasProse({ text: '' }), false)
assert.strictEqual(hasProse({ text: '  \n ' }), false)
assert.strictEqual(hasProse({ text: 'a' }), true)

// --- state comes from two facts: prose, and being active ---------------------
{
  const written = ch({ id: 1, text: 'prose' })
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
      ch({ id: 1, title: 'Arrival', summary: 'They meet on the platform.', text: 'prose' }),
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
    ch({ id: 1, title: 'One', text: 'first prose' }),
    ch({ id: 2, title: 'Two', text: 'second prose' }),
    ch({ id: 3, title: 'Three', text: 'third prose' }),
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
  assert.strictEqual(storyProse([ch({ id: 1, title: 'One', text: 'prose' })], 1), 'prose')
}

// --- an empty Chapter contributes its divider but no blank gap ---------------
{
  const chapters = [ch({ id: 1, title: 'One', text: 'prose' }), ch({ id: 2, title: 'Two' })]
  assert.strictEqual(storyProse(chapters, 2), 'prose\n\n— Chapter 2: Two —')
  // A cold-start Story has nothing to send.
  assert.strictEqual(storyProse([ch({ id: 1 })], 1), '')
}

// --- the caret split -------------------------------------------------------
{
  const chapters = [
    ch({ id: 1, title: 'One', text: 'first prose' }),
    ch({ id: 2, title: 'Two', text: 'second prose' }),
    ch({ id: 3, title: 'Three', text: 'third prose' }),
  ]

  // The active Chapter is cut at the caret; everything before it is context as usual.
  const split = storyProseSplit(chapters, 2, 'second'.length)
  assert.strictEqual(split.text, 'first prose\n\n— Chapter 2: Two —\n\nsecond')
  assert.strictEqual(split.trailing, ' prose')

  // The trailing text stops at the end of the active Chapter — later Chapters stay out of both
  // halves, which is the whole point of the split being Chapter-bounded.
  assert.ok(!split.trailing.includes('third prose'))
  assert.ok(!split.text.includes('third prose'))

  // No caret is the old behaviour, character for character, on both sides.
  assert.strictEqual(storyProseSplit(chapters, 2).text, storyProse(chapters, 2))
  assert.strictEqual(storyProseSplit(chapters, 2).trailing, '')

  // A caret at the very end leaves nothing trailing, so a Direct with the caret parked at the end
  // of the prose sends exactly what it always did.
  const atEnd = storyProseSplit(chapters, 2, 'second prose'.length)
  assert.strictEqual(atEnd.text, storyProse(chapters, 2))
  assert.strictEqual(atEnd.trailing, '')

  // A caret at the start hands the whole active Chapter over as trailing text.
  const atStart = storyProseSplit(chapters, 2, 0)
  assert.strictEqual(atStart.trailing, 'second prose')
  assert.strictEqual(atStart.text, 'first prose\n\n— Chapter 2: Two —')

  // Out-of-range offsets clamp rather than producing a silent empty split.
  assert.strictEqual(storyProseSplit(chapters, 2, -5).trailing, 'second prose')
  assert.strictEqual(storyProseSplit(chapters, 2, 9999).trailing, '')

  // The split falls on the *active* Chapter, not the last one.
  assert.strictEqual(storyProseSplit(chapters, 1, 'first'.length).trailing, ' prose')
}

console.log('ok')

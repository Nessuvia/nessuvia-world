// Run: node --experimental-strip-types src/core/prompt/checkChapterGuideTrim.ts
//
// The three-stage trim is the branchiest thing in the guide, so it gets its own check. `count` is
// lines rather than tokens: the trim's job is the ladder, not the tokenizer, and a line budget
// makes every allowance below readable by eye.
import assert from 'node:assert'
import {
  earlierChaptersMarker,
  renderChapterGuide,
  renderChapterGuideWithin,
  type GuideChapter,
} from './chapterGuide.ts'
import type { Beat } from '../storage/types.ts'

const lines = (s: string) => (s === '' ? 0 : s.split('\n').length)

let b = 0
const beat = (text: string): Beat => ({ id: `b${++b}`, text, done: false, targetWords: 0 })

function ch(c: Partial<GuideChapter> & { id: number }): GuideChapter {
  return { title: `Chapter ${c.id}`, summary: '', beats: [], guideSend: 'both', text: '', ...c }
}

// Chapter 3 is the active one. Full render is 11 lines: 4 + 3 + 2 + 2.
const chapters = [
  ch({ id: 1, title: 'One', summary: 'recap one', beats: [beat('one beat a'), beat('one beat b')] }),
  ch({ id: 2, title: 'Two', summary: 'recap two', beats: [beat('two beat')] }),
  ch({ id: 3, title: 'Three', beats: [beat('three beat')] }),
  ch({ id: 4, title: 'Four', beats: [beat('four beat')] }),
]
const fit = (allowance: number) => renderChapterGuideWithin(chapters, 3, allowance, lines)

assert.strictEqual(lines(renderChapterGuide(chapters, 3)), 11)

// --- fits without trimming: byte-for-byte the untrimmed guide, and no marker --
{
  const out = fit(11)
  assert.strictEqual(out, renderChapterGuide(chapters, 3))
  assert.ok(!out.includes(earlierChaptersMarker))
}

// --- stage 1: the earliest Chapter demotes to its summary, one at a time -----
{
  const out = fit(10)
  assert.ok(out.startsWith(earlierChaptersMarker))
  assert.ok(out.includes('recap one')) // kept: the recap is what summary is for
  assert.ok(!out.includes('one beat a')) // lost: beats of a Chapter already behind us
  assert.ok(out.includes('recap two') && out.includes('two beat')) // Chapter 2 untouched
  assert.strictEqual(lines(out), 10)

  // One more rung of the same stage takes Chapter 2's beats too.
  const tighter = fit(9)
  assert.ok(tighter.includes('recap two'))
  assert.ok(!tighter.includes('two beat'))
}

// --- stage 2: summaries give way to title rows, earliest first ---------------
{
  const out = fit(8)
  assert.ok(!out.includes('recap one'))
  assert.ok(out.includes('Chapter 1 — One'))
  assert.ok(out.includes('recap two')) // still on the gentler rung
  assert.strictEqual(lines(out), 8)

  const tighter = fit(7)
  assert.ok(!tighter.includes('recap two'))
  assert.ok(tighter.includes('Chapter 2 — Two'))
}

// --- stage 3: the earliest Chapters go entirely --------------------------------
{
  const out = fit(6)
  assert.ok(!out.includes('Chapter 1'))
  assert.ok(out.includes('Chapter 2 — Two'))
  assert.strictEqual(lines(out), 6)

  const tighter = fit(5)
  assert.ok(!tighter.includes('Chapter 1') && !tighter.includes('Chapter 2'))
}

// --- the active Chapter and everything after it are never touched -------------
{
  // Well under what the floor alone costs: the guide overruns rather than dropping the Chapter
  // being written.
  const out = fit(1)
  assert.ok(out.includes('Chapter 3 — Three [writing now]'))
  assert.ok(out.includes('three beat'))
  // Chapter 4 is after the active one, so the trim never reaches it either.
  assert.ok(out.includes('Chapter 4 — Four'))
  assert.ok(out.includes('four beat'))
  assert.ok(lines(out) > 1)
}

// --- guideSend is an author override the trim reads but never rewrites --------
{
  const overridden = [
    ch({ id: 1, title: 'One', guideSend: 'summary', summary: 'recap one', beats: [beat('unsent beat')] }),
    ch({ id: 2, title: 'Two', guideSend: 'beats', summary: 'unsent recap', beats: [beat('two beat a'), beat('two beat b')] }),
    ch({ id: 3, title: 'Three', beats: [beat('three beat')] }),
  ]
  // 2 + 3 + 2 = 7 lines in full; neither Chapter's suppressed half is ever emitted.
  for (const allowance of [7, 6, 5, 4, 3, 2, 1]) {
    const out = renderChapterGuideWithin(overridden, 3, allowance, lines)
    assert.ok(!out.includes('unsent beat'), `beat leaked at ${allowance}`)
    assert.ok(!out.includes('unsent recap'), `recap leaked at ${allowance}`)
  }
  // A Chapter set to `beats` has no summary to fall back to, so stage 1 leaves it at its title row.
  const demoted = renderChapterGuideWithin(overridden, 3, 6, lines)
  assert.ok(demoted.includes('Chapter 2 — Two'))
  assert.ok(!demoted.includes('two beat a'))
}

// --- 'off' Chapters are filtered before "earliest" is decided ------------------
{
  const withOff = [
    ch({ id: 1, title: 'One', guideSend: 'off', summary: 'hidden', beats: [beat('hidden beat')] }),
    ch({ id: 2, title: 'Two', summary: 'recap two', beats: [beat('two beat a'), beat('two beat b')] }),
    ch({ id: 3, title: 'Three', beats: [beat('three beat')] }),
  ]
  const out = renderChapterGuideWithin(withOff, 3, 5, lines)
  assert.ok(!out.includes('hidden'))
  // Chapter 2 is the earliest that renders, so it is what gets demoted.
  assert.ok(out.includes('recap two') && !out.includes('two beat a'))
  // Numbering still counts position in the Story.
  assert.ok(out.includes('Chapter 2 — Two'))
  assert.strictEqual(renderChapterGuideWithin([withOff[0]], null, 1, lines), '')
}

// --- no active Chapter: the last rendered one is the floor ---------------------
{
  const out = renderChapterGuideWithin(chapters, null, 1, lines)
  assert.ok(out.includes('Chapter 4 — Four'))
  assert.ok(out.includes('four beat'))
  assert.ok(!out.includes('Chapter 1'))
}

// --- the marker appears only when something was removed, and is counted in ----
{
  assert.ok(!fit(11).includes(earlierChaptersMarker))
  assert.ok(fit(10).includes(earlierChaptersMarker))
  // Counted inside the fit: the returned string, marker and all, is within the allowance.
  for (const allowance of [11, 10, 9, 8, 7, 6, 5]) {
    assert.ok(lines(fit(allowance)) <= allowance, `overran at ${allowance}`)
  }
  // The marker never rides on a guide that is in fact intact: a rung that changed nothing (a
  // Chapter demoted to the text its mode was already emitting) doesn't claim a removal.
  for (const allowance of [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    const out = fit(allowance)
    if (out.includes(earlierChaptersMarker)) {
      assert.notStrictEqual(out, renderChapterGuide(chapters, 3), `false marker at ${allowance}`)
    }
  }
}

console.log('ok')

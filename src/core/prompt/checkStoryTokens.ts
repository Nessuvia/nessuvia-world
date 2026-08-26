import assert from 'node:assert'
import { storyTokens, swapStoryTokens, type StoryTokenArgs } from './storyTokens.ts'

const blk = (id: string, beat = '', targetWords = 0, done = false) => ({ id, beat, targetWords, done })

const args: StoryTokenArgs = {
  title: '  The Long Way  ',
  premise: 'A courier takes a job she should have refused.',
  ending: 'She refuses the second one.',
  castNames: ['Mary', '  ', 'John'],
  chapters: [
    { id: 1, title: 'Departure', summary: 'Mary leaves.', blocks: [blk('a', 'She packs', 0, true)] },
    {
      id: 2,
      title: 'The Road',
      summary: '',
      blocks: [
        blk('b', 'The checkpoint', 0, true),
        blk('c', 'Mary is searched', 300),
        blk('d', 'She lies about the parcel'),
        blk('e'), // free prose, no beat
      ],
    },
    { id: 3, title: 'Arrival', summary: '', blocks: [blk('f', 'The handoff'), blk('g', 'The refusal')] },
  ],
  chapterId: 2,
  blockId: 'c',
}

const t = storyTokens(args)

assert.strictEqual(t.storyTitle, 'The Long Way')
assert.strictEqual(t.premise, 'A courier takes a job she should have refused.')
assert.strictEqual(t.ending, 'She refuses the second one.')
// Blank cast names drop out rather than leaving empty lines.
assert.strictEqual(t.castNames, 'Mary, John')

assert.strictEqual(t.chapterNumber, '2')
assert.strictEqual(t.chapterCount, '3')
assert.strictEqual(t.chapterTitle, 'The Road')
assert.strictEqual(t.chapterSummary, '')
assert.strictEqual(t.previousChapterSummary, 'Mary leaves.')
assert.strictEqual(t.nextChapterTitle, 'Arrival')
assert.strictEqual(t.nextChapterBeats, '- The handoff\n- The refusal')

assert.strictEqual(t.beat, 'Mary is searched')
assert.strictEqual(t.beatTargetWords, '300')
// The current Block is in neither list, and the beatless free Block is in neither either.
assert.strictEqual(t.beatsDone, '- The checkpoint')
assert.strictEqual(t.beatsRemaining, '- She lies about the parcel')

// A target of 0 is unset, and reads blank rather than "0".
assert.strictEqual(storyTokens({ ...args, blockId: 'd' }).beatTargetWords, '')

// No cursor: every chapter- and beat-scoped token blanks, Story-scoped ones still resolve.
const none = storyTokens({ ...args, chapterId: null, blockId: null })
assert.strictEqual(none.chapterNumber, '')
assert.strictEqual(none.chapterTitle, '')
assert.strictEqual(none.previousChapterSummary, '')
assert.strictEqual(none.nextChapterBeats, '')
assert.strictEqual(none.beat, '')
assert.strictEqual(none.beatsRemaining, '')
assert.strictEqual(none.storyTitle, 'The Long Way')
assert.strictEqual(none.chapterCount, '3')

// First chapter has no previous; last has no next.
assert.strictEqual(storyTokens({ ...args, chapterId: 1, blockId: 'a' }).previousChapterSummary, '')
assert.strictEqual(storyTokens({ ...args, chapterId: 3, blockId: 'f' }).nextChapterTitle, '')

// Swapping: known tokens go, case folds, unknown ones survive untouched.
assert.strictEqual(
  swapStoryTokens('Chapter {{chapterNumber}} of {{CHAPTERCOUNT}}: {{chapterTitle}}', t),
  'Chapter 2 of 3: The Road',
)
assert.strictEqual(swapStoryTokens('{{char}} and {{nonsense}}', t), '{{char}} and {{nonsense}}')
assert.strictEqual(swapStoryTokens('', t), '')

// A line whose only known token is empty is dropped whole, sentence and all.
assert.strictEqual(swapStoryTokens('Recap: {{chapterSummary}}.', t), '')
assert.strictEqual(
  swapStoryTokens('Write this next: {{beat}}\nRecap: {{chapterSummary}}.\nKeep going.', t),
  'Write this next: Mary is searched\nKeep going.',
)
// Mixed line: one token has content, so the line stays and the empty one blanks in place.
assert.strictEqual(swapStoryTokens('{{chapterTitle}} / {{chapterSummary}}', t), 'The Road / ')
// Lines with no known tokens are never touched, empty or not.
assert.strictEqual(swapStoryTokens('plain\n\n{{nonsense}}', t), 'plain\n\n{{nonsense}}')

// The default stack's Beat block on a free stretch: every line drops, the block renders empty.
const free = storyTokens({ ...args, blockId: 'e' })
assert.strictEqual(
  swapStoryTokens('Write this next: {{beat}}\nAim for about {{beatTargetWords}} words.', free),
  '',
)
// On a beat with no word target, only the target line goes.
assert.strictEqual(
  swapStoryTokens(
    'Write this next: {{beat}}\nAim for about {{beatTargetWords}} words.',
    storyTokens({ ...args, blockId: 'd' }),
  ),
  'Write this next: She lies about the parcel',
)

console.log('checkStoryTokens ok')

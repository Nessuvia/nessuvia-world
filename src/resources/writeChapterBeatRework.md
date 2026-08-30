# Write mode: chapter and beat rework

## Context

Write mode was built on one promise: the author gives as much or as little as they want, and the
story grows from that. The current implementation does not deliver it.

Today there is exactly one generation helper. `OutlineDialog` takes four fields (premise, chapter
count, beats per chapter, words per chapter), sends a two-message prompt that ignores the Story's
cast, ending and existing chapters, and on success **deletes every chapter in the story** and
rebuilds them. There is no way to work on one chapter. There is no way to add to what exists.

Word targets are worse. `splitTargets` divides a chapter's word budget evenly across its beats, so
a scene transition gets the same 300 words as the climax. Real chapters do not distribute like
that. The chapter target itself is never stored: `wordsPerChapter` is consumed at generation time
and thereafter the chapter's target is a recomputed sum of its beats.

The rework splits generation into two features, replaces even word division with weights, stores
the chapter target, and removes free prose from the Block model.

Not a rewrite. The connector path, streaming, swipes, `chapterGuide`'s degradation ladder and
`buildStoryPrompt`'s budget math all stay.

## Scope

### 1. Split generation into Story and Chapter

**Story generation** produces a chapter outline. Chapters and their summaries. No beats.

Required input is one field, a premise. Everything else sits below in an expandable advanced area:

- themes to highlight (free text)
- cast (existing `Story.cast`, shown read-only with a link to the rail; the outline prompt gets the
  names and descriptions it currently never sees)
- genre, tone, setting
- ending (existing `Story.ending`)
- a form preset, and the numbers it fills

**Chapter generation** produces a beat outline for one chapter. Same plumbing, narrower scope.

Required input is the chapter's existing title and summary, already on the record. Advanced:

- author notes, free-form. This is the "as much or as little as you want" field.
- the previous chapter's summary, and its prose when it exists (auto, not typed)
- chapter word target and beat count
- story-level premise, themes and ending, injected automatically

### 2. Length presets

The preset dropdown fills the number inputs. Editing any number flips the dropdown to `Custom`;
the numbers are never locked. Presets name a form (short story, novelette, novella, novel) and
carry total words, chapter count and words per chapter.

**The preset numbers are a follow-up.** Build the mechanism with placeholder values and a comment
naming them as unresearched. Real publishing norms get looked up and dropped into the table later,
which is a data edit, not a code change.

### 3. Beat names

A beat gains a `name`: "The Inciting Incident". Display only, and it reaches the model through a
new `{{beatName}}` token. It comes out of the bulk import format, which carries one per entry.

### 4. Beat weights replace even division

`Block.targetWords` stops being hand-authored. A beat carries a weight instead:

```ts
type BeatWeight = 'sketch' | 'brief' | 'normal' | 'long' | 'major'
```

Multipliers roughly `0.35 / 0.65 / 1.0 / 1.5 / 2.3`. The model picks a weight per beat during
chapter generation and the author edits it with a five-way control that shows the derived word
count underneath.

`Chapter.targetWords` becomes a stored field. A chapter's beat targets are derived: each beat's
share is `chapterTarget * weight / sumOfWeights`, rounded, remainder to the earliest beats so the
parts sum exactly. This is `splitTargets`' existing remainder discipline, generalised to weights.
Rename it `splitByWeight` and extend `checkOutline.ts`.

`storyTokens.beatTargetWords` keeps reading a number, so the wire format does not change.

### 5. Free prose is removed

The `emptyBeat = ' '` single-space sentinel and `isBeat = beat !== ''` are load-bearing, untrimmed,
and have already caused a duplication bug (see the comment in `withBeats`). Free prose was a
holdover and no longer belongs in Write mode.

Every Block is a beat. A beat with empty instructions is just an unwritten beat, which is the
ordinary case and needs no sentinel. `beatSlots.ts` is deleted outright: with no free blocks to keep
in place, `withBeats` was a plain array replacement and the callers do it themselves.

A new chapter starts with **zero** blocks and an empty state offering "Generate chapter outline"
and "Add beat". `newChapter` no longer seeds a block; `openStory` no longer back-fills one.

No conversion pass for existing records. Clearing site data is the answer, per CLAUDE.md.

### 6. Advanced View

With chapters able to start empty, the setup path needs somewhere to put the fields. The eventual
answer is a wizard. This rework does not build it.

It builds **Advanced View**: every field laid out plainly, no progressive disclosure, no
hand-holding. This is a permanent end feature, not scaffolding, so it gets built properly and the
wizard later becomes a guided front door onto the same state. Nothing written here gets thrown away.

### 7. chapterGuide follows

Chapters gain a stored target and beats gain weights, so the guide that tells the model what to
write next changes with them. The degradation ladder (`fitStoryProse` swapping oldest prose for
`beatLine`) keeps its shape. What changes is that `beatLine` and `degradedHeader` have richer
fields available, and the free-prose branch in `walk` disappears.

## Files

Core:

- `core/storage/types.ts` : `Block.weight`, drop the free-prose meaning of `beat`; `Chapter.targetWords`;
  Story fields for themes, genre, tone, setting. Dexie version bump only if an index is added (it is not).
- `core/stores/writeStore.ts` : `newBlock` / `newChapter` factories; split `generateOutline` into
  `generateStoryOutline` and `generateChapterOutline`, neither wholesale-destructive by default.
- `core/prompt/outline.ts` : split into two request/reply shapes; `splitTargets` becomes
  `splitByWeight`.
- `core/prompt/miscPrompts.ts` : the `outline` prompt splits into `storyOutline` and
  `chapterOutline`, both editable in the prompts module with their own slots.
- `core/prompt/chapterGuide.ts`, `core/prompt/storyTokens.ts` : drop free-prose handling.
- `modules/write/beatSlots.ts` and `checkBeatSlots.ts` : deleted.

Modules:

- `modules/write/OutlineDialog.tsx` : becomes the Story generation surface.
- `modules/write/ChapterOutlineDialog.tsx` : new, reached from a chapter.
- `modules/write/PlotLayout.tsx` : chapter target input, weight controls on beat rows, empty state,
  per-chapter generate button.
- `modules/write/WriteView.tsx` : the kebab menu loses "Convert to free prose"; "Target words"
  becomes the weight control.
- `modules/write/bulkBeats.ts` : the hand-rolled `{"text",200}` format is gone. Bulk Add now takes
  a JSON array of `{ name, content, length }`, the same shape the chapter outline replies in. A
  length the parser does not recognise is not an error: `parseBulkBeats` collects the unknown values
  and the dialog draws a dropdown per value so the author remaps them before anything is added.
- `modules/write/lengthPresets.ts` : new, the form dropdown's table. Numbers are placeholders.
- `modules/write/WeightPicker.tsx` : new, the five-way control shared by the Plot Layout row, the
  block kebab menu and the regen dialog.

Regeneration overwrites with a confirmation naming what is lost. Both dialogs stay open on failure.

## Verification

`npx pnpm build`, then:

```
find src -name 'check*' -exec node --experimental-strip-types {} \;
```

Extend `checkOutline.ts` with weight-split cases: weights summing to the target exactly, a single
beat, zero target, all-`sketch`. Extend `checkChapterGuide.ts` for the removed free-prose branch.
`checkBeatSlots.ts` shrinks or goes away with the file it tests.

Then hand off. Browser testing is the user's, in this order: create a story, run Story generation
from a one-line premise, confirm chapters and summaries arrive with no beats. Open a chapter, run
Chapter generation, confirm beats arrive with varied weights and that derived word counts sum to
the chapter target. Write a beat and confirm `{{beatTargetWords}}` reaches the model via the prompt
preview panel.

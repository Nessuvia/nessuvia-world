# Write mode — Plot Layout

## Context

Write mode has drifted. Opening a Story today shows a scrolling prose document and a right sidebar,
and Chapters appear in **two** places — a bookmark strip in `StorySidebar` and an "Edit Chapters"
modal — neither of which says what a Chapter is *for*. A Chapter is not an organizing folder: its
title, summary and beats are assembled into the Chapter guide and sent to the model on every
generation. That is invisible in the current UI, which is why the author returned to the feature
after a few days away and could not read it.

This upgrade gives the Story a second tab, **Plot Layout**: a left-to-right chain of chapter blocks
between an editable Premise and Ending, with a full-width chapter editor beneath it. Beats become
the *only* plan text — a line of intent, a target word count, a done checkbox — and gain a "Write
this beat" action. The per-chapter `summary` field is removed; a chapter's beat list is its own
summary. Both existing Chapter surfaces are deleted, so there is exactly one place to plan.

The auto-assembled pacing prompt the author actually wants is **phase 2**.

## Data model

`core/storage/types.ts`. Per CLAUDE.md this is a WIP codebase — **no migration, no back-compat
shim** for the old `beats: string[]` or the removed `summary`. Existing beats are dropped; clearing
site data is a fine answer.

```ts
export interface Beat {
  id: string          // crypto.randomUUID(); beats have no table, so they need their own key
  text: string        // "Mary discovers that John isn't who he says he is"
  targetWords: number // 0 means unset
  done: boolean       // the author checks it manually; nothing auto-checks it
}
```

`Chapter` changes:

- `beats: Beat[]` (was `string[]`) — the plan for the chapter: what is meant to happen
- `summary` — **kept**, and its meaning narrowed. It was doing two jobs at once (recap of what
  happened, statement of intent) and that ambiguity is why it read as noise. Beats now own intent, so
  `summary` is **recap only**: what the chapter turned out to contain. Its doc comment says exactly
  that.
- `sendEnabled: boolean` — **replaced** by `guideSend`, below. Moves into the chapter editor pane.
- `lastGeneration` unchanged

### What a chapter contributes to the guide

```ts
/** What this Chapter contributes to the Chapter guide. 'both' is the default and the useful one:
 *  an unwritten Chapter has no summary yet, so it sends beats; a written Chapter has both, and the
 *  trim demotes it to summary alone when the guide runs out of room. */
guideSend: 'off' | 'beats' | 'summary' | 'both'
```

One field, not `sendEnabled` plus a mode flag. Two booleans would allow "send, but send nothing";
this cannot express an invalid state, and it is one control in the editor rather than two.

`newChapter()` defaults it to `'both'`. Nothing auto-detects: a chapter sends what its mode says.
The reason `'both'` behaves well without per-chapter fiddling is that the fields fill in at different
times — an unwritten chapter has beats and an empty summary, a written one has both — so the default
mode says "everything you have" and the trim decides what survives.

Renaming `sendEnabled` touches its filter in `chapterGuide.ts`, `ChapterPatch`, and the toggle in the
new editor. No migration: WIP rule.
- **No `next` field.** An earlier draft stored `next?: number[]` to make branching "a later UI
  change, not a later data change". It buys nothing: with the UI enforcing a single chain, `next` is
  a copy of `order` that every add, delete and reorder has to keep in sync — a second source of
  truth for the chain, and the exact class of bug this codebase avoids. Branching needs real edge
  storage and a real editor whenever it arrives; adding the field then is the same size of change.

`ChapterPatch` in `writeStore.ts` becomes
`Partial<Pick<Chapter, 'title' | 'summary' | 'beats' | 'guideSend'>>`.
All beat editing — add, edit text, set target, check done, remove, reorder — goes through the
existing `updateChapter(id, { beats })`, which already persists and marks dirty. **No new store
actions for beats.** `writeBeat` is the only addition.

`Story` gains three plain fields:

- `premise: string` — the opening situation card before Chapter 1
- `ending: string` — the intended ending card after the last chapter
- `capsCollapsed?: boolean` — caps render as thin markers when true

**No `db.version()` bump.** These are all plain fields on existing tables and none are queried with
`find()` (CLAUDE.md, *Data*). Default them in `newChapter()` and the story factory in
`core/stores/writeStore.ts`.

## Prompt path

Two real changes: beats render for **every** send-enabled chapter, and the guide becomes
**trimmable**. Premise and Ending are stored and edited in phase 1 but do not reach the model until
phase 2.

### `core/prompt/chapterGuide.ts`

`renderChapterGuide` now emits every chapter's contribution per its `guideSend`, not just the active
one's beats. Done beats are included and marked, since what's covered vs. still ahead is the pacing
signal. Chapter numbering still counts position in the Story.

Each chapter renders its title line, then its summary lines (indented, when the mode includes
`summary` and the text is non-empty), then its beats (when the mode includes `beats`). Summary before
beats: what happened, then what is meant to happen.

```
Chapter 1 — Arrival [written]
  They meet on the platform and she agrees to visit.
Chapter 2 — Ruin [writing now]
  He gets her as far as the house.
  · John invites Mary over [done]
  · Mary discovers the truth
Chapter 3 — Escape [not yet written]
  · Mary tries to escape
```

(Chapter 1 is `both` with no beats left worth sending after the trim demoted it; Chapter 3 is `both`
with no summary yet. Same mode, different output, because the fields fill at different times.)

- `guideSend: 'off'` replaces the `!sendEnabled` skip.
- The `state !== 'writingNow'` early return deleted — that was the only thing gating beats.
- New marker string in `stateLabels`' neighbourhood: `beatDone = '[done]'`. Prompt wording lives
  here with the rest.
- The `  Beats:` header line today's code emits is **dropped**. It labelled beats as the exception
  for one chapter; now every chapter has them and the `·` bullets carry it. Beats indent two spaces
  under the chapter line, as above. `checkChapterGuide` asserts on that shape.
- A beat with empty `text` is skipped, same as today's `filter((b) => b.trim())`.
- `chapterState`, `chapterDivider`, `storyProse`, `storyProseSplit`, `hasProse` — untouched.
- `GuideChapter` drops `'summary'` from its `Pick<>`.

New export, pure and check-testable, for the trim:

```ts
export function renderChapterGuideWithin(
  chapters: GuideChapter[],
  activeId: number | null,
  allowance: number,                 // tokens
  count: (s: string) => number,      // injected so this file stays free of gpt-tokenizer
): string
```

`guideSend: 'off'` chapters are filtered out first, as `renderChapterGuide` already does; "earliest"
then means earliest among the chapters that render. **Three** stages now, gentlest first, and
**never** touching the active chapter or any chapter after it:

1. **Demote the earliest chapters to summary alone**, one chapter at a time, until it fits. This is
   the stage `summary` buys: a written chapter whose prose has scrolled out of the window keeps its
   recap and loses only its beats, which are the least useful thing about a chapter already written.
   A chapter with an empty summary has nothing to demote to and falls straight to its title line.
2. If still over, reduce those to title lines alone, earliest first.
3. If still over, drop them entirely, earliest first.

The ladder is deliberately semantic rather than mechanical: at every rung the guide is losing the
least informative thing left in it, and a written chapter is represented by what happened in it for
as long as the budget allows.

`guideSend` is an author override that the trim respects but does not rewrite — a chapter set to
`summary` never gains beats under pressure, and a chapter set to `beats` demotes to its title at
stage 1, since it has no summary to fall back to. The trim reads the mode; it never writes it.

Either way, when anything was dropped or stripped, prepend a marker line so the model knows earlier
chapters exist:

```
(Earlier chapters not shown in full)
```

The marker is part of the string being measured — each candidate is counted with the marker already
on it, so the fit can't be blown by the line that says it was fitted.

If even the active chapter and its successors exceed the allowance, return that — the guide never
drops the chapter being written. When `activeId` is null or matches no chapter, the last rendered
chapter stands in as the floor, matching the "no cursor means the last Chapter" fallback `generate`
and `StoryPromptPanel` already share.

### Fitting the guide: one helper, both callers

**Correction to an earlier draft:** there is no `budget.contextTokens`. `Budget` is
`{ contextLimit, maxTokens, safetyMarginPct }` (`core/prompt/budget.ts`), and the usable window is
`contextLimit - maxTokens - (contextLimit * safetyMarginPct / 100)`.

Also, `buildStoryPrompt` **needs no change at all**. The guide is already resolved before prose by
construction: it sits in the fixed prefix, `fixedTokens` is priced first, and `fitEndBackward` spends
only the remainder. The one new thing is capping the guide, and that happens before it is handed in.
`BuildStoryArgs.chapterGuide` stays a plain string; the signature is untouched, and its doc comment
changes from "never trimmed" to "already fitted by the caller".

Two callers build a Story prompt and they must not diverge — `writeStore.generate` (`writeStore.ts:485`)
and `StoryPromptPanel` (`StoryPromptPanel.tsx:81`), which exists precisely so the preview and the
wire agree. So the fitting is **one exported helper**, not a step each caller performs:

```ts
// core/prompt/buildStoryPrompt.ts — it already imports countTokens; chapterGuide.ts must stay
// tokenizer-free so the check scripts can run it under --experimental-strip-types.
export const guideSharePct = 10   // named and commented next to maxTrailingTokens
export function fitChapterGuide(
  chapters: GuideChapter[],
  activeId: number | null,
  budget?: Budget,
): string
```

- No budget → `renderChapterGuide` in full, matching how the rest of the file treats a missing budget.
- With one → `renderChapterGuideWithin(chapters, activeId, Math.floor(usable * guideSharePct / 100), countTokens)`.
- 10%, starting tight on purpose: every guide token is a prose token `fitEndBackward` can't spend,
  and the three-stage ladder degrades gently enough that hitting the cap is not a cliff. The comment
  on the constant says to raise it if the guide starts demoting chapters the author still needs.
- Both call sites replace `renderChapterGuide(...)` with `fitChapterGuide(..., budget)` and change
  nothing else. `StoryPromptPanel` already computes the same `budget` object it passes to
  `buildStoryPrompt`; it passes that.

`renderChapterGuideWithin` keeps its injected `count` parameter — that is what lets the trim be
checked without pulling gpt-tokenizer into a check script.

### Checks

- `checkChapterGuide.ts` — update for the new beat shape; add cases for beats on non-active
  chapters, the `[done]` marker, summary-before-beats ordering, and each `guideSend` value
  (`off` skips, `beats`/`summary` emit one half, `both` emits what exists).
- New `checkChapterGuideTrim.ts` — the three-stage trim is the branchiest thing in this change and
  must be covered: fits without trimming; oldest demoted to summary; a beats-only chapter falling
  straight to its title; oldest reduced to titles; oldest dropped; the active chapter never demoted
  or dropped even when it alone exceeds the allowance; chapters after the active one never touched;
  an author `guideSend` override never rewritten by the trim; marker line present only when
  something was removed, and counted inside the fit.

## Beat generation (phase 1)

The only generation-path change. Beats are a generational tool — they are never mapped to prose
spans, and the chapter's prose stays free text.

- New store action in `core/stores/writeStore.ts`, alongside `generate`:
  `writeBeat(chapterId: number, beatId: string): Promise<void>`.
- It composes a direction string and calls the **existing** `generate(direction)` path — same
  insertion at the caret, same `lastGeneration` span, so Retry / Continue / Undo
  (`writeSpan.ts:validSpan`, `spanChapter`) keep working with no changes.
- Direction composition, prompt text only — **no `max_tokens` change, no sampler change**:

  ```
  Write the next beat in about 200 words:
  Mary discovers that John isn't who he says he is

  <whatever is in the Direction box, if anything>
  ```

  Omit the "in about N words" clause when `targetWords` is 0. Append the Direction box contents
  after a blank line when non-empty — the beat is the plan, the Direction is extra steering.
- Two entry points:
  - a **Write** button on each beat row in the Plot Layout editor; clicking it switches to the
    Story tab and starts generating
  - a **Write next beat** button beside Generate in `StorySidebar`, targeting the active chapter's
    first `done: false` beat. Disabled with `title="No unwritten beats in this chapter."` when there
    isn't one — it never falls through to another chapter.
- Generating never checks a beat off. The author does that by hand.

Settled edge cases, so the implementer isn't deciding them at the keyboard:

- **Targeting a chapter that isn't active.** `writeBeat` sets `activeChapterId` to the beat's chapter
  before calling `generate`. No caret cleanup is needed: `generate` only adopts a caret whose
  `chapterId` matches (`writeStore.ts:457`), so a caret left in another chapter falls through to the
  end-of-chapter default, which is what "write this beat" should do.
- **Returns early when `streaming`**, the same guard `generate` and `retry` carry.
- **The Direction box is read, not cleared.** Composition folds in whatever is typed; the box keeps
  its text so a following Retry behaves as it does today.
- **The composed string is what's stored** in `lastGeneration.direction`, so Retry reruns the beat
  instruction rather than the bare box contents. That is the intent — a beat's passage is retried
  against its beat.
- **No second copy of the Direction.** `generate` appends exactly the string it is given as the final
  user turn; the box is never sent alongside it.

## UI

### Tabs

Two tabs in the existing `.storyBar` in `WriteView.tsx`, next to the story title: **Story** and
**Plot Layout**. Follow the in-page pattern from `modules/characters/CharacterEditor.tsx:207-239`
(`.editorTabsWrap > .editorTabs[role=tablist]`), **not** module-level `tabs` — those deep-link the
shelf, and the sidebar swaps to `StorySettingsPanel` when a story is open. Local `useState`, no hash
routing: reopening a story always lands on Story.

Selecting Plot Layout replaces `<StoryDocument />` **and hides `<StorySidebar />` entirely**. The
plot tab owns the full width.

`StorySidebar` carries Stop, Retry, Continue and Undo (`StorySidebar.tsx:351-372`), so hiding it
takes Stop away with it. **The Plot Layout tab is disabled while `streaming`**, `title="Available
when the Co-Writer stops writing."` — the same `disabled={streaming}` idiom the sidebar's own buttons
use. The beat **Write** path is unaffected: it switches to the Story tab before it generates.

The prompt preview is not affected either way — `StorySettingsPanel` (which renders
`StoryPromptPanel`) mounts from `app/Sidebar.tsx:308`, not from `StorySidebar`, so it stays available
on both tabs.

```
┌──────────────────────────────────────────────┐
│ My Story              [ Story ][ Plot Layout ]│
├──────────────────────────────────────────────┤
│ Plot Layout — chapters and beats sent to the  │
│ model as the plan.                            │
│ ◀ [Premise][Ch1][Ch2][Ch3][Ending] ▶          │
├──────────────────────────────────────────────┤
│ Chapter 2 — Ruin              [↑][↓][Delete] │
│ Title    [ Ruin                            ] │
│ Summary  [ He gets her as far as the house. ] │
│ Beats                          640 / 800 words│
│  ☑ John invites Mary over        200  [Write] │
│  ☐ Mary discovers the truth      600  [Write] │
│  [ Add beat ]                                 │
│ Send to the model [ Summary and beats  ▾ ]    │
│                          [ Add chapter after ]│
└──────────────────────────────────────────────┘
```

### The chain strip

New `PlotLayout.tsx` in `modules/write/`. A horizontally scrolling strip of fixed-width blocks —
reuse the touch drag-scroll and `.tabsCaret` edge-indicator approach already in `CharacterEditor`.

- Order: Premise cap → chapter blocks in `order` → Ending cap. Arrows drawn between them.
- Caps are editable textareas, collapsible to thin markers (`capsCollapsed`).
- A chapter block shows: number and title, its **beat lines truncated to one row each**, and
  `written / target` words. The summary is editor-only — a block is a plan at a glance, and recap
  prose would crowd out the beats, which are the thing being planned.
- Block styling comes from `chapterState()` in `chapterGuide.ts` — written blocks solid, the active
  one highlighted, unwritten ghosted. A `guideSend: 'off'` chapter renders dimmed; the other three
  modes look the same, since what a chapter sends is not a state of the chapter.
- The strip is **select-only**. Clicking a block selects it into the editor below. There is no drag,
  no inline editing, no add/delete on the canvas.
- Word target per chapter = sum of its beats' `targetWords`. Actual = word count of `chapter.text`.
  Prose is never attributed to an individual beat.
- One word-count function, exported from `PlotLayout.tsx` and used by both the strip and the editor:
  trim, split on `/\s+/`, empty string counts 0. It is a display number; it does not need to match
  any other counter in the app.
- **Selection is local to the tab, not the caret.** `PlotLayout` holds its own `selectedId`
  (`useState`, seeded from `activeChapterId`, falling back to the first chapter). Clicking a block
  must not move where the next Direct writes — the Story tab's caret owns that. The one thing that
  does set `activeChapterId` from this tab is the beat **Write** button, which is an explicit "write
  here". Per CLAUDE.md *Specificity*: selection is per-view session state and is not persisted.
- **Write switches the tab first, then generates**, so `ChapterRegion` is mounted before the stream
  starts and the caret handoff lands in a live DOM.

### The chapter editor

Full width, directly beneath the strip, for the selected chapter. Everything structural lives here:
Title, Summary, the beat list, `guideSend`, move up/down, Delete chapter, Add chapter after.

- **Summary** is a textarea under Title, labelled and hinted for its one job:

  > Summary — what happened in this chapter. Sent in place of the beats when the guide runs short of
  > room.

  It is written by hand. Generating a recap from the prose stays phase 2.
- **`guideSend`** is a four-option select, labelled `Send to the model`, options reading
  `Summary and beats` (default) · `Beats only` · `Summary only` · `Nothing`. It replaces the
  "Include in the Chapter guide" checkbox in the sketch above.

- Beat rows: done checkbox, text input, target-words number input, Write button, remove. Reorder
  with `app/useDragReorder.ts` (CLAUDE.md: there is no drag-and-drop library; use this).
- Delete chapter keeps today's `ChapterModal` behaviour — disabled at one chapter, confirms only
  when the chapter has prose, and deletes the prose with it.

### Story tab

- A progress rail above the prose: compact blocks, no beats, reading `Ch 2 of 3` with the active
  block marked. It replaces both the removed sidebar strip and any breadcrumb — one slot, one job.
  Clicking a block jumps to that chapter's prose.
- Collapsible via the shared `CollapseButton`, and the state persists (a `railCollapsed` flag on
  `settingsStore`, alongside `openStoryDirectly`) so a distraction-free writer sets it once.
  Scope is deliberate: **global**, not per-story. Whether the rail shows is a working preference, not
  a property of a story. Per-story would be the upgrade path if anyone ever wants it.
- The **active chapter is set by the caret**. `ChapterRegion`'s existing `onFocus` already calls
  `setActiveChapter(id)`; nothing else needs to.

### Removed

- `modules/write/ChapterModal.tsx` — deleted outright.
- The `ChapterSection` / `.chapterNav` block in `StorySidebar.tsx` and its "Edit Chapters" button.
- Their CSS in `write.css`: `.chapterSection`, `.chapterNav*`, `.chapterOpenModal`,
  `.chapterDialog*`, `.chapterEdit*`, `.chapterPlan*`, `.beatList`, `.beatAdd`, `.chapterAdd`.

### Explainers and copy

Native `title=` tooltips on blocks, caps, beat rows, the word-target input, the Write buttons and
the guide toggle. Plus one plain line under the tab bar on Plot Layout:

> Plot Layout — chapters and beats sent to the model as the plan.

And one line under the Premise and Ending caps, since in phase 1 they are stored but never reach the
prompt and a reader has no way to tell:

> Premise and Ending are not sent to the model yet.

It is deleted in phase 2 when they are. Shown once beneath the pair, not repeated on each cap; when
the caps are collapsed to markers the hint collapses with them.

Per CLAUDE.md *UI copy*: state what the thing does and stop. No triples, no negated pairs, no
praise words. Icons from `@remixicon/react` only.

### Mobile (≤700px)

`useMediaQuery('(max-width: 700px)')` — the chain rotates to a vertical stack (Premise, chapters,
Ending, connected by short vertical rules) and tapping a block expands its editor inline rather than
in a pane below. Everything else is CSS.

Inline is the **same** `ChapterEditor` component, rendered after the tapped block in the stack
instead of after the strip. One implementation, one place a beat row is defined; the media query
decides only where it mounts.

## Files

| File | Change |
|---|---|
| `src/core/storage/types.ts` | `Beat`; `Chapter.beats: Beat[]`, `summary` kept and re-documented as recap, `sendEnabled` → `guideSend`; `Story.premise/ending/capsCollapsed` |
| `src/core/prompt/chapterGuide.ts` | summary + beats per `guideSend` for all chapters, `[done]` marker, no `Beats:` header, new `renderChapterGuideWithin` |
| `src/core/prompt/buildStoryPrompt.ts` | **new** `fitChapterGuide` + `guideSharePct`; `BuildStoryArgs` unchanged, doc comment updated |
| `src/core/prompt/checkChapterGuide.ts` | updated; **new** `checkChapterGuideTrim.ts` |
| `src/core/stores/writeStore.ts` | `ChapterPatch` drops `summary` and retypes `beats`, `writeBeat()`, `setPremise`/`setEnding`, defaults in `newChapter`, `fitChapterGuide` at the call site |
| `src/modules/write/PlotLayout.tsx` | **new** — strip, caps, chapter editor |
| `src/modules/write/plotLayout.css` | **new** |
| `src/modules/write/WriteView.tsx` | tab bar in `.storyBar`; swap document+sidebar for `PlotLayout`; progress rail above `StoryDocument` |
| `src/modules/write/StorySidebar.tsx` | remove `ChapterSection`; add **Write next beat** |
| `src/modules/write/ChapterModal.tsx` | **delete** |
| `src/modules/write/write.css` | remove dead chapter/modal rules |
| `src/modules/write/StoryPromptPanel.tsx` | must show the same fitted guide `generate()` builds |
| `src/core/stores/settingsStore.ts` | `railCollapsed` |

Also new: `src/modules/write/checkBeatDirection.ts` — the direction-composition function is branchy
(target 0, empty Direction box, no unchecked beat), so it gets the smallest thing that fails if it
breaks. Keep the composition a **pure exported function** so the check can import it without the
store.

## Explicitly not in scope

- **Auto prompt assembly / pacing** — the model reasoning about position in the arc and word budget.
  The point of the exercise, deliberately phase 2.
- **Auto-recap of written chapters.** `summary` is kept and is the trim's first fallback, but the
  author writes it. Generating it from the chapter's prose is phase 2. A written chapter with an
  empty summary falls to its title line under pressure, which is the cost of not filling it in.
- **Branching chains.** Not stored either — see *Data model*. Chapters are a single `order` chain.
- Premise/Ending reaching the prompt.
- Tension, arc-shape overlays, chapter roles, arc templates — dropped, not deferred. Word counts
  carry pacing.
- Per-beat prose spans. Prose stays chapter-granular; beats are never mapped to it.
- Any `max_tokens` or sampler change from word targets.

## Verification

1. `npx pnpm build` (runs `tsc -b`, then Vite) must be clean.
2. `find src -name 'check*' -exec node --experimental-strip-types {} \;` — all pass, including the
   new `checkChapterGuideTrim.ts` and `checkBeatDirection.ts`.
3. Then **stop and hand off** (CLAUDE.md, *Verifying work*). Do not launch a browser or leave
   `pnpm dev` running. Report clean and name what to look at:
   - a fresh Story opens on the Story tab with one chapter, rail reading `Ch 1 of 1`, rail collapse
     persisting across a reload
   - Plot Layout shows `[Premise] → [Ch 1] → [Ending]`, caps collapse, tooltips read plainly
   - adding chapters and beats, reordering, and deleting a chapter with prose behave as described
   - `StoryPromptPanel` shows summary then beats under every sending chapter with `[done]` markers,
     each of the four `guideSend` values changes what that chapter contributes, and on a story long
     enough to exceed the allowance the `(Earlier chapters not shown in full)` line appears with the
     earliest chapters demoted to summary, then to titles, then dropped
   - **Write** on a beat switches to the Story tab and generates; Retry / Continue / Undo still work
     on the result; **Write next beat** is disabled with its tooltip when nothing is unchecked

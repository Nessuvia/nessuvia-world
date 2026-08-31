# Write mode: one rail, no wart

## Context

Write mode currently sandwiches the document between three columns:

- the app nav rail, taken over by `StorySettingsPanel` (connection, prompt stack, params, story
  width, story colors, find/replace, prompt preview),
- `.storyMain`: the storyBar (title, Story/Plot tabs, Toggle Styling) and the contentEditable
  document,
- `StorySidebar` on the right (Write next beat, Chapter beats checklist, Direction, Characters,
  Scratchpad), with its own collapse rail, its own phone drawer, its own backdrop and its own
  gear button to reopen.

Two problems. The left rail is the chat settings panel wearing a Write hat: it reuses
`.panel.chatSettings`, mirrors the chat's section list, and reads as tacked on. The right panel
boxes the prose in from both sides; the document, which is the whole point of the mode, gets the
narrowest column of the three and `--storyWidth` is measured against what's left over. The panel
also unmounts on the Plot Layout tab, so story state disappears exactly when you're planning.

Target: **the document plus exactly one rail, on the left.** The right panel goes away. Its
contents move into the rail, which gets a two-tier structure so it doesn't become an endless
accordion scroll. Generation becomes inline-only plus the rail's beat list; nothing floats.

Two things get deleted rather than moved: Scratchpad and Find & Replace.

## Decisions taken

| Question | Answer |
|---|---|
| Shape | document + one rail (the left one) |
| Plot Layout | stays a separate tab; the rail persists across both |
| Story/Plot switch | stays in the storyBar |
| Rail width | `palette.sidebarWidth`, already drag-resizable, no new machinery |
| Rail nav | two tiers: writing by default, Story settings replaces the body |
| Generation | inline at the beat, plus a write control on each rail beat row |
| Beats scope | whole story, chapters as collapsible groups |
| Direction | story-level, in the rail |
| Cut | Scratchpad, Find & Replace |
| Phone | one drawer, but beats stay reachable without opening it |

## The new rail

One component replaces both `StorySettingsPanel` and `StorySidebar`:
`src/modules/write/StoryRail.tsx`, mounted where `StorySettingsPanel` is today
(`src/app/Sidebar.tsx:302-309`, unchanged wiring, new import).

It has two bodies and a local `tier` state (`'write' | 'setup'`), not a route or a hash: the
storyBar already owns the hash-free tab switch and adding a second URL axis would collide with it.

### Tier 1: Write (default)

Ordered top to bottom:

1. **Beats**, the story spine, not a per-chapter checklist. `<details>` per chapter (title or
   `Chapter N`), active chapter open, others closed; open/closed state is view-only, not persisted.
   Each chapter's `beatBlocks(chapter)` renders a row with:
   - a `done` checkbox (existing `updateChapter` write),
   - the beat text as a button that scrolls + focuses `.storyProse[data-block=…]`,
   - a spark button that writes/regens that beat, which is what replaces `Write next beat`, and it
     works on any chapter, which the old button never did (`StorySidebar.tsx:296` only ever looked
     at the active chapter).
   - `chapterState()` from `core/prompt/chapterGuide` colors the chapter summary line, same three
     values `PlotLayout` already uses, so the rail and the Plot tab can't disagree.
2. **Direction**, the existing textarea, debounce and hint, lifted verbatim from
   `StorySidebar.tsx:169-211`.
3. **Characters**, lifted verbatim from `StorySidebar.tsx:17-109`, including `EntityPicker`.
4. A `Story settings` row at the foot that switches to tier 2.

Streaming state (`streamingStoryId === story.id`, `streamingBlockId`) still gates the spark buttons
into Stop, per beat rather than one global button.

### Tier 2: Story settings

The current `StorySettingsPanel` sections, minus Find & Replace, with a `← Story` header row back
to tier 1: Connection, Prompt Stack, Parameters, Appearance (story width, show reasoning,
`AppearancePanel colors={false} font={false}`, Story colors), Prompt preview.

Drop the `.panel.chatSettings` class borrow. Give the rail its own class
(`.storyRail`) in `write.css` and copy across only the layout rules it actually needs from
`chat.css`. The chat-lookalike styling is a large part of why the panel reads as tacked on.

## Deletions

- `src/modules/write/StorySidebar.tsx`, gone. With it: `.storySidebar`, `.storySidebarHead`,
  `.storyPanelRail`, `.storyPanelBackdrop`, `.drawerOpenButton`, `.directionBox`/`.directBtn` (the
  Direction textarea rules survive under the rail's class), the
  `localStorage['nessuTavern.storyPanelCollapsed']` key, the second `useSideDrawer` call, and the
  `narrow` `useMediaQuery` at `StorySidebar.tsx:279`.
- `src/modules/write/FindReplace.tsx`, gone. Then `::highlight(proseFind)` in `write.css:1075`,
  and `proseSpots`/`proseRange` in `proseMarkup.ts` become dead; check for other callers before
  removing (grep says FindReplace only).
- **Scratchpad**, the section, `Story.scratchpad` in `core/storage/types.ts`, its store setter, and
  the `{{scratchpad}}` entry in `core/prompt/storyTokens.ts` plus its substitution site. No Dexie
  version bump needed (dropping a plain field). Any stack that still writes `{{scratchpad}}` will
  render it as literal text; per CLAUDE.md, that's acceptable on a WIP codebase.
- `StorySettingsPanel.tsx` and `StorySidebar.tsx` both disappear into `StoryRail.tsx`.

## The document side

`WriteView.tsx:1082-1169`:

- `.storyEditor` stops being a flex row with two children. The sidebar child is gone, so it's just
  `.storyMain`. Collapse the wrapper if nothing else needs it; `--storyWidth` and the four color
  vars stay on whatever the outermost node ends up being.
- Remove the `tab === 'Story'` guard that mounted the sidebar (`:1160`). The rail persists across
  both tabs for free, since it lives in the app sidebar.
- `JumpToPlot` and the `onWriteBeat` round-trip (`:1056`) stay as they are; the storyBar tabs stay.
- `write.css:672-…` `.storySidebar` block goes; `.storyMain` keeps `flex:1; min-width:0`.

Inline generation is already inline-only apart from the dead panel button, so `BlockHead`
(`WriteView.tsx:404-573`) needs no change. The rail's spark rows call the same
`writeStore.writeBlock(chapterId, blockId)`.

## Phone

Killing the right panel kills the second drawer, the second backdrop and the gear button. The app
sidebar drawer is then the only drawer.

Beats must stay reachable without opening it: on `(max-width: 700px)` the storyBar grows a beats
button that opens the beat list as a sheet. Reuse `useSideDrawer` once, or simply a full-width
`<details>` under the storyBar, which is the cheaper answer and needs no new state. Prefer the
`<details>`; the drawer machinery is what we're deleting.

## Files

| File | Change |
|---|---|
| `src/modules/write/StoryRail.tsx` | new: the two-tier rail |
| `src/modules/write/StorySidebar.tsx` | delete |
| `src/modules/write/StorySettingsPanel.tsx` | delete (absorbed) |
| `src/modules/write/FindReplace.tsx` | delete |
| `src/modules/write/WriteView.tsx` | drop the sidebar child + its tab guard; phone beats `<details>` |
| `src/modules/write/write.css` | `.storyRail` in, `.storySidebar`/drawer/rail/highlight rules out |
| `src/modules/write/proseMarkup.ts` | remove `proseSpots`/`proseRange` if unreferenced |
| `src/app/Sidebar.tsx` | swap the `storyId` branch to `StoryRail` |
| `src/core/storage/types.ts` | drop `Story.scratchpad` |
| `src/core/stores/writeStore.ts` | drop the scratchpad setter |
| `src/core/prompt/storyTokens.ts` | drop `scratchpad` |

Unchanged: `PlotLayout.tsx`, `StoryPromptPanel.tsx`, `beatSlots.ts`, `bulkBeats.ts`,
`buildStoryPrompt.ts`, `chapterGuide.ts`, `db.ts`.

## Verification

1. `npx pnpm build` (runs `tsc -b` then Vite), clean.
2. `find src -name 'check*' -exec node --experimental-strip-types {} \;`, all pass. The existing
   Write checks (`beatSlots`, `bulkBeats`) don't touch layout; no new check is needed for a
   pure-relocation change. If the rail's beat grouping grows non-trivial ordering logic, add one
   `checkBeatRail.ts` asserting chapters come out in `order` and the active chapter is the one
   marked open.
3. Then hand off. Things to look at in the browser: rail switches between the two tiers and back;
   dragging the sidebar edge resizes the rail and the document reflows; the rail survives switching
   Story ↔ Plot Layout; a spark on a beat in a non-active chapter writes that beat and scrolls to
   it; Stop appears on the right row while streaming; Direction still saves on debounce; at 700px
   there is exactly one drawer and beats are reachable from the storyBar.

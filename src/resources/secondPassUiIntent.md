# Second Pass UI cleanup: intent

The feature works. The UI grew as it was built and now reads as one long scroll with three
different kinds of thing stacked in it. This is a layout and copy pass. No behavior changes,
one exception noted below.

## What is wrong today

`SecondPassPanel.tsx` renders, in one column: the enable toggle, the editing connection, the
skip-when-clean checkbox, the standing instruction, then sentence sprawl with a three-number grid,
then rule of three, then repetition with another three-number grid, then `TextRulesPanel` (41
default rules, import/export, a preview box) and then `GrammarHammerPanel` (12 rules, a POS cheat
sheet, another preview box). Reaching the Hammer means scrolling past everything else.

Four specific defects:

1. `GrammarHammerPanel` has its own "Enable" checkbox writing `secondPass.enabled`, the same field
   the panel above it writes. Two checkboxes, one boolean, no indication they are the same.
2. "Restore defaults" lives in the free-text rules card but also resets sprawl, triplet and
   repetition, which are in a different card further up the page.
3. Two preview textareas that do the same job on different rule sets, so testing a sample of text
   against everything means pasting it twice.
4. `disabled={!settings.enabled}` on every control, so an off feature is a page of greyed inputs.

## What changes

### Sub-tabs inside the panel

A tab strip at the top of `SecondPassPanel`: Setup, Checks, Rules, Hammer. State is a local
`useState`, not a hash and not a sidebar entry. The Settings sidebar keeps its five flat entries and
`modules/settings/tabs.ts` is untouched.

Setup holds the enable toggle, the editing connection, skip-when-clean and its explanation, the
standing instruction, the Write-mode beats checkbox, and the bundle actions.

Checks holds sprawl, rule of three and repetition. Each is a card with the same head shape as a
rule card: a checkbox and a name on one line. The number fields render only when that check is on,
so an off check is one line instead of a grid of dead inputs.

Rules holds the free-text rule list, Add rule, and per-rule copy/delete.

Hammer holds the Hammer rule list and its cheat sheet, with no Enable of its own.

### The preview

One preview, rendered below the tab strip and outside it, so it is reachable from any sub-tab. It
takes sample text and runs the Hammer rules, the free-text rules and the enabled checks in a single
list of results, each row labelled with what reported it. The two existing preview boxes go away.

### The Hammer's Enable

Removed. The Hammer tab reads Second Pass's enable state. With Second Pass off, the tab says so in
one line instead of offering a checkbox that turns the whole feature on from inside a sub-panel.

### Bundle actions

Restore defaults, Remove N old defaults, Import JSON, Export JSON and the paste box move to Setup
under a Bundle heading. Copy names what Restore touches: the missing rules and the three checks.
Individual rule actions (Add, Copy, Delete) stay with the rule lists.

### Write's beats checkbox

`secondPass.passBeats` moves out of Write's story shelf toolbar and into Setup, labelled as taking
effect in Write mode and costing one request per generated beat. The toolbar in
`WriteView.tsx` loses the conditional checkbox and the `useSecondPass` import that only served it.

### The chat sidebar section

The Second Pass `<details>` in `ChatSettingsPanel.tsx` is removed. It listed Hammer rules only,
showed raw POS patterns, and toggling a rule there rewrote the global setting with nothing in the UI
saying so. Second Pass is a global feature and Settings is where it lives.

This is the one behavior change: enabling Second Pass from inside a chat is no longer possible.

### Copy

Every hint gets read against the UI copy rules. The current ones explain why a design is correct
("A rule cannot do this one: what makes a sentence sprawl is how many joints it has, not which words
fill them"). That reasoning belongs in the code comment it is already in. The hint says what the
check does.

## What does not change

The scope of this work stops at `SecondPassPanel.tsx`, `TextRulesPanel.tsx`,
`GrammarHammerPanel.tsx`, the Second Pass parts of `settings.css`, the two deletions in
`WriteView.tsx` and `ChatSettingsPanel.tsx`, and one new preview component.

- **No logic changes in `core/secondPass`.** `runSecondPass`, `buildPassPrompt`, `textRules`,
  `sprawl`, `triplet`, `repetition`, `punctuation`, `ruleJson`, `defaultRules` and every `check*`
  next to them are untouched. If a check script needs editing, the change went too far.
- **No changes to `core/hammer`.** `pattern`, `matcher`, `repair`, `strip`, `exclusions` and the
  POS tag list stay as they are. The preview calls `previewStrips` and `stripText` exactly as the
  Hammer panel does now.
- **No data shape changes.** `SecondPassSettings`, `SecondPassRule`, `GrammarHammerRule`,
  `SprawlSettings`, `TripletSettings`, `RepetitionSettings` keep their current fields. No Dexie
  version bump: Second Pass lives in `nessuTavern.settings` in localStorage and always has.
- **No per-chat or per-story scope.** Every knob stays global. The `// Per-chat override` comments
  in `settingsStore.ts` and `WriteView.tsx` stay accurate and stay comments. Adding a scope level is
  a separate piece of work with its own decision about which level each control writes to.
- **No new rule capabilities.** No reordering the rule lists, no drag handles, no grouping or
  tagging, no per-rule enable-all, no search or filter over the 41 defaults. The lists render in
  array order the way they do now.
- **Rules and Hammer stay two lists.** They match different things and have different fields.
  Merging them, or folding the checks into either list, is not part of this.
- **Import stays additive.** A JSON import appends and never replaces, unchanged.
- **The Settings sidebar tab list is unchanged.** Second Pass stays one entry.
- **No new dependency.** The tab strip is a row of buttons and a `useState`. No routing library
  work, no tab component, and nothing hoisted into `/app` unless a second caller appears.
- **No visual polish pass.** Existing CSS vars, spacing scale and skin contract as written in
  `.claude/cssConventions.md`. New classes where new elements need them, no restyling of what is
  already there.
- **`punctuation.ts` stays without a UI.** It normalizes unconditionally and has no settings.
  Giving it a toggle is a feature request, not cleanup.

## Done when

`npx pnpm build` and `scripts/agent-test.sh` are clean, the check scripts are unmodified, and the
four sub-tabs plus the shared preview are ready to look at in the browser.

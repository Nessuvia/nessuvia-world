# Prose Slop Linter — Implementation Plan

## 1. Overview

A deterministic prose linter with auto-fix, shipped as a self-contained feature of the existing React LLM frontend. It detects clichéd/LLM-signature phrasing in pasted prose and applies mechanical fixes without any additional LLM calls.

**Core constraint that defines the whole design:** every fix is a deletion or a rearrangement of tokens already present in the input. The engine never generates new words. Anything requiring invention is flagged as a suggestion, never auto-applied.

**Scope boundaries for v1:**
- No integration with the rest of the frontend. Isolated feature module, own route/panel, own state. Prose enters by paste, leaves by copy.
- Browser-only. No server, no network calls except the dynamic chunk fetch for the optional parser.
- Declarative rules only (regex + POS patterns). No JS-tier rules.
- Single shipped rule pack of 3–5 rules with deep guards. Breadth is deferred; precision is the v1 goal.

**Three tabs:**
| Tab | Purpose |
|---|---|
| Review | Flagged spans, accept/reject each fix |
| Diff | Original vs. fixed, side by side |
| Playground | Author/test rules against sample prose |

**Success criteria for v1:** zero mangled sentences on the negative corpus; every shipped rule passes its own fixtures in-app; a user can paste a YAML rule and see it fire without a reload.

---

## 2. Architecture

### 2.1 Layering

Keep the engine free of React. It's a pure module: text + ruleset in, edit list out. The UI is a consumer. This matters because it makes the engine testable in vitest without rendering, and because later phases (server-side runs, CLI, integration with the editor) need it decoupled.

```
src/features/slop-linter/
  engine/          # pure TS, no React
    adapters/      # compromise + wink-nlp behind one interface
    matchers/      # literal, regex, pos
    guards/        # named predicate stdlib
    transforms/    # delete, replace, template filters
    invariants/    # post-fix validation
    pipeline.ts    # orchestration
  rules/
    core.yaml      # shipped pack
    schema.ts      # zod schema for rule validation
  ui/              # React components, three tabs
  state/           # store + localStorage persistence
```

### 2.2 Parser adapter

Two engines, one interface. Rules must never reference engine-specific APIs.

```ts
interface ParserAdapter {
  id: 'compromise' | 'wink';
  parse(text: string): ParsedDoc;
}

interface ParsedDoc {
  sentences: Sentence[];   // { start, end, tokens }
  tokens: Token[];         // { text, start, end, pos, lemma }
  match(pattern: string, scope?: Span): Span[];
}
```

- **compromise** is the default, statically imported (already in the bundle).
- **wink-nlp** loads via `import()` on toggle, together with `wink-eng-lite-web-model`. It's a multi-MB chunk — show a loading state, and fall back to compromise on failure with a visible notice.
- The two engines will disagree. Tag every result with the adapter id that produced it and surface that in the UI. Do not attempt to reconcile them.
- POS pattern syntax: adopt compromise's `#Adjective` convention as the canonical form; the wink adapter translates. Rules are written once.

### 2.3 Execution model

Synchronous, on the main thread, with a size cap (suggest ~50k chars) and a debounce on input. Above the cap, require an explicit "Analyze" click rather than live analysis.

Two passes, because document-level frequency is a first-class signal:

1. **Scan** — run all matchers over the doc, collect candidate matches, compute per-rule occurrence counts.
2. **Resolve** — apply guards (including frequency guards, which need pass-1 counts), sort, deselect overlaps, build the final edit list.

### 2.4 Edit model

Never mutate text incrementally — index invalidation from overlapping edits is the classic bug here.

```ts
type Tier = 'safe' | 'aggressive' | 'suggest';

type Candidate =
  | { kind: 'derived';   text: string; tier: Tier }
  | { kind: 'generated'; text: string; poolIds: string[] }  // no tier — cannot auto-apply
  | { kind: 'user';      text: string };

interface Edit {
  ruleId: string;
  span: { start: number; end: number };
  replacement: string;      // '' for deletion
  tier: Tier;
  status: 'pending' | 'accepted' | 'rejected';
  candidates?: Candidate[];
}
```
Edits are collected against original offsets, then applied right-to-left in a single pass. The edit list is the source of truth; accept/reject flips `status`; output is recomputed by replaying accepted edits. Undo is free.
Only derived candidates carry a tier, and only tiered candidates are eligible for auto-application. generated and user candidates are structurally incapable of entering the auto-apply path — this is enforced by the type, not by convention. user is live in v1 (free-text override in review mode); generated is reserved for Phase 2 and unused until then.

---

## 3. Rule format

Authored in YAML, normalized to JSON for runtime and localStorage.

```yaml
id: core/not-x-but-y
description: Removes the "it wasn't X, but Y" contrast frame.
severity: warn
tier: safe
enabled: true

match:
  type: regex
  value: '\b(?:it )?(?:wasn''t|isn''t|was not) (?<x>[^,]{1,40}), but (?<y>[^.!?]{1,60})'
  flags: gi

guards:
  - notInQuotes
  - notInCode
  - minDocFrequency: 2

fix:
  type: replace
  candidates:
    - 'it was ${y}'
    - '${y|capitalize}'

# Reserved for Phase 2. Not implemented in v1 — parsed and ignored.
# slots:
#   y:                                    # named capture from match
#     pos: '#Adjective'                   # constrains the eligible pool
#     pool: 'core/restrained-adjectives'

tests:
  - in: "It wasn't anger, but something quieter."
    out: "It was something quieter."
  - in: '"It wasn''t anger, but grief," she said.'
    out: '"It wasn''t anger, but grief," she said.'   # guard: notInQuotes
```

### 3.1 Field notes for the implementing agent

- **`match.type`**: `literal` | `regex` | `pos`. Literal is a plain string table entry (Tier 3 substitutions). POS uses compromise match syntax and may embed literal alternations: `with a #Adjective (precision|ease|weight)`.
- **`fix.candidates`**: ordered. Auto-fix takes the first that passes invariants; review mode shows all as a menu. A rule with `fix.type: none` is detect-only.
- **Template filters**: `capitalize`, `lowercase`, `lemma`, `indefinite` (a/an agreement). These five cover the mechanical repairs from splicing. Resist adding more without a concrete need.
- **`tests`**: required, minimum one positive and one negative. Enforce in the schema — a rule with no negative fixture is visibly untrustworthy and the validator should say so.
- **`tier`**: drives which mode applies the rule. Not a synonym for severity.
- **`slots`** (Phase 2, reserved): maps a named capture to a curated replacement pool. Slots are keyed per capture, not per rule — a pattern with two variable positions needs independent pools, and retrofitting that shape later would touch every rule. In v1 the schema accepts and ignores this key; do not implement pool resolution.

### 3.2 Guard stdlib (v1)

`notInQuotes` · `notInCode` · `notInHeading` · `notProperNoun` · `notSpanningSentence` · `minDocFrequency: n` · `sentenceLengthOver: n`

`notInQuotes` is the highest-value guard — characters are allowed to speak in clichés, and blanket-fixing dialogue will wreck fiction. Implement it carefully: handle straight and curly quotes, nested quotes, and apostrophe-vs-quote ambiguity.

`minDocFrequency` deserves emphasis: a construction appearing once is style, six times is a tic. This is the single best slop signal available without semantics, and it should be easy to express declaratively.

### 3.3 Validation and safety

- **Schema validation** via zod on every load and every user paste. Reject with field-level errors, never partially load a malformed pack.
- **Regex linting** before compilation: reject nested quantifiers (`(a+)+`), unbounded `.*` adjacent to alternation, and patterns exceeding a length cap. Reject, don't warn — a ReDoS on the main thread freezes the tab.
- **Timeout guard**: wrap each rule's execution and abort past a budget (suggest 50ms/rule). On timeout, disable the rule for the session and surface which rule stalled.
- **YAML parsed in safe mode** — no custom tags, no anchor expansion.

### 3.4 Conflict resolution

Deterministic and documented, because "my rule didn't fire" is the top support question for every linter:

1. Sort candidates by span start, then by length descending (longer/more specific wins), then by explicit `priority`, then by rule id for stability.
2. Greedy non-overlapping selection.
3. Suppressed matches are retained, not discarded, and shown in the UI with the reason (`overlapped by core/x`, `guard notInQuotes failed`).

### 3.5 Invariants

After each candidate edit, re-parse the affected sentence and assert: finite verb present, subject present, balanced quotes/brackets/parens, no doubled or orphaned punctuation, consistent boundary capitalization, named entities preserved. Failure reverts the edit and downgrades it to `suggest`.

Separately, assert **idempotence** in the test suite: applying the fixer twice must equal applying it once. Rules that re-fire on their own output are a recurring class of bug worth catching automatically.

---

## 4. UI

### 4.1 Modes

A single mode selector governs auto-application:

| Mode | Behavior |
|---|---|
| Safe | `tier: safe` edits pre-accepted; others pending |
| Aggressive | `safe` + `aggressive` pre-accepted |
| Review-only | Nothing pre-accepted |

Mode persists to localStorage. Changing mode recomputes `status` on pending edits only — never overrides an explicit user accept/reject.

### 4.2 Tabs

**Review** — prose with highlighted spans; a side list of edits grouped by rule. Each entry: matched text, proposed replacement, rule id, tier, accept/reject/choose-alternative. Bulk accept/reject per rule. Suppressed matches in a collapsed section with reasons.

**Diff** — original vs. output with accepted edits applied. Word-level diff. Copy button on the output.

**Playground** — YAML editor pane, sample prose pane, live match highlighting and fix preview. Inline schema/regex-lint errors. A "run fixtures" action showing pass/fail per test for the rule being edited.

Rule authoring is iterative guessing; the tightness of this loop determines whether anyone writes a second rule. If one piece of UI gets extra polish, make it this one.

### 4.3 Persistence

localStorage keys, namespaced under `slopLinter:`:
- `draft` — textarea contents, debounced
- `mode` — safe/aggressive/review-only
- `parser` — compromise/wink
- `userRules` — normalized JSON
- `disabledRuleIds` — core rules the user turned off

Version the persisted shape from day one and write a migration stub. Rule schema changes are inevitable.

### 4.4 Rule management

Import (YAML or JSON, paste or file), export (both formats), enable/disable per rule, and a rule inspector showing description, guards, fixtures, and in-app test results. User rules override core rules by id.

---

## 5. Shipped core pack (v1)

Three to five rules, chosen for guard depth over coverage. Suggested starting set:

1. **`core/not-x-but-y`** — `it wasn't X, but Y` → `it was Y`. Template inversion, `tier: safe`, guarded by `notInQuotes` + `minDocFrequency: 2`.
2. **`core/trailing-with-a`** — trailing `, with a [adj] [abstract noun]`. Excision. Requires a curated noun list (`precision`, `ease`, `weight`, `intensity`, `finality`) — the closed list is where the precision comes from, not the POS pattern. `tier: safe`.
3. **`core/not-just-but`** — `X isn't just A — it's B` → `X is B`. Template inversion, `tier: aggressive` (the discarded half more often carries meaning).
4. **`core/wordy-phrases`** — closed substitution table (`in order to` → `to`, `due to the fact that` → `because`). Boring, high-yield, near-zero risk. `tier: safe`.
5. *(optional)* **`core/sentence-initial-adverb`** — `Indeed,` / `Ultimately,` / `Importantly,` at sentence start. Excision, `tier: aggressive`, `minDocFrequency: 2`.

Each ships with at least one positive and one negative fixture. Rule 4 is the best first implementation target: it exercises the full pipeline end to end with the least matcher complexity.

---

## 6. Validation

**Golden corpus** — input/expected-output pairs, in-repo, run under vitest.

**Negative corpus** — prose that must pass through byte-identical: dialogue-heavy fiction, technical documentation, deliberately styled prose. This is the real quality metric. False positives cost trust; missed slop costs nothing. Precision over recall, without exception.

Track per-rule precision against the corpus and let measured precision drive tier assignment. That gives a principled promote/demote path instead of guessing.

Also assert: idempotence across the whole corpus, and adapter parity (flag rules whose results diverge sharply between compromise and wink — divergence usually means the pattern is leaning on POS tags that aren't reliable).

---

## 7. Suggested implementation order

Guesswork is intentionally light here. Sequence is a suggestion; the dependency direction is not.

**Phase A — engine skeleton.** Types, edit model, zod schema, literal matcher, delete/replace transforms, right-to-left applier. Ship `core/wordy-phrases` only. No UI beyond a textarea and an output pane. Vitest against a small corpus. *Goal: prove the edit pipeline is correct before adding matcher complexity.*

**Phase B — regex tier and safety.** Regex matcher with named captures, template filters, regex linting, timeout guard. Add `core/not-x-but-y`. *Goal: the safety machinery exists before user input touches it.*

**Phase C — guards and invariants.** Guard stdlib, `notInQuotes` first and most carefully. Post-fix invariant checks with revert-to-suggest. Two-pass pipeline for `minDocFrequency`. *Goal: nothing mangles.*

**Phase D — POS tier.** compromise adapter behind the `ParserAdapter` interface. Add `core/trailing-with-a` with its curated noun list. *Goal: the adapter boundary is real before a second engine exists.*

**Phase E — UI.** Three tabs, mode selector, localStorage persistence, accept/reject, diff view. *Goal: usable.*

**Phase F — user rules.** YAML parsing via dynamic import, import/export, in-app fixture runner, playground editor. *Goal: extensible.*

**Phase G — wink-nlp.** Dynamic import, model loading state, fallback on failure, adapter-parity reporting. *Goal: the accuracy escape hatch.*

Phases D and E can run in parallel once C lands. G is genuinely optional for v1 — ship without it if the compromise ceiling holds.

**Explicitly deferred:** JS-tier rules and sandboxing · Web Worker execution · rule pack semver and extends composition · UI-based rule authoring · corpus-backed replacement suggestions (review mode only, offered but never auto-applied) · integration with the rest of the frontend · dependency parsing.

---

## 8. Notes for implementing agents

- The engine is pure and React-free. If a change requires importing React into `engine/`, the design has drifted.
- The no-generation constraint is load-bearing, not stylistic. A "helpful" rule that substitutes a word not present in the input breaks the tool's core guarantee.
- When precision and recall conflict, choose precision. When a fix is uncertain, downgrade it to `suggest` rather than widening a guard.
- Suppressed matches are data, not noise — always retain and surface them with reasons.
- Do not add template filters, guards, or matcher types speculatively. Each addition is a surface a rule author has to learn.
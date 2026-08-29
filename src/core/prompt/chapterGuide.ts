// Chapters as prompt text: the Chapter guide (the list, stamped with each Chapter's state) and the
// Story prose the guide sits over. Pure and check-testable: the store resolves rows, this decides
// wording and shape.
//
// Extension-ful imports on purpose: checkChapterGuide.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Block, BlockContext, Chapter } from '../storage/types.ts'

/** The fields the guide needs off a Chapter row. */
export type GuideChapter = Pick<Chapter, 'id' | 'title' | 'summary' | 'blocks' | 'guideSend'>

/**
 * The Blocks that are part of the plan. One definition, used by the guide, the Story panel
 * checklist and the Plot Layout editor alike.
 *
 * The test is `!== ''`, not `.trim() !== ''`: a beat the Author has just added and not yet written
 * is still a beat, and it has to keep its box and its row. What it sends to the model is a separate
 * question, answered in `renderOne`: an unwritten beat says nothing, so it contributes no line.
 * Emptying the field outright is how a beat becomes free prose, and that is an explicit action.
 */
export const beatBlocks = (chapter: Pick<Chapter, 'blocks'>): Block[] =>
  chapter.blocks.filter(isBeat)

/** Whether a Block is a beat at all: see `beatBlocks` for why the test is `!== ''`. Exported so
 *  nothing spells it a second way: a caller that tests `.trim()` instead disagrees about a beat the
 *  Author has just added, and disagreeing about which Blocks are beats corrupts any write that maps
 *  an edited beat list back onto `blocks`. */
export const isBeat = (block: Block): boolean => block.beat !== ''

/** A Chapter's prose: its Blocks' content in order. Blocks are stretches of one document, so they
 *  join with a blank line, the same separator Chapters use inside the prose blob. */
export const chapterProse = (chapter: Pick<Chapter, 'blocks'>): string =>
  chapter.blocks
    .map((b) => b.content.trim())
    .filter(Boolean)
    .join('\n\n')

/** The line marking a Chapter boundary inside the Story prose, so the model can see where the
 *  boundaries fall as the prose scrolls past them. Prompt wording; keep it here with the rest. */
export const chapterDivider = (index: number, title: string): string =>
  `- Chapter ${index + 1}${title.trim() ? `: ${title.trim()}` : ''} -`

/** What a Chapter is doing right now, from two facts: has prose, and is the active Chapter. */
export type ChapterState = 'written' | 'writingNow' | 'notYetWritten'

/** Prompt wording, in one place: these are strings a model reads, and they get retuned. */
export const stateLabels: Record<ChapterState, string> = {
  written: '[written]',
  writingNow: '[writing now]',
  notYetWritten: '[not yet written]',
}

/** The one definition of "has prose" for the `written` stamp: any Block with non-whitespace text. */
export const hasProse = (chapter: Pick<Chapter, 'blocks'>): boolean =>
  chapter.blocks.some((b) => b.content.trim() !== '')

export function chapterState(chapter: GuideChapter, activeId: number | null): ChapterState {
  if (chapter.id != null && chapter.id === activeId) return 'writingNow'
  return hasProse(chapter) ? 'written' : 'notYetWritten'
}

/** Stamped on a beat the Author has ticked off. Prompt wording, same as `stateLabels`. */
export const beatDone = '[done]'

/** The line that stands in for whatever the trim took out, so the model knows there was more. */
export const earlierChaptersMarker = '(Earlier chapters not shown in full)'

/** How much of a Chapter the guide is currently showing. `full` is what `renderChapterGuide`
 *  always emits; the rest are rungs the trim steps down, gentlest first. */
type Detail = 'full' | 'summaryOnly' | 'titleOnly' | 'dropped'

/**
 * One Chapter's lines: its title row, then its summary (recap), then its beats (intent). Summary
 * before beats: what happened, then what is meant to happen.
 *
 * `guideSend` decides which halves exist at all; `detail` decides how many of them survive the
 * trim. The two are independent: the trim reads the mode, it never rewrites it, so a Chapter set
 * to `beats` has nothing to demote to and drops straight to its title row.
 */
function renderOne(
  chapter: GuideChapter,
  index: number,
  activeId: number | null,
  detail: Detail,
): string[] {
  if (detail === 'dropped' || chapter.guideSend === 'off') return []
  const title = chapter.title.trim()
  const lines = [`Chapter ${index + 1}${title ? ` - ${title}` : ''} ${stateLabels[chapterState(chapter, activeId)]}`]
  if (detail === 'titleOnly') return lines

  const wantsSummary = chapter.guideSend === 'summary' || chapter.guideSend === 'both'
  const summary = chapter.summary.trim()
  if (wantsSummary && summary) for (const line of summary.split('\n')) lines.push(`  ${line}`)
  if (detail === 'summaryOnly') return lines

  const wantsBeats = chapter.guideSend === 'beats' || chapter.guideSend === 'both'
  if (!wantsBeats) return lines
  // Done beats stay in and are marked: what's covered against what's still ahead is the pacing
  // signal, and dropping the covered half would leave the model reading the plan as all-remaining.
  for (const beat of beatBlocks(chapter)) {
    // A beat that has been added but not written says nothing about what is meant to happen.
    const text = beat.beat.trim()
    if (!text) continue
    lines.push(`  · ${text}${beat.done ? ` ${beatDone}` : ''}`)
  }
  return lines
}

/**
 * Every sending Chapter, in order, stamped with its state. Numbering counts position in the Story,
 * not position in the guide, so a Chapter set to `off` doesn't renumber the rest.
 *
 * Every Chapter contributes what its `guideSend` says it does. Beats are not the active Chapter's
 * privilege, because what's planned three Chapters out is exactly the pacing context the guide is
 * for.
 */
export function renderChapterGuide(chapters: GuideChapter[], activeId: number | null): string {
  const lines: string[] = []
  chapters.forEach((chapter, i) => lines.push(...renderOne(chapter, i, activeId, 'full')))
  return lines.join('\n')
}

/**
 * The same guide, capped at `allowance` tokens. `count` is injected so this file stays free of
 * gpt-tokenizer and the check scripts can run it under `--experimental-strip-types`.
 *
 * Three stages, gentlest first, and never touching the active Chapter or any Chapter after it:
 *
 * 1. Demote the earliest Chapters to summary alone, one at a time. A written Chapter whose prose
 *    has scrolled out of the window keeps its recap and loses only its beats, which are the least
 *    useful thing about a Chapter already written.
 * 2. Still over: reduce those to title rows, earliest first.
 * 3. Still over: drop them, earliest first.
 *
 * If even the active Chapter and its successors exceed the allowance, that is what comes back:
 * the guide never drops the Chapter being written. With no active Chapter the last rendered one
 * stands in as the floor, matching the "no cursor means the last Chapter" fallback the callers
 * already share.
 */
export function renderChapterGuideWithin(
  chapters: GuideChapter[],
  activeId: number | null,
  allowance: number,
  count: (s: string) => number,
): string {
  // Filtered first, so "earliest" means earliest among the Chapters that actually render.
  const sending = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter((x) => x.chapter.guideSend !== 'off')
  if (sending.length === 0) return ''

  const activeAt = sending.findIndex((x) => x.chapter.id != null && x.chapter.id === activeId)
  const floor = activeAt === -1 ? sending.length - 1 : activeAt

  const details: Detail[] = sending.map(() => 'full')

  const build = (): string => {
    const lines: string[] = []
    let removed = false
    sending.forEach((x, k) => {
      const shown = renderOne(x.chapter, x.index, activeId, details[k])
      // Compared against what the Chapter would have said in full, so a Chapter whose mode already
      // held nothing back doesn't earn the marker by being "demoted" to the same text.
      if (details[k] !== 'full' && shown.join('\n') !== renderOne(x.chapter, x.index, activeId, 'full').join('\n')) {
        removed = true
      }
      lines.push(...shown)
    })
    // The marker is inside the string being measured: the fit can't be blown by the line that says
    // it was fitted.
    return (removed ? [earlierChaptersMarker, ...lines] : lines).join('\n')
  }

  let out = build()
  if (count(out) <= allowance) return out

  for (const rung of ['summaryOnly', 'titleOnly', 'dropped'] as const) {
    for (let k = 0; k < floor; k++) {
      if (details[k] === rung) continue
      details[k] = rung
      out = build()
      if (count(out) <= allowance) return out
    }
  }
  return out
}

/**
 * The Story prose the Co-Writer sees: every Chapter up to and including the active one, divider
 * lines between them. Chapters after the active one are the future and contribute only their guide
 * rows: their prose (if any, after a reorder) would be text the passage hasn't reached yet.
 *
 * Nothing is trimmed here. The budget fills backward from the end of this blob, across Chapter
 * lines: Chapters do not partition the context window. What scrolls off the top is covered by the
 * summaries in the guide.
 */
export function storyProse(chapters: GuideChapter[], activeId: number | null): string {
  return storyProseSplit(chapters, activeId, null, 'both').text
}

/**
 * The same prose, split around one Block: `text` is everything before it (the Story context as
 * `storyProse` has always built it), `trailing` is the rest of the active Chapter after it: what
 * the model has to write its way back to. The Block's own content is in neither: it is what the
 * generation is replacing.
 *
 * `trailing` stops at the end of the active Chapter. Later Chapters are the future and stay out,
 * the same rule `text` follows on the other side.
 *
 * `context` is the Block's own setting and does nothing but blank one side or the other. That is
 * the whole of the per-Block context feature: `buildStoryPrompt` already took these two strings.
 *
 * With `blockId` null (a preview with no Block picked) the split falls at the end of the active
 * Chapter, `trailing` is '' and `text` is the whole prose, the shape this returned before Blocks.
 */
export function storyProseSplit(
  chapters: GuideChapter[],
  activeId: number | null,
  blockId: string | null,
  context: BlockContext,
): { text: string; trailing: string } {
  const activeIndex = chapters.findIndex((c) => c.id != null && c.id === activeId)
  const upTo = activeIndex === -1 ? chapters.length - 1 : activeIndex
  const parts: string[] = []
  const after: string[] = []
  chapters.slice(0, upTo + 1).forEach((chapter, i) => {
    // The first Chapter's divider is dropped: a one-Chapter Story reads as plain prose.
    if (i > 0) parts.push(chapterDivider(i, chapter.title))
    if (i !== upTo || blockId == null) {
      const text = chapterProse(chapter)
      if (text) parts.push(text)
      return
    }
    // The active Chapter, split at the Block. An unknown id lands everything before it, which
    // matches the no-Block fallback rather than silently dropping the Chapter.
    const at = chapter.blocks.findIndex((b) => b.id === blockId)
    const cut = at === -1 ? chapter.blocks.length : at
    for (const [j, block] of chapter.blocks.entries()) {
      const text = block.content.trim()
      if (!text || j === cut) continue
      ;(j < cut ? parts : after).push(text)
    }
  })
  return {
    text: context === 'before' || context === 'both' ? parts.join('\n\n') : '',
    trailing: context === 'after' || context === 'both' ? after.join('\n\n') : '',
  }
}

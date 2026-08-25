// Chapters as prompt text: the Chapter guide (the list, stamped with each Chapter's state) and the
// Story prose the guide sits over. Pure and check-testable — the store resolves rows, this decides
// wording and shape.
//
// Extension-ful imports on purpose: checkChapterGuide.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Chapter } from '../storage/types.ts'

/** The fields the guide needs off a Chapter row. */
export type GuideChapter = Pick<Chapter, 'id' | 'title' | 'summary' | 'beats' | 'sendEnabled' | 'text'>

/** The line marking a Chapter boundary inside the Story prose, so the model can see where the
 *  boundaries fall as the prose scrolls past them. Prompt wording; keep it here with the rest. */
export const chapterDivider = (index: number, title: string): string =>
  `— Chapter ${index + 1}${title.trim() ? `: ${title.trim()}` : ''} —`

/** What a Chapter is doing right now, from two facts: has prose, and is the active Chapter. */
export type ChapterState = 'written' | 'writingNow' | 'notYetWritten'

/** Prompt wording, in one place: these are strings a model reads, and they get retuned. */
export const stateLabels: Record<ChapterState, string> = {
  written: '[written]',
  writingNow: '[writing now]',
  notYetWritten: '[not yet written]',
}

/** The one definition of "has prose" for the `written` stamp: any non-whitespace text. */
export const hasProse = (chapter: Pick<Chapter, 'text'>): boolean => chapter.text.trim() !== ''

export function chapterState(chapter: GuideChapter, activeId: number | null): ChapterState {
  if (chapter.id != null && chapter.id === activeId) return 'writingNow'
  return hasProse(chapter) ? 'written' : 'notYetWritten'
}

/**
 * Every send-enabled Chapter, in order, stamped with its state. Numbering counts position in the
 * Story, not position in the guide, so a Chapter toggled off doesn't renumber the rest.
 *
 * Beats render in full only for the active Chapter — they're working instructions for the passage
 * being written now, not arc-level context. Every other Chapter contributes title and summary.
 */
export function renderChapterGuide(chapters: GuideChapter[], activeId: number | null): string {
  const lines: string[] = []
  chapters.forEach((chapter, i) => {
    if (!chapter.sendEnabled) return
    const state = chapterState(chapter, activeId)
    const title = chapter.title.trim()
    lines.push(`Chapter ${i + 1}${title ? ` — ${title}` : ''} ${stateLabels[state]}`)
    const summary = chapter.summary.trim()
    if (summary) for (const line of summary.split('\n')) lines.push(`  ${line}`)
    if (state !== 'writingNow') return
    const beats = chapter.beats.filter((b) => b.trim())
    if (beats.length === 0) return
    lines.push('  Beats:')
    for (const beat of beats) lines.push(`    · ${beat.trim()}`)
  })
  return lines.join('\n')
}

/**
 * The Story prose the Co-Writer sees: every Chapter up to and including the active one, divider
 * lines between them. Chapters after the active one are the future and contribute only their guide
 * rows — their prose (if any, after a reorder) would be text the passage hasn't reached yet.
 *
 * Nothing is trimmed here. The budget fills backward from the end of this blob, across Chapter
 * lines: Chapters do not partition the context window. What scrolls off the top is covered by the
 * summaries in the guide.
 */
export function storyProse(chapters: GuideChapter[], activeId: number | null): string {
  return storyProseSplit(chapters, activeId).text
}

/**
 * The same prose, split at a caret offset into the active Chapter: `text` is everything before the
 * caret (the Story context as `storyProse` has always built it), `trailing` is the rest of the
 * active Chapter — what the model has to write its way back to.
 *
 * `trailing` stops at the end of the active Chapter. Later Chapters are the future and stay out,
 * the same rule `text` follows on the other side.
 *
 * With no caret (or a caret at the very end) `trailing` is '' and `text` is the whole prose, so the
 * no-caret path is byte-for-byte what it was before carets existed.
 */
export function storyProseSplit(
  chapters: GuideChapter[],
  activeId: number | null,
  caretOffset?: number,
): { text: string; trailing: string } {
  const activeIndex = chapters.findIndex((c) => c.id != null && c.id === activeId)
  const upTo = activeIndex === -1 ? chapters.length - 1 : activeIndex
  const parts: string[] = []
  let trailing = ''
  chapters.slice(0, upTo + 1).forEach((chapter, i) => {
    // The first Chapter's divider is dropped: a one-Chapter Story reads as plain prose.
    if (i > 0) parts.push(chapterDivider(i, chapter.title))
    let text = chapter.text
    if (i === upTo && caretOffset != null) {
      const at = Math.min(Math.max(caretOffset, 0), text.length)
      trailing = text.slice(at)
      text = text.slice(0, at)
    }
    if (text.trim()) parts.push(text)
  })
  return { text: parts.join('\n\n'), trailing }
}

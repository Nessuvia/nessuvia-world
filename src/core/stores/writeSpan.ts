// The rule for "is the last generation still there?", kept out of writeStore.ts so checkWriteSpan.ts
// can import it — the store pulls in Dexie and zustand, neither of which runs under
// `node --experimental-strip-types`.
//
// Extension-ful imports on purpose, for the same reason.
import type { Chapter } from '../storage/types.ts'

/** The span a generation wrote, as stored on the Chapter. */
export type GenerationSpan = NonNullable<Chapter['lastGeneration']>

/** The fields the span rules need off a Chapter row. */
export type SpanChapter = Pick<Chapter, 'id' | 'text' | 'lastGeneration'>

/**
 * The last generation's span, or null when there isn't a usable one.
 *
 * The span stores the text it wrote as well as its offsets, so validating it is a string compare
 * rather than offset bookkeeping on every keystroke: if the Chapter no longer reads that way at
 * those offsets, the Author has edited over it and Retry / Continue / Undo have nothing to act on.
 * One rule, used by both the store and the sidebar, so the buttons and the actions never disagree.
 */
export function validSpan(chapter?: SpanChapter | null): GenerationSpan | null {
  const span = chapter?.lastGeneration
  if (!span) return null
  return chapter!.text.slice(span.start, span.end) === span.text ? span : null
}

/**
 * Which Chapter the generation buttons act on: the active one when its span is intact, else the
 * last Chapter that has one. The fallback is what makes the buttons survive a reload, where
 * `activeChapterId` resets to the last Chapter rather than to wherever generation happened.
 */
export function spanChapter<T extends SpanChapter>(
  chapters: T[],
  activeChapterId: number | null,
): T | null {
  const active = chapters.find((c) => c.id === activeChapterId)
  if (validSpan(active)) return active!
  for (let i = chapters.length - 1; i >= 0; i--) if (validSpan(chapters[i])) return chapters[i]
  return null
}

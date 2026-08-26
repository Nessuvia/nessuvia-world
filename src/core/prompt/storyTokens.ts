// The {{tokens}} a Story stack understands. Write mode's answer to `swapTokens` — a different set
// of names over different data, so it is a separate table rather than an arm of the chat one.
//
// Extension-ful imports on purpose: checkStoryTokens.ts runs this under
// `node --experimental-strip-types`.

/** The Block fields a token reads. `Block` satisfies this structurally. */
export interface TokenBlock {
  id: string
  beat: string
  targetWords: number
  done: boolean
}

/** The Chapter fields a token reads. `Chapter` satisfies this structurally. */
export interface TokenChapter {
  id?: number
  title: string
  summary: string
  blocks: TokenBlock[]
}

export interface StoryTokenArgs {
  title: string
  premise: string
  ending: string
  /** Names of the enabled cast, in cast order. The `cast` bound block sends the full cards; this is
   *  the same people as a list you can write a sentence around. */
  castNames: string[]
  chapters: TokenChapter[]
  /** The Chapter being written into, and the Block inside it. Either may be null before a cursor
   *  exists; every token that needs them then resolves to ''. */
  chapterId: number | null
  blockId: string | null
}

const beatLines = (blocks: TokenBlock[]) =>
  blocks
    .filter((b) => b.beat.trim())
    .map((b) => `- ${b.beat.trim()}`)
    .join('\n')

/**
 * Every Story token and its value. An unset field resolves to '' rather than being left out, so a
 * sentence built around a token that has nothing behind it comes out blank instead of showing the
 * token to the model — the same rule `castTokens` follows.
 */
export function storyTokens(args: StoryTokenArgs): Record<string, string> {
  const { chapters, chapterId, blockId } = args
  const at = chapters.findIndex((c) => c.id === chapterId)
  const chapter = at === -1 ? undefined : chapters[at]
  const previous = at > 0 ? chapters[at - 1] : undefined
  const next = at === -1 ? undefined : chapters[at + 1]
  const block = chapter?.blocks.find((b) => b.id === blockId)
  const others = (chapter?.blocks ?? []).filter((b) => b.id !== blockId && b.beat.trim())

  return {
    storyTitle: args.title.trim(),
    premise: args.premise.trim(),
    ending: args.ending.trim(),
    castNames: args.castNames.filter((n) => n.trim()).join(', '),

    chapterNumber: at === -1 ? '' : String(at + 1),
    chapterCount: String(chapters.length),
    chapterTitle: chapter?.title.trim() ?? '',
    chapterSummary: chapter?.summary.trim() ?? '',
    previousChapterSummary: previous?.summary.trim() ?? '',
    nextChapterTitle: next?.title.trim() ?? '',
    nextChapterBeats: next ? beatLines(next.blocks) : '',

    beat: block?.beat.trim() ?? '',
    // 0 is "unset" on the Block, and a prompt saying "about 0 words" is worse than one saying
    // nothing, so it resolves blank like every other unset field.
    beatTargetWords: block && block.targetWords > 0 ? String(block.targetWords) : '',
    beatsDone: beatLines(others.filter((b) => b.done)),
    beatsRemaining: beatLines(others.filter((b) => !b.done)),
  }
}

/**
 * Substitutes the known Story tokens. Unknown {{tokens}} are left exactly as they are, same as
 * `swapTokens`. Matching is case-insensitive.
 *
 * A line whose known tokens ALL resolve to '' is dropped whole, sentence and all. Without that,
 * "Aim for about {{beatTargetWords}} words." survives as an instruction with a hole in it every
 * time the field is unset — and a block whose every line is one of those drops out of the prompt
 * entirely, which is what makes a Beat block safe to leave in a stack while writing free prose.
 * A line mixing an empty token with a filled one is kept: something on it still has content.
 *
 * Only ever applied to a prompt block's own text — never to Story prose. A {{token}} the Author
 * typed into their manuscript is manuscript.
 */
export function swapStoryTokens(text: string, values: Record<string, string>): string {
  if (!text) return text
  const folded = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  const kept: string[] = []
  for (const line of text.split('\n')) {
    let known = 0
    let filled = 0
    const swapped = line.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
      const value = folded.get(key.toLowerCase())
      if (value === undefined) return whole
      known++
      if (value.trim()) filled++
      return value
    })
    if (known > 0 && filled === 0) continue
    kept.push(swapped)
  }
  return kept.join('\n')
}

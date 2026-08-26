// Mapping an edited beat list back onto a Chapter's `blocks`. Its own file rather than a helper in
// PlotLayout.tsx so checkBeatSlots.ts can run it under `node --experimental-strip-types`, which
// cannot parse JSX — and this is logic that has already shipped one bug.
//
// Extension-ful imports on purpose, for the same reason.
import type { Block, Chapter } from '../../core/storage/types.ts'
import { isBeat } from '../../core/prompt/chapterGuide.ts'

/**
 * A `blocks` array with its beats replaced by `next`, in the same slots the old beats held. Free
 * stretches keep their positions, so editing the plan on the Plot Layout tab never shuffles prose
 * the Author wrote outside it.
 *
 * `next` comes from `beatBlocks`, so both sides must agree on which Blocks are beats — that is why
 * the slot scan calls `isBeat` rather than spelling the test again. When they disagreed, a beat the
 * Author had just added counted in `next` but held no slot, so every keystroke appended a copy
 * instead of replacing it.
 *
 * Beats in `next` with no slot left (the list grew) go on the end. Slots with no entry left in
 * `next` (a beat was removed) are dropped.
 */
export function withBeats(chapter: Pick<Chapter, 'blocks'>, next: Block[]): Block[] {
  const out: Block[] = []
  let k = 0
  for (const block of chapter.blocks) {
    if (!isBeat(block)) {
      out.push(block)
      continue
    }
    // This slot takes the next entry in the edited list, whatever its id — that is what makes a
    // reorder land in place rather than appending. A slot past the end of `next` held a beat that
    // was removed, so it is simply not written out.
    if (k < next.length) out.push(next[k++])
  }
  return [...out, ...next.slice(k)]
}

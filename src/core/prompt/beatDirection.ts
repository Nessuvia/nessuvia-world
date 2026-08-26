// The Direction a "Write this beat" click sends. Prompt text, so it lives here with the rest of it
// rather than in the store — and pure, so checkBeatDirection.ts can run it.
//
// Extension-ful imports on purpose (none needed today): this file runs under
// `node --experimental-strip-types`.

/**
 * A beat, folded into a Direction. The beat is the plan; whatever is in the Direction box is extra
 * steering and rides after it. The composed string is what `generate` stores in
 * `lastGeneration.direction`, so a Retry reruns the beat instruction rather than the bare box.
 *
 * A target of 0 is unset and drops the word clause. An empty beat leaves the box contents alone.
 */
export function beatDirection(beatText: string, targetWords: number, boxText: string): string {
  const beat = beatText.trim()
  const box = boxText.trim()
  if (!beat) return box
  const head =
    targetWords > 0 ? `Write the next beat in about ${targetWords} words:` : 'Write the next beat:'
  return box ? `${head}\n${beat}\n\n${box}` : `${head}\n${beat}`
}

// Parsing the Bulk Add box into beats. Its own file rather than a helper in PlotLayout.tsx so
// checkBulkBeats.ts can run it under `node --experimental-strip-types`, which cannot parse JSX.
//
// Extension-ful imports on purpose, for the same reason.
import { emptyBeat } from './beatSlots.ts'

/** One parsed entry: the beat line, and its word target. 0 is unset, matching `Block.targetWords`. */
export interface BulkBeat {
  beat: string
  targetWords: number
}

/**
 * The accepted shape is `{"text",200}`, comma separated, with the count optional: `{"text"}`.
 *
 * Deliberately hand-rolled rather than coerced into JSON.parse: the format is not JSON (the braces
 * hold a positional pair, not an object), and a JSON error message would name a syntax the Author
 * never typed.
 *
 * Whitespace and newlines between entries are free, the separating commas are optional, and a
 * trailing one is fine — a list pasted out of a spreadsheet or a chat reply should go in as it is.
 * Inside the quotes, `\"` is a literal quote and `\\` a literal backslash; every other character,
 * newlines included, stands for itself.
 */
export function parseBulkBeats(input: string): { beats: BulkBeat[]; error: string } {
  const beats: BulkBeat[] = []
  let i = 0
  const ws = () => {
    while (i < input.length && /\s/.test(input[i])) i++
  }
  // Between entries the separators carry no meaning, so they are skipped rather than required.
  const gap = () => {
    while (i < input.length && /[\s,]/.test(input[i])) i++
  }
  // Position is 1-based: it is shown to a person looking at a textarea, not used as an index.
  const fail = (what: string) => ({ beats: [], error: `${what} at character ${i + 1}.` })

  gap()
  while (i < input.length) {
    if (input[i] !== '{') return fail('Expected {')
    i++
    ws()
    if (input[i] !== '"') return fail('Expected a quoted beat')
    i++

    let text = ''
    let closed = false
    while (i < input.length) {
      const c = input[i]
      if (c === '\\' && i + 1 < input.length) {
        // Only the two escapes the format defines. Anything else keeps its backslash, so a Windows
        // path or a stray slash in the prose survives being pasted in.
        const next = input[i + 1]
        text += next === '"' || next === '\\' ? next : c + next
        i += 2
        continue
      }
      if (c === '"') {
        closed = true
        i++
        break
      }
      text += c
      i++
    }
    if (!closed) return fail('Unclosed quote')

    ws()
    let targetWords = 0
    if (input[i] === ',') {
      i++
      ws()
      const start = i
      while (i < input.length && /[0-9]/.test(input[i])) i++
      if (i === start) return fail('Expected a word count')
      targetWords = Number(input.slice(start, i))
      ws()
    }

    if (input[i] !== '}') return fail('Expected }')
    i++

    // A beat that is blank or all spaces still has to be a beat: '' is what makes a Block free
    // prose, and pasting an empty pair is not how the Author asks for that. Same rule the beat
    // field itself follows.
    beats.push({ beat: text.replace(/\s*\n\s*/g, ' ').trim() || emptyBeat, targetWords })
    gap()
  }

  if (beats.length === 0) return { beats: [], error: 'Nothing to add.' }
  return { beats, error: '' }
}

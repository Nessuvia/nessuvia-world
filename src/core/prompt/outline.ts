// Generate outline: the request the Plot Layout's button sends, and the parse of what comes back.
// Pure: no store, no fetch, so checkOutline.ts can run it.
//
// Extension-ful imports on purpose: the check scripts run this under
// `node --experimental-strip-types`.
import type { ChatMessage } from '../connectors/connectorInterface.ts'
import { firstJsonObject } from '../palette/palettePrompt.ts'
import { fillSlots, miscPrompt, type MiscPrompts } from './miscPrompts.ts'

/** What the dialog collected. `beatsPerChapter: 0` lets the model pick; `wordsPerChapter: 0` is
 *  unset, and leaves every generated beat's `targetWords` at 0. */
export interface OutlineRequest {
  premise: string
  chapters: number
  beatsPerChapter: number
  wordsPerChapter: number
}

/** One chapter of a parsed reply. Maps onto a Chapter's title/summary and its beat Blocks. */
export interface OutlineChapter {
  title: string
  summary: string
  beats: string[]
}

/** Ceilings on what a reply may turn into, applied at the parse. A model that answers with two
 *  hundred chapters of forty beats each would otherwise become that many Dexie records. */
const maxChapters = 60
const maxBeats = 40

export function buildOutlineMessages(req: OutlineRequest, prompts?: MiscPrompts): ChatMessage[] {
  const beats =
    req.beatsPerChapter > 0
      ? `Give every chapter exactly ${req.beatsPerChapter} beats.`
      : 'Give every chapter as many beats as it needs.'
  const words = req.wordsPerChapter > 0 ? `Each chapter runs about ${req.wordsPerChapter} words.\n` : ''
  const text = fillSlots(miscPrompt('outline', prompts), {
    premise: req.premise.trim(),
    chapters: String(req.chapters),
    beats,
    words,
  })
  // One system turn. There is no history and no stack here: the whole request is the instruction,
  // and an endpoint that wants a user turn to answer at all gets a bare one.
  return [
    { role: 'system', content: text },
    { role: 'user', content: 'Write the outline.' },
  ]
}

/**
 * The reply, as chapters. Model output, so nothing is trusted: the object is cut out rather than
 * parsed whole, every field is coerced, and an entry that holds no title and no summary and no
 * beats is dropped rather than becoming an empty Chapter.
 *
 * Throws with a readable message when there is nothing usable. The dialog shows it, and the store
 * only deletes the existing chapters after this has returned.
 */
export function parseOutlineReply(text: string): OutlineChapter[] {
  const json = firstJsonObject(text)
  if (!json) {
    throw new Error(
      text.includes('{')
        ? 'The reply started a JSON object but never closed it. It was probably cut off.'
        : 'The reply had no JSON object in it.',
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new Error(`The reply's JSON did not parse: ${(err as Error).message}`)
  }

  const rows = (raw as { chapters?: unknown })?.chapters
  if (!Array.isArray(rows)) throw new Error('The reply held no chapters array.')

  const out: OutlineChapter[] = []
  for (const row of rows.slice(0, maxChapters)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const title = str(r.title)
    const summary = str(r.summary)
    const beats = Array.isArray(r.beats)
      ? r.beats.map(str).filter((b) => b !== '').slice(0, maxBeats)
      : []
    if (!title && !summary && beats.length === 0) continue
    out.push({ title, summary, beats })
  }

  if (out.length === 0) throw new Error('The reply held no chapters.')
  return out
}

/** A field as a single-line string. A number or a boolean is written out rather than dropped;
 *  anything else (an object, an array, null) is not text and becomes nothing. */
function str(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s*\n\s*/g, ' ').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * The chapter's word target split across its beats. Whole words, with the remainder spread one each
 * over the earliest beats, so the parts add back up to `total` exactly. The Plot Layout shows the
 * sum as the chapter target, and a rounded split that misses by a few words shows there.
 *
 * `total` of 0 (unset) gives zeroes, which is what `Block.targetWords` means by unset.
 */
export function splitTargets(total: number, count: number): number[] {
  if (count <= 0) return []
  if (total <= 0) return new Array(count).fill(0)
  const base = Math.floor(total / count)
  const extra = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))
}

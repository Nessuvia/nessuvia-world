// Extension-ful imports on purpose: checkWorldInfo.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports.
import type { Message, WorldBook, WorldInfoEntry } from '../storage/types'
import { countTokens } from './budget.ts'

/** Scan window when neither the entry nor its book says how far back to look. */
export const defaultDepth = 4

const window = (entry: WorldInfoEntry, book?: WorldBook) =>
  entry.scanDepth ?? book?.scanDepth ?? defaultDepth

// substring, not word boundary — a key of "BA" fires inside "abandon". Upgrade to a
// \b-anchored regex per key if that bites in practice.
const mentions = (haystack: string, keys: string[]) =>
  keys.some((key) => haystack.includes(key.toLowerCase()))

/**
 * The entries that belong in this turn's prompt: every enabled always-on one, plus any whose key
 * appears within its own scan window of recent history. Sorted the way the card ordered them.
 *
 * Each entry gets its own window because the depth is per entry, so the text being searched differs
 * from one to the next — there's no single haystack to build up front.
 */
export function matchedEntries(
  entries: WorldInfoEntry[],
  messages: Message[],
  book?: WorldBook,
): WorldInfoEntry[] {
  return entries
    .filter((entry) => {
      if (!entry.enabled || !entry.content.trim()) return false
      if (entry.always) return true
      if (!entry.keys.length) return false
      const recent = messages.slice(-window(entry, book))
      return recent.some((m) => mentions(m.content.toLowerCase(), entry.keys))
    })
    .sort((a, b) => a.order - b.order || (a.id ?? 0) - (b.id ?? 0))
}

/**
 * What the World info block contributes: the matched entries' content, newline-joined, kept under
 * the book's token budget. '' when nothing matched, which the prompt builder already treats as an
 * empty bound field and reports as skipped.
 *
 * The budget is enforced rather than advisory: real books carry entries of several hundred words
 * each, so a handful firing at once would swallow the context before history got any.
 */
export function worldInfoText(
  entries: WorldInfoEntry[],
  messages: Message[],
  book?: WorldBook,
): string {
  const matched = matchedEntries(entries, messages, book)
  const budget = book?.tokenBudget
  if (budget === undefined || budget <= 0) return matched.map((e) => e.content).join('\n')

  // drops whole entries from the tail of the card's own order once the budget is spent.
  // No priority, probability or group weighting — those stay in `raw` until someone wants them.
  const kept: string[] = []
  let used = 0
  for (const entry of matched) {
    const cost = countTokens(entry.content)
    // The first match always goes in, over budget or not. Real cards set budgets smaller than a
    // single entry — the reference book allows 500 tokens for entries of 700 — and a book that
    // silently injects nothing at all reads as broken rather than as thrifty.
    if (kept.length && used + cost > budget) break
    kept.push(entry.content)
    used += cost
  }
  return kept.join('\n')
}

// Extension-ful imports on purpose: checkRuleJson.ts runs this under `node --experimental-strip-types`.
import type { SecondPassRule } from '../stores/settingsStore.ts'

/**
 * Free-text rules in and out as JSON, so a set can be written in a file, pasted from somewhere, or
 * handed to someone else. Rules are the part of Second Pass worth sharing: they are prose about
 * prose, and authoring twenty of them through a form is miserable.
 *
 * Untrusted input. A rule's `find` becomes a RegExp and its `note` goes into a prompt, so both are
 * checked here rather than at the point they are used.
 */

/** What `exportRules` writes and `parseRules` recognises. */
const FORMAT = 'nessuTavern.rules'

export function exportRules(rules: SecondPassRule[]): string {
  return JSON.stringify({ format: FORMAT, rules }, null, 2)
}

export function downloadRules(rules: SecondPassRule[]) {
  const url = URL.createObjectURL(new Blob([exportRules(rules)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `XeniaNessuvia-rules-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function one(raw: unknown, index: number): SecondPassRule {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Rule ${index + 1} is not an object.`)
  }
  const r = raw as Record<string, unknown>
  const find = str(r.find)
  const note = str(r.note)
  // A rule with neither has nothing to match and nothing to say. `textRules` skips it silently,
  // which would make a typo in a pasted file look like a successful import.
  if (!find.trim() && !note.trim()) throw new Error(`Rule ${index + 1} has no find and no note.`)

  const regex = bool(r.regex, false)
  if (regex && find.trim()) {
    try {
      new RegExp(find)
    } catch (err) {
      throw new Error(`Rule ${index + 1} has a bad regex: ${(err as Error).message}`)
    }
  }

  const scope = r.scope === 'user' || r.scope === 'both' ? r.scope : 'assistant'
  return {
    // Always a fresh id. An imported file may carry ids already in the list, and the same rule
    // twice under one id is worse than the same rule twice.
    id: crypto.randomUUID(),
    enabled: bool(r.enabled, true),
    label: str(r.label) || undefined,
    find,
    regex,
    caseSensitive: bool(r.caseSensitive, false),
    scope,
    note,
  }
}

/**
 * Read rules from text. Three shapes are accepted, because all three are things a person actually
 * has to hand: what `exportRules` wrote, a bare array of rules, and a single rule object.
 */
export function parseRules(text: string): SecondPassRule[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not JSON: ${(err as Error).message}`)
  }

  let list: unknown = data
  if (data && typeof data === 'object' && !Array.isArray(data) && 'rules' in data) {
    list = (data as { rules: unknown }).rules
  }
  if (!Array.isArray(list)) list = [list]

  const rules = (list as unknown[]).map(one)
  if (rules.length === 0) throw new Error('No rules in that file.')
  return rules
}

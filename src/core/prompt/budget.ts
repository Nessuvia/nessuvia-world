import type { Message } from '../storage/types'

// The BPE table is big, so it loads on demand and never touches first paint. The single-encoding
// entrypoint matters: the package root bundles every encoding it ships, which doubled the chunk.
let count: ((text: string) => number) | null = null

export async function loadTokenizer() {
  if (!count) count = (await import('gpt-tokenizer/encoding/o200k_base')).countTokens
}

/** Roles and delimiters aren't free: every message costs a little more than its text. */
export const perMessageOverhead = 4

// one tokenizer for all models — per-family tokenizers if the margin stops covering it.
// Exact for OpenAI-family, 10-20% off for Llama/Mistral/Qwen; safetyMarginPct absorbs that.
export function countTokens(text: string): number {
  // chars/4 before the table lands. Every caller that shows numbers awaits loadTokenizer.
  return count ? count(text) : Math.ceil(text.length / 4)
}

export function countMessages(messages: { content: string }[]): number {
  return messages.reduce((n, m) => n + countTokens(m.content) + perMessageOverhead, 0)
}

export interface Budget {
  contextLimit: number
  maxTokens: number
  safetyMarginPct: number
}

export interface Trimmed {
  /** A contiguous tail of the input — history is never reordered. */
  messages: Message[]
  /** The messages that didn't fit, oldest first — the preview names them, not just counts them. */
  dropped: Message[]
  droppedCount: number
  available: number
  /** Context can't even hold the system prompt plus the reply reserve. */
  overflow: boolean
}

/** Keeps the newest history that fits, dropping the rest from the top. */
export function trimHistory(messages: Message[], fixedTokens: number, budget: Budget): Trimmed {
  const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
  const available = Math.floor(budget.contextLimit - fixedTokens - budget.maxTokens - margin)

  if (available <= 0) {
    return { messages: [], dropped: messages, droppedCount: messages.length, available, overflow: true }
  }

  let used = 0
  let keepFrom = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = countTokens(messages[i].content) + perMessageOverhead
    // One message bigger than the whole allowance keeps nothing; no mid-message truncation yet.
    if (used + cost > available) break
    used += cost
    keepFrom = i
  }

  return {
    messages: messages.slice(keepFrom),
    dropped: messages.slice(0, keepFrom),
    droppedCount: keepFrom,
    available,
    overflow: false,
  }
}

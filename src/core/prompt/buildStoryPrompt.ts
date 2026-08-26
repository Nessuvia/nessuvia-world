// Extension-ful imports on purpose: checkBuildStoryPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { PromptBlock, PromptStack } from '../storage/types'
import { activeContent } from '../storage/types.ts'
import { swapBlockVals } from './swapTokens.ts'
import type { Budget } from './budget.ts'
import { countTokens, perMessageOverhead } from './budget.ts'
import type { GuideChapter } from './chapterGuide.ts'
import { renderChapterGuide, renderChapterGuideWithin } from './chapterGuide.ts'

/** An enabled cast member, flattened to the card fields the Co-Writer needs. The store resolves
 *  Character/Persona rows into this so the assembly stays pure and check-testable. */
export interface CastMember {
  name: string
  description: string
  personality?: string
  scenario?: string
  exampleDialogue?: string
}

/** The enabled cast as one block of reference text — one member per stanza, blank fields dropped. */
export function castText(members: CastMember[]): string {
  return members
    .map((m) =>
      [`Name: ${m.name}`, m.description, m.personality, m.scenario, m.exampleDialogue]
        .filter((s) => s && s.trim())
        .join('\n\n'),
    )
    .filter((s) => s.trim())
    .join('\n\n')
}

/** A bound block wrapped in its own open/close text (e.g. `<cast>…</cast>`). */
function wrap(block: PromptBlock, inner: string): string {
  return [block.content, inner, block.closeContent].filter((t) => t && t.trim()).join('\n')
}

/** The text a bound source stands for. `story` varies between the two render passes. */
interface Bound {
  cast: string
  authorNote: string
  chapterGuide: string
  story: string
  storyTrailing: string
}

/**
 * A block's text: own content, children, then its closing text. Bound sources resolve to their
 * content wherever they sit — a Cast block nested inside a `<character>` wrapper contributes the
 * same text it would at the top level, just indented into the parent's join.
 */
function blockText(block: PromptBlock, bound: Bound): string {
  if (block.disabled) return ''
  switch (block.source) {
    case 'cast':
      return wrap(block, bound.cast)
    case 'authorNote':
      return wrap(block, bound.authorNote)
    case 'chapterGuide':
      return wrap(block, bound.chapterGuide)
    case 'storyContext':
      return wrap(block, bound.story)
    case 'storyTrailing':
      // Guarded rather than left to `wrap`: this block carries instruction text of its own ("must
      // lead into the text below"), and with no caret there is no text below for it to point at.
      return bound.storyTrailing.trim() ? wrap(block, bound.storyTrailing) : ''
    default: {
      let own = block.source === 'text' ? activeContent(block) : ''
      if (block.input) own = swapBlockVals(own, block.input)
      const parts = [
        own,
        ...(block.children ?? []).map((c) => blockText(c, bound)),
        block.closeContent ?? '',
      ]
      return parts.filter((t) => t.trim()).join('\n')
    }
  }
}

/** Is there an enabled Story-context block anywhere in the tree? */
function hasStory(blocks: PromptBlock[]): boolean {
  return blocks.some(
    (b) => !b.disabled && (b.source === 'storyContext' || hasStory(b.children ?? [])),
  )
}

/**
 * Keep the newest prose that fits, dropping whole lines from the top. Mirrors trimHistory's
 * end-backward rule for the single Story-context blob.
 * ponytail: line-granular, no mid-line truncation — a single line bigger than the budget drops
 * everything, same as trimHistory. Upgrade to sentence/char granularity if that ever bites.
 */
export function fitEndBackward(text: string, available: number): string {
  if (available <= 0) return ''
  if (countTokens(text) + perMessageOverhead <= available) return text
  const lines = text.split('\n')
  let used = perMessageOverhead
  let keepFrom = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const cost = countTokens(lines[i]) + 1 // ~1 token for the rejoining newline
    if (used + cost > available) break
    used += cost
    keepFrom = i
  }
  return lines.slice(keepFrom).join('\n')
}

/**
 * Cap on the "What follows" block, in tokens.
 *
 * The trailing text is priced in the fixed pass, so every token of it is a token `fitEndBackward`
 * can't spend on Story context. What the model actually needs is the passage it has to join up
 * with — the sentences immediately after the caret — so a few hundred tokens carries the job, and
 * a caret placed near the top of a long Chapter must not push the whole preceding Story out of the
 * window. Raise it if joins start reading as though the model couldn't see far enough ahead.
 */
export const maxTrailingTokens = 400

/**
 * Keep the text nearest the caret, dropping whole lines from the bottom. The mirror image of
 * `fitEndBackward`: that one keeps the end of the prose, this one keeps the start of the tail,
 * because in both cases the text closest to the insert point is the text that matters.
 */
export function fitStartForward(text: string, available: number): string {
  if (available <= 0) return ''
  if (countTokens(text) + perMessageOverhead <= available) return text
  const lines = text.split('\n')
  let used = perMessageOverhead
  let keepTo = 0
  for (let i = 0; i < lines.length; i++) {
    const cost = countTokens(lines[i]) + 1 // ~1 token for the rejoining newline
    if (used + cost > available) break
    used += cost
    keepTo = i + 1
  }
  return lines.slice(0, keepTo).join('\n')
}

/**
 * Share of the usable window the Chapter guide may take, as a percent.
 *
 * Tight on purpose: every guide token is a prose token `fitEndBackward` can't spend, and the
 * three-stage ladder in `renderChapterGuideWithin` degrades gently enough that hitting the cap is
 * not a cliff. Raise it if the guide starts demoting Chapters the Author still needs.
 */
export const guideSharePct = 10

/**
 * The Chapter guide, capped at its share of the budget. Both Story-prompt callers go through this
 * one function — `generate` and the preview panel must not diverge on what the guide says.
 *
 * No budget means no cap, matching how the rest of this file treats a missing budget.
 */
export function fitChapterGuide(
  chapters: GuideChapter[],
  activeId: number | null,
  budget?: Budget,
): string {
  if (!budget) return renderChapterGuide(chapters, activeId)
  const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
  const usable = budget.contextLimit - budget.maxTokens - margin
  const allowance = Math.floor((usable * guideSharePct) / 100)
  return renderChapterGuideWithin(chapters, activeId, allowance, countTokens)
}

export interface BuildStoryArgs {
  stack: PromptStack
  castText: string
  authorNote: string
  /** The rendered Chapter guide (see chapterGuide.ts). Part of the fixed prefix, already fitted by
   *  the caller — see `fitChapterGuide`. */
  chapterGuide: string
  storyText: string
  /** Prose after the caret, to the end of the active Chapter. '' when generating at the end, which
   *  is the common case — the block then renders empty and drops out. */
  storyTrailing?: string
  direction: string
}

export interface BuiltStoryPrompt {
  messages: ChatMessage[]
  /** Everything except the Story prose — the fixed prefix + the Direction. */
  fixedTokens: number
  storyTokens: number
  storyIncluded: string
  /** Characters of Story prose the budget dropped from the top. */
  droppedChars: number
}

/**
 * Assembles a Write-mode request. The active Story stack places the fixed prefix (Cast, Chapter
 * guide, Author's note, freeform blocks); Story context expands to as much prose as the budget holds, end-backward;
 * the Direction rides last as a separate user turn, never merged into the prose. See the master's
 * Context assembly. Budget = the active connection's contextLimit.
 */
export function buildStoryPrompt(args: BuildStoryArgs, budget?: Budget): BuiltStoryPrompt {
  const { stack, castText: cast, authorNote, chapterGuide, storyText, direction } = args

  // Priced in the fixed pass below, before fitEndBackward spends what's left on the Story prose:
  // losing the text the model is writing towards would defeat the point of a caret insert.
  const storyTrailing = fitStartForward(args.storyTrailing ?? '', maxTrailingTokens)

  // Rendered twice with the same walk: once with no prose to price the fixed cost, once with the
  // prose the budget allowed. Anything but the Story text is identical between the passes, so the
  // two runs line up 1:1 and the trim can't shift a block into or out of the prompt.
  const render = (story: string) => {
    const turns: ChatMessage[] = []
    for (const block of stack.active) {
      const content = blockText(block, { cast, authorNote, chapterGuide, story, storyTrailing })
      if (content.trim()) turns.push({ role: block.role, content })
    }
    return turns
  }

  const fixed = render('')
  let fixedTokens = fixed.reduce((n, m) => n + countTokens(m.content) + perMessageOverhead, 0)

  // The Direction is fixed — always in, counted against the budget, never trimmed.
  const dir = direction.trim()
  if (dir) fixedTokens += countTokens(dir) + perMessageOverhead

  let storyIncluded = ''
  let droppedChars = 0
  if (hasStory(stack.active) && storyText.trim()) {
    if (budget) {
      const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
      const available = Math.floor(budget.contextLimit - fixedTokens - budget.maxTokens - margin)
      storyIncluded = fitEndBackward(storyText, available)
    } else {
      storyIncluded = storyText
    }
    droppedChars = storyText.length - storyIncluded.length
  }

  const out: ChatMessage[] = []
  // Neighbouring same-role turns merge, so a run of system blocks is one system message.
  const push = (role: ChatMessage['role'], content: string) => {
    const last = out.at(-1)
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }

  for (const turn of render(storyIncluded)) push(turn.role, turn.content)

  // Kept separate on purpose: the Direction is the final user instruction, never folded into prose.
  if (dir) out.push({ role: 'user', content: dir })

  return { messages: out, fixedTokens, storyTokens: countTokens(storyIncluded), storyIncluded, droppedChars }
}

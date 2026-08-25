// Extension-ful imports on purpose: checkPrompt.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { TagRule } from '../stores/settingsStore'
import type { Chat, Character, Message, Persona, PromptBlock, PromptStack } from '../storage/types'
import { activeContent, activeDescription } from '../storage/types.ts'
import { isGroup } from '../stores/roster.ts'
import { chatTokens, swapBlockVals, swapTokens } from './swapTokens.ts'
import { promptConditions, resolveConditions } from './conditions.ts'
import type { Budget } from './budget.ts'
import { countMessages, countTokens, perMessageOverhead, trimHistory } from './budget.ts'

function boundText(
  block: PromptBlock,
  character: Character,
  persona: Persona,
  authorNote: string,
  worldInfo: string,
): string {
  switch (block.source) {
    case 'authorNote':
      return authorNote
    case 'worldInfo':
      return worldInfo
    case 'characterDescription':
      return activeDescription(character)
    case 'characterPersonality':
      return character.personality
    case 'characterScenario':
      return character.scenario
    case 'characterExampleDialogue':
      return character.exampleDialogue
    case 'personaDescription':
      return persona.description
    default:
      return ''
  }
}

/** Two spaces per level, on non-blank lines only — blank lines stay blank, not trailing spaces. */
function indentLines(text: string, depth: number): string {
  if (depth <= 0) return text
  const pad = '  '.repeat(depth)
  return text
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

/**
 * A block's whole text, children included: own text, then each child, then the closing text,
 * newline-joined. Blank parts drop out, so a bare group is just its children and an empty
 * bound field never leaves a stray blank line — but a wrapper's tags stay even with no children.
 *
 * `indent` is display-only (the preview): each nesting level shifts its children right. The sent
 * prompt never passes it, so what goes over the wire has no indentation.
 */
function blockText(
  block: PromptBlock,
  character: Character,
  persona: Persona,
  authorNote: string,
  worldInfo: string,
  indent: boolean,
  depth: number,
): string {
  if (block.disabled) return ''
  let own =
    block.source === 'text'
      ? activeContent(block)
      : boundText(block, character, persona, authorNote, worldInfo)
  // Per-block, so it can't live in swapTokens: {{blockVal}} is this block's own input value.
  if (block.input) own = swapBlockVals(own, block.input)
  const parts = [
    indentLines(own, depth),
    // Nested chat history resolves to '' — it's many messages with their own roles, it can't
    // live inside one text span. The editor refuses to nest it in the first place.
    ...(block.children ?? []).map((child) =>
      blockText(child, character, persona, authorNote, worldInfo, indent, indent ? depth + 1 : 0),
    ),
    indentLines(block.closeContent ?? '', depth),
  ]
  return parts.filter((text) => text.trim()).join('\n')
}

/**
 * Who said a history turn, for the label. The stamped name wins so a deleted character or persona
 * still gets credited; the fallbacks cover turns written before either field existed.
 */
function speakerLabel(message: Message, character: Character, persona: Persona): string {
  return message.role === 'user'
    ? (message.personaName ?? persona.name)
    : (message.speakerName ?? character.name)
}

/**
 * Drop each depth-limited tag block from a history message once it's older than the tag allows.
 * `distance` is how far the message is from the newest (1 = it is the last message), so a tag with
 * depth 1 rides along only while its message is last. Same literal open/close scan as renderText;
 * a rule with no `depth` is display-only and never touches the sent text. Storage is untouched.
 */
export function stripDepthTags(content: string, distance: number, rules?: TagRule[]): string {
  const active = rules?.filter(
    (r) => r.open && r.close && r.depth !== undefined && distance > r.depth,
  )
  if (!active?.length) return content
  let out = ''
  let i = 0
  while (i < content.length) {
    const rule = active.find((r) => content.startsWith(r.open, i))
    const close = rule ? content.indexOf(rule.close, i + rule.open.length) : -1
    // An unclosed opener is literal text, same as renderText.
    if (rule && close >= 0) {
      i = close + rule.close.length
      continue
    }
    out += content[i]
    i += 1
  }
  if (out === content) return content
  // The block sat on its own line; dropping it leaves a blank gap. Collapse it, don't ship it.
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** The trailing turn naming who speaks next. One string, tunable in one place. */
export function nextSpeakerHint(name: string): string {
  return `Write the next message as ${name}.`
}

export interface BuildPromptArgs {
  stack: PromptStack
  character: Character
  persona: Persona
  messages: Message[]
  /** Group chats: whoever is speaking this turn. Absent = `character`, exactly as Phase 1. */
  speaker?: Character
  /** Source of the author's note text for `authorNote` blocks. */
  chat?: Chat
  /** Text for a `worldInfo` block. Resolved by the caller — matching needs the speaking character's
   *  entries out of storage, and this function stays pure, exactly as it does for `authorNote`. */
  worldInfo?: string
  /** A system turn appended after everything else — the rewrite instruction. Counted against
   *  the budget like any other text, never exempted. */
  appendSystem?: string
  /** Display-only: indent nested block content for the preview. Never set on the send path. */
  indent?: boolean
  /** Tag rules with a `depth` strip their block from older history turns. Absent = nothing stripped. */
  tagRules?: TagRule[]
  /** Force speaker labels on even outside a group. Multiplayer needs them with one character. */
  nameSpeakers?: boolean
  /** The multiplayer roster in host-chosen slot order, filling {{char1}}…{{char4}}. Absent
   *  outside a session, which leaves those tokens alone. */
  cast?: Character[]
  /** The session's people as `Name: description` lines, filling {{personas}}. Resolved by the
   *  caller, as `worldInfo` is: the roster lives in the multiplayer store, not here. */
  personas?: string
}

/** A block that contributed nothing, and the reason — the preview lists these. */
export interface SkippedBlock {
  label: string
  reason: 'disabled' | 'empty'
}

export interface BuiltPrompt {
  messages: ChatMessage[]
  tokensUsed: number
  /** What the fixed blocks cost before any history goes in. */
  fixedTokens: number
  droppedCount: number
  /** The history messages the budget dropped, oldest first. */
  dropped: Message[]
  skipped: SkippedBlock[]
  /** History allowance left after the fixed blocks, the reply reserve and the margin. */
  available: number
  overflow: boolean
}

/**
 * Walks the active zone in order and produces the exact request body messages.
 * With a budget, history is trimmed from the top first — the preview and the send
 * call this same function so they can't drift apart.
 */
export function buildPrompt(
  {
    stack,
    character,
    persona,
    messages,
    speaker,
    chat,
    worldInfo,
    appendSystem,
    indent,
    tagRules,
    nameSpeakers,
    cast,
    personas,
  }: BuildPromptArgs,
  budget?: Budget,
): BuiltPrompt {
  // In a group chat only the speaker's card goes in the prompt; everyone else is known from the
  // labelled history.
  const who = speaker ?? character
  const authorNote = chat?.authorNote ?? ''
  const worldInfoText = worldInfo ?? ''
  // Labels only once there's more than one character to tell apart: a solo chat's prompt is
  // byte-identical to what Phase 1 produced. `chat.nameSpeakers` forces them on for a chat that
  // several *people* speak in — every buildPrompt caller passes `chat`, so a session's labels
  // reach the send path and the preview without either being told about multiplayer. The
  // `nameSpeakers` argument stays for callers with no chat record.
  const group = (chat ? isGroup(chat) || chat.nameSpeakers === true : false) || nameSpeakers === true

  // Authored card data only — character fields, persona info, freeform blocks. Chat history is
  // transcript, not card data: it is never substituted. {{user}} is always the *active* persona,
  // even where older turns were sent as someone else.
  // {{charDescription}} follows the speaker too, so in a group each character's blocks paste
  // that character's own description.
  // {{char1}}…{{char4}} are the session roster instead, fixed for the whole session: they don't
  // follow the speaker, so one block can talk about the cast as a group.
  const tokens = chatTokens(who, persona, cast, personas)
  const swap = (text: string) => swapTokens(text, tokens)

  // [if Narrator] and friends. Resolved per block, before substitution: a token inside a dropped
  // branch never gets swapped, and no token's value can be read back as a condition name. A
  // conditional cannot span two blocks — each block's text is parsed on its own, so an [if] in one
  // block and its [endif] in the next are both literal text.
  const conditions = promptConditions(who, cast)

  // Resolve first, assemble second: budgeting needs the fixed cost before history goes in.
  const resolved: (ChatMessage | 'history')[] = []
  // Author's notes with a depth leave the stack and get spliced into history below.
  const depthNotes: { message: ChatMessage; depth: number }[] = []
  const skipped: SkippedBlock[] = []
  let fixedTokens = 0

  for (const block of stack.active) {
    if (block.disabled) {
      skipped.push({ label: block.label, reason: 'disabled' })
      continue
    }
    if (block.source === 'chatHistory') {
      resolved.push('history')
      continue
    }

    const text = swap(
      resolveConditions(
        blockText(block, who, persona, authorNote, worldInfoText, !!indent, 0),
        conditions,
      ),
    )

    // A blank bound field must not become a blank system turn — an empty author's note included.
    if (!text.trim()) {
      skipped.push({ label: block.label, reason: 'empty' })
      continue
    }

    const message: ChatMessage = { role: block.role, content: text }
    fixedTokens += countTokens(text) + perMessageOverhead

    // a depth note with no history block in the stack simply doesn't appear. Depth is
    // defined relative to history; a stack without history has nothing to be N messages from.
    // The chat's own depth beats the stack's, same shape as the param overrides: the stack block
    // carries the default, one chat can move the note without touching the stack.
    const depth = chat?.authorNoteDepth ?? block.depth
    if (block.source === 'authorNote' && depth !== undefined) {
      depthNotes.push({ message, depth })
      continue
    }
    resolved.push(message)
  }

  // Both trailing turns are system turns, so the merge below concatenates them: the hint says who
  // is up, then any rewrite instruction narrows what they should write. Neither overwrites the
  // other, and the more specific one has the last word.
  if (group) {
    const hint = nextSpeakerHint(who.name)
    resolved.push({ role: 'system', content: hint })
    fixedTokens += countTokens(hint) + perMessageOverhead
  }

  // Not swapped here: appendSystem quotes transcript around the instruction, and transcript is
  // exempt. The authored half — what you typed into the rewrite box — is swapped by the caller
  // before it's wrapped, so a {{char}} the model wrote stays a literal.
  if (appendSystem?.trim()) {
    resolved.push({ role: 'system', content: appendSystem })
    fixedTokens += countTokens(appendSystem) + perMessageOverhead
  }

  const trimmed = budget
    ? trimHistory(messages, fixedTokens, budget)
    : { messages, dropped: [], droppedCount: 0, available: 0, overflow: false }

  const out: ChatMessage[] = []

  // Neighbouring same-role turns become one, so five system blocks are one system message
  // and every backend sees the same shape.
  function push(role: ChatMessage['role'], content: string) {
    const last = out.at(-1)
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }

  // History plus any depth notes, in final order. Depth counts messages from the end, clamped to
  // the top. Notes are inserted deepest-last so each depth is read against the trimmed history.
  // The label is added here and only here — stored `content` never carries a speaker prefix.
  // the prefix isn't in the trim arithmetic, only in the final count. A name per turn is
  // noise against the reply reserve; count it in trimHistory if long group chats start overflowing.
  const history: ChatMessage[] = trimmed.messages.map((m, idx) => {
    // Newest turn is distance 1; a depth-N tag stays in the prompt only while distance ≤ N.
    const content = stripDepthTags(m.content, trimmed.messages.length - idx, tagRules)
    return {
      role: m.role,
      content: group ? `${speakerLabel(m, character, persona)}: ${content}` : content,
    }
  })
  for (const note of depthNotes) {
    history.splice(Math.max(0, history.length - note.depth), 0, note.message)
  }

  for (const part of resolved) {
    if (part === 'history') {
      // Verbatim: what was said stays what was said.
      for (const m of history) push(m.role, m.content)
    } else {
      push(part.role, part.content)
    }
  }

  return {
    messages: out,
    tokensUsed: countMessages(out),
    fixedTokens,
    droppedCount: trimmed.droppedCount,
    dropped: trimmed.dropped,
    skipped,
    available: trimmed.available,
    overflow: trimmed.overflow,
  }
}

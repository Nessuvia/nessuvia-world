// The wording of every re-roll instruction, in one place so it's tunable in one place.
// Extension-ful imports on purpose: checkPrompt.ts runs this under `node --experimental-strip-types`.
import type { Message } from '../storage/types'

/** What the user's instruction turns into. The original is quoted so the model has something to
 *  work from even when the budget trimmed the message out of history. */
export function rewritePrompt(original: string, instruction: string): string {
  return `Your previous reply was:\n\n${original}\n\nWrite that reply again, following this instruction: ${instruction.trim()}\n\nReply with the rewritten message only.`
}

function speaker(message: Message, characterName: string): string {
  return message.role === 'user'
    ? (message.personaName ?? 'User')
    : (message.speakerName ?? characterName)
}

/**
 * The default instruction for re-rolling a message that isn't the last one. Regenerating an old
 * message sends only the history *before* it, so without this the model writes as if the
 * conversation ended there. Quoting what follows is the whole point — it costs tokens and the
 * budget counts them like anything else.
 *
 * `later` empty (the message *is* the last one) returns '' — nothing to warn about.
 */
export function oldMessageInstruction(later: Message[], characterName: string): string {
  if (!later.length) return ''
  const transcript = later.map((m) => `${speaker(m, characterName)}: ${m.content}`).join('\n\n')
  return `You are rewriting an earlier message in this conversation, not the latest one. What was said after it:\n\n${transcript}\n\nRewrite the message so that what follows still makes sense.`
}

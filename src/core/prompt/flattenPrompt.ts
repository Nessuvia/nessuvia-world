// Extension-ful imports on purpose: checkFlattenPrompt.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { InstructTemplate } from '../params/paramDef.ts'

/**
 * A message list as one string, for a text-completion endpoint. Each message is wrapped in its
 * role's prefix and suffix; `firstPrefix` (the BOS token) is emitted once at the very front, and
 * the assistant turn is left open at the end so the model continues rather than starts over.
 *
 * The message contents are never rewritten, only wrapped. Formatting is a transport concern here
 * the same way it is a display concern elsewhere.
 */
export function flattenPrompt(messages: ChatMessage[], template: InstructTemplate): string {
  let out = template.firstPrefix ?? ''
  for (const message of messages) {
    const [prefix, suffix] =
      message.role === 'system'
        ? [template.systemPrefix, template.systemSuffix]
        : message.role === 'assistant'
          ? [template.modelPrefix, template.modelSuffix]
          : [template.userPrefix, template.userSuffix]
    out += prefix + message.content + suffix
  }
  // The open assistant turn. Without it the model has to guess whose line is next.
  out += template.modelPrefix
  // A trailing space after the prefix costs a token on most tokenizers and shifts the reply.
  return template.trimTrailingSpace ? out.replace(/[ \t]+$/, '') : out
}

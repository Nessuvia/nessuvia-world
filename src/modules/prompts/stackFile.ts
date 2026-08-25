// Prompt stack files: the stack's own fields, without the row id or ownerId. Those belong to the
// browser that stores it, not to the file.
import type { PromptBlock, PromptStack } from '../../core/storage/types'
import { currentOwnerId } from '../../core/storage/storageInterface'
import { stackKind } from './stackKinds'

interface StackFile {
  format: 'nessu-prompt-stack'
  version: 1
  name: string
  kind: 'chat' | 'story'
  active: PromptBlock[]
  inactive: PromptBlock[]
}

const fileName = (name: string) =>
  `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'stack'}.json`

export function exportStack(stack: PromptStack) {
  const file: StackFile = {
    format: 'nessu-prompt-stack',
    version: 1,
    name: stack.name,
    kind: stackKind(stack),
    active: stack.active,
    inactive: stack.inactive,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = fileName(stack.name)
  link.click()
  URL.revokeObjectURL(url)
}

// Fresh ids all the way down: two stacks must never share a block identity while dragging, and a
// file can be imported twice.
const reid = (list: PromptBlock[]): PromptBlock[] =>
  list.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    ...(b.children ? { children: reid(b.children) } : {}),
  }))

/** Parse a stack file into a savable stack. Throws with a message meant for the user. */
export function parseStack(text: string): PromptStack {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const file = data as Partial<StackFile>
  if (file?.format !== 'nessu-prompt-stack') throw new Error('That file is not a prompt stack.')
  if (!Array.isArray(file.active) || !Array.isArray(file.inactive)) {
    throw new Error('The stack file is missing its blocks.')
  }
  return {
    ownerId: currentOwnerId(),
    name: typeof file.name === 'string' && file.name ? file.name : 'Imported stack',
    kind: file.kind === 'story' ? 'story' : 'chat',
    active: reid(file.active),
    inactive: reid(file.inactive),
  }
}

// Run: node --experimental-strip-types src/modules/prompts/checkStackKinds.ts
import assert from 'node:assert'
import type { BlockSource, PromptBlock, PromptStack } from '../../core/storage/types.ts'
import { boundSources, kindSources, stackKind, validateStack } from './stackKinds.ts'

let n = 0
function b(source: BlockSource, disabled = false): PromptBlock {
  return { id: `b${n++}`, label: source, source, role: 'system', content: '', ...(disabled && { disabled }) }
}
function stack(kind: 'chat' | 'story' | undefined, active: PromptBlock[]): PromptStack {
  return { ownerId: 'local', name: 't', kind, active }
}

// --- kind defaulting ----------------------------------------------------
assert.strictEqual(stackKind({ kind: undefined }), 'chat') // absent = chat
assert.strictEqual(stackKind({ kind: 'story' }), 'story')

// --- allowed sources are freeform + the kind's bound set ----------------
assert.deepStrictEqual(kindSources('story'), [
  'text',
  'cast',
  'storyContext',
  'storyTrailing',
  'chapterGuide',
  'authorNote',
])
assert.ok(!kindSources('story').includes('chatHistory')) // story has no chat history
assert.ok(kindSources('chat').includes('chatHistory'))
assert.ok(!boundSources.story.includes('chatHistory'))

// --- chat validation is unchanged ---------------------------------------
assert.strictEqual(validateStack(stack('chat', [b('chatHistory')])), '')
assert.match(validateStack(stack('chat', [])), /Chat History/) // needs one
assert.match(validateStack(stack('chat', [b('chatHistory'), b('chatHistory')])), /Only one/)
// undefined kind validates as chat
assert.match(validateStack(stack(undefined, [])), /Chat History/)
// a disabled history doesn't count
assert.match(validateStack(stack('chat', [b('chatHistory', true)])), /Chat History/)

// --- story validation: exactly one story context, no chat history -------
assert.strictEqual(validateStack(stack('story', [b('storyContext')])), '')
assert.strictEqual(validateStack(stack('story', [b('cast'), b('storyContext'), b('authorNote')])), '')
assert.match(validateStack(stack('story', [])), /Story context/) // needs one
assert.match(validateStack(stack('story', [b('storyContext'), b('storyContext')])), /Only one Story/)
assert.match(validateStack(stack('story', [b('storyContext'), b('chatHistory')])), /no Chat History/)
// the chapter guide is optional, capped at one
assert.strictEqual(validateStack(stack('story', [b('storyContext')])), '')
assert.strictEqual(validateStack(stack('story', [b('storyContext'), b('chapterGuide')])), '')
assert.match(
  validateStack(stack('story', [b('storyContext'), b('chapterGuide'), b('chapterGuide')])),
  /Only one Chapter guide/,
)
// "What follows" is optional too — a Story with no caret sends nothing for it — and capped at one
assert.strictEqual(validateStack(stack('story', [b('storyContext'), b('storyTrailing')])), '')
assert.match(
  validateStack(stack('story', [b('storyContext'), b('storyTrailing'), b('storyTrailing')])),
  /Only one What follows/,
)

// author's note capped at one, both kinds
assert.match(validateStack(stack('story', [b('storyContext'), b('authorNote'), b('authorNote')])), /Author's note/)

// --- nested blocks count too --------------------------------------------
const wrap = (children: PromptBlock[], disabled = false): PromptBlock => ({
  id: `w${n++}`, label: 'wrap', source: 'text', role: 'system', content: '', children,
  ...(disabled && { disabled }),
})
// a story context nested in a wrapper satisfies the rule
assert.strictEqual(validateStack(stack('story', [wrap([b('storyContext')])])), '')
// one at top level and one nested is still two
assert.match(validateStack(stack('story', [b('storyContext'), wrap([b('storyContext')])])), /Only one Story/)
// a disabled wrapper takes its children out of the prompt
assert.match(validateStack(stack('story', [wrap([b('storyContext')], true)])), /Story context/)
assert.strictEqual(validateStack(stack('chat', [wrap([b('chatHistory')])])), '')

console.log('ok')

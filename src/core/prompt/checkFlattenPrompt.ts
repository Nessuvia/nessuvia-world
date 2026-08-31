// Run: node --experimental-strip-types src/core/prompt/checkFlattenPrompt.ts
import assert from 'node:assert'
import { defaultTemplate } from '../params/paramDef.ts'
import { flattenPrompt } from './flattenPrompt.ts'

const messages = [
  { role: 'system' as const, content: 'be brief' },
  { role: 'user' as const, content: 'hello' },
  { role: 'assistant' as const, content: 'hi' },
  { role: 'user' as const, content: 'again' },
]

// --- ChatML round trip ----------------------------------------------------
{
  const out = flattenPrompt(messages, defaultTemplate())
  assert.strictEqual(
    out,
    '<|im_start|>system\nbe brief<|im_end|>\n' +
      '<|im_start|>user\nhello<|im_end|>\n' +
      '<|im_start|>assistant\nhi<|im_end|>\n' +
      '<|im_start|>user\nagain<|im_end|>\n' +
      '<|im_start|>assistant\n',
  )
}

// --- the assistant turn is left open at the end --------------------------
{
  const template = defaultTemplate()
  const out = flattenPrompt(messages, template)
  assert.ok(out.endsWith(template.modelPrefix), 'the model turn is not open')
  // The model's own suffix must not follow it: that would close the turn before it starts.
  assert.ok(!out.endsWith(template.modelSuffix))
}

// --- firstPrefix is emitted once, at the very front ----------------------
{
  const template = { ...defaultTemplate(), firstPrefix: '<|begin_of_text|>' }
  const out = flattenPrompt(messages, template)
  assert.ok(out.startsWith('<|begin_of_text|>'))
  assert.strictEqual(out.split('<|begin_of_text|>').length - 1, 1)
  // Unset means nothing is prepended at all.
  assert.ok(!flattenPrompt(messages, defaultTemplate()).startsWith('<|begin'))
}

// --- trailing whitespace: trimmed on, kept off --------------------------
{
  const spaced = { ...defaultTemplate(), modelPrefix: '### Response: ' }
  assert.ok(flattenPrompt(messages, spaced).endsWith('### Response:'))
  const kept = { ...spaced, trimTrailingSpace: false }
  assert.ok(flattenPrompt(messages, kept).endsWith('### Response: '))
  // Only trailing spaces and tabs go; a deliberate newline at the end stays.
  const newline = { ...defaultTemplate(), modelPrefix: '### Response:\n' }
  assert.ok(flattenPrompt(messages, newline).endsWith('\n'))
}

// --- message content is wrapped, never rewritten -------------------------
{
  const messy = [{ role: 'user' as const, content: '  spaced  \n\nand blank lines  ' }]
  const out = flattenPrompt(messy, { ...defaultTemplate(), trimTrailingSpace: false })
  assert.ok(out.includes('  spaced  \n\nand blank lines  '))
}

// --- an empty history is still a valid prompt ---------------------------
{
  assert.strictEqual(flattenPrompt([], defaultTemplate()), '<|im_start|>assistant\n')
}

// --- an unknown role is treated as the user's ---------------------------
{
  const template = defaultTemplate()
  const out = flattenPrompt([{ role: 'user', content: 'x' }], template)
  assert.ok(out.includes(`${template.userPrefix}x${template.userSuffix}`))
}

console.log('ok')

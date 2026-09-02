import assert from 'node:assert'
import { parseTour } from './parseTour.ts'

// The name comes off the `#` line; a file without one falls back to the id.
assert.strictEqual(parseTour('chat', '# Chat\n').name, 'Chat')
assert.strictEqual(parseTour('chat', '## .a\nhi\n').name, 'chat')

// A step with no directives.
const plain = parseTour('chat', '# Chat\n\n## .chatComposer\nType here.\n')
assert.deepStrictEqual(plain.steps, [{ target: '.chatComposer', body: ['Type here.'] }])

// Every directive, in either order.
const directives = parseTour('chat', '## .chatSidebar | left | desktop\nThe rail.\n')
assert.strictEqual(directives.steps[0].side, 'left')
assert.strictEqual(directives.steps[0].only, 'desktop')
assert.strictEqual(parseTour('chat', '## .x | mobile | bottom\nb\n').steps[0].side, 'bottom')
// An unknown directive is ignored rather than failing the file.
assert.deepStrictEqual(parseTour('chat', '## .x | sideways\nb\n').steps[0], { target: '.x', body: ['b'] })

// `center` is a step with no target.
assert.strictEqual(parseTour('chat', '## center\nWelcome.\n').steps[0].target, '')

// Blank lines split paragraphs; wrapped lines inside one join with a space.
const paragraphs = parseTour('chat', '## .x\nOne line\nwrapped.\n\nSecond.\n\n\nThird.\n')
assert.deepStrictEqual(paragraphs.steps[0].body, ['One line wrapped.', 'Second.', 'Third.'])

// A malformed `##` line is not a step, and takes its body with it.
const malformed = parseTour('chat', '## .x\nkeep\n\n##\ndrop\n\n## .y\nkeep too\n')
assert.deepStrictEqual(malformed.steps.map((s) => s.target), ['.x', '.y'])
assert.deepStrictEqual(malformed.steps.map((s) => s.body), [['keep'], ['keep too']])

// An empty file parses to a tour with no steps rather than throwing.
assert.deepStrictEqual(parseTour('chat', '').steps, [])

console.log('checkParseTour ok')

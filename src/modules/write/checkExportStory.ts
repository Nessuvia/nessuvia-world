// Run: node --experimental-strip-types src/modules/write/checkExportStory.ts
import assert from 'node:assert'
import type { Block, Chapter, Story } from '../../core/storage/types.ts'
import { resolvePalette } from '../../core/palette/palette.ts'
import { buildHtml, buildTxt, escapeHtml, proseHtml } from './exportStory.ts'

const block = (content: string): Block => ({
  id: content || 'empty',
  beat: '',
  targetWords: 0,
  done: false,
  content,
  context: 'both',
})

const chapter = (order: number, title: string, contents: string[]): Chapter => ({
  id: order + 1,
  ownerId: 'local',
  storyId: 1,
  order,
  title,
  summary: '',
  blocks: contents.map(block),
  guideSend: 'off',
  createdAt: 0,
  updatedAt: 0,
})

const story: Story = {
  id: 1,
  ownerId: 'local',
  title: 'My <b>Story</b>',
  cover: '',
  cast: [],
  direction: '',
  createdAt: 0,
  updatedAt: 0,
}

// TXT: the chapter break shape, and out-of-order chapters sorted back by `order`.
const chapters = [chapter(1, 'Second', ['ghi']), chapter(0, 'First', ['abc', '   ', 'def'])]
const txt = buildTxt(story, chapters)
assert.equal(txt, 'My <b>Story</b>\n\n1 - First\n\nabc\n\ndef\n\n2 - Second\n\nghi\n')

// A chapter with no title still gets its number and its blank lines.
assert.ok(buildTxt(story, [chapter(0, '  ', ['x'])]).includes('\n\n1\n\nx'))

// Escaping: prose and title alike are model output opened in a browser.
assert.equal(escapeHtml('<script>"&"</script>'), '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;')
assert.equal(proseHtml('a <b> c'), 'a &lt;b&gt; c')

// Markers become real elements; backtick contents stay literal.
assert.equal(proseHtml('**loud**'), '<strong>loud</strong>')
assert.equal(proseHtml('*soft*'), '<em>soft</em>')
assert.equal(proseHtml('***both***'), '<strong><em>both</em></strong>')
assert.equal(proseHtml('"said"'), '<q>said</q>')
assert.equal(proseHtml('`**raw**`'), '<code>**raw**</code>')
// An unmatched marker stays text rather than swallowing the rest.
assert.equal(proseHtml('half *open'), 'half *open')

const html = buildHtml(story, chapters, resolvePalette())
assert.ok(html.startsWith('<!doctype html>'))
assert.ok(html.includes('<title>My &lt;b&gt;Story&lt;/b&gt;</title>'))
assert.ok(!html.includes('<b>Story</b>'))
assert.ok(html.includes('<h2 id="ch1">1 - First</h2>'))
// Chapter nav: one link per chapter, in order, titles escaped into the tooltip.
assert.ok(html.includes('<nav><a href="#ch1" title="First">1</a><a href="#ch2" title="Second">2</a></nav>'))
assert.ok(buildHtml(story, [chapter(0, '  ', ['x'])], resolvePalette()).includes('<a href="#ch1">1</a>'))
assert.ok(html.includes('max-width: 1280px'))
assert.ok(html.includes('@media (max-width: 700px)'))
// Empty blocks are dropped, not emitted as blank paragraphs.
assert.equal(html.match(/<p>/g)?.length, 3)

console.log('checkExportStory ok')

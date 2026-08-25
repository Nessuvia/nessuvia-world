// Run: node --experimental-strip-types src/core/prompt/checkWorldInfo.ts
import assert from 'node:assert'
import type { Message, WorldInfoEntry } from '../storage/types'
import { loadTokenizer } from './budget.ts'
import { defaultDepth, matchedEntries, worldInfoText } from './worldInfo.ts'

await loadTokenizer()

let messageId = 0
const message = (content: string): Message => ({
  id: ++messageId,
  ownerId: 'local',
  chatId: 1,
  role: 'user',
  content,
  createdAt: ++messageId,
})

let entryId = 0
function entry(patch: Partial<WorldInfoEntry> = {}): WorldInfoEntry {
  return {
    id: ++entryId,
    ownerId: 'local',
    characterId: 1,
    name: 'e',
    keys: [],
    content: 'lore',
    always: false,
    enabled: true,
    order: 0,
    ...patch,
  }
}

const names = (list: WorldInfoEntry[]) => list.map((e) => e.name)

// --- always-on fires with no keys, a keyless entry doesn't ------------
{
  const always = entry({ name: 'always', always: true })
  const keyless = entry({ name: 'keyless' })
  assert.deepStrictEqual(names(matchedEntries([always, keyless], [message('hi')])), ['always'])
}

// --- a key in recent history fires, case-insensitively ---------------
{
  const e = entry({ name: 'ba', keys: ['Behavioral Activation'] })
  assert.deepStrictEqual(names(matchedEntries([e], [message('tell me about behavioral activation')])), ['ba'])
  assert.deepStrictEqual(matchedEntries([e], [message('tell me about the weather')]), [])
}

// --- disabled and empty entries never fire --------------------------
{
  const off = entry({ name: 'off', always: true, enabled: false })
  const blank = entry({ name: 'blank', always: true, content: '   ' })
  assert.deepStrictEqual(matchedEntries([off, blank], []), [])
}

// --- the scan window is the default when nothing overrides it -------
{
  const e = entry({ keys: ['sword'] })
  const old = [message('a sword!'), ...Array.from({ length: defaultDepth }, () => message('filler'))]
  assert.deepStrictEqual(matchedEntries([e], old), [], 'outside the default window')
  const recent = [message('filler'), message('a sword!')]
  assert.strictEqual(matchedEntries([e], recent).length, 1, 'inside the default window')
}

// --- the book's scan depth widens the window ------------------------
{
  const e = entry({ keys: ['sword'] })
  const history = [message('a sword!'), ...Array.from({ length: 10 }, () => message('filler'))]
  assert.deepStrictEqual(matchedEntries([e], history), [])
  assert.strictEqual(
    matchedEntries([e], history, { name: '', description: '', scanDepth: 50 }).length,
    1,
    "the reference card's scan_depth: 50 reaches back past the default",
  )
}

// --- an entry's own scan depth beats the book's ----------------------
{
  const e = entry({ keys: ['sword'], scanDepth: 2 })
  const history = [message('a sword!'), message('filler'), message('filler')]
  assert.deepStrictEqual(
    matchedEntries([e], history, { name: '', description: '', scanDepth: 50 }),
    [],
    'the entry narrows the book',
  )
}

// --- matches come back in the card's insertion order ----------------
{
  const late = entry({ name: 'late', always: true, order: 100 })
  const early = entry({ name: 'early', always: true, order: 1 })
  assert.deepStrictEqual(names(matchedEntries([late, early], [])), ['early', 'late'])
}

// --- the token budget drops the tail, not the head ------------------
{
  const first = entry({ name: 'first', always: true, order: 1, content: 'alpha '.repeat(50) })
  const second = entry({ name: 'second', always: true, order: 2, content: 'beta '.repeat(50) })
  const book = { name: '', description: '', tokenBudget: 60 }
  const text = worldInfoText([first, second], [], book)
  assert.ok(text.includes('alpha'), 'the first entry survives')
  assert.ok(!text.includes('beta'), 'the entry that would cross the budget is dropped')
  // A budget smaller than one entry still yields that entry — see the comment in worldInfoText.
  const tight = worldInfoText([first, second], [], { name: '', description: '', tokenBudget: 5 })
  assert.ok(tight.includes('alpha') && !tight.includes('beta'), 'the first match is never dropped')
  // No budget means no dropping.
  const all = worldInfoText([first, second], [], { name: '', description: '' })
  assert.ok(all.includes('alpha') && all.includes('beta'))
}

// --- nothing matched is the empty string, which the prompt skips ----
assert.strictEqual(worldInfoText([entry({ keys: ['nope'] })], [message('hi')]), '')

console.log('checkWorldInfo ok')

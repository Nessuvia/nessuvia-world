// Run: node --experimental-strip-types src/core/stores/checkSwipes.ts
import assert from 'node:assert'
import type { Message } from '../storage/types'
import { continued, deletedSwipes, reasoningFor, regenerated, selectSwipe, snapshotFor, swipeCount, swipeIndex } from './swipes.ts'

const reply = (id: number, content: string): Message => ({
  id,
  ownerId: 'local',
  chatId: 1,
  role: 'assistant',
  content,
  createdAt: id,
})

/** The invariant that lets every Phase 1 reader keep working. */
function mirrors(m: Message) {
  assert.strictEqual(m.content, m.swipes![m.swipeIndex!], 'content mirrors the selected swipe')
}

// --- a fresh message reads as one alternate -------------------------------
{
  const m = reply(1, 'original')
  assert.strictEqual(swipeCount(m), 1)
  assert.strictEqual(swipeIndex(m), 0)
}

// --- first regenerate seeds swipes[0] with the original -------------------
{
  const first = regenerated(reply(1, 'original'), 'second')!
  assert.deepStrictEqual(first.swipes, ['original', 'second'])
  assert.strictEqual(first.swipeIndex, 1)
  assert.strictEqual(first.content, 'second')
  mirrors(first)

  // …and appends from there, always pointing at the newest.
  const third = regenerated(first, 'third')!
  assert.deepStrictEqual(third.swipes, ['original', 'second', 'third'])
  assert.strictEqual(third.swipeIndex, 2)
  mirrors(third)
}

// --- an empty record: the first real text is swipe 1, not swipe 2 ---------
{
  const first = regenerated(reply(1, ''), 'first')!
  assert.deepStrictEqual(first.swipes, ['first'])
  assert.strictEqual(first.swipeIndex, 0)
  assert.strictEqual(swipeCount(first), 1)
  mirrors(first)
  assert.deepStrictEqual(regenerated(first, 'second')!.swipes, ['first', 'second'])
}

// --- selectSwipe mirrors content, and clamps instead of throwing ----------
{
  const three = regenerated(regenerated(reply(1, 'a'), 'b')!, 'c')!
  const back = selectSwipe(three, 0)
  assert.strictEqual(back.content, 'a')
  mirrors(back)
  mirrors(selectSwipe(three, 1))

  assert.strictEqual(selectSwipe(three, -5).swipeIndex, 0)
  assert.strictEqual(selectSwipe(three, 99).swipeIndex, 2)
  mirrors(selectSwipe(three, -5))
  mirrors(selectSwipe(three, 99))

  // Selecting on a message that never regenerated seeds swipe 0 and stays put.
  const untouched = selectSwipe(reply(1, 'only'), 3)
  assert.deepStrictEqual(untouched.swipes, ['only'])
  assert.strictEqual(untouched.content, 'only')
  mirrors(untouched)
}

// --- an errored regenerate changes nothing --------------------------------
{
  const before = regenerated(reply(1, 'a'), 'b')!
  const snapshot = JSON.stringify(before)
  assert.strictEqual(regenerated(before, ''), null) // nothing streamed = nothing to store
  assert.strictEqual(JSON.stringify(before), snapshot)
}

// --- an aborted regenerate keeps the partial as a swipe -------------------
{
  const partial = regenerated(reply(1, 'a'), 'half a sen')!
  assert.deepStrictEqual(partial.swipes, ['a', 'half a sen'])
  assert.strictEqual(partial.content, 'half a sen')
}

// --- swiping message N leaves N+1… byte-identical -------------------------
{
  const list = [reply(1, 'one'), reply(2, 'two'), reply(3, 'three')]
  const snapshot = JSON.stringify(list.slice(1))
  const swiped = regenerated(list[0], 'one again')!
  const after = [swiped, ...list.slice(1)]
  assert.strictEqual(JSON.stringify(after.slice(1)), snapshot)
  assert.strictEqual(after[0].content, 'one again')
  // Nothing about a swipe touches ids, timestamps or ordering.
  assert.strictEqual(swiped.id, 1)
  assert.strictEqual(swiped.createdAt, 1)
}

// --- snapshots stay parallel to swipes ------------------------------------
{
  // A message from before snapshots existed: swipe 0 has no entry, the new one does.
  const first = regenerated(reply(1, 'one'), 'two', '{"b":2}')!
  assert.strictEqual(first.requestSnapshots!.length, first.swipes!.length)
  assert.strictEqual(snapshotFor(first), '{"b":2}')
  assert.strictEqual(snapshotFor(selectSwipe(first, 0)), undefined)

  // And each further swipe keeps its own.
  const second = regenerated(first, 'three', '{"c":3}')!
  assert.strictEqual(second.requestSnapshots!.length, 3)
  assert.strictEqual(snapshotFor(second), '{"c":3}')
  assert.strictEqual(snapshotFor(selectSwipe(second, 1)), '{"b":2}')

  // A regeneration with nothing to store leaves a hole, not a shifted array.
  const third = regenerated(second, 'four')!
  assert.strictEqual(third.requestSnapshots!.length, 4)
  assert.strictEqual(snapshotFor(third), undefined)
  assert.strictEqual(snapshotFor(selectSwipe(third, 2)), '{"c":3}')
}

// --- reasonings stay parallel to swipes, same as snapshots ----------------
{
  const first = regenerated(reply(1, 'one'), 'two', undefined, 'because two')!
  assert.strictEqual(first.reasonings!.length, first.swipes!.length)
  assert.strictEqual(reasoningFor(first), 'because two')
  assert.strictEqual(reasoningFor(selectSwipe(first, 0)), undefined) // swipe 0 predates it

  // A re-roll with no reasoning leaves a hole, and earlier swipes keep theirs.
  const second = regenerated(first, 'three')!
  assert.strictEqual(second.reasonings!.length, 3)
  assert.strictEqual(reasoningFor(second), undefined)
  assert.strictEqual(reasoningFor(selectSwipe(second, 1)), 'because two')
}

// --- deleting swipes ------------------------------------------------------
{
  // one, two(+snap b), three(+snap c, reasoning r3)
  let m = regenerated(reply(1, 'one'), 'two', '{"b":2}')!
  m = regenerated(m, 'three', '{"c":3}', 'r3')!
  assert.strictEqual(swipeIndex(m), 2)

  // Dropping an earlier swipe slides the selection back and keeps parallel arrays aligned.
  const dropFirst = deletedSwipes(m, [0])!
  assert.deepStrictEqual(dropFirst.swipes, ['two', 'three'])
  assert.strictEqual(swipeIndex(dropFirst), 1)
  assert.strictEqual(dropFirst.content, 'three')
  assert.strictEqual(snapshotFor(dropFirst), '{"c":3}')
  assert.strictEqual(reasoningFor(dropFirst), 'r3')
  assert.strictEqual(snapshotFor(selectSwipe(dropFirst, 0)), '{"b":2}')

  // Dropping the selected last swipe lands on the new last one.
  const dropLast = deletedSwipes(m, [2])!
  assert.deepStrictEqual(dropLast.swipes, ['one', 'two'])
  assert.strictEqual(swipeIndex(dropLast), 1)
  assert.strictEqual(dropLast.content, 'two')
  assert.strictEqual(snapshotFor(dropLast), '{"b":2}')

  // Nothing left means the caller deletes the message.
  assert.strictEqual(deletedSwipes(m, [0, 1, 2]), null)
  assert.strictEqual(deletedSwipes(reply(2, 'only'), [0]), null)

  // A message with no swipes array still deletes its single swipe by index 0.
  const single = deletedSwipes(reply(3, 'only'), [1])!
  assert.deepStrictEqual(single.swipes, ['only'])
  assert.strictEqual(swipeCount(single), 1)
}

// --- continuing writes in place, and never adds a swipe -------------------
{
  // A message that was never re-rolled: still one swipe afterwards.
  const once = continued(reply(1, 'half a sen'), 'half a sentence')!
  assert.deepStrictEqual(once.swipes, ['half a sentence'])
  assert.strictEqual(swipeCount(once), 1)
  assert.strictEqual(once.swipeIndex, 0)
  mirrors(once)

  // Three swipes, sitting on the middle one: only that one changes.
  let m = regenerated(reply(1, 'one'), 'two', '{"b":2}', 'r2')!
  m = regenerated(m, 'three', '{"c":3}', 'r3')!
  const on = continued(selectSwipe(m, 1), 'two and more', '{"d":4}', 'r4')!
  assert.deepStrictEqual(on.swipes, ['one', 'two and more', 'three'])
  assert.strictEqual(swipeCount(on), 3)
  assert.strictEqual(swipeIndex(on), 1)
  mirrors(on)
  // The continuation's request is what produced the text as it now stands; reasoning accumulates.
  assert.strictEqual(snapshotFor(on), '{"d":4}')
  assert.strictEqual(reasoningFor(on), 'r2\n\nr4')
  // Its neighbours are untouched.
  assert.strictEqual(snapshotFor(selectSwipe(on, 2)), '{"c":3}')
  assert.strictEqual(reasoningFor(selectSwipe(on, 2)), 'r3')

  // A continuation that produced nothing changes nothing.
  const before = JSON.stringify(m)
  assert.strictEqual(continued(m, ''), null)
  assert.strictEqual(JSON.stringify(m), before)

  // No snapshot and no reasoning leave what was already there alone.
  const bare = continued(selectSwipe(m, 1), 'two and more')!
  assert.strictEqual(snapshotFor(bare), '{"b":2}')
  assert.strictEqual(reasoningFor(bare), 'r2')
}

console.log('ok')

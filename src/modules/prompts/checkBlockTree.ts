// Run: node --experimental-strip-types src/modules/prompts/checkBlockTree.ts
import assert from 'node:assert'
import type { PromptBlock } from '../../core/storage/types'
import {
  addChild,
  allBlocks,
  contains,
  findBlock,
  flatten,
  insertBlock,
  moveByKey,
  removeBlock,
  replaceBlock,
  siblingsOf,
} from './blockTree.ts'

function b(id: string, children?: PromptBlock[]): PromptBlock {
  return { id, label: id, source: 'text', role: 'system', content: id, ...(children && { children }) }
}

//  a
//  wrap
//    x
//    inner
//      deep
//  z
const tree = [b('a'), b('wrap', [b('x'), b('inner', [b('deep')])]), b('z')]

// --- flatten: depth-first, with depth and parent -------------------------
assert.deepStrictEqual(
  flatten(tree).map((r) => [r.block.id, r.depth, r.parentId]),
  [
    ['a', 0, null],
    ['wrap', 0, null],
    ['x', 1, 'wrap'],
    ['inner', 1, 'wrap'],
    ['deep', 2, 'inner'],
    ['z', 0, null],
  ],
)
assert.deepStrictEqual(allBlocks(tree).length, 6)

// --- find / contains ----------------------------------------------------
assert.strictEqual(findBlock(tree, 'deep')?.label, 'deep')
assert.strictEqual(findBlock(tree, 'nope'), undefined)
assert.strictEqual(contains(tree[1], 'deep'), true) // grandchild counts
assert.strictEqual(contains(tree[1], 'wrap'), true) // itself counts
assert.strictEqual(contains(tree[1], 'z'), false)

// --- remove at any depth, without touching siblings ---------------------
{
  const out = removeBlock(tree, 'inner')
  assert.deepStrictEqual(
    flatten(out).map((r) => r.block.id),
    ['a', 'wrap', 'x', 'z'],
  )
  // The original is untouched: nothing here mutates.
  assert.strictEqual(flatten(tree).length, 6)
}

// --- insert: root, into a container, before an id or at the end ---------
assert.deepStrictEqual(
  flatten(insertBlock(tree, b('new'), null, 'z')).map((r) => r.block.id),
  ['a', 'wrap', 'x', 'inner', 'deep', 'new', 'z'],
)
assert.deepStrictEqual(
  flatten(insertBlock(tree, b('new'), null, null)).map((r) => r.block.id),
  ['a', 'wrap', 'x', 'inner', 'deep', 'z', 'new'],
)
assert.deepStrictEqual(
  flatten(insertBlock(tree, b('new'), 'wrap', 'x')).map((r) => r.block.id),
  ['a', 'wrap', 'new', 'x', 'inner', 'deep', 'z'],
)
assert.deepStrictEqual(
  flatten(insertBlock(tree, b('new'), 'inner', null)).map((r) => r.block.id),
  ['a', 'wrap', 'x', 'inner', 'deep', 'new', 'z'],
)
// An unknown beforeId appends rather than dropping the block on the floor.
assert.deepStrictEqual(
  flatten(insertBlock(tree, b('new'), 'wrap', 'ghost')).map((r) => r.block.id),
  ['a', 'wrap', 'x', 'inner', 'deep', 'new', 'z'],
)

// --- move = remove then insert, across levels, order preserved ----------
{
  const out = insertBlock(removeBlock(tree, 'a'), b('a'), 'inner', 'deep')
  assert.deepStrictEqual(
    flatten(out).map((r) => [r.block.id, r.depth]),
    [
      ['wrap', 0],
      ['x', 1],
      ['inner', 1],
      ['a', 2],
      ['deep', 2],
      ['z', 0],
    ],
  )
}

// --- replace keeps position at depth ------------------------------------
{
  const out = replaceBlock(tree, { ...b('deep'), label: 'renamed' })
  assert.strictEqual(findBlock(out, 'deep')?.label, 'renamed')
  assert.deepStrictEqual(
    flatten(out).map((r) => r.block.id),
    ['a', 'wrap', 'x', 'inner', 'deep', 'z'],
  )
}

// --- addChild turns a leaf into a container -----------------------------
{
  const out = addChild(tree, 'a', b('kid'))
  assert.deepStrictEqual(findBlock(out, 'a')!.children!.map((c) => c.id), ['kid'])
  const again = addChild(out, 'a', b('kid2'))
  assert.deepStrictEqual(findBlock(again, 'a')!.children!.map((c) => c.id), ['kid', 'kid2'])
}

// --- siblingsOf: the list that holds an id, and that list's parent ------
assert.deepStrictEqual(siblingsOf(tree, 'a')?.parentId, null)
assert.deepStrictEqual(siblingsOf(tree, 'deep')?.parentId, 'inner')
assert.deepStrictEqual(siblingsOf(tree, 'x')?.siblings.map((s) => s.id), ['x', 'inner'])
assert.strictEqual(siblingsOf(tree, 'nope'), null)

// --- moveByKey: up/down reorder among siblings only ---------------------
{
  //  a  wrap(x inner(deep))  z
  const up = moveByKey(tree, 'z', 'up')!
  assert.deepStrictEqual(up.map((r) => r.id), ['a', 'z', 'wrap'])
  const down = moveByKey(tree, 'a', 'down')!
  assert.deepStrictEqual(down.map((r) => r.id), ['wrap', 'a', 'z'])
  // deep is an only child: no sibling to swap with.
  assert.strictEqual(moveByKey(tree, 'deep', 'up'), null)
  // a is already first among its siblings.
  assert.strictEqual(moveByKey(tree, 'a', 'up'), null)
}

// --- moveByKey right: nest into the block directly above ----------------
{
  const out = moveByKey(tree, 'z', 'right')! // nests z into wrap (the block above z)
  assert.deepStrictEqual(
    flatten(out).map((r) => [r.block.id, r.depth]),
    [['a', 0], ['wrap', 0], ['x', 1], ['inner', 1], ['deep', 2], ['z', 1]],
  )
  // a is first at its level: nothing above to nest into.
  assert.strictEqual(moveByKey(tree, 'a', 'right'), null)
}

// --- moveByKey left: pop out to just after the parent -------------------
{
  const out = moveByKey(tree, 'deep', 'left')! // deep leaves inner, lands after inner
  assert.deepStrictEqual(
    flatten(out).map((r) => [r.block.id, r.depth]),
    [['a', 0], ['wrap', 0], ['x', 1], ['inner', 1], ['deep', 1], ['z', 0]],
  )
  // already top level.
  assert.strictEqual(moveByKey(tree, 'a', 'left'), null)
}

// --- moveByKey: Chat History can't nest or be nested into ---------------
{
  const hist = [b('a'), { ...b('h'), source: 'chatHistory' as const }, b('c')]
  assert.strictEqual(moveByKey(hist, 'h', 'right'), null) // history won't move into a block
  assert.strictEqual(moveByKey(hist, 'c', 'right'), null) // nothing nests into history
}

console.log('ok')

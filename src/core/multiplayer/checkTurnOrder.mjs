#!/usr/bin/env node
import assert from 'assert'
import { advance, holder, reorder, removeParticipant, addParticipant } from './turnOrder.ts'

assert.strictEqual(advance(['a', 'b', 'c'], 0), 1)
assert.strictEqual(advance(['a', 'b', 'c'], 1), 2)
assert.strictEqual(advance(['a', 'b', 'c'], 2), 0)
assert.strictEqual(advance([], 0), 0)

assert.strictEqual(holder(['a', 'b', 'c'], 0), 'a')
assert.strictEqual(holder(['a', 'b', 'c'], 1), 'b')
assert.strictEqual(holder(['a', 'b', 'c'], 2), 'c')
assert.strictEqual(holder([], 0), undefined)
assert.strictEqual(holder(['a'], 99), undefined)

const original = ['a', 'b', 'c']
const movedForward = reorder(original, 1, 2)
const movedBackward = reorder(original, 2, 0)
assert.deepStrictEqual(original, ['a', 'b', 'c'])
assert.deepStrictEqual(movedForward, ['a', 'c', 'b'])
assert.deepStrictEqual(movedBackward, ['c', 'a', 'b'])

assert.strictEqual(reorder(['a'], 0, 5).length, 1)
assert.strictEqual(reorder([], 0, 0).length, 0)

const beforeHolder = removeParticipant(['a', 'b', 'c'], 1, 'a')
assert.deepStrictEqual(beforeHolder.order, ['b', 'c'])
assert.strictEqual(holder(beforeHolder.order, beforeHolder.turnIndex), 'b')

const wasHolder = removeParticipant(['a', 'b', 'c'], 1, 'b')
assert.deepStrictEqual(wasHolder.order, ['a', 'c'])
assert.strictEqual(holder(wasHolder.order, wasHolder.turnIndex), 'c')

const lastWasHolder = removeParticipant(['a', 'b'], 1, 'b')
assert.deepStrictEqual(lastWasHolder.order, ['a'])
assert.strictEqual(holder(lastWasHolder.order, lastWasHolder.turnIndex), 'a')

const afterHolder = removeParticipant(['a', 'b', 'c'], 1, 'c')
assert.deepStrictEqual(afterHolder.order, ['a', 'b'])
assert.strictEqual(holder(afterHolder.order, afterHolder.turnIndex), 'b')

const onlyOne = removeParticipant(['x'], 0, 'x')
assert.deepStrictEqual(onlyOne.order, [])
assert.strictEqual(onlyOne.turnIndex, 0)

const notFound = removeParticipant(['a', 'b'], 0, 'z')
assert.deepStrictEqual(notFound.order, ['a', 'b'])
assert.strictEqual(notFound.turnIndex, 0)

const appended = addParticipant(['a', 'b'], 'c')
assert.deepStrictEqual(appended, ['a', 'b', 'c'])

const duplicateIgnored = addParticipant(['a', 'b'], 'b')
assert.deepStrictEqual(duplicateIgnored, ['a', 'b'])

assert.strictEqual(addParticipant([], 'x').length, 1)
assert.strictEqual(addParticipant(['a'], 'a').length, 1)

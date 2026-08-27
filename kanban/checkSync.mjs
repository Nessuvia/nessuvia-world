// node kanban/checkSync.mjs
//
// The seed is the only thing in sync.js that can break: boards.nbx has to land in localStorage as
// the keys nullboard looks for, and it must not touch a browser that already has a board.
// sync.js is a plain browser script, so we run it against stubs rather than importing it.

import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'public/sync.js'), 'utf8')
const nbx = readFileSync(join(here, 'public/boards.nbx'), 'utf8')

// Methods on the prototype stay off Object.keys(), same as a real Storage.
class FakeStorage {
  getItem(k) {
    return Object.hasOwn(this, k) ? this[k] : null
  }
  setItem(k, v) {
    this[k] = String(v)
  }
}

function run(localStorage, responseText) {
  const ctx = {
    localStorage,
    console,
    JSON,
    Object,
    String,
    Array,
    XMLHttpRequest: class {
      open() {}
      send() {
        this.status = 200
        this.responseText = responseText
      }
    },
  }

  vm.runInNewContext(source, ctx)
  return { ...localStorage }
}

// Empty browser: every board in the file lands under the keys nullboard reads on init.
const boards = JSON.parse(nbx)
const seeded = run(new FakeStorage(), nbx)

for (const board of boards) {
  assert.equal(seeded[`nullboard.board.${board.id}`], String(board.revision))
  assert.deepEqual(JSON.parse(seeded[`nullboard.board.${board.id}.${board.revision}`]), board)
}
assert.equal(Object.keys(seeded).length, boards.length * 2, 'seeded keys nullboard does not read')

// A bare board object, not an array — nullboard exports both shapes.
const single = run(new FakeStorage(), JSON.stringify(boards[0]))
assert.equal(single[`nullboard.board.${boards[0].id}`], String(boards[0].revision))

// Browser that already has a board: boards.nbx must not overwrite it.
const used = new FakeStorage()
used.setItem('nullboard.board.1', 'mine')
assert.deepEqual(run(used, nbx), { 'nullboard.board.1': 'mine' }, 'seed clobbered local data')

// Garbage on the wire is ignored rather than half-applied.
assert.deepEqual(run(new FakeStorage(), 'not json'), {})
assert.deepEqual(run(new FakeStorage(), '[{"title":"no id"}]'), {})

console.log('ok')

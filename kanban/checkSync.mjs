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
  removeItem(k) {
    delete this[k]
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
assert.equal(Object.keys(seeded).length, boards.length * 2 + 1, 'seeded keys nullboard does not read')

// The board opens on load rather than the board list: config.board is the first board's id, as a
// number, which is what nullboard looks up in its board index.
assert.deepEqual(JSON.parse(seeded['nullboard.config']), { board: boards[0].id })

// A bare board object, not an array. nullboard exports both shapes.
const single = run(new FakeStorage(), JSON.stringify(boards[0]))
assert.equal(single[`nullboard.board.${boards[0].id}`], String(boards[0].revision))

// Public tracker: a browser holding an older copy gets the committed one, and the stale meta that
// would point back at the old revision is dropped.
const stale = new FakeStorage()
const old = { ...boards[0], revision: boards[0].revision - 1 }
stale.setItem(`nullboard.board.${old.id}`, String(old.revision))
stale.setItem(`nullboard.board.${old.id}.${old.revision}`, JSON.stringify(old))
stale.setItem(`nullboard.board.${old.id}.meta`, '{"current":1}')
stale.setItem('nullboard.config', '{"board":1,"theme":"dark"}')
const fresh = run(stale, nbx)

assert.equal(fresh[`nullboard.board.${old.id}`], String(boards[0].revision))
assert.deepEqual(JSON.parse(fresh[`nullboard.board.${boards[0].id}.${boards[0].revision}`]), boards[0])
assert.equal(fresh[`nullboard.board.${old.id}.meta`], undefined, 'stale meta outranks the seed')
assert.equal(fresh['nullboard.config'], '{"board":1,"theme":"dark"}', 'seed took the visitor theme')

// Same revision already stored: nothing is touched, so nullboard keeps its own meta.
const current = new FakeStorage()
for (const board of boards) {
  current.setItem(`nullboard.board.${board.id}.${board.revision}`, JSON.stringify(board))
  current.setItem(`nullboard.board.${board.id}.meta`, 'kept')
}
const before = { ...current }
assert.deepEqual({ ...run(current, nbx) }, { ...before, 'nullboard.config': `{"board":${boards[0].id}}` })

// Garbage on the wire is ignored rather than half-applied.
assert.deepEqual(run(new FakeStorage(), 'not json'), {})
assert.deepEqual(run(new FakeStorage(), '[{"title":"no id"}]'), {})

console.log('ok')

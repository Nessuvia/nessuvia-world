// node kanban/checkSync.mjs
//
// The round trip is the only thing in sync.js that can break: seed boards.json into localStorage,
// click Sync cards, get the same JSON back out. sync.js is a plain browser script, so we run it
// against stubs rather than importing it.

import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'public/sync.js'), 'utf8')
const boardsJson = readFileSync(join(here, 'public/boards.json'), 'utf8')

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
  let onReady
  let downloaded = null
  let onSync

  const ctx = {
    localStorage,
    console,
    JSON,
    Object,
    String,
    XMLHttpRequest: class {
      open() {}
      send() {
        this.status = 200
        this.responseText = responseText
      }
    },
    Blob: class {
      constructor(parts) {
        this.text = parts.join('')
      }
    },
    URL: {
      createObjectURL: (b) => {
        downloaded = b.text
        return 'blob:x'
      },
      revokeObjectURL() {},
    },
    document: {
      createElement: () => ({ click() {} }),
      addEventListener: (_, fn) => (onReady = fn),
      querySelector: () => ({ addEventListener: (_, fn) => (onSync = fn) }),
    },
  }

  vm.runInNewContext(source, ctx)
  onReady()
  onSync({ preventDefault() {} })
  return downloaded
}

// Empty browser: seeds from boards.json, and syncing back gives the same thing.
const fresh = new FakeStorage()
const out = run(fresh, boardsJson)
assert.deepEqual(JSON.parse(out), JSON.parse(boardsJson), 'round trip changed the data')
assert.equal(fresh['nullboard.config'], JSON.parse(boardsJson)['nullboard.config'])

// Browser that already has a board: boards.json must not overwrite it.
const used = new FakeStorage()
used.setItem('nullboard.board.1', 'mine')
const out2 = run(used, boardsJson)
assert.deepEqual(JSON.parse(out2), { 'nullboard.board.1': 'mine' }, 'seed clobbered local data')

// Garbage on the wire is ignored rather than half-applied.
const broken = new FakeStorage()
assert.deepEqual(JSON.parse(run(broken, 'not json')), {})

console.log('ok')

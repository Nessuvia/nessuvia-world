// Gets nullboard's cards in and out of git.
//
// Out: ≡ menu → "Export all boards...". Save the .nbx over kanban/public/boards.nbx and commit.
// In: on a browser that has never seen this board, the committed boards.nbx is loaded into
// localStorage before nullboard starts.
//
// .nbx is nullboard's own export format — plain JSON, either one board object or an array of
// them. We write the two localStorage keys the "old format" branch of Storage_Local.openInner()
// looks for, and nullboard rebuilds meta and config on its own.

const prefix = 'nullboard.'

function ourKeys() {
  return Object.keys(localStorage).filter((k) => k.startsWith(prefix))
}

// Synchronous on purpose: nullboard reads localStorage during init, and this script runs in
// <head>, so the seed has to be finished before the next <script> tag does.
// ponytail: sync XHR blocks the load. It's one small file on a dev-only page; if that ever
// matters, seed asynchronously and reload once behind a sentinel key.
function seed() {
  if (ourKeys().length) return

  const req = new XMLHttpRequest()
  req.open('GET', 'boards.nbx', false)
  try {
    req.send()
  } catch {
    return // offline, or served from file:// — nullboard shows its empty state
  }
  if (req.status !== 200 && req.status !== 0) return

  let data
  try {
    data = JSON.parse(req.responseText)
  } catch {
    console.warn('boards.nbx is not valid JSON; starting empty')
    return
  }
  if (!Array.isArray(data)) data = [data]

  for (const board of data) {
    if (!board || !board.id || !board.revision || !Array.isArray(board.lists)) {
      console.warn('boards.nbx holds something that is not a board; skipping it')
      continue
    }
    localStorage.setItem(prefix + 'board.' + board.id, String(board.revision))
    localStorage.setItem(prefix + 'board.' + board.id + '.' + board.revision, JSON.stringify(board))
  }
}

seed()

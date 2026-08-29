// Gets nullboard's cards in and out of git.
//
// Out: ≡ menu → "Export all boards...". Save the .nbx over kanban/public/boards.nbx and commit.
// In: the committed boards.nbx is loaded into localStorage before nullboard starts, on every
// visit whose stored copy is behind the file. This is a public tracker, so the file wins
// anything typed into the board in a visitor's browser is overwritten by the next commit.
//
// .nbx is nullboard's own export format, plain JSON, either one board object or an array of
// them. We write the two localStorage keys the "old format" branch of Storage_Local.openInner()
// looks for, and nullboard rebuilds meta on its own.

const prefix = 'nullboard.'

// Synchronous on purpose: nullboard reads localStorage during init, and this script runs in
// <head>, so the seed has to be finished before the next <script> tag does.
// ponytail: sync XHR blocks the load. It's one small file on a dev-only page; if that ever
// matters, seed asynchronously and reload once behind a sentinel key.
function seed() {
  const req = new XMLHttpRequest()
  req.open('GET', 'boards.nbx', false)
  try {
    req.send()
  } catch {
    return // offline, or served from file://, nullboard shows its empty state
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

  let first = null

  for (const board of data) {
    if (!board || !board.id || !board.revision || !Array.isArray(board.lists)) {
      console.warn('boards.nbx holds something that is not a board; skipping it')
      continue
    }
    if (first === null) first = board.id

    // Already holding this exact revision, leave it, along with whatever meta nullboard keeps
    // next to it. Anything else (never seen, or an older/edited copy) gets replaced.
    const key = prefix + 'board.' + board.id + '.' + board.revision
    if (localStorage.getItem(key) === JSON.stringify(board)) continue

    localStorage.setItem(key, JSON.stringify(board))
    localStorage.setItem(prefix + 'board.' + board.id, String(board.revision))
    // New-format meta would win over the key above and point at the old revision. Dropping it
    // sends nullboard down rebuildMeta(), which reads the revision we just wrote.
    localStorage.removeItem(prefix + 'board.' + board.id + '.meta')
  }

  // Without a config nullboard opens on the board list. It reads config.board as a number, and
  // its own `last_board` fallback stores a string that fails that lookup, so write the config.
  // Only when there isn't one: config also holds theme and font, which are the visitor's.
  if (first !== null && !localStorage.getItem(prefix + 'config')) {
    localStorage.setItem(prefix + 'config', JSON.stringify({ board: first }))
  }
}

seed()

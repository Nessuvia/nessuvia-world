// Gets nullboard's cards in and out of git.
//
// Out: "Sync cards" in the ≡ menu downloads boards.json. Drop it over kanban/public/boards.json
// and commit.
// In: on a browser that has never seen this board, the committed boards.json is loaded into
// localStorage before nullboard starts.
//
// Every localStorage key nullboard owns is prefixed 'nullboard.' — see Storage_Local in
// index.html. We copy those keys verbatim in both directions and never look inside them, so the
// board format, revision history and config are none of our business.

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
  req.open('GET', 'boards.json', false)
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
    console.warn('boards.json is not valid JSON; starting empty')
    return
  }

  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith(prefix)) localStorage.setItem(key, val)
  }
}

function download() {
  const data = {}
  for (const key of ourKeys().sort()) data[key] = localStorage.getItem(key)

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'boards.json'
  a.click()
  URL.revokeObjectURL(url)
}

seed()

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.config .sync-cards').addEventListener('click', (e) => {
    e.preventDefault()
    download()
  })
})

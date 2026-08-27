# kanban

Idea board at kanban.nessuvia.com. Lists: Ideas, In Consideration, Rejected, Approved, In Progress,
Done. No auth — the cards are committed as a `.nbx` file, nullboard's own export format, and are
readable by anyone with the repo.

[Nullboard](https://github.com/apankrat/nullboard) vendored at `db65363`, BSD-2-Clause, `LICENSE`
kept verbatim. `public/index.html` is upstream's `nullboard.html` with two additions: the `sync.js`
tag in `<head>`, and a CSS block at the end of `<style>` that wraps the lists three per row instead
of one sideways-scrolling row. Both are commented as ours. `public/sync.js` is ours.

## Committing cards

1. Close the board (≡ menu → board list) so the export entry reads **Export all boards...**, then
   click it.
2. Save it over `public/boards.nbx` and commit.

`public/boards.nbx` is loaded on every visit where the stored copy is behind the file, so a commit
reaches people who have been here before. Cards typed into the board in a browser are overwritten
by the next commit. Theme and font settings are the visitor's and are left alone.

`node kanban/checkSync.mjs` checks the seed.

## Deploy

```
npx wrangler deploy --config kanban/wrangler.jsonc
```

No build step. `npx wrangler dev --config kanban/wrangler.jsonc` to run it locally.

`kanban.nessuvia.com` is a `custom_domain` route, so Cloudflare owns the DNS record and the first
deploy created it. The app's own Worker uses a plain route instead, because `xenia.nessuvia.com`
already had a record made by hand.

Neither Worker deploys on push today — the API reports `last_deployed_from: "wrangler"` for
`xenia-nessuvia-dev`, so both go live by someone running the command by hand.

To put the kanban on a push trigger, connect a Workers Build to this repo in the Cloudflare
dashboard (Workers → nessuvia-kanban → Settings → Builds):

- Root directory: repo root
- Build command: none
- Deploy command: `npx wrangler deploy --config kanban/wrangler.jsonc`
- Build watch paths: `kanban/*`, so an app-only push doesn't redeploy the board

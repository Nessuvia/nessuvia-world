# kanban

Idea board at kanban.nessuvia.com. Lists: Ideas, In Consideration, Rejected, Approved, In Progress,
Done. No auth — the cards are committed as plain JSON and readable by anyone with the repo.

[Nullboard](https://github.com/apankrat/nullboard) vendored at `db65363`, BSD-2-Clause, `LICENSE`
kept verbatim. `public/index.html` is upstream's `nullboard.html` with three additions: the
`sync.js` tag in `<head>`, the "Sync cards" entry in the ≡ menu, and a CSS block at the end of
`<style>` that wraps the lists three per row instead of one sideways-scrolling row. Each is
commented as ours. `public/sync.js` is ours.

## Committing cards

1. ≡ menu → **Sync cards**. Downloads `boards.json`.
2. Move it over `public/boards.json` and commit.

A browser with no board yet loads `public/boards.json` on first visit. A browser that already has
one ignores the file — the download is the only way data moves.

## Deploy

```
npx wrangler deploy --config kanban/wrangler.jsonc
```

No build step. `npx wrangler dev --config kanban/wrangler.jsonc` to run it locally.

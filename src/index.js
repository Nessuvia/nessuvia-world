// Static hosting and nothing else. There are no /api/ routes: the app has no backend, sync goes
// from the browser straight to the user's own bucket, and multiplayer goes straight to Supabase
// Realtime. Nothing of anyone's is stored on our side.
//
// Named environments inherit top-level "main", so env.dev needs its own entry point — otherwise
// dev would deploy the coming-soon page. Assets apply not_found_handling:
// single-page-application on a miss, which is what serves the SPA fallback.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}

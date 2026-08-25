import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './app/skins' // pulls in every skin stylesheet
import './modules/chat' // self-registers into moduleRegistry
import './modules/write'
import './modules/multiplayer'
import './modules/ask'
import './modules/characters'
import './modules/personas'
import './modules/prompts'
import './modules/appearance'
import './modules/settings'
import './modules/bodyMap' // a plugin: off until enabled in Settings > Miscellaneous
// Sync is off in every build, dev included. Not deleted: the bucket code works and the decision to
// drop BYO-S3 for good hasn't been made. Unregistering is the whole switch — Sidebar guards its two
// sync entries with `syncModule &&`, and /sync stops resolving. Re-enable by uncommenting.
// import './modules/sync'

// A WIP tab that ships: registered everywhere, so /learn resolves on live, but the rail only shows
// its button on dev (see Sidebar.tsx).
import './modules/learn'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

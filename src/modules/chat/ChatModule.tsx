import { Route, Routes } from 'react-router-dom'
import CharacterPicker from './CharacterPicker'
import CharacterPanel from './CharacterPanel'
import ChatView from './ChatView'
import TagsPage from './TagsPage'

// The module owns its subroutes. Split out of index.ts so index can register a lazy component
// without importing the views.
export default function ChatModule() {
  return (
    <Routes>
      <Route index element={<CharacterPicker />} />
      {/* The open character lives in the URL, so clicking Chat in the sidebar closes it. */}
      <Route path="c/new" element={<CharacterPanel />} />
      <Route path="c/:characterId" element={<CharacterPanel />} />
      {/* Above :chatId, which would otherwise swallow it. */}
      <Route path="tags" element={<TagsPage />} />
      <Route path=":chatId" element={<ChatView />} />
    </Routes>
  )
}

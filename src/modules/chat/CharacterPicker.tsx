import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiSearchLine } from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { Avatar } from '../../app/Avatar'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { useChats } from '../../core/stores/chatStore'
import { useBlips } from '../../core/stores/blipStore'
import { parsePngCard, pngDataUrl } from '../characters/pngCard'
import { formatStamp } from './formatStamp'
import ImportUrlModal from './ImportUrlModal'

/** `/chat` with no chat selected: every character, most-chatted first. */
export default function CharacterPicker() {
  const { characters, loading, load, importCharacter } = useCharacters()
  const summaries = useChats((s) => s.summaries)
  const blips = useBlips((s) => s.blips)
  const loadSummaries = useChats((s) => s.loadSummaries)
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useCloseOnOutside<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))
  const [urlModal, setUrlModal] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()
    loadSummaries()
  }, [load, loadSummaries])

  // Cleared on the way out, not on the way in: a reply that lands while you're standing here still
  // gets seen, and the blip is gone the next time you come back.
  useEffect(() => () => useBlips.getState().clearAll(), [])

  async function runImport(json: unknown, avatar = '') {
    setError('')
    try {
      navigate(`/chat/c/${await importCharacter(json, avatar)}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function importFile(file: File) {
    try {
      if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
        const buffer = await file.arrayBuffer()
        await runImport(parsePngCard(buffer), pngDataUrl(buffer))
      } else {
        await runImport(JSON.parse(await file.text()))
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const q = search.trim().toLowerCase()
  const sorted = [...characters]
    .filter((c) => !q || (displayName(c) || '').toLowerCase().includes(q))
    .sort(
      (a, b) =>
        (summaries[b.id!]?.count ?? 0) - (summaries[a.id!]?.count ?? 0) ||
        (summaries[b.id!]?.latest ?? 0) - (summaries[a.id!]?.latest ?? 0) ||
        a.name.localeCompare(b.name),
    )

  return (
    <div className="chatPicker screenFrame">
      <div className="chatPickerHeader">
        <h2>Characters</h2>
        <span className="headerActions">
          <span className="charSearchWrap">
            <RiSearchLine size={16} className="charSearchIcon" />
            <input
              className="chatSearch charSearch"
              placeholder="Search characters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
          <span className="importMenu" ref={menuRef}>
            <button type="button" className="importButton" onClick={() => setMenuOpen((o) => !o)}>
              Import card
            </button>
            {menuOpen && (
              <div className="panel importMenuList">
                <label>
                  Upload from device
                  <input
                    type="file"
                    accept=".json,application/json,.png,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = '' // so re-picking the same file fires onChange again
                      setMenuOpen(false)
                      if (file) importFile(file)
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setUrlModal(true)
                  }}
                >
                  Import via URL
                </button>
              </div>
            )}
          </span>
          <button type="button" onClick={() => navigate('/chat/c/new')}>
            New character
          </button>
        </span>
      </div>

      {urlModal && (
        <ImportUrlModal
          onClose={() => setUrlModal(false)}
          onImport={(json, avatar) => {
            setUrlModal(false)
            runImport(json, avatar)
          }}
        />
      )}

      {error && <p className="error">{error}</p>}
      {loading && characters.length === 0 && <p className="placeholder">Loading…</p>}
      {!loading && characters.length === 0 && (
        <p className="placeholder">No characters yet — import or create one first.</p>
      )}
      {characters.length > 0 && sorted.length === 0 && (
        <p className="placeholder">No matches.</p>
      )}

      {/* The grid is the scroller, so the header and search stay put. .appContent clips, so without
          this the cards below the fold were simply unreachable. */}
      <div className="pickerGrid screenBody">
        {sorted.map((c) => {
          const summary = summaries[c.id!]
          return (
            <button
              key={c.id}
              type="button"
              className="card pickerCard"
              onClick={() => navigate(`/chat/c/${c.id}`)}
            >
              {blips.includes(c.id!) ? (
                <span className="blipRing" title="New reply">
                  <Avatar of={c} name={displayName(c) || '?'} />
                </span>
              ) : (
                <Avatar of={c} name={displayName(c) || '?'} />
              )}
              <span className="characterName">{displayName(c) || 'Unnamed'}</span>
              <span className="pickerMeta">
                {summary && summary.count > 0
                  ? `${summary.count} chat${summary.count === 1 ? '' : 's'}` +
                    (summary.latest ? ` · Last message: ${formatStamp(summary.latest)}` : '')
                  : 'No chats yet'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

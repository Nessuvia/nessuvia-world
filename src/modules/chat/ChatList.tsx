import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiStarFill, RiStarLine } from '@remixicon/react'
import { useChats } from '../../core/stores/chatStore'
import type { Character } from '../../core/storage/types'
import { CollapseButton } from '../../app/CollapseButton'

export default function ChatList({
  character,
  onCollapse,
}: {
  character: Character
  onCollapse?: () => void
}) {
  const { chats, loadChats, renameChat, deleteChat, toggleBookmark } = useChats()
  const searchMessages = useChats((s) => s.searchMessages)
  const loadSearchIndex = useChats((s) => s.loadSearchIndex)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  // Not persisted: which way you're searching right now is a glance-level choice, like the
  // collapsed column next door.
  const [inside, setInside] = useState(false)
  // Also not persisted, and deliberately so: skipping the confirm is a decision for this sitting,
  // not a setting that follows you into the next one.
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false)

  useEffect(() => {
    loadChats(character.id!)
  }, [character.id, loadChats])

  // Loaded once when the box is checked, then every keystroke filters the array. Reading the table
  // per keystroke would be the same answer at a much worse price.
  useEffect(() => {
    if (inside) loadSearchIndex(character.id!)
  }, [inside, character.id, loadSearchIndex])

  // The search row only exists above this many chats; below it, a query left over from before a
  // delete must not go on hiding rows from a box that isn't on screen.
  const showTools = chats.length > 4
  const query = showTools ? search.trim().toLowerCase() : ''

  /** Matching messages per chat id. Empty unless searching inside. */
  const counts = useMemo(() => {
    if (!inside || !query) return {} as Record<number, number>
    const out: Record<number, number> = {}
    for (const m of searchMessages) {
      if (m.content.toLowerCase().includes(query)) out[m.chatId] = (out[m.chatId] ?? 0) + 1
    }
    return out
  }, [inside, query, searchMessages])

  // A title hit still counts when searching inside — the extra results are the point of the box,
  // not a replacement for the ones it already found.
  const shown = chats.filter(
    (c) => c.title.toLowerCase().includes(query) || (c.id !== undefined && counts[c.id] > 0),
  )

  return (
    <div className="chatPicker">
      <div className="chatPickerHeader">
        <span className="chatPickerTitle">
          <h2>Chats</h2>
          {chats.length > 0 && <span className="hint">({chats.length})</span>}
          {onCollapse && <CollapseButton label="Chats" collapsed={false} onToggle={onCollapse} />}
        </span>
      </div>

      {/* The sheet sits this list above the card's sections, so its chrome costs the sections
          screen space. Under a handful of chats you can see them all anyway — the search and the
          delete toggle only earn their rows once the list is long enough to need them. */}
      {showTools && (
        <>
          <div className="chatSearchRow">
            <input
              className="chatSearch"
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="chatSearchInside">
              <input
                type="checkbox"
                checked={inside}
                onChange={(e) => setInside(e.target.checked)}
              />
              Search inside chats
            </label>
          </div>

          <label className="chatDeleteToggle">
            <input
              type="checkbox"
              checked={skipDeleteConfirm}
              onChange={(e) => setSkipDeleteConfirm(e.target.checked)}
            />
            Immediately delete chats when clicking Delete
          </label>
        </>
      )}

      {chats.length === 0 && <p className="placeholder">No chats yet.</p>}
      {chats.length > 0 && shown.length === 0 && <p className="placeholder">No matches.</p>}

      <ul className="pickerList">
        {shown.map((c) => (
          <li key={c.id} className="card chatRow">
            {renaming === c.id ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  // Blur commits, like the chat title in the header. Escape clears the draft
                  // first, so the blur it causes has nothing left to write.
                  if (title.trim() && title.trim() !== c.title) renameChat(c.id!, title.trim())
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameChat(c.id!, title.trim() || c.title)
                    setRenaming(null)
                    setTitle('')
                  }
                  if (e.key === 'Escape') {
                    setTitle('')
                    setRenaming(null)
                  }
                }}
              />
            ) : (
              <Link className="chatTitle" to={`/chat/${c.id}`}>
                {c.title}
              </Link>
            )}
            {c.id !== undefined && counts[c.id] > 0 && (
              <span className="hint chatMatchCount">
                {counts[c.id] === 1 ? '1 match' : `${counts[c.id]} matches`}
              </span>
            )}
            <button
              type="button"
              className="starButton"
              title={c.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              aria-label={c.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              onClick={() => toggleBookmark(c.id!)}
            >
              {c.bookmarked ? <RiStarFill size={16} /> : <RiStarLine size={16} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(c.title)
                setRenaming(c.id!)
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (skipDeleteConfirm || confirm(`Delete "${c.title}" and its messages?`))
                  deleteChat(c.id!)
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

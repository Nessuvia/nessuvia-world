import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiMoreLine } from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useChats } from '../../core/stores/chatStore'
import { useWorldInfo } from '../../core/stores/worldInfoStore'
import { Avatar } from '../../app/Avatar'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { exportCardJson, exportCardPng } from '../characters/exportCard'
import GalleryLightbox from '../characters/GalleryLightbox'
import ChatList from './ChatList'

/**
 * A character, read first — `/chat/c/:characterId`. Editing is a separate route. The description
 * is deliberately not here: it's the model's view of the character, not the reader's.
 */
export default function CharacterProfile() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { characters, load, remove } = useCharacters()
  const { chats, loadChats, createChat } = useChats()
  const id = characterId ? Number(characterId) : null
  const character = characters.find((c) => c.id === id) ?? null

  const [menuOpen, setMenuOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const menuRef = useCloseOnOutside<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  useEffect(() => {
    if (id) loadChats(id)
  }, [id, loadChats])

  if (!character) return <p className="placeholder">Loading…</p>

  // Read at export time rather than held in state — nothing else on this page needs them.
  const bookEntries = () =>
    character.id ? useWorldInfo.getState().fetchFor(character.id) : Promise.resolve([])

  // The list is sorted by createdAt; "last" here means last written to.
  const lastChat = chats.reduce(
    (best, c) => (best && best.updatedAt >= c.updatedAt ? best : c),
    chats[0],
  )

  const tags = character.tags ?? []
  const gallery = character.gallery.filter((url) => url !== character.avatar)

  return (
    <div className="characterProfile screenFrame">
      <div className="chatPickerHeader">
        <button type="button" className="secondary" onClick={() => navigate('/chat')}>
          Back
        </button>
        <h2>{displayName(character) || 'Unnamed'}</h2>
        <span className="profileMenu" ref={menuRef}>
          <button
            type="button"
            aria-label="More"
            title="More"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <RiMoreLine size={16} />
          </button>
          {menuOpen && (
            <span className="exportMenuList">
              <button
                type="button"
                disabled={!character.avatar}
                onClick={async () => {
                  setMenuOpen(false)
                  try {
                    await exportCardPng(character, await bookEntries())
                  } catch (e) {
                    setExportError(e instanceof Error ? e.message : 'Export failed.')
                  }
                }}
              >
                Export PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  bookEntries().then((entries) => exportCardJson(character, entries))
                }}
              >
                Export JSON
              </button>
              <hr />
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  setMenuOpen(false)
                  if (
                    confirm(
                      `Delete ${character.name || 'this character'}, your chats, and your messages?`,
                    )
                  ) {
                    await remove(character.id!)
                    navigate('/chat')
                  }
                }}
              >
                Delete
              </button>
            </span>
          )}
        </span>
      </div>

      <div className="screenBody profileBody">
        {exportError && <p className="hint">{exportError}</p>}

        <div className="profileIdentity">
          <Avatar of={character} name={character.name} className="avatar profileAvatar" />
          <div>
            <h3>{displayName(character) || 'Unnamed'}</h3>
            {tags.length > 0 && (
              <div className="profileTags">
                {tags.map((t) => (
                  <span key={t} className="tagChip">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="profileActions">
          {lastChat && (
            <button type="button" onClick={() => navigate(`/chat/${lastChat.id}`)}>
              Continue last chat
            </button>
          )}
          <button
            type="button"
            onClick={async () => navigate(`/chat/${await createChat(character.id!)}`)}
          >
            New chat
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate(`/chat/c/${character.id}/edit`)}
          >
            Edit character
          </button>
        </div>

        {character.creatorNotes?.trim() && (
          <p className="profileNotes">{character.creatorNotes}</p>
        )}

        {gallery.length > 0 && (
          <div className="profileGallery">
            {gallery.map((url) => (
              <img key={url} src={url} alt="" onClick={() => setLightbox(url)} />
            ))}
          </div>
        )}

        <ChatList character={character} />
      </div>

      {lightbox && <GalleryLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

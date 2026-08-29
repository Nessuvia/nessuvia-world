import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiMoreLine } from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useChats } from '../../core/stores/chatStore'
import { useWorldInfo } from '../../core/stores/worldInfoStore'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import { Avatar } from '../../app/Avatar'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import CharacterEditor from '../characters/CharacterEditor'
import { exportCardJson, exportCardPng } from '../characters/exportCard'
import ChatList from './ChatList'

/**
 * One character, read and edited on the same page — `/chat/c/:characterId`, or `/chat/c/new`.
 *
 * The description used to be kept off the read view on the grounds that it's the model's view of
 * the character rather than the reader's. That split cost more than it bought: the card system
 * (variants, greetings, the lorebook, param overrides) had no surface anywhere, so the sheet now
 * shows the card whole. Identity, the chat actions and the chat list sit above the collapsed
 * sections, because most visits here are to resume a chat, not to edit anything.
 */
export default function CharacterSheet() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { characters, load, remove } = useCharacters()
  const { chats, loadChats, createChat } = useChats()
  const id = characterId ? Number(characterId) : null
  const character = characters.find((c) => c.id === id) ?? null

  const [menuOpen, setMenuOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const [saveState, setSaveState] = useState('')
  const menuRef = useCloseOnOutside<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  useEffect(() => {
    if (id) loadChats(id)
  }, [id, loadChats])

  // Still loading an existing character. `/chat/c/new` has no id and drops straight through.
  if (id !== null && !character) return <p className="placeholder">Loading…</p>

  // Read at export time rather than held in state — nothing else on this page needs them. A card
  // carries one `character_book`, so the export takes the character's first attached lorebook and
  // leaves any others out.
  const exportBook = async () => {
    const bookId = character?.lorebookIds?.[0]
    if (!bookId) return { entries: [], book: undefined }
    await useLorebooks.getState().load()
    return {
      entries: await useWorldInfo.getState().fetchFor(bookId),
      book: useLorebooks.getState().books.find((b) => b.id === bookId),
    }
  }

  // The list is sorted by createdAt; "last" here means last written to.
  const lastChat = chats.reduce(
    (best, c) => (best && best.updatedAt >= c.updatedAt ? best : c),
    chats[0],
  )

  const tags = character?.tags ?? []

  // Everything above the sections: who this is, and the two things you came here to do.
  const identity = character && (
    <div className="sheetTop">
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
      </div>

      <ChatList character={character} />
    </div>
  )

  return (
    <div className="characterSheet screenFrame">
      <div className="chatPickerHeader">
        <button type="button" className="secondary" onClick={() => navigate('/chat')}>
          Back
        </button>
        <span className="saveState">{saveState}</span>
        {character && (
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
                      const { entries, book } = await exportBook()
                      await exportCardPng(character, entries, book)
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
                    exportBook().then(({ entries, book }) => exportCardJson(character, entries, book))
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
        )}
      </div>

      {exportError && <p className="hint">{exportError}</p>}

      <CharacterEditor
        key={character?.id ?? 'new'}
        characterId={character?.id ?? null}
        onSaveState={setSaveState}
        header={identity}
        // A new character gets an id on its first autosave; move onto its own URL so the identity
        // block and chat list appear and Back has somewhere to return from.
        onCreated={(newId) => navigate(`/chat/c/${newId}`, { replace: true })}
      />
    </div>
  )
}

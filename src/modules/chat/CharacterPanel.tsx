import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import CharacterEditor from '../characters/CharacterEditor'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import ChatList from './ChatList'

/** One character — `/chat/c/:characterId`, or `/chat/c/new`: details left, chats right. */
export default function CharacterPanel() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { characters, load, remove } = useCharacters()
  const id = characterId ? Number(characterId) : null
  const character = characters.find((c) => c.id === id) ?? null
  const onBack = () => navigate('/chat')

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  // not persisted — a collapsed column is a glance-level choice, not a setting.
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="characterPanel screenFrame">
      <div className="chatPickerHeader">
        <h2>{character ? displayName(character) || 'Unnamed' : 'New character'}</h2>
        <span className="headerActions">
          {character && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (
                  confirm(`Delete ${character.name || 'this character'}, your chats, and your messages?`)
                ) {
                  await remove(character.id!)
                  onBack()
                }
              }}
            >
              Delete character
            </button>
          )}
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
        </span>
      </div>

      <div className="characterPanelColumns">
        <div className="characterPanelColumn screenBody">
          <CharacterEditor
            key={character?.id ?? 'new'}
            characterId={character?.id ?? null}
            onCreated={(newId) => navigate(`/chat/c/${newId}`, { replace: true })}
          />
        </div>
        {collapsed ? (
          <CollapseRail label="Chats" onToggle={() => setCollapsed(false)} />
        ) : (
          <div className="characterPanelColumn chats screenBody">
            {character ? (
              <ChatList character={character} onCollapse={() => setCollapsed(true)} />
            ) : (
              <>
                <CollapseButton
                  label="Chats"
                  collapsed={false}
                  onToggle={() => setCollapsed(true)}
                />
                <p className="placeholder">Name the character to start a chat.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import CharacterEditor from '../characters/CharacterEditor'

/** Editing one character — `/chat/c/:characterId/edit`, or `/chat/c/new`. */
export default function CharacterPanel() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { characters, load } = useCharacters()
  const id = characterId ? Number(characterId) : null
  const character = characters.find((c) => c.id === id) ?? null

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  return (
    <div className="characterPanel screenFrame">
      <div className="chatPickerHeader">
        <h2>{character ? displayName(character) || 'Unnamed' : 'New character'}</h2>
        <span className="headerActions">
          <button
            type="button"
            className="secondary"
            onClick={() => navigate(character ? `/chat/c/${character.id}` : '/chat')}
          >
            Back
          </button>
        </span>
      </div>

      <CharacterEditor
        key={character?.id ?? 'new'}
        characterId={character?.id ?? null}
        // A new character gets an id on its first autosave; move onto its own edit URL so Back
        // has a profile to return to.
        onCreated={(newId) => navigate(`/chat/c/${newId}/edit`, { replace: true })}
      />
    </div>
  )
}

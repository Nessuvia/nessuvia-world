import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine,
  RiFilter3Line,
  RiImportLine,
  RiPriceTag3Line,
  RiSearchLine,
  RiStackLine,
} from '@remixicon/react'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { Avatar } from '../../app/Avatar'
import { CollapseButton } from '../../app/CollapseButton'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { useChats } from '../../core/stores/chatStore'
import { useBlips } from '../../core/stores/blipStore'
import type { Character } from '../../core/storage/types'
import { parsePngCard, pngDataUrl } from '../../core/connectors/pngCard'
import { importCard } from '../characters/importCard'
import { formatStamp } from './formatStamp'
import ImportUrlModal from './ImportUrlModal'
import ImportTagsModal from './ImportTagsModal'
import TagContextMenu from './TagContextMenu'
import TagList from './TagList'
import { useLongPress } from './useLongPress'
import { allTags, groupByPrimaryTag, matchesTags, type TagMode } from './tags'

// Which of Any/All the filter uses. A UI preference, so localStorage rather than a store — it is
// deliberately outside backup and sync.
const MODE_KEY = 'nessuTavern.tagFilterMode'
const storedMode = (): TagMode => (localStorage.getItem(MODE_KEY) === 'all' ? 'all' : 'any')

/** `/chat` with no chat selected: every character, most-chatted first. */
export default function CharacterPicker() {
  const { characters, loading, load, save, importCharacter } = useCharacters()
  const summaries = useChats((s) => s.summaries)
  const blips = useBlips((s) => s.blips)
  const loadSummaries = useChats((s) => s.loadSummaries)
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useCloseOnOutside<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))
  const [urlModal, setUrlModal] = useState(false)
  const [search, setSearch] = useState('')

  const [tagsOpen, setTagsOpen] = useState(false)
  const tagsRef = useCloseOnOutside<HTMLSpanElement>(tagsOpen, () => setTagsOpen(false))
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<TagMode>(storedMode)
  // Grouping and which groups are shut are both per-visit: you arrive at a flat, fully open grid.
  const [grouped, setGrouped] = useState(false)
  const [shut, setShut] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ character: Character; x: number; y: number } | null>(null)
  // A parsed card waiting on the tag review screen.
  const [pendingImport, setPendingImport] = useState<{ json: unknown; avatar: string; tags: string[] } | null>(null)

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
      // Tags on the card get a look before they join the tag list; everything else imports straight.
      const cardTags = importCard(json).tags
      if (cardTags.length) {
        setPendingImport({ json, avatar, tags: cardTags })
        return
      }
      navigate(`/chat/c/${await importCharacter(json, avatar)}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function finishImport(tags: string[]) {
    const pending = pendingImport
    setPendingImport(null)
    if (!pending) return
    try {
      navigate(`/chat/c/${await importCharacter(pending.json, pending.avatar, tags)}`)
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

  const tags = allTags(characters)
  const q = search.trim().toLowerCase()
  // Name search and tag filter both have to pass.
  const sorted = [...characters]
    .filter(
      (c) =>
        (!q || (displayName(c) || '').toLowerCase().includes(q)) && matchesTags(c, selected, mode),
    )
    .sort(
      (a, b) =>
        (summaries[b.id!]?.count ?? 0) - (summaries[a.id!]?.count ?? 0) ||
        (summaries[b.id!]?.latest ?? 0) - (summaries[a.id!]?.latest ?? 0) ||
        a.name.localeCompare(b.name),
    )

  function pickMode(next: TagMode) {
    setMode(next)
    localStorage.setItem(MODE_KEY, next)
  }

  function card(c: Character) {
    const summary = summaries[c.id!]
    return (
      <PickerCard
        key={c.id}
        character={c}
        meta={
          summary && summary.count > 0
            ? `${summary.count} chat${summary.count === 1 ? '' : 's'}` +
              (summary.latest ? ` · Last message: ${formatStamp(summary.latest)}` : '')
            : 'No chats yet'
        }
        blip={blips.includes(c.id!)}
        onOpen={() => navigate(`/chat/c/${c.id}`)}
        onMenu={(x, y) => setContextMenu({ character: c, x, y })}
      />
    )
  }

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

          {/* Both tag controls stay out of the way until a character actually has a tag. */}
          {tags.length > 0 && (
            <>
              <span className="importMenu" ref={tagsRef}>
                <button
                  type="button"
                  className={`importButton${selected.length ? ' active' : ''}`}
                  title="Filter tags"
                  onClick={() => setTagsOpen((o) => !o)}
                >
                  <RiFilter3Line size={16} />
                  <span className="btnLabel">
                    {selected.length
                      ? `${selected.length} tag${selected.length === 1 ? '' : 's'}`
                      : 'Filter tags'}
                  </span>
                </button>
                {tagsOpen && (
                  <div className="panel importMenuList tagFilterMenu">
                    <TagList
                      tags={tags}
                      checked={selected}
                      onToggle={(tag) =>
                        setSelected((s) => (s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]))
                      }
                      header={
                        <div className="tagFilterHead">
                          {/* Any vs All only means something with two tags picked. */}
                          {selected.length > 1 && (
                            <span className="tagModeSwitch">
                              <button
                                type="button"
                                className={mode === 'any' ? 'on' : ''}
                                onClick={() => pickMode('any')}
                              >
                                Any
                              </button>
                              <button
                                type="button"
                                className={mode === 'all' ? 'on' : ''}
                                onClick={() => pickMode('all')}
                              >
                                All
                              </button>
                            </span>
                          )}
                          {selected.length > 0 && (
                            <button type="button" onClick={() => setSelected([])}>
                              Clear
                            </button>
                          )}
                        </div>
                      }
                    />
                  </div>
                )}
              </span>

              <button
                type="button"
                className={grouped ? 'active' : ''}
                title="Sort by tag"
                aria-pressed={grouped}
                onClick={() => setGrouped((g) => !g)}
              >
                <RiStackLine size={16} />
                <span className="btnLabel">Sort by tag</span>
              </button>
            </>
          )}

          <span className="importMenu" ref={menuRef}>
            <button
              type="button"
              className="importButton"
              title="Import card"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <RiImportLine size={16} />
              <span className="btnLabel">Import card</span>
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
          <button type="button" title="New character" onClick={() => navigate('/chat/c/new')}>
            <RiAddLine size={16} />
            <span className="btnLabel">New character</span>
          </button>
          <button type="button" title="Tags" onClick={() => navigate('/chat/tags')}>
            <RiPriceTag3Line size={16} />
            <span className="btnLabel">Tags</span>
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

      {pendingImport && (
        <ImportTagsModal
          tags={pendingImport.tags}
          onConfirm={finishImport}
          onClose={() => finishImport([])}
        />
      )}

      {contextMenu && (
        <TagContextMenu
          character={contextMenu.character}
          tags={tags}
          at={contextMenu}
          onChange={async (next) => {
            const updated = { ...contextMenu.character, tags: next }
            setContextMenu({ ...contextMenu, character: updated })
            await save(updated)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {error && <p className="error">{error}</p>}
      {loading && characters.length === 0 && <p className="placeholder">Loading…</p>}
      {!loading && characters.length === 0 && (
        <p className="placeholder">No characters yet — import or create one first.</p>
      )}
      {characters.length > 0 && sorted.length === 0 && <p className="placeholder">No matches.</p>}

      {/* The grid is the scroller, so the header and search stay put. .appContent clips, so without
          this the cards below the fold were simply unreachable. */}
      {grouped ? (
        <div className="tagGroups screenBody">
          {groupByPrimaryTag(sorted, selected).map((group) => (
            <section key={group.tag} className="panel tagGroup">
              <header className="tagGroupHead">
                <CollapseButton
                  label={group.tag}
                  collapsed={shut.includes(group.tag)}
                  onToggle={() =>
                    setShut((s) =>
                      s.includes(group.tag) ? s.filter((t) => t !== group.tag) : [...s, group.tag],
                    )
                  }
                />
                <h3>{group.tag}</h3>
                <span className="tagGroupCount">({group.characters.length})</span>
              </header>
              {!shut.includes(group.tag) && (
                <div className="pickerGrid">{group.characters.map(card)}</div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="pickerGrid screenBody">{sorted.map(card)}</div>
      )}
    </div>
  )
}

/** One card. Split out so the flat grid and the grouped view share exactly one copy of it. */
function PickerCard({
  character,
  meta,
  blip,
  onOpen,
  onMenu,
}: {
  character: Character
  meta: string
  blip: boolean
  onOpen: () => void
  onMenu: (x: number, y: number) => void
}) {
  const longPress = useLongPress(onMenu)
  const avatar = <Avatar of={character} name={displayName(character) || '?'} />
  return (
    <button
      type="button"
      className="card pickerCard"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      {...longPress}
    >
      {blip ? (
        <span className="blipRing" title="New reply">
          {avatar}
        </span>
      ) : (
        avatar
      )}
      <span className="characterName">{displayName(character) || 'Unnamed'}</span>
      <span className="pickerMeta">{meta}</span>
    </button>
  )
}

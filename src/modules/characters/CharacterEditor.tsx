import { useEffect, useState, type ReactNode } from 'react'
import { newCharacter, useCharacters } from '../../core/stores/charactersStore'
import { useSettings } from '../../core/stores/settingsStore'
import { ColorInput } from '../../app/ColorInput'
import type { Character } from '../../core/storage/types'
import ParamEditor from './ParamEditor'
import AvatarCropDialog from './AvatarCropDialog'
import GalleryLightbox from './GalleryLightbox'
import { Avatar } from '../../app/Avatar'
import { RiDeleteBinLine, RiImageCircleLine, RiUploadLine } from '@remixicon/react'
import { exportCardJson, exportCardPng } from './exportCard'
import LorebookTab from './LorebookTab'
import TagChips from './TagChips'
import { useWorldInfo } from '../../core/stores/worldInfoStore'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'

const tabs = ['General', 'Description', 'Openings', 'Gallery', 'Lorebook', 'Details', 'Parameters'] as const
type Tab = (typeof tabs)[number] | string

/**
 * `characterId` null means a brand new character — it's written on the first autosave, and
 * `onCreated` hands back its new id. Edits autosave 1s after the last keystroke; there is no
 * Save button.
 */
export default function CharacterEditor({
  characterId,
  onCreated,
  extraTab,
}: {
  characterId: number | null
  onCreated?: (id: number) => void
  /** One caller-supplied tab, shown next to General. The chat page uses it to fold its chat
      list into the tab bar on narrow screens. */
  extraTab?: { label: string; content: ReactNode }
}) {
  const { characters, load, save } = useCharacters()
  const connection = useSettings((s) => s.connections.find((c) => c.id === s.activeConnectionId))
  const [draft, setDraft] = useState<Character | null>(
    characterId === null ? newCharacter() : null,
  )
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<Tab>('General')
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [galleryUrl, setGalleryUrl] = useState('')
  // Uncommitted text in the Avatar URL field; null means the field shows `draft.avatar`.
  const [urlDraft, setUrlDraft] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportError, setExportError] = useState('')
  const exportRef = useCloseOnOutside<HTMLSpanElement>(exportOpen, () => setExportOpen(false))
  // Which URLs failed to load. Keyed by URL, not index, so removing an entry doesn't shift the
  // broken marks onto its neighbours.
  const [brokenUrls, setBrokenUrls] = useState<string[]>([])

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  // Fills once, when the characters land. Switching character remounts this component
  // (the parent keys it on the id), so the draft never needs resetting in place.
  useEffect(() => {
    if (characterId === null || draft) return
    const found = characters.find((c) => c.id === characterId)
    if (found) setDraft({ ...found })
  }, [characterId, draft, characters])

  // The one write path: the debounce below and Ctrl+S both go through it. An unnamed character is
  // never written — otherwise opening the New form and typing nothing would leave a blank record.
  async function persist() {
    if (!draft || !draft.name.trim()) return
    const id = await save(draft)
    setSaved(true)
    if (draft.id === undefined) {
      setDraft({ ...draft, id })
      onCreated?.(id)
    }
  }

  // Debounced autosave, same 1s as the stack editor.
  useEffect(() => {
    if (saved || !draft || !draft.name.trim()) return
    const timer = setTimeout(persist, 1000)
    return () => clearTimeout(timer)
  }, [saved, draft, save, onCreated])

  if (!draft) return <p className="placeholder">Loading…</p>

  // Read at export time rather than held in state: nothing else on this tab needs them, and the
  // Lorebook tab keeps its own copy in the store.
  const bookEntries = () =>
    draft.id ? useWorldInfo.getState().fetchFor(draft.id) : Promise.resolve([])

  function change(next: Character) {
    setDraft(next)
    setSaved(false)
  }

  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    change({ ...draft!, [key]: value })

  // Load the picked file into the crop dialog. The ORIGINAL lands on `avatar` and the dialog's rect
  // on `avatarCrop` — one copy of the pixels, and the Gallery shows the whole image.
  function readAvatar(file: File) {
    const reader = new FileReader()
    reader.onload = () => setCropSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  // Swapping the avatar keeps the outgoing one: it moves into the gallery so an uploaded PNG isn't
  // lost when the avatar is pointed at a URL. The crop rect goes with the avatar, not the gallery.
  function setAvatar(url: string, crop?: Character['avatarCrop']) {
    const old = draft!.avatar
    const gallery =
      old && old !== url && !draft!.gallery.includes(old)
        ? [...draft!.gallery, old]
        : draft!.gallery
    change({ ...draft!, avatar: url, avatarCrop: crop, gallery })
  }

  // The URL field commits on blur/Enter rather than per keystroke — otherwise every character typed
  // would count as an avatar swap and drop a half-typed url into the gallery.
  function commitAvatarUrl() {
    if (urlDraft === null) return
    const url = urlDraft.trim()
    setUrlDraft(null)
    if (url !== draft!.avatar) setAvatar(url)
  }

  const variants = draft.altDescriptions
  const setVariants = (
    next: Character['altDescriptions'],
    activeIndex = draft!.activeDescriptionIndex,
  ) => change({ ...draft!, altDescriptions: next, activeDescriptionIndex: activeIndex })

  const greetings = draft.alternateGreetings

  const gallery = draft.gallery

  // The avatar shows in the gallery as a derived tile. "Set as avatar" can point `avatar` at a
  // url that's also a gallery entry, so drop that url from the gallery tiles — otherwise the same
  // url renders twice with the same key and React leaves stale duplicates until a remount.
  const galleryTiles = [
    ...(draft.avatar ? [{ url: draft.avatar, avatar: true }] : []),
    ...gallery.filter((url) => url !== draft.avatar).map((url) => ({ url, avatar: false })),
  ]

  // The extra tab sits right after General. It can come and go with the viewport, so a selection
  // that is no longer in the list falls back to General rather than showing an empty body.
  const tabList: Tab[] = extraTab
    ? ['General', extraTab.label, ...tabs.slice(1)]
    : [...tabs]
  const current = tabList.includes(tab) ? tab : 'General'

  function addGalleryImage() {
    const url = galleryUrl.trim()
    if (!url || gallery.includes(url)) return
    set('gallery', [...gallery, url])
    setGalleryUrl('')
  }

  return (
    <div className="characters characterEditor screenFrame">
      <div className="charactersHeader">
        <div className="editorTabs" role="tablist">
          {tabList.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={current === t}
              className={current === t ? 'editorTab current' : 'editorTab'}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="saveState">
          {draft.name.trim() ? (saved ? 'Saved' : 'Saving…') : 'Name required'}
        </span>
      </div>

      <div className="screenBody">
      {extraTab && current === extraTab.label && extraTab.content}
      {current === 'General' && (
        <>
          <label>
            Name
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </label>

          <label>
            Display name
            <input
              value={draft.displayName ?? ''}
              placeholder={draft.name}
              onChange={(e) => set('displayName', e.target.value)}
            />
          </label>
          <p className="hint">Shown in lists, the character page, and chats. Empty uses the name. {'{{char}}'} and requests always use the name.</p>

          <label>
            Avatar
            <span className="avatarRow">
              <Avatar of={draft} />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) readAvatar(file)
                  e.target.value = '' // let the same file re-open the dialog
                }}
              />
              {draft.avatar && (
                <>
                  {/* Cropping re-bakes the pixels, which only works on the uploaded base64 original —
                      a URL avatar has no local copy to crop. */}
                  {draft.avatar.startsWith('data:') && (
                    <button type="button" onClick={() => setCropSrc(draft.avatar)}>
                      Crop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                  >
                    Remove
                  </button>
                </>
              )}
              <span className="exportMenu" ref={exportRef}>
                <button type="button" onClick={() => setExportOpen(!exportOpen)}>
                  <RiUploadLine size={16} /> Export
                </button>
                {exportOpen && (
                  <span className="exportMenuList">
                    <button
                      type="button"
                      disabled={!draft.avatar}
                      onClick={async () => {
                        setExportOpen(false)
                        try {
                          await exportCardPng(draft, await bookEntries())
                        } catch (e) {
                          setExportError(e instanceof Error ? e.message : 'Export failed.')
                        }
                      }}
                    >
                      PNG card
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportOpen(false)
                        bookEntries().then((entries) => exportCardJson(draft, entries))
                      }}
                    >
                      JSON card
                    </button>
                  </span>
                )}
              </span>
            </span>
          </label>
          {exportError && <p className="hint">{exportError}</p>}
          <label>
            Avatar URL
            <input
              type="url"
              placeholder="https://"
              value={urlDraft ?? (draft.avatar.startsWith('data:') ? '' : draft.avatar)}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={commitAvatarUrl}
              onKeyDown={(e) => e.key === 'Enter' && commitAvatarUrl()}
            />
          </label>
          {draft.avatar && !draft.avatar.startsWith('data:') && (
            <p className="hint">
              This avatar loads from a URL. If the link breaks, the image is lost. Download it and
              upload it to keep a local copy.
            </p>
          )}

          <fieldset className="colorsGroup">
            <legend>Colors</legend>
            <p className="hint">Overrides the global colors for this character. Empty uses the global.</p>
            <label>
              Text
              <ColorInput
                value={draft.colors.textColor}
                onChange={(v) => set('colors', { ...draft.colors, textColor: v })}
              />
            </label>
            <label>
              Emphasis
              <ColorInput
                value={draft.colors.emphasisColor}
                onChange={(v) => set('colors', { ...draft.colors, emphasisColor: v })}
              />
            </label>
            <label>
              Bold
              <ColorInput
                value={draft.colors.boldColor}
                onChange={(v) => set('colors', { ...draft.colors, boldColor: v })}
              />
            </label>
            <label>
              Quote
              <ColorInput
                value={draft.colors.quoteColor}
                onChange={(v) => set('colors', { ...draft.colors, quoteColor: v })}
              />
            </label>
          </fieldset>
        </>
      )}

      {current === 'Description' && (
        <div className="altTab">
          <div className="variantRow defaultRow">
            <input
              type="radio"
              name="activeDescription"
              checked={draft.activeDescriptionIndex === -1}
              onChange={() => set('activeDescriptionIndex', -1)}
            />
            <div className="variantFields">
              <span>Default Description</span>
              <textarea
                rows={12}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          </div>

          <div className="variantList">
          {variants.map((v, i) => (
            <div key={i} className="variantRow">
              <input
                type="radio"
                name="activeDescription"
                checked={draft.activeDescriptionIndex === i}
                onChange={() => set('activeDescriptionIndex', i)}
              />
              <div className="variantFields">
                <input
                  value={v.title}
                  placeholder="Title"
                  onChange={(e) =>
                    setVariants(
                      variants.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
                <textarea
                  rows={6}
                  value={v.content}
                  onChange={(e) =>
                    setVariants(
                      variants.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const next = variants.filter((_, j) => j !== i)
                  // Removing the active one (or anything before it) must not shift the selection
                  // onto a different variant.
                  const active =
                    draft.activeDescriptionIndex === i
                      ? -1
                      : draft.activeDescriptionIndex > i
                        ? draft.activeDescriptionIndex - 1
                        : draft.activeDescriptionIndex
                  setVariants(next, active)
                }}
              >
                Delete
              </button>
            </div>
          ))}
          </div>

          <button
            type="button"
            onClick={() => setVariants([...variants, { title: '', content: '' }])}
          >
            Add variant
          </button>
        </div>
      )}

      {current === 'Openings' && (
        <div className="altTab">
          <label>
            First message
            <textarea
              rows={8}
              value={draft.firstMessage}
              onChange={(e) => set('firstMessage', e.target.value)}
            />
          </label>

          <fieldset className="variants grow">
            <legend>Alternate greetings</legend>
            <div className="variantList">
            {greetings.map((g, i) => (
              <div key={i} className="variantRow">
                <textarea
                  rows={4}
                  value={g}
                  onChange={(e) =>
                    set(
                      'alternateGreetings',
                      greetings.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    set(
                      'alternateGreetings',
                      greetings.filter((_, j) => j !== i),
                    )
                  }
                >
                  Delete
                </button>
              </div>
            ))}
            </div>
            <button type="button" onClick={() => set('alternateGreetings', [...greetings, ''])}>
              Add greeting
            </button>
          </fieldset>
        </div>
      )}

      {current === 'Gallery' && (
        <div className="galleryTab">
          <label>
            Image URL
            <span className="galleryAdd">
              <input
                type="url"
                value={galleryUrl}
                placeholder="https://"
                onChange={(e) => setGalleryUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addGalleryImage()
                  }
                }}
              />
              <button type="button" onClick={addGalleryImage}>
                Add
              </button>
            </span>
          </label>
          <p className="hint">Images are loaded from their URL. Nothing is stored to your device, but any link could break in the future. Image upload handling coming soon.</p>

          {galleryTiles.length === 0 ? (
            <p className="placeholder">No images.</p>
          ) : (
            <div className="galleryGrid screenBody">
              {galleryTiles.map(({ url, avatar }) => (
                <figure key={url}>
                  {brokenUrls.includes(url) ? (
                    <div className="galleryBroken">
                      <span>Image did not load</span>
                      {/* A data URL is the whole image; printing it would fill the tile. */}
                      {!url.startsWith('data:') && <span className="galleryBrokenUrl">{url}</span>}
                    </div>
                  ) : (
                    <img
                      src={url}
                      alt=""
                      onClick={() => setLightbox(url)}
                      onError={() =>
                        setBrokenUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
                      }
                    />
                  )}
                  {avatar ? (
                    <span className="galleryTileNote">Avatar</span>
                  ) : (
                    <span className="galleryTileActions">
                      {/* A gallery data URL carries its own bytes; a gallery URL becomes a URL avatar
                          (crop is dropped — it framed a different image). */}
                      <button
                        type="button"
                        onClick={() => setAvatar(url)}
                      >
                        <RiImageCircleLine size={14} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => set('gallery', gallery.filter((g) => g !== url))}
                      >
                        <RiDeleteBinLine size={14} />
                      </button>
                    </span>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      )}

      {current === 'Lorebook' && (
        <LorebookTab
          character={draft}
          onChangeBook={(patch) =>
            change({ ...draft, worldBook: { name: '', description: '', ...draft.worldBook, ...patch } })
          }
        />
      )}

      {current === 'Details' && (
        <>
          <label>
            Tags
            <TagChips tags={draft.tags ?? []} onChange={(tags) => set('tags', tags)} />
          </label>

          <label>
            Personality
            <textarea
              rows={4}
              value={draft.personality}
              onChange={(e) => set('personality', e.target.value)}
            />
          </label>

          <label>
            Scenario
            <textarea
              rows={4}
              value={draft.scenario}
              onChange={(e) => set('scenario', e.target.value)}
            />
          </label>

          <label>
            Example dialogue
            <textarea
              rows={8}
              value={draft.exampleDialogue}
              onChange={(e) => set('exampleDialogue', e.target.value)}
            />
          </label>
        </>
      )}

      {current === 'Parameters' &&
        (connection ? (
          <>
            <p className="hint">
              Used for every chat with this character. An empty field uses the connection's value.
            </p>
            <ParamEditor
              overrides={draft.paramOverrides ?? {}}
              connection={connection}
              onChange={(paramOverrides) => set('paramOverrides', paramOverrides)}
            />
          </>
        ) : (
          <p className="hint">Pick an active connection in Settings to set parameters.</p>
        ))}
      </div>

      {lightbox && <GalleryLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          initialCrop={cropSrc === draft.avatar ? draft.avatarCrop : undefined}
          onCancel={() => setCropSrc(null)}
          onConfirm={({ crop }) => {
            setAvatar(cropSrc, crop)
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}

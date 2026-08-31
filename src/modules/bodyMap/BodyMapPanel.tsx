import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { RiCloseLine, RiFlipHorizontal2Line } from '@remixicon/react'
import { useBodyMap } from './bodyMapStore'
import { useChats } from '../../core/stores/chatStore'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import type { BodyView, HostContext } from './types'
import { resolveTemplate } from './output'
import './bodyMap.css'

/**
 * The runtime body map, rendered in the chat's sidebar panel. Presets are authored once in the
 * Body map tab and picked here per chat; everything below the picker writes to that chat's tracker
 * row, so a second chat with the same preset keeps its own states, tag and toggle.
 *
 * Interaction runs off the SVG polygon overlay: each region is a focusable <polygon>, so click and
 * keyboard both resolve to a partId natively (no pixel math).
 */
export default function BodyMapPanel() {
  const map = useBodyMap((s) => s.map)
  const savedMaps = useBodyMap((s) => s.savedMaps)
  const tracker = useBodyMap((s) => s.tracker)
  const setMapRow = useBodyMap((s) => s.setMapRow)
  const addAction = useBodyMap((s) => s.addAction)
  const removeAction = useBodyMap((s) => s.removeAction)
  const updateAction = useBodyMap((s) => s.updateAction)
  const setEnabled = useBodyMap((s) => s.setEnabled)
  const setTag = useBodyMap((s) => s.setTag)
  const payload = useBodyMap((s) => s.payload)

  const chat = useChats((s) => s.chat)
  const character = useCharacters((s) => s.characters.find((c) => c.id === chat?.characterId))
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const persona = usePersonas((s) => s.personas.find((p) => p.id === activePersonaId))

  const [view, setView] = useState<BodyView>('front')
  const [menuPart, setMenuPart] = useState<string | null>(null)
  const [typePart, setTypePart] = useState<string | null>(null)
  // Which applied action the modal is editing, by its position in that part's list.
  const [editing, setEditing] = useState<{ partId: string; index: number } | null>(null)
  // Natural image size drives the SVG viewBox so polygon coords line up with the rendered figure.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  const ctx: HostContext = {
    user: persona?.name ?? 'User',
    char: character ? displayName(character) : 'Character',
  }

  // Own the load now that the chat view doesn't: the panel is the only surface that reads tracker
  // state for display. decorateMessage opens it independently at send time.
  useEffect(() => {
    if (chat?.id != null) useBodyMap.getState().open(chat.id)
  }, [chat?.id])

  const regions = useMemo(() => map.regions.filter((r) => r.view === view), [map, view])
  const nameFor = useMemo(() => new Map(map.regions.map((r) => [r.partId, r.name])), [map])

  async function apply(partId: string, state: string, template: string) {
    const part = nameFor.get(partId) ?? partId
    await addAction(partId, { state, resolvedDescription: resolveTemplate(template, part, ctx) })
    setMenuPart(null)
  }

  const activeParts = Object.entries(tracker.parts).filter(([, a]) => a.length > 0)
  // The exact string send() appends, same call, same store state.
  const block = payload(ctx)
  const editingAction = editing ? tracker.parts[editing.partId]?.[editing.index] : undefined

  return (
    <div className="bodyMapPanel">
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={tracker.enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Append to messages
      </label>

      <label className="bodyFootField">
        Preset
        <select
          value={tracker.mapRowId ?? ''}
          onChange={(e) => setMapRow(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Bundled figure</option>
          {savedMaps.map((s) => (
            <option key={s.rowId} value={s.rowId}>
              {s.map.name || 'Untitled'}
            </option>
          ))}
        </select>
      </label>

      <label className="bodyFootField">
        Tag
        <input
          value={tracker.tag}
          placeholder="No tag"
          onChange={(e) => setTag(e.target.value)}
        />
      </label>
      <p className="hint">Wraps the block as &lt;tag&gt;…&lt;/tag&gt;. Empty sends the lines bare.</p>

      <button
        type="button"
        onClick={() => {
          setView(view === 'front' ? 'back' : 'front')
          setMenuPart(null)
        }}
      >
        <RiFlipHorizontal2Line size={16} /> {view === 'front' ? 'Front' : 'Back'}
      </button>

      <div className="bodyFigure">
        <img
          src={map.images[view]}
          alt={`${map.name}, ${view}`}
          onLoad={(e) =>
            setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
        {dims && (
          <svg className="bodyOverlay" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none">
            {regions.map((r) => {
              const has = (tracker.parts[r.partId]?.length ?? 0) > 0
              return (
                <polygon
                  key={r.partId}
                  className={has ? 'region active' : 'region'}
                  points={(r.polygon ?? []).map((p) => p.join(',')).join(' ')}
                  tabIndex={0}
                  role="button"
                  aria-label={r.name}
                  onClick={() => setMenuPart(r.partId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setMenuPart(r.partId)
                    }
                  }}
                />
              )
            })}
          </svg>
        )}
      </div>

      {menuPart && (
        <div className="panel bodyMenu">
          <div className="bodyMenuTitle">{nameFor.get(menuPart)}</div>
          {map.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => apply(menuPart, a.state, a.descriptionTemplate)}
            >
              {a.state}
            </button>
          ))}
          <button type="button" className="bodyMenuType" onClick={() => setTypePart(menuPart)}>
            Type…
          </button>
        </div>
      )}

      <div className="bodyState">
        {activeParts.length === 0 && <p className="bodyEmpty">No parts set.</p>}
        {activeParts.map(([partId, actions]) => (
          <div key={partId} className="card bodyStatePart">
            <div className="bodyStatePartName">{nameFor.get(partId) ?? partId}</div>
            <ul>
              {actions.map((a, i) => (
                <li key={i}>
                  {/* The row is the edit control: clicking it reopens the same modal on this
                      action, prefilled. Remove sits outside the button so it never edits. */}
                  <button
                    type="button"
                    className="bodyStateEdit"
                    title="Edit"
                    onClick={() => setEditing({ partId, index: i })}
                  >
                    {a.state}
                  </button>
                  <button type="button" title="Remove" onClick={() => removeAction(partId, i)}>
                    <RiCloseLine size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bodyMapPreview">
        <div className="bodyMapPreviewLabel">Appended to your next message</div>
        {block ? <pre>{block}</pre> : <p className="bodyEmpty">Nothing to append.</p>}
      </div>

      {typePart && (
        <TypeModal
          part={nameFor.get(typePart) ?? typePart}
          onClose={() => setTypePart(null)}
          onSubmit={(state, description) => {
            apply(typePart, state, description)
            setTypePart(null)
          }}
        />
      )}

      {editing && editingAction && (
        <TypeModal
          part={nameFor.get(editing.partId) ?? editing.partId}
          state={editingAction.state}
          description={editingAction.resolvedDescription}
          onClose={() => setEditing(null)}
          onSubmit={(state, description) => {
            const part = nameFor.get(editing.partId) ?? editing.partId
            updateAction(editing.partId, editing.index, {
              ...editingAction,
              state,
              resolvedDescription: resolveTemplate(description, part, ctx),
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/** One-off action entry: a raw State label + Description sent to the LLM. The description is a
 *  template, {{user}}/{{char}}/{{part}} still resolve.
 *
 *  Portalled to document.body: the panel renders inside the sidebar's scroll container, and a
 *  full-viewport .dialogBackdrop nested in there covered the page without the dialog being
 *  reachable, every other modal in the app is a child of the page, not of the rail. */
function TypeModal({
  part,
  state: initialState = '',
  description: initialDescription = '',
  onClose,
  onSubmit,
}: {
  part: string
  /** Starting values. Set when editing an applied action; omitted when adding a new one. */
  state?: string
  description?: string
  onClose: () => void
  onSubmit: (state: string, description: string) => void
}) {
  const [state, setState] = useState(initialState)
  const [description, setDescription] = useState(initialDescription)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="dialogBackdrop bodyTypeBackdrop" onClick={onClose}>
      <div className="panel dialog bodyTypeDialog" onClick={(e) => e.stopPropagation()}>
        <h3>{part}</h3>
        <label>
          State
          <input value={state} onChange={(e) => setState(e.target.value)} autoFocus />
        </label>
        <label>
          Description (sent to LLM)
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="{{user}} does something to {{char}}’s {{part}}"
          />
        </label>
        <div className="dialogActions">
          <button
            type="button"
            disabled={!state.trim() || !description.trim()}
            onClick={() => onSubmit(state.trim(), description.trim())}
          >
            {initialState || initialDescription ? 'Save' : 'Add'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiAddLine, RiCloseLine, RiSettings3Line } from '@remixicon/react'
import { Avatar } from '../../app/Avatar'
import type { CastEntry } from '../../core/storage/types'
import { useWrite } from '../../core/stores/writeStore'
import { spanChapter, validSpan } from '../../core/stores/writeSpan'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import EntityPicker, { type PickerItem } from '../../app/EntityPicker'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import '../../app/sideDrawer.css'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import ChapterModal from './ChapterModal'

// Attach any character/persona; each attached entry has an on/off toggle. Only enabled cast is sent.
function CastSection() {
  const story = useWrite((s) => s.story)
  const setCast = useWrite((s) => s.setCast)
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const [picking, setPicking] = useState(false)
  if (!story) return null
  const cast = story.cast

  const isAttached = (kind: CastEntry['kind'], id: number) =>
    cast.some((e) => e.kind === kind && e.id === id)

  const attach = (kind: CastEntry['kind'], id: number) =>
    setCast([...cast, { kind, id, enabled: true }])
  const detach = (kind: CastEntry['kind'], id: number) =>
    setCast(cast.filter((e) => !(e.kind === kind && e.id === id)))
  const toggle = (kind: CastEntry['kind'], id: number) =>
    setCast(cast.map((e) => (e.kind === kind && e.id === id ? { ...e, enabled: !e.enabled } : e)))

  // Cast rows show the same avatar + name as the picker, so look both up in one pass.
  const lookOf = (entry: CastEntry) => {
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      return { name: c ? displayName(c) : '(deleted character)', source: c, page: c ? `/chat/c/${c.id}` : null }
    }
    const p = personas.find((x) => x.id === entry.id)
    return { name: p ? p.name : '(deleted persona)', source: p, page: p ? '/personas' : null }
  }

  // `key` carries the kind and id back out of the picker, which only knows about strings.
  const unattached: PickerItem[] = [
    ...characters
      .filter((c) => !isAttached('character', c.id!))
      .map((c) => ({ key: `character-${c.id}`, kind: 'character', label: displayName(c), avatar: c.avatar, avatarCrop: c.avatarCrop })),
    ...personas
      .filter((p) => !isAttached('persona', p.id!))
      .map((p) => ({ key: `persona-${p.id}`, kind: 'persona', label: p.name, avatar: p.avatar, avatarCrop: p.avatarCrop })),
  ]

  return (
    <div className="castSection">
      {cast.length === 0 && <p className="placeholder">No cast attached.</p>}
      <ul className="castList">
        {cast.map((entry) => {
          const look = lookOf(entry)
          return (
            <li key={`${entry.kind}-${entry.id}`}>
              <button
                type="button"
                className="castRow"
                aria-pressed={entry.enabled}
                onClick={() => toggle(entry.kind, entry.id)}
              >
                <Avatar of={look.source} name={look.name || '?'} />
                <span className="entityPickerName">{look.name}</span>
              </button>
              {look.page && (
                <Link to={look.page} className="castRowAction" title={`Open ${entry.kind}`}>
                  <RiSettings3Line size={14} />
                </Link>
              )}
              <button
                type="button"
                className="castRowAction"
                title="Remove from cast"
                onClick={() => detach(entry.kind, entry.id)}
              >
                <RiCloseLine size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      {unattached.length > 0 &&
        (picking ? (
          <EntityPicker
            items={unattached}
            placeholder="Search characters..."
            onCancel={() => setPicking(false)}
            onPick={(item) => {
              const [kind, id] = item.key.split('-')
              attach(kind as CastEntry['kind'], Number(id))
              setPicking(false)
            }}
          />
        ) : (
          <button type="button" className="castAddSlot" onClick={() => setPicking(true)}>
            Add Character +
          </button>
        ))}
    </div>
  )
}

// The bookmark strip: one row per Chapter, click to jump and activate. Everything else about a
// Chapter — its title, plan and order — is edited in the modal.
function ChapterSection() {
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const setActiveChapter = useWrite((s) => s.setActiveChapter)
  const updateChapter = useWrite((s) => s.updateChapter)
  const [editing, setEditing] = useState(false)

  // One action, not two: the row jumps the document and takes the cursor with it.
  function jump(id: number) {
    setActiveChapter(id)
    const el = document.querySelector<HTMLElement>(`.storyProse[data-chapter="${id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.focus()
  }

  return (
    <div className="chapterSection">
      <ul className="chapterNav">
        {chapters.map((chapter, i) => (
          <li key={chapter.id} className={chapter.id === activeChapterId ? 'active' : undefined}>
            <button type="button" className="chapterNavRow" onClick={() => jump(chapter.id!)}>
              <span className="chapterNavNum">{i + 1}</span>
              <span className="chapterNavTitle">{chapter.title || `Chapter ${i + 1}`}</span>
            </button>
            <label className="chapterNavSend" title="Include in the Chapter guide">
              <input
                type="checkbox"
                checked={chapter.sendEnabled}
                onChange={(e) => updateChapter(chapter.id!, { sendEnabled: e.target.checked })}
              />
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="chapterOpenModal" onClick={() => setEditing(true)}>
        Edit Chapters
      </button>
      {editing && <ChapterModal onClose={() => setEditing(false)} />}
    </div>
  )
}

// The Story's standing instruction. Debounced so a keystroke isn't a database write.
function AuthorNoteSection() {
  const story = useWrite((s) => s.story)
  const setAuthorNote = useWrite((s) => s.setAuthorNote)
  const [draft, setDraft] = useState(story?.authorNote ?? '')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setDraft(story?.authorNote ?? '')
  }, [story?.id, story?.authorNote])

  // Same flush-on-unmount rule as the editor: the pending keystrokes are still the Author's.
  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  function onChange(text: string) {
    setDraft(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      setAuthorNote(text)
    }, 500)
  }

  return (
    <textarea
      className="authorNoteBox"
      rows={4}
      value={draft}
      placeholder="A standing instruction for this Story."
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setAuthorNote(draft)}
    />
  )
}

// One sticky note. Held locally, written to the Story on blur — a note list write per keystroke is
// a database write for nothing.
function NoteEdit({ text, onSave, onDelete }: { text: string; onSave: (t: string) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(text)
  // Index keys mean a delete shifts text under a surviving note; resync the draft when it does.
  useEffect(() => setDraft(text), [text])
  return (
    <div className="scratchNote">
      <textarea
        rows={3}
        value={draft}
        placeholder="Note"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== text && onSave(draft)}
      />
      <button type="button" className="castRowAction" title="Delete note" onClick={onDelete}>
        <RiCloseLine size={14} />
      </button>
    </div>
  )
}

// A stack of loose notes kept with the Story, so info the Author wants around doesn't live in an
// external notepad. Per Story.
function ScratchpadSection() {
  const story = useWrite((s) => s.story)
  const setScratchpad = useWrite((s) => s.setScratchpad)
  if (!story) return null
  const notes = story.scratchpad ?? []

  return (
    <div className="scratchSection">
      {notes.length === 0 && <p className="placeholder">No notes yet.</p>}
      {notes.map((note, i) => (
        <NoteEdit
          key={i}
          text={note}
          onSave={(t) => setScratchpad(notes.map((n, j) => (j === i ? t : n)))}
          onDelete={() => setScratchpad(notes.filter((_, j) => j !== i))}
        />
      ))}
      <button type="button" className="noteAdd" onClick={() => setScratchpad([...notes, ''])}>
        <RiAddLine size={14} /> Add note
      </button>
    </div>
  )
}

/**
 * Right panel: Story-exclusive controls. The Direction box is pinned at the top; everything else is
 * an accordion section under it.
 *
 * On a wide screen it has two states: full, or collapsed to a rail, moved by the chevron.
 *
 * On a phone there is no rail — a rail of this panel carries no controls, so it would be width
 * spent on nothing. The panel is a drawer on the right edge instead (useSideDrawer): the chevron
 * closes it, the button at the top right opens it, a swipe drags it either way under the finger,
 * and Direct closes it so the prose is visible while the Co-Writer writes. Not persisted.
 */
export default function StorySidebar({ onDirect }: { onDirect: (direction: string) => void }) {
  const story = useWrite((s) => s.story)
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const streaming = useWrite((s) => s.streaming)
  const stop = useWrite((s) => s.stop)
  // Kept in the store so the draft survives moving around the app; cleared on send.
  const direction = useWrite((s) => (story?.id != null ? (s.directions[story.id] ?? '') : ''))
  const setDirection = useWrite((s) => s.setDirection)
  const retry = useWrite((s) => s.retry)
  const continueStory = useWrite((s) => s.continueStory)
  const undoGeneration = useWrite((s) => s.undoGeneration)
  // The same rule the store's actions use, so a button is live exactly when its action would act.
  const span = useWrite((s) => validSpan(spanChapter(s.chapters, s.activeChapterId)))
  // The collapsed rail is a wide-screen state only; on a phone the panel is a drawer.
  const narrow = useMediaQuery('(max-width: 700px)')
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('nessuTavern.storyPanelCollapsed') === '1',
  )
  // Phone only. Starts closed: the Story opens on the prose, not on the controls.
  const [open, setOpen] = useState(false)
  const drawer = useSideDrawer({ side: 'right', enabled: narrow, open, setOpen })

  function setCollapsedPersisted(next: boolean) {
    setCollapsed(next)
    localStorage.setItem('nessuTavern.storyPanelCollapsed', next ? '1' : '0')
  }

  const active = chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)
  const activeIndex = chapters.findIndex((c) => c.id === active?.id)
  const hasProse = (active?.text ?? '').trim() !== ''

  function direct() {
    const text = direction.trim()
    if (!text || story?.id == null) return
    setDirection(story.id, '')
    // The panel covers the screen on a phone, so sending would leave the Author staring at the
    // controls while the prose they asked for streams in behind them.
    if (narrow) setOpen(false)
    onDirect(text)
  }

  if (collapsed && !narrow)
    return (
      <CollapseRail
        label="Story panel"
        className="storyPanelRail"
        onToggle={() => setCollapsedPersisted(false)}
      />
    )

  return (
    <>
      {/* Opaque ground under the panel. The panel itself can be glass, and a translucent sheet
          over live prose is unreadable; this gives it something solid to sit on without taking
          the glass look away. Narrow screens only — elsewhere the panel is in flow. It fades
          rather than moving with the drawer: it is the whole screen either way. */}
      {narrow && (
        <div className={`storyPanelBackdrop${open || drawer.dragX !== null ? ' shown' : ''}`} />
      )}

      {narrow && !open && (
        <div className="drawerOpenButtons">
          <button
            type="button"
            className="drawerOpenButton"
            title="Open Story panel"
            aria-label="Open Story panel"
            onClick={() => setOpen(true)}
          >
            <RiSettings3Line size={20} />
          </button>
        </div>
      )}

    <aside className={`panel storySidebar ${drawer.className}`} style={drawer.style}>
      <header className="storySidebarHead">
        <h3>Story panel</h3>
        {/* Narrow: the chevron closes the panel outright and points the way it leaves. Wide: it
            shrinks to the rail. */}
        <CollapseButton
          label="Story panel"
          collapsed={narrow}
          onToggle={() => (narrow ? setOpen(false) : setCollapsedPersisted(true))}
        />
      </header>

      <div className="directionBox">
        <textarea
          value={direction}
          placeholder="What should the Co-Writer write next?"
          disabled={streaming}
          onChange={(e) => story?.id != null && setDirection(story.id, e.target.value)}
        />
        <div className="directionButtons">
          {streaming ? (
            <button type="button" className="directBtn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="directBtn" disabled={!direction.trim()} onClick={direct}>
              Direct
            </button>
          )}
          <button type="button" disabled={!span || streaming} onClick={() => retry()}>
            Retry
          </button>
          {/* The only one that doesn't need a span: with prose to carry on from, there is something
              to continue whether or not the last passage came from the Co-Writer. */}
          <button
            type="button"
            disabled={streaming || !hasProse}
            onClick={() => continueStory()}
          >
            Continue
          </button>
          <button type="button" disabled={!span || streaming} onClick={() => undoGeneration()}>
            Undo
          </button>
        </div>
        {active && (
          <p className="activeChapterName">
            Writing in Chapter {activeIndex + 1}
            {active.title.trim() ? ` — ${active.title.trim()}` : ''}
          </p>
        )}
      </div>

      <details className="panel accordionSection" open>
        <summary>Author's note</summary>
        <AuthorNoteSection />
      </details>

      <details className="panel accordionSection" open>
        <summary>Characters</summary>
        <CastSection />
      </details>

      <details className="panel accordionSection" open>
        <summary>Chapters</summary>
        <ChapterSection />
      </details>

      <details className="panel accordionSection">
        <summary>Scratchpad</summary>
        <ScratchpadSection />
      </details>

    </aside>
    </>
  )
}

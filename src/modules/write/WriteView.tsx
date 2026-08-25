import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { RiAddLine, RiBookLine, RiCloseLine, RiItalic } from '@remixicon/react'
import AvatarCropDialog from '../characters/AvatarCropDialog'
import { decorateProse, readProse, restoreCaret, saveCaret } from './proseMarkup'
import { useWrite } from '../../core/stores/writeStore'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import type { CastEntry, Chapter, Story } from '../../core/storage/types'
import StorySidebar from './StorySidebar'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import '../../app/sideDrawer.css'

// Landing screen: the grid of Story cover cards, plus the preview panel for the picked Story.
function Shelf() {
  const { stories, loading, load, create } = useWrite()
  const openStoryDirectly = useSettings((s) => s.openStoryDirectly)
  const setOpenStoryDirectly = useSettings((s) => s.setOpenStoryDirectly)
  const navigate = useNavigate()
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()
  }, [load])

  // A deleted Story leaves a preview pointing at nothing.
  useEffect(() => {
    if (previewId != null && !stories.some((s) => s.id === previewId)) setPreviewId(null)
  }, [stories, previewId])

  function onCoverClick(id: number) {
    if (openStoryDirectly) navigate(`/write/s/${id}`)
    else setPreviewId(id)
  }

  async function onCreate() {
    const title = prompt('Story title')?.trim()
    if (title == null) return
    const id = await create(title || 'Untitled Story')
    navigate(`/write/s/${id}`)
  }

  const shown = stories.filter((s) =>
    (s.title || 'Untitled Story').toLowerCase().includes(search.trim().toLowerCase()),
  )
  const preview = stories.find((s) => s.id === previewId) ?? null

  return (
    <div className="shelfLayout">
    <div className="shelf">
      <div className="shelfHeader">
        <h2>Write</h2>
        <div className="shelfHeaderRight">
          <label className="shelfToggle">
            <input
              type="checkbox"
              checked={openStoryDirectly}
              onChange={(e) => {
                setOpenStoryDirectly(e.target.checked)
                if (e.target.checked) setPreviewId(null)
              }}
            />
            Open Story Directly
          </label>
          <input
            className="storySearch"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={onCreate}>
            New Story
          </button>
        </div>
      </div>

      {loading && stories.length === 0 && <p className="placeholder">Loading…</p>}
      {!loading && stories.length === 0 && (
        <p className="placeholder">No Stories yet. Create one to start.</p>
      )}
      {!loading && stories.length > 0 && shown.length === 0 && (
        <p className="placeholder">No matches.</p>
      )}

      <ul className="shelfGrid">
        {shown.map((s) => (
          <li key={s.id} className={s.id === previewId ? 'storyCard selected' : 'storyCard'}>
            <button type="button" className="card storyCover" onClick={() => onCoverClick(s.id!)}>
              {s.cover ? (
                <img src={s.cover} alt="" />
              ) : (
                <span className="coverPlaceholder">
                  <RiBookLine size={40} />
                </span>
              )}
            </button>
            <span className="storyTitle">{s.title || 'Untitled Story'}</span>
          </li>
        ))}
      </ul>
    </div>

      {preview && <StoryPreview story={preview} onClose={() => setPreviewId(null)} />}
    </div>
  )
}

function stamp(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Shelf preview panel: a bigger cover and what the Story holds, with Continue to open the editor.
//
// On a phone it is a drawer on the right edge rather than a column beside the grid. Picking a
// cover is what opens it, so a swipe from closed is not eligible — there would be nothing in it.
// A swipe right, or the close button, sends it back out; the Story it was showing is dropped once
// it has finished leaving, so the slide out isn't cut short by the panel unmounting mid-move.
function StoryPreview({ story, onClose }: { story: Story; onClose: () => void }) {
  const wordCount = useWrite((s) => s.wordCount)
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const loadCharacters = useCharacters((s) => s.load)
  const loadPersonas = usePersonas((s) => s.load)
  const setCover = useWrite((s) => s.setCover)
  const rename = useWrite((s) => s.rename)
  const remove = useWrite((s) => s.remove)
  const duplicate = useWrite((s) => s.duplicate)
  const navigate = useNavigate()
  const [words, setWords] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  // null when not editing; the draft otherwise. Blur saves, an empty draft keeps the old title.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const phone = useMediaQuery('(max-width: 700px)')
  // Off a phone the panel is simply in the layout, so it counts as open and the drawer classes do
  // nothing. On a phone it mounts closed and slides in on the next frame.
  const [open, setOpen] = useState(!phone)
  const drawer = useSideDrawer({ side: 'right', enabled: phone, swipeOpen: false, open, setOpen })

  useEffect(() => {
    if (!phone) { setOpen(true); return }
    // A frame closed first: setting the class in the same paint as the mount gives the transition
    // nothing to move from.
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [phone, story.id])

  // Swiping it away leaves `open` false with the panel still mounted; drop the Story once the
  // slide out has had its 220ms (sideDrawer.css). Through a ref: onClose is written inline by the
  // shelf, and a new identity per render would keep restarting the timer.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (open || !phone) return
    const id = window.setTimeout(() => closeRef.current(), 220)
    return () => window.clearTimeout(id)
  }, [open, phone])

  // The shelf never opened a Story, so the cast stores may still be empty.
  useEffect(() => {
    loadCharacters()
    loadPersonas()
  }, [loadCharacters, loadPersonas])

  useEffect(() => {
    let live = true
    setWords(null)
    setTitleDraft(null)
    wordCount(story.id!).then((n) => {
      if (live) setWords(n)
    })
    return () => {
      live = false
    }
  }, [story.id, wordCount])

  const nameOf = (entry: CastEntry) => {
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      return c ? displayName(c) : '(deleted character)'
    }
    const p = personas.find((x) => x.id === entry.id)
    return p ? p.name : '(deleted persona)'
  }

  return (
    <>
    {/* Same opaque ground the Story panel gets: the shelf grid is still behind this. */}
    {phone && <div className={`storyPanelBackdrop${open ? ' shown' : ''}`} />}
    <aside className={`panel storyPreview ${drawer.className}`} style={drawer.style}>
      <button
        type="button"
        className="storyPreviewClose"
        title="Close"
        onClick={() => (phone ? setOpen(false) : onClose())}
      >
        <RiCloseLine size={16} />
      </button>

      <button
        type="button"
        className={story.cover ? 'storyPreviewCover' : 'storyPreviewCover empty'}
        title={story.cover ? 'Replace cover' : 'Add cover'}
        onClick={() => fileInput.current?.click()}
      >
        {story.cover ? (
          <img src={story.cover} alt="" />
        ) : (
          <span className="coverPlaceholder">
            <RiAddLine size={48} />
          </span>
        )}
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => setCropSrc(String(reader.result))
          reader.readAsDataURL(file)
        }}
      />

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          aspect={3 / 4}
          title="Crop cover"
          onCancel={() => setCropSrc(null)}
          onConfirm={({ dataUrl }) => {
            setCover(story.id!, dataUrl)
            setCropSrc(null)
          }}
        />
      )}

      <button
        type="button"
        className="storyPreviewContinue"
        onClick={() => navigate(`/write/s/${story.id}`)}
      >
        Continue
      </button>

      {titleDraft === null ? (
        <h3
          className="storyPreviewTitle"
          title="Rename Story"
          onClick={() => setTitleDraft(story.title)}
        >
          {story.title || 'Untitled Story'}
        </h3>
      ) : (
        <input
          className="titleEdit storyPreviewTitle"
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            rename(story.id!, titleDraft.trim() || story.title)
            setTitleDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTitleDraft(null)
          }}
        />
      )}

      <dl className="storyPreviewFacts">
        <dt>Words</dt>
        <dd>{words == null ? '…' : words.toLocaleString()}</dd>
        <dt>Characters</dt>
        <dd>
          {story.cast.length === 0 ? 'None' : story.cast.map(nameOf).join(', ')}
        </dd>
        <dt>Created</dt>
        <dd>{stamp(story.createdAt)}</dd>
        <dt>Last edit</dt>
        <dd>{stamp(story.updatedAt)}</dd>
      </dl>

      <div className="storyPreviewActions">
        <button type="button" onClick={() => duplicate(story.id!)}>
          Copy Story
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Delete ${story.title || 'this Story'}?`)) remove(story.id!)
          }}
        >
          Delete Story
        </button>
      </div>
    </aside>
    </>
  )
}

// One Chapter's region: a contenteditable holding that Chapter's raw prose. Uncontrolled — the DOM
// is the source of truth for typing; React only re-syncs it when the Chapter's rev changes (open,
// generation commit), so a keystroke never triggers a re-render that would move the caret.
//
// Inline markers (italics/bold/quotes) are decorated in place by proseMarkup, never by React. The
// markers stay in the DOM as their own spans and are only hidden with CSS, so reading the prose back
// out still yields exactly what the Author typed — the Chapter never loses an asterisk. Toggle
// Styling flips a class; it doesn't re-parse.
//
// Decoration runs on the same debounced tick as the save rather than per keystroke — rebuilding the
// DOM under a live caret is the fragile part, and doing it while typing has paused keeps the caret
// restore to one predictable moment.
//
// Backspace at the very start of a region is swallowed: Chapters merge only by deleting one in the
// Chapter modal, and the divider above is not content that could be backspaced away.
/** Streaming *into the Story that's open*. A generation left running while the Author opened
 *  another Story keeps going, but its tail belongs to the other document, not this one. */
const streamingHere = (s: { streaming: boolean; streamingStoryId: number | null; story: { id?: number } | null }) =>
  s.streaming && s.streamingStoryId === s.story?.id

function ChapterRegion({ chapter, index }: { chapter: Chapter; index: number }) {
  const id = chapter.id!
  const rev = useWrite((s) => s.revs[id] ?? 0)
  const isActive = useWrite((s) => s.activeChapterId === id)
  const streaming = useWrite(streamingHere)
  const streamingText = useWrite((s) => s.streamingText)
  const saveChapterText = useWrite((s) => s.saveChapterText)
  const setActiveChapter = useWrite((s) => s.setActiveChapter)
  const setCaret = useWrite((s) => s.setCaret)
  // Which marker color wins is baked into the DOM at decoration time, so a reorder has to rebuild
  // it. The colors themselves are CSS vars and repaint on their own.
  const colorOrder = usePalette().storyColorOrder
  // usePalette rebuilds the array when the palette changes, so the effect below keys off contents.
  const orderKey = colorOrder.join(',')
  const decoratedOrder = useRef(orderKey)
  const ref = useRef<HTMLDivElement>(null)
  const tail = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  // The text the DOM was last decorated against, so a pause that changed nothing doesn't rebuild
  // the editor (and jog the caret) for no reason.
  const decorated = useRef('')
  // Own undo/redo: decorateProse rebuilds the DOM, which throws away the browser's native undo
  // stack, so Ctrl-Z has nothing to restore. We snapshot each committed state instead.
  // ponytail: per-chapter, capped at 200 states; a Story-wide stack is the upgrade path.
  const history = useRef<{ text: string; caret: number }[]>([])
  const histIndex = useRef(-1)
  // The streaming tail belongs to the Chapter being generated into, not to whichever region the
  // Author has clicked into since.
  const takingStream = streaming && isActive

  // Re-sync the DOM only on out-of-band changes (open, commit) — not on every keystroke.
  useLayoutEffect(() => {
    if (ref.current && readProse(ref.current) !== chapter.text) {
      decorateProse(ref.current, chapter.text, colorOrder)
      decorated.current = chapter.text
    }
    // Open or an out-of-band commit reseeds history — undo doesn't cross those boundaries.
    history.current = [{ text: chapter.text, caret: 0 }]
    histIndex.current = 0
    // A commit or an Undo hands over where the caret should land; the rebuild above would otherwise
    // have left it at the start. Read straight off the store rather than subscribing: this is a
    // one-shot handover, not something the region should re-render for.
    const pending = useWrite.getState().pendingCaret
    if (ref.current && pending && pending.chapterId === id) {
      ref.current.focus()
      restoreCaret(ref.current, pending.offset)
      useWrite.setState({ pendingCaret: null })
    }
  }, [rev, id])

  // Track the caret so generation can land where the Author is. Not folded into the 800ms onInput
  // debounce: that one skips when the text is unchanged, and moving the caret changes no text.
  function trackCaret() {
    if (ref.current) setCaret(id, saveCaret(ref.current))
  }

  // A color reorder repaints prose that is already on screen, caret kept where the Author left it.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || decoratedOrder.current === orderKey) return
    decoratedOrder.current = orderKey
    const caret = saveCaret(el)
    decorateProse(el, readProse(el), orderKey.split(',') as MarkerKind[])
    if (caret !== null) restoreCaret(el, caret)
  }, [orderKey])

  // When the region goes away mid-debounce, flush rather than drop: the timer must not fire against
  // a detached node, but the keystrokes it was holding are still the Author's.
  useEffect(() => {
    const el = ref.current
    return () => {
      if (timer.current === undefined) return
      window.clearTimeout(timer.current)
      timer.current = undefined
      if (el) saveChapterText(id, readProse(el))
    }
  }, [saveChapterText, id])

  // The streaming tail isn't editable, so it can be decorated freely as it grows.
  useLayoutEffect(() => {
    if (tail.current) decorateProse(tail.current, streamingText, colorOrder)
  }, [streamingText, takingStream, orderKey])

  function onInput() {
    window.clearTimeout(timer.current)
    const el = ref.current
    if (!el) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      // Read at fire time, not when the timer was set — an IME commit or a paste can land between.
      const text = readProse(el)
      saveChapterText(id, text)
      if (text === decorated.current) return
      decorated.current = text
      const caret = saveCaret(el)
      decorateProse(el, text, colorOrder)
      if (caret !== null) restoreCaret(el, caret)
      // Drop any redo branch, then record this committed state.
      history.current = history.current.slice(0, histIndex.current + 1)
      history.current.push({ text, caret: caret ?? 0 })
      if (history.current.length > 200) history.current.shift()
      histIndex.current = history.current.length - 1
    }, 800)
  }

  function applyHistory(i: number) {
    const el = ref.current
    if (!el || i < 0 || i >= history.current.length) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    histIndex.current = i
    const { text, caret } = history.current[i]
    decorated.current = text
    decorateProse(el, text, colorOrder)
    restoreCaret(el, caret)
    saveChapterText(id, text)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
      e.preventDefault()
      const redo = e.key === 'y' || (e.key === 'z' && e.shiftKey)
      applyHistory(histIndex.current + (redo ? 1 : -1))
      return
    }
    if (e.key !== 'Backspace') return
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || !sel.isCollapsed || sel.rangeCount === 0) return
    // Nothing between the region's start and the caret means Backspace would reach for the boundary.
    const range = sel.getRangeAt(0).cloneRange()
    range.setStart(el, 0)
    if (range.toString().length === 0) e.preventDefault()
  }

  return (
    <div className="chapterRegion">
      {/* Not content: a real element between two regions, outside every editable surface, so no
          Chapter's stored text ever holds a marker to corrupt. */}
      {index > 0 && (
        <div className="chapterDivider" contentEditable={false}>
          <span>{chapter.title || `Chapter ${index + 1}`}</span>
        </div>
      )}
      <div
        ref={ref}
        className="storyProse"
        data-chapter={id}
        contentEditable={!takingStream}
        suppressContentEditableWarning
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onKeyUp={trackCaret}
        onMouseUp={trackCaret}
        onFocus={() => {
          setActiveChapter(id)
          trackCaret()
        }}
        data-placeholder={
          index === 0
            ? 'Start writing, or press Direct to have the Co-Writer open the Story.'
            : 'Empty Chapter.'
        }
      />
      {takingStream && (
        // The streaming region: locked (not editable) so only the tail is off-limits while the
        // Author edits other Chapters. Committed onto the prose when generation finishes.
        <div className="streamingTail" contentEditable={false}>
          {/* Filled by decorateProse, so the tail formats as it arrives. */}
          <span ref={tail} />
          <span className="caret">▌</span>
        </div>
      )}
    </div>
  )
}

// The document: one region per Chapter, stacked, dividers drawn between them. It reads as one
// continuous page — prose, a rule carrying the Chapter title, more prose.
function StoryDocument() {
  const chapters = useWrite((s) => s.chapters)
  const streaming = useWrite(streamingHere)
  const streamingText = useWrite((s) => s.streamingText)
  const styling = useWrite((s) => s.styling)
  const palette = usePalette()
  const stuck = useRef(true)

  // The scroller is .storyMain, which owns the whole editor column; track whether the Author is
  // parked at the bottom so following the stream never yanks them back down mid-read.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.storyMain')
    if (!el) return
    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Follow the generated tail as it grows.
  useEffect(() => {
    if (!streaming) return
    const el = document.querySelector<HTMLElement>('.storyMain')
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  }, [streaming, streamingText])

  const proseStyle = {
    fontFamily: effectiveFont(palette) || undefined,
    fontSize: `${palette.fontSize}px`,
    // A var rather than `lineHeight`: the prose rules set their own, which would win over an
    // inherited value.
    '--storyLineHeight': palette.lineHeight || '',
  } as React.CSSProperties

  return (
    // showMarkers is the off state of Toggle Styling: the marker spans stop being hidden and the
    // bold/italic rules stop applying, so the prose reads as the raw text it actually is.
    <div className={`chapterEditor${styling ? '' : ' showMarkers'}`} style={proseStyle}>
      {chapters.map((chapter, i) => (
        <ChapterRegion key={chapter.id} chapter={chapter} index={i} />
      ))}
    </div>
  )
}

function StoryEditor() {
  const { storyId } = useParams()
  const id = Number(storyId)
  const story = useWrite((s) => s.story)
  const openStory = useWrite((s) => s.openStory)
  const closeStory = useWrite((s) => s.closeStory)
  const saveChapterText = useWrite((s) => s.saveChapterText)
  const generate = useWrite((s) => s.generate)
  const error = useWrite((s) => s.error)
  const dismissError = useWrite((s) => s.dismissError)
  const styling = useWrite((s) => s.styling)
  const toggleStyling = useWrite((s) => s.toggleStyling)
  const rename = useWrite((s) => s.rename)
  const palette = usePalette()
  // null while showing the title; a string while editing it.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)

  useEffect(() => {
    openStory(id)
    return () => closeStory()
  }, [id, openStory, closeStory])

  // Flush every region's DOM text before generating: append starts from the latest prose, and the
  // Chapter guide reads each Chapter's state off text the Author may have typed seconds ago.
  async function onDirect(direction: string) {
    for (const el of document.querySelectorAll<HTMLElement>('.storyProse[data-chapter]')) {
      await saveChapterText(Number(el.dataset.chapter), readProse(el))
    }
    await generate(direction)
  }

  if (!story || story.id !== id) return <p className="placeholder">Loading…</p>

  return (
    // Visual settings arrive as CSS vars, same pattern as the chat's. An empty value falls through
    // to the var's fallback in write.css, so "unset" costs nothing.
    <div
      className="storyEditor"
      style={
        {
          // The Story's own width wins over the palette's default.
          '--storyWidth': `${story.storyWidth ?? palette.storyWidth}%`,
          '--storyTextColor': palette.storyTextColor || '',
          '--storyEmphasisColor': palette.storyEmphasisColor || '',
          '--storyBoldColor': palette.storyBoldColor || '',
          '--storyQuoteColor': palette.storyQuoteColor || '',
        } as React.CSSProperties
      }
    >
      <div className="storyMain">
        <div className="storyBar">
          {titleDraft === null ? (
            <h2 onClick={() => setTitleDraft(story.title)} title="Rename Story">
              {story.title || 'Untitled Story'}
            </h2>
          ) : (
            <input
              className="titleEdit"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                rename(id, titleDraft.trim() || 'Untitled Story')
                setTitleDraft(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setTitleDraft(null)
              }}
            />
          )}
          <button
            type="button"
            className={`stylingToggle${styling ? ' on' : ''}`}
            aria-pressed={styling}
            onClick={toggleStyling}
          >
            <RiItalic size={14} /> Toggle Styling
          </button>
        </div>
        <StoryDocument />
      </div>
      <StorySidebar onDirect={onDirect} />
      {error && (
        <div className="writeToast" role="alert">
          {error}
          <button type="button" onClick={dismissError} title="Dismiss">
            <RiCloseLine size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function WriteView() {
  return (
    <Routes>
      <Route index element={<Shelf />} />
      <Route path="s/:storyId" element={<StoryEditor />} />
      <Route path="*" element={<Navigate to="/write" replace />} />
    </Routes>
  )
}

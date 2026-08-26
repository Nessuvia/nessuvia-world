import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  RiAddLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiBookLine,
  RiCloseLine,
  RiItalic,
  RiListCheck3,
  RiMoreLine,
  RiSparkling2Line,
  RiStopCircleLine,
} from '@remixicon/react'
import AvatarCropDialog from '../characters/AvatarCropDialog'
import { decorateProse, readProse, restoreCaret, saveCaret } from './proseMarkup'
import { loremParagraphs } from './loremPreview'
import { newBlock, useWrite } from '../../core/stores/writeStore'
import { swipeCount, swipeIndex } from '../../core/stores/swipes'
import { isBeat } from '../../core/prompt/chapterGuide'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import type { Block, BlockContext, CastEntry, Chapter, Story } from '../../core/storage/types'
import StorySidebar from './StorySidebar'
import PlotLayout from './PlotLayout'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import { CollapseButton } from '../../app/CollapseButton'
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

/** Streaming *into the Story that's open*. A generation left running while the Author opened
 *  another Story keeps going, but its tail belongs to the other document, not this one. */
const streamingHere = (s: { streaming: boolean; streamingStoryId: number | null; story: { id?: number } | null }) =>
  s.streaming && s.streamingStoryId === s.story?.id

const contextLabels: Record<BlockContext, string> = {
  both: 'Prose before and after',
  before: 'Prose before only',
  after: 'Prose after only',
  none: 'No surrounding prose',
}

// The header above a beat Block: its plan line, and every control that acts on the Block. A free
// stretch gets none of this — see BlockRegion.
function BlockHead({
  block,
  chapterId,
  chapterIndex,
  beatIndex,
  onPatch,
  onRemove,
  preview,
  onPreview,
}: {
  block: Block
  chapterId: number
  chapterIndex: number
  beatIndex: number
  onPatch: (patch: Partial<Block>) => void
  onRemove: () => void
  preview: boolean
  onPreview: (on: boolean) => void
}) {
  const streaming = useWrite((s) => s.streaming)
  const streamingHere = useWrite((s) => s.streaming && s.streamingBlockId === block.id)
  const stop = useWrite((s) => s.stop)
  const writeBlock = useWrite((s) => s.writeBlock)
  const regenBlock = useWrite((s) => s.regenBlock)
  const swipeBlock = useWrite((s) => s.swipeBlock)
  const deleteSwipe = useWrite((s) => s.deleteSwipe)
  const [menu, setMenu] = useState(false)
  const menuRef = useCloseOnOutside<HTMLDivElement>(menu, () => setMenu(false))

  const total = swipeCount(block)
  const at = swipeIndex(block)
  const label = `Chapter ${chapterIndex + 1} - Beat ${beatIndex + 1}: ${block.beat.trim() || 'Empty beat'}`

  function regen() {
    setMenu(false)
    const instruction = prompt('What should change?')?.trim()
    if (instruction) regenBlock(chapterId, block.id, instruction)
  }

  return (
    <div className="blockHead" contentEditable={false}>
      <input
        type="checkbox"
        checked={block.done}
        title="Mark this beat done. Nothing ticks it for you."
        onChange={(e) => onPatch({ done: e.target.checked })}
      />
      {/* Wraps rather than truncating — the whole plan line is readable in place. */}
      <span className="blockLabel" title={label}>
        {label}
      </span>
      {block.targetWords > 0 && <span className="blockTarget">{block.targetWords}w</span>}

      {total > 1 && (
        <span className="blockSwipes">
          <button
            type="button"
            title="Previous version"
            disabled={at === 0 || streaming}
            onClick={() => swipeBlock(chapterId, block.id, at - 1)}
          >
            <RiArrowLeftSLine size={21} />
          </button>
          {at + 1}/{total}
          <button
            type="button"
            title="Next version"
            disabled={at === total - 1 || streaming}
            onClick={() => swipeBlock(chapterId, block.id, at + 1)}
          >
            <RiArrowRightSLine size={21} />
          </button>
        </span>
      )}

      {streamingHere ? (
        <button type="button" className="blockWrite" title="Stop writing. The text so far is kept." onClick={stop}>
          <RiStopCircleLine size={21} />
        </button>
      ) : (
        <button
          type="button"
          className="blockWrite"
          disabled={streaming}
          title={
            streaming
              ? 'Available when the Co-Writer stops writing.'
              : total > 1 || block.content.trim()
                ? 'Write this beat again as a new version.'
                : 'Write this beat.'
          }
          onClick={() => writeBlock(chapterId, block.id)}
        >
          <RiSparkling2Line size={21} />
        </button>
      )}

      <div className="blockMenu" ref={menuRef}>
        <button type="button" title="More" onClick={() => setMenu(!menu)}>
          <RiMoreLine size={21} />
        </button>
        {menu && (
          <div className="blockMenuPop panel">
            <button type="button" disabled={streaming} onClick={regen}>
              Regen with instructions
            </button>
            <label>
              Context
              <select
                value={block.context}
                title="How much of the surrounding prose this beat is written against."
                onChange={(e) => onPatch({ context: e.target.value as BlockContext })}
              >
                {(Object.keys(contextLabels) as BlockContext[]).map((k) => (
                  <option key={k} value={k}>
                    {contextLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="blockMenuPreview">
              Preview word count
              <input
                type="checkbox"
                checked={preview}
                disabled={block.targetWords <= 0}
                title={
                  block.targetWords > 0
                    ? 'Fill an empty beat with placeholder text as long as the target.'
                    : 'Set a target first.'
                }
                onChange={(e) => onPreview(e.target.checked)}
              />
            </label>
            <label className="blockMenuTarget">
              Target words
              <input
                type="number"
                min={0}
                step={50}
                value={block.targetWords || ''}
                placeholder="0"
                onChange={(e) =>
                  onPatch({ targetWords: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setMenu(false)
                onPatch({ beat: '' })
              }}
            >
              Convert to free prose
            </button>
            <button
              type="button"
              className="danger"
              disabled={streaming}
              onClick={() => {
                setMenu(false)
                deleteSwipe(chapterId, block.id)
              }}
            >
              Delete Swipe
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setMenu(false)
                onRemove()
              }}
            >
              Delete Beat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// One Block's region: a contenteditable holding that Block's raw prose. Uncontrolled — the DOM is
// the source of truth for typing; React only re-syncs it when the Block's rev changes (open,
// generation, swipe), so a keystroke never triggers a re-render that would move the caret.
//
// Inline markers (italics/bold/quotes) are decorated in place by proseMarkup, never by React. The
// markers stay in the DOM as their own spans and are only hidden with CSS, so reading the prose back
// out still yields exactly what the Author typed — the Block never loses an asterisk. Toggle
// Styling flips a class; it doesn't re-parse.
//
// Decoration runs on the same debounced tick as the save rather than per keystroke — rebuilding the
// DOM under a live caret is the fragile part, and doing it while typing has paused keeps the caret
// restore to one predictable moment.
//
// Backspace at the very start of a region is swallowed: Blocks merge only by deleting one, and the
// box edge above is not content that could be backspaced away.
function BlockRegion({
  block,
  chapterId,
  chapterIndex,
  beatIndex,
  first,
  onPatch,
  onRemove,
  onMakeBeat,
}: {
  block: Block
  chapterId: number
  chapterIndex: number
  beatIndex: number
  first: boolean
  onPatch: (patch: Partial<Block>) => void
  onRemove: () => void
  onMakeBeat: () => void
}) {
  const id = block.id
  const rev = useWrite((s) => s.revs[id] ?? 0)
  const streamingText = useWrite((s) => s.streamingText)
  const takingStream = useWrite((s) => streamingHere(s) && s.streamingBlockId === id)
  const saveBlockText = useWrite((s) => s.saveBlockText)
  const setActiveBlock = useWrite((s) => s.setActiveBlock)
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
  // ponytail: per-Block, capped at 200 states; a Story-wide stack is the upgrade path.
  const history = useRef<{ text: string; caret: number }[]>([])
  const histIndex = useRef(-1)
  const beat = isBeat(block)
  // Preview Word Count: per-beat and deliberately not persisted — it's a ruler you hold up while
  // setting a target, not a property of the beat. ponytail: a Block field is the upgrade path if
  // Authors want it to survive a reload.
  const [preview, setPreview] = useState(false)
  const empty = !block.content.trim()
  // Reshuffles whenever the target changes, which is what makes typing a new number redraw at the
  // new length. Nothing else in this component re-renders per keystroke, so the text sits still
  // while the Author writes.
  const previewText = useMemo(
    () => (preview && empty ? loremParagraphs(block.targetWords) : ''),
    [preview, empty, block.targetWords],
  )

  // Re-sync the DOM only on out-of-band changes (open, generation, swipe) — not on every keystroke.
  useLayoutEffect(() => {
    if (ref.current && readProse(ref.current) !== block.content) {
      decorateProse(ref.current, block.content, colorOrder)
      decorated.current = block.content
    }
    // Open or an out-of-band commit reseeds history — undo doesn't cross those boundaries.
    history.current = [{ text: block.content, caret: 0 }]
    histIndex.current = 0
    // A commit or a swipe hands over where the caret should land; the rebuild above would otherwise
    // have left it at the start. Read straight off the store rather than subscribing: this is a
    // one-shot handover, not something the region should re-render for.
    const pending = useWrite.getState().pendingCaret
    if (ref.current && pending && pending.blockId === id) {
      ref.current.focus()
      restoreCaret(ref.current, pending.offset)
      useWrite.setState({ pendingCaret: null })
    }
  }, [rev, id])

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
      if (el) saveBlockText(chapterId, id, readProse(el))
    }
  }, [saveBlockText, chapterId, id])

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
      saveBlockText(chapterId, id, text)
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
    saveBlockText(chapterId, id, text)
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
    <div className={`${beat ? 'blockRegion beat' : 'blockRegion free'}${previewText ? ' previewing' : ''}`}>
      {beat ? (
        <BlockHead
          block={block}
          chapterId={chapterId}
          chapterIndex={chapterIndex}
          beatIndex={beatIndex}
          onPatch={onPatch}
          onRemove={onRemove}
          preview={preview}
          onPreview={setPreview}
        />
      ) : (
        // A free stretch has to look like nothing, or a Chapter of unplanned writing reads as a
        // stack of empty forms. These show on hover only (write.css).
        <div className="freeTools" contentEditable={false}>
          <button type="button" title="Make this a beat" onClick={onMakeBeat}>
            <RiListCheck3 size={21} />
          </button>
          <button type="button" title="Delete this stretch" onClick={onRemove}>
            <RiCloseLine size={21} />
          </button>
        </div>
      )}
      <div
        ref={ref}
        className="storyProse"
        data-block={id}
        contentEditable={!takingStream}
        suppressContentEditableWarning
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onFocus={() => setActiveBlock(chapterId, id)}
        data-placeholder={
          previewText
            ? ''
            : beat
            ? 'Write this beat, or press the spark to have the Co-Writer do it.'
            : first
              ? 'Start writing, or press Direct to have the Co-Writer open the Story.'
              : 'Empty.'
        }
      />
      {previewText && (
        // Its own element rather than the region's placeholder: `:empty` stops matching the moment
        // the browser drops a <br> into a contenteditable, which is too fragile to hang a feature
        // on. The region collapses to nothing while this shows (write.css), so the placeholder
        // prose starts exactly where real prose would.
        <div className="blockPreview" contentEditable={false}>
          {previewText}
        </div>
      )}
      {takingStream && (
        // The streaming region: locked (not editable) so only the tail is off-limits while the
        // Author edits other Blocks. Committed onto the Block when generation finishes.
        <div className="streamingTail" contentEditable={false}>
          {/* Filled by decorateProse, so the tail formats as it arrives. */}
          <span ref={tail} />
          <span className="caret">▌</span>
        </div>
      )}
    </div>
  )
}

// The thin strip between two Blocks. Hidden until hovered (write.css) — it sits in the middle of a
// document being read.
function BlockGap({ onAdd }: { onAdd: (beat: boolean) => void }) {
  return (
    <div className="blockGap" contentEditable={false}>
      <button type="button" title="Add a beat here" onClick={() => onAdd(true)}>
        <RiAddLine size={18} /> Beat
      </button>
      <button type="button" title="Add free prose here" onClick={() => onAdd(false)}>
        <RiAddLine size={18} /> Prose
      </button>
    </div>
  )
}

// One Chapter: its divider, then its Blocks in order. The Chapter itself holds no prose — a Block
// does — so this is a mapper plus the structural edits that act on the `blocks` array.
function ChapterRegion({ chapter, index }: { chapter: Chapter; index: number }) {
  const id = chapter.id!
  const updateChapter = useWrite((s) => s.updateChapter)
  const blocks = chapter.blocks

  const setBlocks = (next: Block[]) =>
    // Never empty: a Chapter with nothing in it has nowhere to type.
    updateChapter(id, { blocks: next.length ? next : [newBlock()] })

  const patch = (blockId: string, p: Partial<Block>) =>
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, ...p } : b)))

  function remove(block: Block) {
    if (!confirm('Delete this beat and the prose in it?')) return
    setBlocks(blocks.filter((b) => b.id !== block.id))
  }

  function addAfter(blockId: string | null, beat: boolean) {
    const at = blockId === null ? -1 : blocks.findIndex((b) => b.id === blockId)
    const next = [...blocks]
    // ' ' rather than '': a beat with an empty line is a free stretch, and this is a beat.
    next.splice(at + 1, 0, newBlock(beat ? ' ' : ''))
    setBlocks(next)
  }

  // Beat numbering counts beats, not Blocks, so a free stretch between two beats doesn't renumber
  // them.
  let beatIndex = -1

  return (
    <div className="chapterRegion">
      {/* Not content: a real element between two regions, outside every editable surface, so no
          Block's stored text ever holds a marker to corrupt. */}
      {index > 0 && (
        <div className="chapterDivider" contentEditable={false}>
          <span>{chapter.title || `Chapter ${index + 1}`}</span>
        </div>
      )}
      <BlockGap onAdd={(beat) => addAfter(null, beat)} />
      {blocks.map((block, i) => {
        if (isBeat(block)) beatIndex += 1
        return (
          <Fragment key={block.id}>
            <BlockRegion
              block={block}
              chapterId={id}
              chapterIndex={index}
              beatIndex={beatIndex}
              first={index === 0 && i === 0}
              onPatch={(p) => patch(block.id, p)}
              onRemove={() => remove(block)}
              onMakeBeat={() => patch(block.id, { beat: ' ' })}
            />
            <BlockGap onAdd={(beat) => addAfter(block.id, beat)} />
          </Fragment>
        )
      })}
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

// The Chapter rail above the prose: where in the Story the cursor is, and a way to jump. Compact —
// no beats; the plan is the Plot Layout tab's job. One slot, one job.
//
// The collapsed state is global rather than per Story: whether the rail shows is a working
// preference, not a property of a Story. Per Story would be the upgrade path.
function ProgressRail() {
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const setActiveChapter = useWrite((s) => s.setActiveChapter)
  const collapsed = useSettings((s) => s.railCollapsed)
  const setRailCollapsed = useSettings((s) => s.setRailCollapsed)

  if (chapters.length === 0) return null
  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId)
  const shown = activeIndex === -1 ? chapters.length : activeIndex + 1

  // One action, not two: the block jumps the document and takes the cursor with it. The Chapter
  // holds no prose itself, so it lands in the Chapter's first Block.
  function jump(id: number) {
    setActiveChapter(id)
    const first = chapters.find((c) => c.id === id)?.blocks[0]
    if (!first) return
    const el = document.querySelector<HTMLElement>(`.storyProse[data-block="${first.id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.focus()
  }

  return (
    <div className={`progressRail${collapsed ? ' shut' : ''}`}>
      <span className="progressRailCount">
        Ch {shown} of {chapters.length}
      </span>
      {!collapsed && (
        <ul className="progressRailBlocks">
          {chapters.map((chapter, i) => (
            <li key={chapter.id}>
              <button
                type="button"
                className={chapter.id === activeChapterId ? 'progressBlock current' : 'progressBlock'}
                title={chapter.title.trim() || `Chapter ${i + 1}`}
                onClick={() => jump(chapter.id!)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ul>
      )}
      <CollapseButton
        label="Chapter rail"
        collapsed={collapsed}
        onToggle={() => setRailCollapsed(!collapsed)}
      />
    </div>
  )
}

type StoryTab = 'Story' | 'Plot Layout'

function StoryEditor() {
  const { storyId } = useParams()
  const id = Number(storyId)
  const story = useWrite((s) => s.story)
  const openStory = useWrite((s) => s.openStory)
  const closeStory = useWrite((s) => s.closeStory)
  const error = useWrite((s) => s.error)
  const dismissError = useWrite((s) => s.dismissError)
  const styling = useWrite((s) => s.styling)
  const toggleStyling = useWrite((s) => s.toggleStyling)
  const rename = useWrite((s) => s.rename)
  const writeBlock = useWrite((s) => s.writeBlock)
  const streaming = useWrite((s) => s.streaming)
  const palette = usePalette()
  // null while showing the title; a string while editing it.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // Local, not the hash: reopening a Story always lands on Story.
  const [tab, setTab] = useState<StoryTab>('Story')

  useEffect(() => {
    openStory(id)
    return () => closeStory()
  }, [id, openStory, closeStory])

  // Escape cancels wherever you are — the Stop buttons only exist next to the beat and in the
  // sidebar, and generation can be started from a tab that shows neither.
  useEffect(() => {
    if (!streaming) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWrite.getState().stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [streaming])

  // The tab moves first, so the Block's region is mounted before the stream starts and the caret
  // handover lands in a live DOM.
  function onWriteBeat(chapterId: number, blockId: string) {
    setTab('Story')
    requestAnimationFrame(() => writeBlock(chapterId, blockId))
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
          {/* In-page tabs, not module `tabs`: those deep-link the shelf, and the sidebar swaps to
              the Story settings panel when a Story is open. */}
          <div className="storyTabs" role="tablist">
            {(['Story', 'Plot Layout'] as StoryTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'storyTab current' : 'storyTab'}
                // Plot Layout hides the Story panel, and Stop lives there.
                disabled={t === 'Plot Layout' && streaming}
                title={
                  t === 'Plot Layout' && streaming
                    ? 'Available when the Co-Writer stops writing.'
                    : undefined
                }
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Story' && (
            <button
              type="button"
              className={`stylingToggle${styling ? ' on' : ''}`}
              aria-pressed={styling}
              onClick={toggleStyling}
            >
              <RiItalic size={21} /> Toggle Styling
            </button>
          )}
        </div>
        {tab === 'Story' ? (
          <>
            <ProgressRail />
            <StoryDocument />
          </>
        ) : (
          <PlotLayout onWriteBeat={onWriteBeat} />
        )}
      </div>
      {tab === 'Story' && <StorySidebar />}
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

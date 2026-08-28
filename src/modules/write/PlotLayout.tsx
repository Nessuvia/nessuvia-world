import { useEffect, useRef, useState } from 'react'
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowLeftSLine,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileTextLine,
  RiListCheck,
} from '@remixicon/react'
import type { Block, Chapter, GuideSend } from '../../core/storage/types'
import { newBlock, useWrite } from '../../core/stores/writeStore'
import { beatBlocks, chapterProse, chapterState, hasProse } from '../../core/prompt/chapterGuide'
import { beatText, emptyBeat, storedBeat, withBeats } from './beatSlots'
import { parseBulkBeats, type BulkBeat } from './bulkBeats'
import { OutlineDialog } from './OutlineDialog'
import { useDragReorder } from '../../app/useDragReorder'
import { useMediaQuery } from '../../app/useMediaQuery'
import { edgeState, type EdgeState } from './tabScroll'
import './plotLayout.css'

/** Words in a blob of prose. A display number — it does not have to agree with any other counter
 *  in the app, and nothing budgets against it. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/** A Chapter's word target: the sum of its beats'. Free stretches have no target. */
const targetWords = (chapter: Chapter): number =>
  beatBlocks(chapter).reduce((n, b) => n + (b.targetWords || 0), 0)

const sendLabels: Record<GuideSend, string> = {
  both: 'Summary and beats',
  beats: 'Beats only',
  summary: 'Summary only',
  off: 'Nothing',
}

// A cap (Premise or Ending) holds its own draft and writes to the Story when typing pauses, the
// same 500ms the Author's note uses — a keystroke is not a database write.
function Cap({
  label,
  hint,
  value,
  onSave,
}: {
  label: string
  hint: string
  value: string
  onSave: (text: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => setDraft(value), [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <div className="plotCap" title={hint}>
      <span className="plotCapLabel">{label}</span>
      <textarea
        rows={4}
        value={draft}
        placeholder={hint}
        onChange={(e) => {
          setDraft(e.target.value)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => onSave(e.target.value), 500)
        }}
        onBlur={() => onSave(draft)}
      />
    </div>
  )
}

// Paste a whole plan in at once. Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css.
// The parse runs on every keystroke: the count and the first line of each beat are the confirmation
// that the paste was read the way the Author meant it, and waiting for a click to say so is worse.
function BulkAddBeats({ onAdd, onClose }: { onAdd: (beats: BulkBeat[]) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const { beats, error } = parseBulkBeats(text)
  // An empty box is not a mistake the Author has made yet, so it says nothing.
  const shown = text.trim() ? error : ''

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="dialog bulkBeats" onClick={(e) => e.stopPropagation()}>
        <h3>Bulk add beats</h3>
        <p className="hint">
          One beat per pair: the text, then the word count. The count is optional.
        </p>
        <code className="bulkBeatsFormat">{'{"the text of the beat",200},{"second beat text"}'}</code>
        <textarea
          rows={8}
          value={text}
          autoFocus
          placeholder={'{"the text of the beat",200},{"second beat text",250}'}
          onChange={(e) => setText(e.target.value)}
        />
        {shown ? (
          <p className="error">{shown}</p>
        ) : (
          <p className="hint">
            {beats.length} beat{beats.length === 1 ? '' : 's'}
            {beats.length > 0 ? ', added to the end of the Chapter.' : ''}
          </p>
        )}
        <ul className="bulkBeatsPreview">
          {beats.map((b, i) => (
            <li key={i}>
              <span>{b.beat.trim() || 'Empty beat'}</span>
              <span className="bulkBeatsWords">{b.targetWords > 0 ? `${b.targetWords} words` : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="dialogActions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!!shown || beats.length === 0} onClick={() => onAdd(beats)}>
            Add {beats.length || ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// One beat's text field. It holds its own draft and writes on a pause, like Cap: `updateChapter`
// awaits the Dexie write before it sets state, so a controlled value fed straight from the store
// lands a render late and React puts the caret back at the end of the line.
function BeatText({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)

  // Only take an outside change when it isn't what we already have — a reorder or an undo, not the
  // echo of our own save coming back.
  useEffect(() => {
    if (value !== draft) setDraft(value)
  }, [value]) // draft left out on purpose: it changes on every keystroke.
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <textarea
      className="plotBeatText"
      rows={1}
      value={draft}
      placeholder="What happens in this beat"
      title="What is meant to happen in this beat. Sent to the model as part of the plan."
      onChange={(e) => {
        setDraft(e.target.value)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => onSave(e.target.value), 400)
      }}
      onBlur={() => {
        window.clearTimeout(timer.current)
        onSave(draft)
      }}
      // Enter would otherwise insert a newline this field then strips.
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
    />
  )
}

// One block on the chain: what the Chapter is planned to do, at a glance. Select-only — clicking it
// opens it in the editor and nothing else. Beats are truncated to a row each; the summary is a
// recap and would crowd out the plan, so it stays in the editor.
function PlotBlock({
  chapter,
  index,
  activeId,
  selected,
  onSelect,
}: {
  chapter: Chapter
  index: number
  activeId: number | null
  selected: boolean
  onSelect: () => void
}) {
  const state = chapterState(chapter, activeId)
  const target = targetWords(chapter)
  const beats = beatBlocks(chapter)
  const classes = ['plotBlock', state, selected ? 'selected' : '', chapter.guideSend === 'off' ? 'muted' : '']
  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      aria-pressed={selected}
      title={
        chapter.guideSend === 'off'
          ? 'This Chapter sends nothing to the model. Open it to change that.'
          : `Sends: ${sendLabels[chapter.guideSend].toLowerCase()}. Click to open it below.`
      }
      onClick={onSelect}
    >
      <span className="plotBlockNum">Chapter {index + 1}</span>
      <span className="plotBlockTitle">{chapter.title || 'Untitled'}</span>
      <ul className="plotBlockBeats">
        {beats.length === 0 && <li className="plotBlockEmpty">No beats</li>}
        {beats.map((beat) => (
          <li key={beat.id} className={beat.done ? 'done' : undefined}>
            {beat.beat.trim() || 'Empty beat'}
          </li>
        ))}
      </ul>
      <span className="plotBlockWords">
        {countWords(chapterProse(chapter))} / {target} words
      </span>
    </button>
  )
}

// The chapter editor: everything structural about one Chapter, full width under the chain (or
// inline under its block on a phone). One implementation either way.
function ChapterEditor({
  chapter,
  index,
  count,
  onWriteBeat,
  onJumpToStory,
  focusBeatId,
  onSelect,
}: {
  chapter: Chapter
  index: number
  count: number
  onWriteBeat: (chapterId: number, beatId: string) => void
  onJumpToStory: (beatId: string) => void
  focusBeatId: string | null
  onSelect: (id: number) => void
}) {
  const id = chapter.id!
  const updateChapter = useWrite((s) => s.updateChapter)
  const removeChapter = useWrite((s) => s.removeChapter)
  const moveChapter = useWrite((s) => s.moveChapter)
  const addChapter = useWrite((s) => s.addChapter)
  const streaming = useWrite((s) => s.streaming)
  const [bulkOpen, setBulkOpen] = useState(false)

  const beats = beatBlocks(chapter)
  const setBeats = (next: Block[]) => updateChapter(id, { blocks: withBeats(chapter, next) })
  const patchBeat = (beatId: string, patch: Partial<Block>) =>
    setBeats(beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)))

  const drag = useDragReorder((from, to) => {
    const next = [...beats]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setBeats(next)
  })

  const target = targetWords(chapter)

  // Arriving from the Story tab's jump button: bring the row into view once, on mount.
  useEffect(() => {
    if (!focusBeatId) return
    document
      .querySelector(`.plotBeatList li[data-beat="${focusBeatId}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [focusBeatId])

  function onDelete() {
    const name = chapter.title || `Chapter ${index + 1}`
    if (hasProse(chapter) && !confirm(`Delete ${name} and its prose?`)) return
    removeChapter(id)
  }

  // Appended, then walked back to sit directly after this one. `addChapter` only ever appends, and
  // `moveChapter` is the one path that keeps `order` and the array agreeing.
  async function addAfter() {
    await addChapter()
    const rows = useWrite.getState().chapters
    const added = rows.at(-1)
    if (!added?.id) return
    for (let pos = rows.length - 1; pos > index + 1; pos--) await moveChapter(added.id, -1)
    onSelect(added.id)
  }

  return (
    <section className="panel plotEditor">
      <header className="plotEditorHead">
        <h3>
          Chapter {index + 1}
          {chapter.title.trim() ? ` — ${chapter.title.trim()}` : ''}
        </h3>
        <button type="button" title="Move up" disabled={index === 0} onClick={() => moveChapter(id, -1)}>
          <RiArrowUpLine size={21} />
        </button>
        <button
          type="button"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => moveChapter(id, 1)}
        >
          <RiArrowDownLine size={21} />
        </button>
        <button
          type="button"
          className="danger"
          title={count <= 1 ? 'A Story keeps one Chapter' : 'Delete this Chapter and its prose'}
          disabled={count <= 1}
          onClick={onDelete}
        >
          <RiDeleteBinLine size={21} />
        </button>
      </header>

      <label className="plotField">
        Title
        <input value={chapter.title} onChange={(e) => updateChapter(id, { title: e.target.value })} />
      </label>

      <label className="plotField">
        Summary
        <textarea
          rows={3}
          value={chapter.summary}
          placeholder="What happened in this Chapter."
          onChange={(e) => updateChapter(id, { summary: e.target.value })}
        />
      </label>
      <p className="hint">
        Summary — what happened in this chapter. Sent in place of the beats when the guide runs short
        of room.
      </p>

      <div className="plotBeatsHead">
        <span>Beats</span>
        <span className="plotBeatsWords">
          {countWords(chapterProse(chapter))} / {target} words
        </span>
      </div>

      <ul className="plotBeatList">
        {beats.map((beat, bi) => (
          <li
            key={beat.id}
            data-beat={beat.id}
            className={drag.over === bi ? 'over' : undefined}
            {...drag.itemProps(bi)}
          >
            <div className="plotBeatMain">
              <input
                type="checkbox"
                checked={beat.done}
                title="Mark this beat done. Nothing ticks it for you."
                onChange={(e) => patchBeat(beat.id, { done: e.target.checked })}
              />
              <BeatText
                value={beatText(beat.beat)}
                onSave={(text) => patchBeat(beat.id, { beat: storedBeat(text) })}
              />
            </div>
            <div className="plotBeatTools">
              <input
                className="plotBeatTarget"
                type="number"
                min={0}
                step={50}
                value={beat.targetWords || ''}
                placeholder="0"
                title="Words this beat should run to. 0 leaves it unset."
                onChange={(e) => patchBeat(beat.id, { targetWords: Math.max(0, Number(e.target.value) || 0) })}
              />
              <button
                type="button"
                className="plotBeatWrite"
                disabled={streaming || !beat.beat.trim()}
                title={
                  streaming
                    ? 'Available when the Co-Writer stops writing.'
                    : 'Write this beat into the Story.'
                }
                onClick={() => onWriteBeat(id, beat.id)}
              >
                Write
              </button>
              <button
                type="button"
                className="plotBeatJump"
                disabled={streaming}
                title={
                  streaming
                    ? 'Available when the Co-Writer stops writing.'
                    : 'Jump to Story: open the Story tab at this beat.'
                }
                onClick={() => onJumpToStory(beat.id)}
              >
                <RiFileTextLine size={18} /> Jump to Story
              </button>
              <button
                type="button"
                title="Remove this beat and the prose in it"
                onClick={() => {
                  // The beat owns its prose now, so removing it removes writing. Ask when there is any.
                  if (beat.content.trim() && !confirm('Delete this beat and the prose in it?')) return
                  setBeats(beats.filter((b) => b.id !== beat.id))
                }}
              >
                <RiCloseLine size={21} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="plotBeatAddRow">
        <button type="button" className="plotBeatAdd" onClick={() => setBeats([...beats, newBlock(emptyBeat)])}>
          <RiAddLine size={21} /> Add beat
        </button>
        <button type="button" className="plotBeatAdd" onClick={() => setBulkOpen(true)}>
          <RiListCheck size={21} /> Bulk add
        </button>
      </div>

      {bulkOpen && (
        <BulkAddBeats
          onClose={() => setBulkOpen(false)}
          onAdd={(added) => {
            setBeats([
              ...beats,
              ...added.map((b) => ({ ...newBlock(b.beat), targetWords: b.targetWords })),
            ])
            setBulkOpen(false)
          }}
        />
      )}

      <label className="plotField plotSend" title="What this Chapter contributes to the Chapter guide.">
        Send to the model
        <select
          value={chapter.guideSend}
          onChange={(e) => updateChapter(id, { guideSend: e.target.value as GuideSend })}
        >
          <option value="both">{sendLabels.both}</option>
          <option value="beats">{sendLabels.beats}</option>
          <option value="summary">{sendLabels.summary}</option>
          <option value="off">{sendLabels.off}</option>
        </select>
      </label>

      <button type="button" className="plotAddChapter" onClick={addAfter}>
        <RiAddLine size={21} /> Add chapter after
      </button>
    </section>
  )
}

/**
 * The Plot Layout tab: the Premise, the chain of Chapters, the Ending, and the editor for whichever
 * Chapter is selected.
 *
 * Selection is local to this tab and is not persisted. Clicking a block must not move where the
 * next Direct writes — the Story tab's caret owns that. The one thing here that sets the active
 * Chapter is the beat Write button, which is an explicit "write here".
 */
export default function PlotLayout({
  onWriteBeat,
  onJumpToStory,
  focusBeat,
}: {
  onWriteBeat: (chapterId: number, beatId: string) => void
  onJumpToStory: (beatId: string) => void
  /** Set by the Story tab's jump button. This tab remounts on every tab switch, so it is only read
   *  for the initial selection. */
  focusBeat: { chapterId: number; beatId: string } | null
}) {
  const story = useWrite((s) => s.story)
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const setPremise = useWrite((s) => s.setPremise)
  const setEnding = useWrite((s) => s.setEnding)
  const setCapsCollapsed = useWrite((s) => s.setCapsCollapsed)
  const streaming = useWrite((s) => s.streaming)
  const phone = useMediaQuery('(max-width: 700px)')
  const [outlineOpen, setOutlineOpen] = useState(false)

  const [selectedId, setSelectedId] = useState<number | null>(
    () => focusBeat?.chapterId ?? activeChapterId ?? chapters[0]?.id ?? null,
  )

  // The strip scrolls sideways. Same two problems the character editor's tab bar has — .appShell
  // stops the browser panning it, and the navbar swipe would grab the gesture — and the same two
  // answers: data-noSwipe, and driving scrollLeft from the touch deltas.
  const stripRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<EdgeState>({ atStart: true, atEnd: true, scrollable: false })

  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const sync = () => setEdges(edgeState(el.scrollLeft, el.scrollWidth, el.clientWidth))
    sync()

    let x0 = 0
    let left0 = 0
    let live = false
    const start = (e: TouchEvent) => {
      live = e.touches.length === 1
      if (!live) return
      x0 = e.touches[0].clientX
      left0 = el.scrollLeft
    }
    const move = (e: TouchEvent) => {
      if (live) el.scrollLeft = left0 - (e.touches[0].clientX - x0)
    }
    const end = () => {
      live = false
    }

    el.addEventListener('scroll', sync, { passive: true })
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      ro.disconnect()
    }
    // On a phone the chain is a vertical stack, so the horizontal scroller isn't in play.
  }, [phone, chapters.length])

  if (!story) return null

  // A deleted Chapter leaves the selection pointing at nothing.
  const selected = chapters.find((c) => c.id === selectedId) ?? chapters[0] ?? null
  const selectedIndex = chapters.findIndex((c) => c.id === selected?.id)
  const collapsed = story.capsCollapsed === true

  const editorFor = (chapter: Chapter, index: number) => (
    <ChapterEditor
      chapter={chapter}
      index={index}
      count={chapters.length}
      onWriteBeat={onWriteBeat}
      onJumpToStory={onJumpToStory}
      focusBeatId={focusBeat && focusBeat.chapterId === chapter.id ? focusBeat.beatId : null}
      onSelect={setSelectedId}
    />
  )

  const capsToggle = (
    <button
      type="button"
      className="plotCapsToggle"
      onClick={() => setCapsCollapsed(!collapsed)}
      title={collapsed ? 'Show the Premise and Ending' : 'Shrink the Premise and Ending to markers'}
    >
      {collapsed ? 'Show Premise and Ending' : 'Hide Premise and Ending'}
    </button>
  )

  const premise = collapsed ? (
    <span className="plotCapMarker" title="Premise">
      Premise
    </span>
  ) : (
    <Cap
      label="Premise"
      hint="The opening situation."
      value={story.premise ?? ''}
      onSave={setPremise}
    />
  )

  const ending = collapsed ? (
    <span className="plotCapMarker" title="Ending">
      Ending
    </span>
  ) : (
    <Cap
      label="Ending"
      hint="The ending this Story is heading for."
      value={story.ending ?? ''}
      onSave={setEnding}
    />
  )

  const arrow = (key: string) => (
    <span className="plotArrow" key={key} aria-hidden>
      <RiArrowRightLine size={16} />
    </span>
  )

  return (
    <div className="plotLayout">
      <p className="hint">Plot Layout — chapters and beats sent to the model as the plan.</p>

      {phone ? (
        <div className="plotStack">
          {premise}
          {arrow('afterPremise')}
          {chapters.map((chapter, i) => (
            <div className="plotStackItem" key={chapter.id}>
              <PlotBlock
                chapter={chapter}
                index={i}
                activeId={activeChapterId}
                selected={chapter.id === selected?.id}
                onSelect={() => setSelectedId(chapter.id!)}
              />
              {chapter.id === selected?.id && editorFor(chapter, i)}
              {arrow(`after-${chapter.id}`)}
            </div>
          ))}
          {ending}
        </div>
      ) : (
        <div className="plotStripWrap">
          <div className="plotStrip" ref={stripRef} data-noSwipe>
            {premise}
            {arrow('afterPremise')}
            {chapters.map((chapter, i) => (
              <div className="plotStripItem" key={chapter.id}>
                <PlotBlock
                  chapter={chapter}
                  index={i}
                  activeId={activeChapterId}
                  selected={chapter.id === selected?.id}
                  onSelect={() => setSelectedId(chapter.id!)}
                />
                {arrow(`after-${chapter.id}`)}
              </div>
            ))}
            {ending}
          </div>
          {/* Decoration over a scroller the user drags; the carets aren't buttons. */}
          {edges.scrollable && !edges.atStart && <RiArrowLeftSLine className="tabsCaret start" size={20} />}
          {edges.scrollable && !edges.atEnd && <RiArrowRightSLine className="tabsCaret end" size={20} />}
        </div>
      )}

      <div className="plotCapsRow">
        {capsToggle}
        <button type="button" className="plotOutline" disabled={streaming} onClick={() => setOutlineOpen(true)}>
          <RiListCheck size={16} />
          Generate outline
        </button>
        {!collapsed && <p className="hint">Premise and Ending are not sent to the model yet.</p>}
      </div>

      {outlineOpen && <OutlineDialog onClose={() => setOutlineOpen(false)} />}

      {!phone && selected && editorFor(selected, selectedIndex)}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useWrite } from '../../core/stores/writeStore'
import { proseRange, proseSpots, readProse } from './proseMarkup'

// Find and Replace reads the editor's DOM rather than the stored Chapter: the editor is
// uncontrolled and saves on an 800ms debounce, so the store's copy lags whatever is on screen.
// Every read here goes through readProse/proseSpots, the same walk the editor saves with.
//
// It works on the active Chapter's region, not the whole document. The regions are separate
// contenteditables holding separate rows, so a document-wide replace would be several writes with
// no shared undo — narrower is the honest scope. ponytail: whole-Story replace is the upgrade path.
function proseEl(chapterId: number | null): HTMLElement | null {
  if (chapterId == null) return null
  return document.querySelector<HTMLElement>(`.storyProse[data-chapter="${chapterId}"]`)
}

/** Offsets of every occurrence of `find` in `text`. Literal, case-sensitive — what the Author
 *  typed is what gets matched, which is what a document search has to do with prose markers in it. */
function matchOffsets(text: string, find: string): number[] {
  if (!find) return []
  const out: number[] = []
  let at = text.indexOf(find)
  while (at !== -1) {
    out.push(at)
    at = text.indexOf(find, at + find.length)
  }
  return out
}

// The CSS Custom Highlight API, which lib.dom doesn't type in every TS version. Absent in browsers
// that don't support it, hence the guard: highlighting is decoration, replacing still works.
interface HighlightApi {
  highlights?: {
    set(name: string, highlight: object): void
    delete(name: string): void
  }
}
const highlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => object }).Highlight
const highlights = (CSS as unknown as HighlightApi).highlights

function paintHighlights(find: string, chapterId: number | null) {
  if (!highlightCtor || !highlights) return
  highlights.delete('proseFind')
  const el = proseEl(chapterId)
  if (!el || !find) return
  const { text, spots } = proseSpots(el)
  const ranges: Range[] = []
  for (const at of matchOffsets(text, find)) {
    const range = proseRange(spots, at, at + find.length)
    if (range) ranges.push(range)
  }
  if (ranges.length) highlights.set('proseFind', new highlightCtor(...ranges))
}

/** Find and Replace over the active Chapter's prose, in the Story's rail panel. */
export default function FindReplace() {
  const chapterId = useWrite((s) => s.activeChapterId)
  const chapterRev = useWrite((s) => (chapterId == null ? 0 : (s.revs[chapterId] ?? 0)))
  const setChapterText = useWrite((s) => s.setChapterText)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [prose, setProse] = useState('')

  // Track the editor's live text: on open/generate (chapterRev) and on every keystroke, so the
  // match count and the buttons describe what is actually on screen.
  useEffect(() => {
    const el = proseEl(chapterId)
    if (!el) return
    const sync = () => setProse(readProse(el))
    sync()
    el.addEventListener('input', sync)
    return () => el.removeEventListener('input', sync)
  }, [chapterRev, chapterId])

  useEffect(() => {
    paintHighlights(find, chapterId)
  }, [find, prose, chapterRev, chapterId])

  // Leaving the panel (or the Story) shouldn't leave the prose lit up.
  useEffect(() => () => highlights?.delete('proseFind'), [])

  const count = matchOffsets(prose, find).length

  async function apply(all: boolean) {
    const el = proseEl(chapterId)
    if (!el || chapterId == null) return
    // Read again at click time: the debounce may not have fired since the last keystroke.
    const text = readProse(el)
    const at = text.indexOf(find)
    if (at === -1) return
    const next = all
      ? text.split(find).join(replace)
      : text.slice(0, at) + replace + text.slice(at + find.length)
    await setChapterText(chapterId, next)
    setProse(next)
  }

  return (
    <div className="findReplace">
      <input value={find} placeholder="Find" onChange={(e) => setFind(e.target.value)} />
      <input value={replace} placeholder="Replace" onChange={(e) => setReplace(e.target.value)} />
      <div className="findReplaceButtons">
        <button type="button" disabled={count === 0} onClick={() => apply(false)}>
          Replace
        </button>
        <button type="button" disabled={count === 0} onClick={() => apply(true)}>
          Replace All
        </button>
      </div>
      {find && count === 0 && <p className="findReplaceNote">No matches found</p>}
    </div>
  )
}

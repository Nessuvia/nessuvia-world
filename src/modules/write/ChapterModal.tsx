import { useState } from 'react'
import { RiAddLine, RiArrowDownLine, RiArrowUpLine, RiCloseLine, RiDeleteBinLine } from '@remixicon/react'
import { useWrite } from '../../core/stores/writeStore'
import { hasProse } from '../../core/prompt/chapterGuide'

/**
 * The Chapter modal: the only thing in the app that creates a Chapter. Add, rename, write the
 * summary and beats, reorder, delete.
 *
 * A Chapter's summary does two jobs from one field — recap once the Chapter has prose, intent
 * before it does — so the Author writes one thing and the Chapter guide decides how to label it.
 */
export default function ChapterModal({ onClose }: { onClose: () => void }) {
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const addChapter = useWrite((s) => s.addChapter)
  const updateChapter = useWrite((s) => s.updateChapter)
  const removeChapter = useWrite((s) => s.removeChapter)
  const moveChapter = useWrite((s) => s.moveChapter)
  const [openId, setOpenId] = useState<number | null>(activeChapterId)

  function onDelete(id: number, title: string) {
    const chapter = chapters.find((c) => c.id === id)
    // Confirm only where there is prose to lose; deleting a planned Chapter is immediate.
    if (chapter && hasProse(chapter) && !confirm(`Delete ${title} and its prose?`)) return
    removeChapter(id)
  }

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="dialog chapterDialog" onClick={(e) => e.stopPropagation()}>
        <div className="chapterDialogHead">
          <h3>Chapters</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        <ul className="chapterEditList">
          {chapters.map((chapter, i) => {
            const id = chapter.id!
            const open = openId === id
            return (
              <li key={id} className={`panel ${open ? 'chapterEdit open' : 'chapterEdit'}`}>
                <div className="chapterEditRow">
                  <input
                    className="chapterTitleInput"
                    value={chapter.title}
                    onChange={(e) => updateChapter(id, { title: e.target.value })}
                    onFocus={() => setOpenId(id)}
                  />
                  <button
                    type="button"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => moveChapter(id, -1)}
                  >
                    <RiArrowUpLine size={14} />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    disabled={i === chapters.length - 1}
                    onClick={() => moveChapter(id, 1)}
                  >
                    <RiArrowDownLine size={14} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title={chapters.length <= 1 ? 'A Story keeps one Chapter' : 'Delete Chapter'}
                    disabled={chapters.length <= 1}
                    onClick={() => onDelete(id, chapter.title || `Chapter ${i + 1}`)}
                  >
                    <RiDeleteBinLine size={14} />
                  </button>
                </div>

                <button type="button" className="chapterEditToggle" onClick={() => setOpenId(open ? null : id)}>
                  {open ? 'Hide plan' : 'Edit plan'}
                </button>

                {open && (
                  <div className="chapterPlan">
                    <label>
                      Summary
                      <textarea
                        rows={3}
                        value={chapter.summary}
                        placeholder="What happens in this Chapter."
                        onChange={(e) => updateChapter(id, { summary: e.target.value })}
                      />
                    </label>

                    <span className="chapterPlanLabel">Beats</span>
                    <ul className="beatList">
                      {chapter.beats.map((beat, bi) => (
                        <li key={bi}>
                          <input
                            value={beat}
                            onChange={(e) =>
                              updateChapter(id, {
                                beats: chapter.beats.map((b, x) => (x === bi ? e.target.value : b)),
                              })
                            }
                          />
                          <button
                            type="button"
                            title="Remove beat"
                            onClick={() =>
                              updateChapter(id, { beats: chapter.beats.filter((_, x) => x !== bi) })
                            }
                          >
                            <RiCloseLine size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="beatAdd"
                      onClick={() => updateChapter(id, { beats: [...chapter.beats, ''] })}
                    >
                      Add beat
                    </button>

                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={chapter.sendEnabled}
                        onChange={(e) => updateChapter(id, { sendEnabled: e.target.checked })}
                      />
                      Include in the Chapter guide
                    </label>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <button type="button" className="chapterAdd" onClick={() => addChapter()}>
          <RiAddLine size={14} /> Add Chapter
        </button>
      </div>
    </div>
  )
}

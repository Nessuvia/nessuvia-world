import { useState } from 'react'
import { useWrite } from '../../core/stores/writeStore'
import './plotLayout.css'

/** The words-per-chapter slider's top end. Past this the number stops meaning a chapter. */
const maxWords = 8000

// Ask the model for a whole plan. Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css,
// like BulkAddBeats. The dialog stays open on a failure so the fields that produced it are still
// there to change.
export function OutlineDialog({ onClose }: { onClose: () => void }) {
  const story = useWrite((s) => s.story)
  const generateOutline = useWrite((s) => s.generateOutline)
  const setPremise = useWrite((s) => s.setPremise)

  const [premise, setPremiseDraft] = useState(story?.premise ?? '')
  const [chapters, setChapters] = useState(5)
  const [beats, setBeats] = useState(4)
  const [words, setWords] = useState(1200)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      // The Author typed the premise here, so it becomes the Story's, this is the same field the
      // Plot Layout's Premise cap edits, not a copy that lives only in the dialog.
      if (premise !== (story?.premise ?? '')) await setPremise(premise)
      await generateOutline({
        premise,
        chapters,
        beatsPerChapter: beats,
        wordsPerChapter: words,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="dialogBackdrop" onClick={busy ? undefined : onClose}>
      <div className="dialog outlineDialog" onClick={(e) => e.stopPropagation()}>
        <h3>Generate outline</h3>

        <label className="outlineField">
          <span>Premise</span>
          <textarea
            rows={5}
            value={premise}
            autoFocus
            placeholder="What the story is about."
            onChange={(e) => setPremiseDraft(e.target.value)}
          />
        </label>

        <div className="outlineNumbers">
          <label className="outlineField">
            <span>Chapters</span>
            <input
              type="number"
              min={1}
              max={60}
              value={chapters}
              onChange={(e) => setChapters(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="outlineField">
            <span>Beats per chapter</span>
            <input
              type="number"
              min={0}
              max={40}
              value={beats}
              onChange={(e) => setBeats(Math.max(0, Math.min(40, Number(e.target.value) || 0)))}
            />
            <span className="hint">0 lets the model choose.</span>
          </label>
        </div>

        <label className="outlineField">
          <span>
            Words per chapter, {words > 0 ? words : 'not set'}
          </span>
          <input
            type="range"
            min={0}
            max={maxWords}
            step={100}
            value={words}
            onChange={(e) => setWords(Number(e.target.value))}
          />
          <span className="hint">Split evenly across each chapter&rsquo;s beats.</span>
        </label>

        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="hint">Replaces every chapter in this story, and the prose in them.</p>
        )}

        <div className="dialogActions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy || !premise.trim()} onClick={run}>
            {busy ? 'Generating…' : 'Generate outline'}
          </button>
        </div>
      </div>
    </div>
  )
}

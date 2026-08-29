import { useState } from 'react'
import type { Message } from '../../core/storage/types'

const snippetLimit = 80

/** Delete a run of messages by position, 1-based, inclusive. */
export default function DeleteRangeDialog({
  messages,
  onClose,
  onConfirm,
}: {
  messages: Message[]
  onClose: () => void
  onConfirm: (ids: number[]) => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const start = Number(from)
  const end = Number(to)
  const valid =
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 1 &&
    end >= start &&
    end <= messages.length
  const selected = valid ? messages.slice(start - 1, end) : []
  // Preview only the ends of the run, a 1–50 range shouldn't render 50 rows. Confirm still
  // deletes the whole slice.
  const preview =
    selected.length > 2
      ? [
          { m: selected[0], pos: start },
          { m: selected[selected.length - 1], pos: end },
        ]
      : selected.map((m, i) => ({ m, pos: start + i }))

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Delete messages</h3>

        <div className="rangeInputs">
          <label>
            From
            <input
              type="number"
              min={1}
              max={messages.length}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="number"
              min={1}
              max={messages.length}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <span className="rangeCount">Messages 1–{messages.length} in this chat.</span>
        </div>

        {from && to && !valid && <p className="placeholder">Enter a range within 1–{messages.length}.</p>}

        {selected.length > 0 && (
          <ul className="rangeList">
            {preview.map(({ m, pos }, i) => (
              <li key={m.id}>
                {i === 1 && selected.length > 2 && <p className="placeholder">… {selected.length - 2} more …</p>}
                <strong>
                  {pos}. {m.speakerName ?? m.personaName ?? m.role}
                </strong>
                <p className="greetingPreview">
                  {m.content.slice(0, snippetLimit)}
                  {m.content.length > snippetLimit ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="dialogActions">
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected.map((m) => m.id!))}
          >
            Confirm
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

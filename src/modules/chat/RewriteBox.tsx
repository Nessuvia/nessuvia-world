import { useState } from 'react'

/**
 * The regen instruction. Enter sends; Shift+Enter is a newline, same as everywhere else.
 * Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css.
 */
export default function RewriteBox({
  initial,
  onSubmit,
  onCancel,
}: {
  /** Prefilled text, the old-message default. Editing it changes only what gets sent this time;
   *  it isn't saved anywhere. */
  initial: string
  onSubmit: (instruction: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)

  return (
    <div className="dialogBackdrop" onClick={onCancel}>
      <div className="panel dialog rewriteDialog" onClick={(e) => e.stopPropagation()}>
        <h3>Regen with instructions</h3>

        <textarea
          autoFocus
          className="rewriteBox"
          rows={10}
          placeholder="How should it be rewritten?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
        />

        <div className="dialogActions rewriteActions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={!text.trim()} onClick={() => onSubmit(text)}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

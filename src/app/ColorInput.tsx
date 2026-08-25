import { RiCloseLine } from '@remixicon/react'
import './ColorInput.css'

/** Color swatch plus a Clear control that sets the value back to '' (no color). The label wrapping
 *  stays at the call site — callers word it differently.
 *
 *  `compact` swaps the "Clear" text button for an icon shown only when a color is set — for rows
 *  packing several swatches, where the text buttons don't fit. */
export function ColorInput({
  value,
  onChange,
  title,
  compact,
}: {
  value: string
  onChange: (color: string) => void
  /** Tooltip on the swatch — used where several sit in a row without their own labels. */
  title?: string
  compact?: boolean
}) {
  return (
    <span className={['colorInput', compact && 'compact', !value && 'unset'].filter(Boolean).join(' ')}>
      <span className="swatch">
        <input type="color" title={title} value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </span>
      {compact ? (
        value && (
          <button type="button" className="clearSwatch" title="Clear" onClick={() => onChange('')}>
            <RiCloseLine size={14} />
          </button>
        )
      ) : (
        <button type="button" onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </span>
  )
}

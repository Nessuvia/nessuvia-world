import { useEffect, useId, useState } from 'react'
import { RiCloseLine } from '@remixicon/react'
import { HexAlphaColorPicker, HexColorPicker } from 'react-colorful'
import { useCloseOnOutside } from './useCloseOnOutside'
import { normalizeHex, sanitizeHexText } from './hexColor'
import './ColorInput.css'

/** Color swatch plus a Clear control that sets the value back to '' (no color). The label wrapping
 *  stays at the call site — callers word it differently.
 *
 *  The swatch opens a popover picker rather than the platform one: Android's native
 *  `<input type="color">` is a hue strip with no hex field and no alpha, and it takes over the
 *  screen. This is a saturation square, a hue slider, an alpha slider where the field carries
 *  alpha, and a hex field for typing a value in.
 *
 *  `compact` swaps the "Clear" text button for an icon shown only when a color is set — for rows
 *  packing several swatches, where the text buttons don't fit. */
export function ColorInput({
  value,
  onChange,
  title,
  compact,
  alpha,
}: {
  value: string
  onChange: (color: string) => void
  /** Tooltip on the swatch — used where several sit in a row without their own labels. */
  title?: string
  compact?: boolean
  /** Adds the alpha slider and stores `#RRGGBBAA`. Off by default: most fields are opaque colors
   *  and an accidental alpha there reads as a bug. */
  alpha?: boolean
}) {
  const [open, setOpen] = useState(false)
  // The hex field's own text, so a half-typed value can sit there without being written back.
  const [text, setText] = useState(value)
  const [typing, setTyping] = useState(false)
  const fieldId = useId()
  const ref = useCloseOnOutside<HTMLSpanElement>(open, () => setOpen(false))

  // Follow the value while the field isn't being typed in: dragging the picker, Clear, and moving
  // to another record all have to show up in the field.
  useEffect(() => {
    if (!typing) setText(value)
  }, [value, typing])

  const Picker = alpha ? HexAlphaColorPicker : HexColorPicker

  const onText = (raw: string) => {
    setText(sanitizeHexText(raw, alpha))
    const next = normalizeHex(raw, alpha)
    if (next !== null) onChange(next)
  }

  return (
    <span
      ref={ref}
      className={compact ? 'colorInput compact' : 'colorInput'}
    >
      <span className="swatch">
        <button
          type="button"
          className="swatchButton"
          title={title}
          aria-label={title ?? 'Pick a color'}
          aria-haspopup="dialog"
          aria-expanded={open}
          style={value ? { background: value } : undefined}
          onClick={() => setOpen(!open)}
        >
          {!value && '—'}
        </button>
        {compact && value && (
          <button type="button" className="clearSwatch" title="Clear" onClick={() => onChange('')}>
            <RiCloseLine size={14} />
          </button>
        )}
      </span>
      {!compact && (
        <button type="button" onClick={() => onChange('')}>
          Clear
        </button>
      )}
      {open && (
        // Several callers wrap the whole control in a <label>. A click on the picker — a plain div,
        // not a control of its own — would activate that label, which forwards to the swatch button
        // and closes the popover on the first drag. The click stops here instead.
        <div className="colorPopover" onClick={(e) => e.stopPropagation()}>
          {/* touch-action: none on the wrapper as well as react-colorful's own handle: a drag that
              starts on the padding around the saturation square would otherwise pull the page down
              into a refresh. */}
          <div className="pickerSurface">
            <Picker color={value || (alpha ? '#FFFFFFFF' : '#FFFFFF')} onChange={(c) => onChange(c.toUpperCase())} />
          </div>
          {/* A span, not a label: a nested <label> is invalid inside the callers that wrap this. */}
          <span className="hexField">
            <span id={fieldId}>Hex</span>
            <input
              aria-labelledby={fieldId}
              value={text}
              placeholder={alpha ? '#RRGGBBAA' : '#RRGGBB'}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              onChange={(e) => onText(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </span>
        </div>
      )}
    </span>
  )
}

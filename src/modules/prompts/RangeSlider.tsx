import { useRef } from 'react'
import type { BlockInput } from '../../core/storage/types'

/**
 * The two-ended slider a scroll block is edited with — one thumb per end, dragged separately.
 * Native `<input type="range">` only carries one value, so the track and thumbs are drawn here and
 * driven by pointer events.
 */
export default function RangeSlider({
  input,
  onChange,
}: {
  input: BlockInput
  onChange: (input: BlockInput) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const span = Math.max(input.max - input.min, 1)
  const pct = (v: number) => ((v - input.min) / span) * 100

  /** The value under the pointer, snapped to the step and held inside the ends. */
  function valueAt(clientX: number) {
    const box = track.current!.getBoundingClientRect()
    const raw = input.min + ((clientX - box.left) / box.width) * (input.max - input.min)
    const step = input.step || 1
    const snapped = input.min + Math.round((raw - input.min) / step) * step
    return Math.min(input.max, Math.max(input.min, snapped))
  }

  /** Dragging past the other thumb stops at it, so the low end stays the low end. */
  function drag(end: 'value' | 'value2', e: React.PointerEvent) {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      const v = valueAt(ev.clientX)
      onChange(
        end === 'value'
          ? { ...input, value: Math.min(v, input.value2) }
          : { ...input, value2: Math.max(v, input.value) },
      )
    }
    move(e.nativeEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Keyboard: arrows nudge by a step, so the control isn't pointer-only. */
  const nudge = (end: 'value' | 'value2', e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    const v = input[end] + dir * (input.step || 1)
    onChange(
      end === 'value'
        ? { ...input, value: Math.max(input.min, Math.min(v, input.value2)) }
        : { ...input, value2: Math.min(input.max, Math.max(v, input.value)) },
    )
  }

  const thumb = (end: 'value' | 'value2') => (
    <button
      type="button"
      className="rangeThumb"
      style={{ left: `${pct(input[end])}%` }}
      aria-label={end === 'value' ? 'Low end' : 'High end'}
      aria-valuenow={input[end]}
      aria-valuemin={input.min}
      aria-valuemax={input.max}
      role="slider"
      onPointerDown={(e) => drag(end, e)}
      onKeyDown={(e) => nudge(end, e)}
    />
  )

  return (
    <div className="rangeSlider">
      <div className="rangeTrack" ref={track}>
        <div
          className="rangeFill"
          style={{ left: `${pct(input.value)}%`, width: `${pct(input.value2) - pct(input.value)}%` }}
        />
        {thumb('value')}
        {thumb('value2')}
      </div>
      <span className="rangeVals">
        {input.value}–{input.value2}
      </span>
    </div>
  )
}

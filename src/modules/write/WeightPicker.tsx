import type { BeatWeight } from '../../core/storage/types'
import { beatWeights, weightLabel } from '../../core/prompt/beatWeights'
import './plotLayout.css'

/** The five-way weight control, with the words it works out to underneath. The number is derived
 *  and read-only: the chapter's target is the number you edit, and this says how it lands here. */
export function WeightPicker({
  value,
  words,
  onChange,
}: {
  value: BeatWeight
  /** The derived word target for this beat. 0 when the chapter has no target set. */
  words: number
  onChange: (weight: BeatWeight) => void
}) {
  return (
    <span className="weightPicker">
      <select
        className="weightSelect"
        value={value}
        title="How long this beat runs against the others in its chapter."
        onChange={(e) => onChange(e.target.value as BeatWeight)}
      >
        {beatWeights.map((w) => (
          <option key={w} value={w}>
            {weightLabel[w]}
          </option>
        ))}
      </select>
      <span className="weightWords">{words > 0 ? `${words}w` : '--'}</span>
    </span>
  )
}

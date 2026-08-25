import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import type { Character } from '../../core/storage/types'
import { displayName } from '../../core/stores/charactersStore'
import TagList from './TagList'

/**
 * The quick-tag menu: right-click (or long-press) a card. Positioned at the pointer rather than
 * anchored to the card, since the card is a grid cell that may sit at either edge.
 */
export default function TagContextMenu({
  character,
  tags,
  at,
  onChange,
  onClose,
}: {
  character: Character
  /** Every tag in use across the roster, so you can apply an existing one without retyping it. */
  tags: string[]
  at: { x: number; y: number }
  onChange: (tags: string[]) => void
  onClose: () => void
}) {
  const ref = useCloseOnOutside<HTMLDivElement>(true, onClose)
  const current = character.tags ?? []

  const toggle = (tag: string) =>
    onChange(current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag])

  return (
    <div
      ref={ref}
      className="panel tagContextMenu"
      // Clamped so a card near the right or bottom edge does not open a menu off screen.
      style={{
        left: Math.min(at.x, window.innerWidth - 240),
        top: Math.min(at.y, window.innerHeight - 320),
      }}
    >
      <p className="tagContextName">{displayName(character) || 'Unnamed'}</p>
      <TagList
        tags={tags}
        checked={current}
        onToggle={toggle}
        onCreate={(tag) => onChange([...current, tag])}
        emptyText="No tags yet."
      />
    </div>
  )
}

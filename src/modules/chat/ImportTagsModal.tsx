import { useState } from 'react'
import { RiCloseLine } from '@remixicon/react'

/**
 * Shown between parsing a card and saving it, when the card carries tags. Card sites hand out
 * whatever the uploader typed, so this is the gate that keeps the tag list yours. Every tag starts
 * included; clicking one drops it.
 */
export default function ImportTagsModal({
  tags,
  onConfirm,
  onClose,
}: {
  tags: string[]
  onConfirm: (kept: string[]) => void
  onClose: () => void
}) {
  const [dropped, setDropped] = useState<string[]>([])
  const kept = tags.filter((t) => !dropped.includes(t))

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog importTagsDialog" onClick={(e) => e.stopPropagation()}>
        <div className="palettePromptHead">
          <h3>Import tags?</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        <p className="hint">This card carries tags. Click one to leave it out.</p>

        <div className="importTagBadges">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`importTagBadge${dropped.includes(tag) ? ' dropped' : ''}`}
              aria-pressed={!dropped.includes(tag)}
              onClick={() =>
                setDropped((d) => (d.includes(tag) ? d.filter((t) => t !== tag) : [...d, tag]))
              }
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="dialogActions">
          <button type="button" onClick={() => onConfirm([])}>
            Skip tags
          </button>
          <button type="button" onClick={() => onConfirm(kept)}>
            Import {kept.length} tag{kept.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

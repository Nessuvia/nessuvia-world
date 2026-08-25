import { useState } from 'react'
import { RiCloseLine } from '@remixicon/react'
import { useDragReorder } from '../../app/useDragReorder'

/** Editable tag chips. Order is load-bearing: the first chip is the character's group in the
 *  picker's grouped view, so the chips drag. */
export default function TagChips({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const { itemProps, over } = useDragReorder((from, to) => {
    const next = [...tags]
    next.splice(to, 0, ...next.splice(from, 1))
    onChange(next)
  })

  function add() {
    const tag = draft.trim()
    setDraft('')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
  }

  return (
    <div className="tagChipsField">
      <span className="tagChips">
        {tags.map((tag, i) => (
          <span key={tag} className={`tagChip${over === i ? ' dragOver' : ''}`} {...itemProps(i)}>
            {tag}
            <button type="button" title={`Remove ${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
              <RiCloseLine size={12} />
            </button>
          </span>
        ))}
      </span>
      <input
        placeholder="Add a tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          add()
        }}
      />
      <p className="hint">Drag to reorder. The first tag is this character's group in the picker.</p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { RiCloseLine } from '@remixicon/react'
import { newBook, useLorebooks } from '../../core/stores/lorebooksStore'
import EntityPicker from '../../app/EntityPicker'

/**
 * Attach and detach lorebooks on whatever holds a list of ids — a character or a chat. The list of
 * attached books, and a picker to add one.
 *
 * The same control in both places on purpose: the two levels differ in which record they write to,
 * and nothing else. Which record that is stays with the caller, which is the level the user meant.
 */
export default function BookAttach({
  ids,
  onChange,
  emptyText,
}: {
  ids: number[]
  onChange: (ids: number[]) => void
  emptyText: string
}) {
  const { books, counts, load } = useLorebooks()
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  const attached = ids.map((id) => books.find((b) => b.id === id)).filter((b) => !!b)

  return (
    <div className="lorebooksAttach">
      {attached.length === 0 && <p className="placeholder">{emptyText}</p>}

      <ul className="lorebooksAttachList">
        {attached.map((b) => (
          <li key={b.id} className="lorebooksAttachRow">
            <span className="lorebooksName">{b.name || 'Unnamed'}</span>
            <span className="lorebooksCount">{counts[b.id!] ?? 0}</span>
            {b.global && <span className="lorebooksBadge">All chats</span>}
            <button
              type="button"
              className="iconButton"
              aria-label={`Detach ${b.name || 'this book'}`}
              onClick={() => onChange(ids.filter((id) => id !== b.id))}
            >
              <RiCloseLine size={16} />
            </button>
          </li>
        ))}
      </ul>

      {picking ? (
        <EntityPicker
          items={books.map((b) => ({ key: String(b.id), label: b.name || 'Unnamed' }))}
          placeholder="Search lorebooks"
          emptyText="No lorebooks."
          onPick={(item) => {
            const id = Number(item.key)
            if (!ids.includes(id)) onChange([...ids, id])
            setPicking(false)
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="lorebooksAttachActions">
          <button type="button" onClick={() => setPicking(true)}>
            Attach
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              const id = await useLorebooks
                .getState()
                .create({ book: newBook('New book'), entries: [] })
              onChange([...ids, id])
            }}
          >
            New book
          </button>
        </div>
      )}
    </div>
  )
}

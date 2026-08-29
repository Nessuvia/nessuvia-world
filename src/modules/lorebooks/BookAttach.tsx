import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  // The book just made here, so the link to go and fill it in has somewhere to point.
  const [createdId, setCreatedId] = useState<number | null>(null)
  // Books are known only after the first load resolves; before that every id looks dead.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    load().then(() => setReady(true))
  }, [load])

  const attached = ids.map((id) => books.find((b) => b.id === id)).filter((b) => !!b)

  // An id with no book left behind it — a book deleted in an older build, or one that never came
  // back from a restore. Write the list back without it, so the count matches the rows.
  useEffect(() => {
    if (ready && attached.length !== ids.length) onChange(attached.map((b) => b.id!))
  })

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
              setCreatedId(id)
            }}
          >
            New book
          </button>
          {createdId !== null && (
            <Link className="lorebooksGoEdit" to={`/lorebooks#book-${createdId}`}>
              Go to edit →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

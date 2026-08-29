import { useEffect } from 'react'
import { defaultDepth } from '../../core/prompt/worldInfo'
import type { Lorebook } from '../../core/storage/types'
import { useLorebooks } from '../../core/stores/lorebooksStore'
import { newEntry, useWorldInfo } from '../../core/stores/worldInfoStore'
import EntryExample from './EntryExample'
import EntryRows from './EntryRows'

/**
 * One book: its own fields, then its entries. Book fields commit on blur, the same way the entry
 * rows do — nothing here is worth a write per keystroke.
 */
export default function BookEditor({ book }: { book: Lorebook }) {
  const save = useLorebooks((s) => s.save)
  const {
    entries,
    loadFor,
    save: saveEntry,
    remove: removeEntry,
    reorder: reorderEntry,
  } = useWorldInfo()
  const bookId = book.id!

  useEffect(() => {
    loadFor(bookId)
  }, [bookId, loadFor])

  // In hundreds, matching what a drag-reorder renumbers to, so a new entry lands last and there is
  // room to type an order between any two rows.
  const nextOrder = entries.length ? Math.max(...entries.map((e) => e.order)) + 100 : 100
  const patch = (fields: Partial<Lorebook>) => save({ ...book, ...fields })

  return (
    <div className="panel lorebooksEditor">
      <label className="lorebooksField">
        Name
        <input
          className="lorebooksTextInput"
          defaultValue={book.name}
          onBlur={(e) => patch({ name: e.target.value })}
        />
      </label>

      <label className="lorebooksField">
        Description
        <textarea
          rows={2}
          defaultValue={book.description}
          onBlur={(e) => patch({ description: e.target.value })}
        />
      </label>

      <div className="lorebooksBookFields">
        <label className="lorebooksField">
          Scan depth
          <input
            className="lorebooksNumberInput"
            type="number"
            min={1}
            value={book.scanDepth ?? ''}
            placeholder={String(defaultDepth)}
            onChange={(e) =>
              patch({ scanDepth: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <label className="lorebooksField">
          Token budget
          <input
            className="lorebooksNumberInput"
            type="number"
            min={0}
            value={book.tokenBudget ?? ''}
            placeholder="No limit"
            onChange={(e) =>
              patch({ tokenBudget: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <label className="lorebooksGlobalToggle">
          <input
            type="checkbox"
            checked={book.global}
            onChange={(e) => patch({ global: e.target.checked })}
          />
          Use in all chats
        </label>
        <button
          type="button"
          className="lorebooksAddEntry"
          onClick={() => saveEntry(newEntry(bookId, nextOrder))}
        >
          Add entry
        </button>
      </div>
      <p className="hint">
        Messages searched for keys, and the most this book may add to a prompt. An entry can set its
        own scan depth.
      </p>

      <EntryExample />
      <p className="hint">
        Drag entries to set their order. Entries from every attached book are sorted together, and
        the prompt stack's world info budget keeps the first ones that fit.
      </p>
      <EntryRows
        book={book}
        entries={entries}
        onSave={saveEntry}
        onRemove={removeEntry}
        onReorder={reorderEntry}
      />
    </div>
  )
}

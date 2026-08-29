import { useState } from 'react'
import { RiDeleteBinLine, RiDraggable } from '@remixicon/react'
import { useDragReorder } from '../../app/useDragReorder'
import '../../app/dragReorder.css'
import { defaultDepth, defaultInsertDepth } from '../../core/prompt/worldInfo'
import type { EntryPosition, Lorebook, WorldInfoEntry } from '../../core/storage/types'

/** The four values SillyTavern's `selectiveLogic` takes, in its own numbering. */
const logicOptions: [number, string][] = [
  [0, 'Any secondary'],
  [3, 'All secondary'],
  [2, 'No secondary'],
  [1, 'Not all secondary'],
]

const positionOptions: [EntryPosition, string][] = [
  ['beforeChar', 'Before character'],
  ['afterChar', 'After character'],
  ['atDepth', 'At depth'],
]

const splitKeys = (value: string) =>
  value
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

/**
 * The entry list of one book. Rows save on blur rather than on a debounce: a row has a dozen fields
 * and an entry's content runs to hundreds of words, so writing per keystroke buys nothing here.
 *
 * The second line of controls (secondary keys, logic, position, order, depth) only appears with the
 * text, because a book of sixty entries is read as a list of names and keys first.
 *
 * Rows drag to reorder, which rewrites `order` across the book. That number is priority as well as
 * sequence: the stack's world info budget fills entries in this order and drops the tail.
 */
export default function EntryRows({
  entries,
  book,
  onSave,
  onRemove,
  onReorder,
}: {
  entries: WorldInfoEntry[]
  book: Lorebook
  onSave: (entry: WorldInfoEntry) => void
  onRemove: (id: number) => void
  onReorder: (from: number, to: number) => void
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const drag = useDragReorder(onReorder)

  const commit = (entry: WorldInfoEntry, patch: Partial<WorldInfoEntry>) =>
    onSave({ ...entry, ...patch })

  if (!entries.length) return <p className="placeholder">No entries.</p>

  return (
    <ul className="lorebooksEntryList">
      {entries.map((entry, index) => {
        // Split, unlike every other useDragReorder row in the app: `draggable` on an ancestor stops
        // Chrome selecting text inside the inputs below, and this row is nothing but inputs. The
        // handle starts the drag; the whole row is still a drop target.
        const { draggable, onDragStart, onDragEnd, ...dropProps } = drag.itemProps(index)
        return (
        <li
          key={entry.id}
          className={`card lorebooksEntry${drag.over === index ? ' dropTarget' : ''}`}
          {...dropProps}
        >
          <div className="lorebooksEntryRow">
            <span
              className="lorebooksEntryHandle"
              aria-label="Drag to reorder"
              title="Drag to reorder"
              draggable={draggable}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <RiDraggable size={16} />
            </span>
            <input
              type="checkbox"
              checked={entry.enabled}
              aria-label="Enabled"
              title="Enabled"
              onChange={(e) => commit(entry, { enabled: e.target.checked })}
            />
            <input
              className="lorebooksEntryName"
              placeholder="Name"
              defaultValue={entry.name}
              onBlur={(e) => commit(entry, { name: e.target.value })}
            />
            <input
              className="lorebooksEntryKeys"
              placeholder="Keys, comma separated"
              defaultValue={entry.keys.join(', ')}
              onBlur={(e) => commit(entry, { keys: splitKeys(e.target.value) })}
            />
            <label className="lorebooksEntryFlag">
              <input
                type="checkbox"
                checked={entry.always}
                onChange={(e) => commit(entry, { always: e.target.checked })}
              />
              Always
            </label>
            <input
              className="lorebooksEntryNumber"
              type="number"
              min={1}
              aria-label="Scan depth"
              title="Scan depth"
              value={entry.scanDepth ?? ''}
              placeholder={String(book.scanDepth ?? defaultDepth)}
              onChange={(e) =>
                commit(entry, { scanDepth: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <button
              type="button"
              onClick={() => setOpenId(openId === entry.id ? null : (entry.id ?? null))}
            >
              {openId === entry.id ? 'Close' : 'Text'}
            </button>
            <button
              type="button"
              className="danger iconButton"
              aria-label="Delete entry"
              onClick={() => onRemove(entry.id!)}
            >
              <RiDeleteBinLine size={16} />
            </button>
          </div>

          {/* Collapsed by default: a real book has dozens of entries of several hundred words, and
              that many open textareas is a page nobody can read. */}
          {openId === entry.id ? (
            <>
              <div className="lorebooksEntryRow">
                <input
                  className="lorebooksEntryKeys"
                  placeholder="Secondary keys, comma separated"
                  defaultValue={(entry.secondaryKeys ?? []).join(', ')}
                  onBlur={(e) => commit(entry, { secondaryKeys: splitKeys(e.target.value) })}
                />
                <select
                  aria-label="Secondary key rule"
                  title="Secondary key rule"
                  value={entry.selectiveLogic ?? 0}
                  onChange={(e) => commit(entry, { selectiveLogic: Number(e.target.value) })}
                >
                  {logicOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="lorebooksEntryFlag">
                  <input
                    type="checkbox"
                    checked={entry.caseSensitive === true}
                    onChange={(e) => commit(entry, { caseSensitive: e.target.checked })}
                  />
                  Case sensitive
                </label>
                <select
                  aria-label="Position"
                  title="Position"
                  value={entry.position ?? 'beforeChar'}
                  onChange={(e) => commit(entry, { position: e.target.value as EntryPosition })}
                >
                  {positionOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="lorebooksEntryFlag">
                  Order
                  <input
                    className="lorebooksEntryNumber"
                    type="number"
                    title="Sorted against every attached book's entries, not just this one"
                    value={entry.order}
                    onChange={(e) => commit(entry, { order: Number(e.target.value) })}
                  />
                </label>
                {entry.position === 'atDepth' && (
                  <input
                    className="lorebooksEntryNumber"
                    type="number"
                    min={0}
                    aria-label="Insertion depth"
                    title="Messages from the end of the chat"
                    value={entry.depth ?? ''}
                    placeholder={String(defaultInsertDepth)}
                    onChange={(e) =>
                      commit(entry, { depth: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                )}
              </div>
              <textarea
                rows={10}
                defaultValue={entry.content}
                className="lorebooksEntryText"
                onBlur={(e) => commit(entry, { content: e.target.value })}
              />
            </>
          ) : (
            <p className="hint lorebooksEntrySnippet">{entry.content || 'No text.'}</p>
          )}
        </li>
        )
      })}
    </ul>
  )
}

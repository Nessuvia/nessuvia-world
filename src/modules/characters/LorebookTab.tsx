import { useEffect, useState } from 'react'
import { RiDeleteBinLine } from '@remixicon/react'
import { defaultDepth } from '../../core/prompt/worldInfo'
import { newEntry, useWorldInfo } from '../../core/stores/worldInfoStore'
import type { Character, WorldInfoEntry } from '../../core/storage/types'

/**
 * A character's lorebook. The reason this tab exists is imported books — a card's `character_book`
 * lands here with no extra work — so the list is built to be read first and edited second.
 *
 * Entries save on blur rather than on a debounce: a row has several fields and an entry's content
 * runs to hundreds of words, so writing per keystroke buys nothing here.
 */
export default function LorebookTab({
  character,
  onChangeBook,
}: {
  character: Character
  onChangeBook: (patch: Partial<Character['worldBook']>) => void
}) {
  const { entries, loadFor, save, remove } = useWorldInfo()
  const characterId = character.id ?? null
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (characterId) loadFor(characterId)
  }, [characterId, loadFor])

  if (!characterId) return <p className="placeholder">Name the character first.</p>

  const book = character.worldBook
  const nextOrder = entries.length ? Math.max(...entries.map((e) => e.order)) + 1 : 0

  // Blur commits, the same way the chat title and the rename field do.
  const commit = (entry: WorldInfoEntry, patch: Partial<WorldInfoEntry>) =>
    save({ ...entry, ...patch })

  return (
    <div className="lorebook">
      {book?.name && <h3>{book.name}</h3>}

      <div className="lorebookBook">
        <label>
          Scan depth
          <input
            type="number"
            min={1}
            value={book?.scanDepth ?? ''}
            placeholder={String(defaultDepth)}
            onChange={(e) =>
              onChangeBook({ scanDepth: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <label>
          Token budget
          <input
            type="number"
            min={0}
            value={book?.tokenBudget ?? ''}
            placeholder="No limit"
            onChange={(e) =>
              onChangeBook({ tokenBudget: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
        <button
          type="button"
          className="lorebookAdd"
          onClick={() => save(newEntry(characterId, nextOrder))}
        >
          Add entry
        </button>
      </div>
      <p className="hint">
        Messages searched for keys, and the most this book may add to a prompt. An entry can set its
        own scan depth.
      </p>

      {entries.length === 0 && <p className="placeholder">No entries.</p>}

      <ul className="lorebookList">
        {entries.map((entry) => (
          <li key={entry.id} className="card lorebookEntry">
            <div className="lorebookRow">
              <input
                type="checkbox"
                checked={entry.enabled}
                aria-label="Enabled"
                title="Enabled"
                onChange={(e) => commit(entry, { enabled: e.target.checked })}
              />
              <input
                className="lorebookName"
                placeholder="Name"
                defaultValue={entry.name}
                onBlur={(e) => commit(entry, { name: e.target.value })}
              />
              <input
                className="lorebookKeys"
                placeholder="Keys, comma separated"
                defaultValue={entry.keys.join(', ')}
                onBlur={(e) =>
                  commit(entry, {
                    keys: e.target.value
                      .split(',')
                      .map((k) => k.trim())
                      .filter(Boolean),
                  })
                }
              />
              <label className="lorebookAlways">
                <input
                  type="checkbox"
                  checked={entry.always}
                  onChange={(e) => commit(entry, { always: e.target.checked })}
                />
                Always
              </label>
              <input
                className="lorebookDepth"
                type="number"
                min={1}
                aria-label="Scan depth"
                title="Scan depth"
                value={entry.scanDepth ?? ''}
                placeholder={String(book?.scanDepth ?? defaultDepth)}
                onChange={(e) =>
                  commit(entry, {
                    scanDepth: e.target.value ? Number(e.target.value) : undefined,
                  })
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
                onClick={() => remove(entry.id!)}
              >
                <RiDeleteBinLine size={16} />
              </button>
            </div>
            {/* Collapsed by default: a real book has a dozen-plus entries of several hundred words,
                and that many open textareas is a page nobody can read. */}
            {openId === entry.id ? (
              <textarea
                rows={10}
                defaultValue={entry.content}
                className="lorebookText"
                onBlur={(e) => commit(entry, { content: e.target.value })}
              />
            ) : (
              <p className="hint lorebookSnippet">{entry.content.slice(0, 120) || 'No text.'}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

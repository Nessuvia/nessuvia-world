import { useEffect, useState } from 'react'
import type { Connection } from '../../core/stores/settingsStore'
import {
  tokenizerDefs,
  tokenizerDef,
  tokenizerFor,
  type TokenizerId,
} from '../../core/prompt/tokenizers'
import { fetchVocab, hasVocab, removeVocab } from '../../core/prompt/tokenizerCache'

interface Props {
  connection: Connection
  onChange: (tokenizer: TokenizerId) => void
}

function megabytes(bytes: number) {
  return `${Math.round(bytes / 100000) / 10} MB`
}

/**
 * Picks which tokenizer counts this connection's prompts, and downloads the vocabulary when the
 * pick needs one. The download is a button rather than something that fires on selection: these
 * files run to 17 MB and nobody should spend that by scrolling a dropdown.
 */
export default function TokenizerPicker({ connection, onChange }: Props) {
  const resolved = tokenizerFor(connection)
  const def = tokenizerDef(resolved)
  const [cached, setCached] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    setNote('')
    let live = true
    hasVocab(resolved).then((has) => {
      if (live) setCached(has)
    })
    return () => {
      live = false
    }
  }, [resolved])

  async function load() {
    setBusy(true)
    setNote('')
    try {
      await fetchVocab(resolved)
      setCached(true)
    } catch {
      setNote('Download failed.')
    }
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    await removeVocab(resolved)
    setCached(false)
    setBusy(false)
  }

  return (
    <label className="span2">
      Tokenizer
      <span className="modelRow">
        <select
          className="tokenizerSelect"
          value={connection.tokenizer ?? 'auto'}
          onChange={(e) => onChange(e.target.value as TokenizerId)}
        >
          <option value="auto">Auto, {tokenizerDef(tokenizerFor({ ...connection, tokenizer: 'auto' })).label}</option>
          {tokenizerDefs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {def.kind === 'hf' && cached === false && (
          <button type="button" onClick={load} disabled={busy}>
            {busy ? 'Downloading…' : `Download ${megabytes(def.bytes ?? 0)}`}
          </button>
        )}
        {def.kind === 'hf' && cached === true && (
          <button type="button" className="secondary" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </span>
      {note && <small>{note}</small>}
      {!note && def.kind === 'hf' && cached === false && (
        <small>Not downloaded. Counts use o200k until it is.</small>
      )}
      {!note && def.kind === 'hf' && cached === true && <small>Stored in the browser cache.</small>}
    </label>
  )
}

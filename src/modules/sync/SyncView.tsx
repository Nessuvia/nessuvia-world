import { useState } from 'react'
import { tableNames, type TableName } from '../../core/storage/storageInterface'
import { useSettings } from '../../core/stores/settingsStore'
import { bucketConfigured, type BucketConfig } from '../../core/sync/bucketConfig'
import { testBucket } from '../../core/sync/syncClient'
import { useSync, type Direction, type TableComparison } from '../../core/sync/syncStore'

/** Both all-tables buttons act on every table, so the decision map is one direction across the
 *  board. Kept for the case where the user knows which side is right and skips the comparison. */
function allTables(direction: Direction): Record<TableName, Direction> {
  return Object.fromEntries(tableNames.map((t) => [t, direction])) as Record<TableName, Direction>
}

function stamp(at: number | null): string {
  return at === null ? '' : new Date(at).toLocaleString()
}

const verdictLabel: Record<TableComparison['verdict'], string> = {
  identical: 'Same on both sides',
  localOnly: 'Changed here',
  cloudOnly: 'Changed in the bucket',
  both: 'Changed on both sides',
}

export default function SyncView() {
  const { status, error, comparison, compare, apply, clearError } = useSync()
  const bucket = useSettings((s) => s.bucket)
  const setBucket = useSettings((s) => s.setBucket)
  const lastSyncedAt = useSettings((s) => s.lastSyncedAt)

  const [decisions, setDecisions] = useState<Partial<Record<TableName, Direction>>>({})
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok'>('idle')

  const busy = status !== 'idle'
  const ready = bucketConfigured(bucket)

  async function runTest() {
    setTestState('testing')
    clearError()
    try {
      await testBucket(bucket)
      setTestState('ok')
    } catch (err) {
      setTestState('idle')
      useSync.setState({ error: err instanceof Error ? err.message : 'Could not reach the bucket.' })
    }
  }

  return (
    <div className="sync screenFrame">
      <h2>Sync</h2>
      <p className="syncNote">
        Copies your library to a storage bucket you run. Settings, connections and API keys stay on
        this device.
      </p>

      <BucketForm
        bucket={bucket}
        onChange={(patch) => {
          setBucket(patch)
          setTestState('idle')
        }}
      />

      <div className="syncActions">
        <button type="button" onClick={runTest} disabled={!ready || testState === 'testing'}>
          {testState === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {testState === 'ok' && <span className="syncNote">Connected.</span>}
      </div>

      {ready && (
        <div className="syncActions">
          <button
            type="button"
            onClick={() => {
              setDecisions({})
              compare()
            }}
            disabled={busy}
          >
            {status === 'comparing' ? 'Comparing…' : 'Compare'}
          </button>
          <button type="button" onClick={() => apply(allTables('push'))} disabled={busy}>
            Upload all
          </button>
          <button type="button" onClick={() => apply(allTables('pull'))} disabled={busy}>
            Download all
          </button>
          {lastSyncedAt !== null && (
            <span className="syncNote">Last synced {stamp(lastSyncedAt)}</span>
          )}
        </div>
      )}

      {comparison && (
        <ComparisonTable
          comparison={comparison}
          decisions={decisions}
          busy={busy}
          onDecide={(table, direction) => setDecisions((d) => ({ ...d, [table]: direction }))}
          // The radios show `suggested` as pre-selected, so Apply has to act on it. Only an
          // explicit click lands in `decisions`; without this merge a pre-filled row would look
          // chosen and then be skipped.
          onApply={() => {
            const merged: Partial<Record<TableName, Direction>> = {}
            for (const [name, c] of Object.entries(comparison) as [TableName, TableComparison][]) {
              const chosen = decisions[name] ?? c.suggested
              if (chosen) merged[name] = chosen
            }
            apply(merged)
          }}
        />
      )}

      {error && <SyncError error={error} onDismiss={clearError} />}
    </div>
  )
}

function BucketForm({
  bucket,
  onChange,
}: {
  bucket: BucketConfig
  onChange(patch: Partial<BucketConfig>): void
}) {
  return (
    <div className="syncBucket">
      <label>
        Endpoint
        <input
          value={bucket.endpoint}
          onChange={(e) => onChange({ endpoint: e.target.value })}
          placeholder="http://localhost:3900"
          spellCheck={false}
        />
      </label>
      <label>
        Bucket
        <input
          value={bucket.bucket}
          onChange={(e) => onChange({ bucket: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Region
        <input
          value={bucket.region}
          onChange={(e) => onChange({ region: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Folder
        <input
          value={bucket.prefix}
          onChange={(e) => onChange({ prefix: e.target.value })}
          placeholder="Optional"
          spellCheck={false}
        />
      </label>
      <label>
        Access key
        <input
          value={bucket.accessKeyId}
          onChange={(e) => onChange({ accessKeyId: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Secret key
        <input
          type="password"
          value={bucket.secretAccessKey}
          onChange={(e) => onChange({ secretAccessKey: e.target.value })}
          autoComplete="off"
        />
      </label>
    </div>
  )
}

/**
 * The per-table decision list. A table changed on both sides has no suggestion and no default —
 * `apply` refuses until every one of them has a direction, so this is where that gets answered.
 */
function ComparisonTable({
  comparison,
  decisions,
  busy,
  onDecide,
  onApply,
}: {
  comparison: Partial<Record<TableName, TableComparison>>
  decisions: Partial<Record<TableName, Direction>>
  busy: boolean
  onDecide(table: TableName, direction: Direction): void
  onApply(): void
}) {
  const rows = (Object.entries(comparison) as [TableName, TableComparison][]).filter(
    ([, c]) => c.verdict !== 'identical',
  )

  if (!rows.length) return <p className="syncNote">Everything matches the bucket.</p>

  return (
    <div className="syncComparison">
      {rows.map(([table, c]) => {
        const chosen = decisions[table] ?? c.suggested
        return (
          <div className="syncRow" key={table}>
            <span className="syncRowName">{table}</span>
            <span className="syncNote">{verdictLabel[c.verdict]}</span>
            <label>
              <input
                type="radio"
                name={`dir-${table}`}
                checked={chosen === 'push'}
                onChange={() => onDecide(table, 'push')}
              />
              Upload
            </label>
            <label>
              <input
                type="radio"
                name={`dir-${table}`}
                checked={chosen === 'pull'}
                onChange={() => onDecide(table, 'pull')}
              />
              Download
            </label>
          </div>
        )
      })}
      <div className="syncActions">
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Apply'}
        </button>
        <span className="syncNote">Downloading a table replaces it in this browser.</span>
      </div>
    </div>
  )
}

function SyncError({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <p className="syncError">
      {error}
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </p>
  )
}

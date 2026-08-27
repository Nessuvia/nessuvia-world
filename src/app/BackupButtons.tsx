import { RiDownloadLine, RiUploadLine } from '@remixicon/react'
import { buildBackup, downloadBackup, parseBackup, restoreBackup } from '../core/storage/backup'

/**
 * Import and Export, in the sidebar and again on the Online Sync page. Hoisted rather than copied:
 * Import clears every table, and two versions of that drifting apart is the kind of bug that loses
 * someone's library.
 *
 * `className` is the caller's, because the two hosts style their buttons differently — the rail's
 * `.sidebar-item` and the sync page's own. Nothing else about them differs.
 */
export default function BackupButtons({ className }: { className: string }) {
  return (
    <>
      {/* File inputs can't be styled; the label is the button. */}
      <label className={className}>
        <RiUploadLine size={18} />
        Import
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!confirm('Import replaces all data in this browser. Continue?')) return
            // Parsed before the confirm's work begins: a bad file must not get as far as
            // clearing a table. Failures are silent otherwise — nothing renders this throw.
            let backup
            try {
              backup = parseBackup(await file.text())
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Not a backup file.')
              return
            }
            await restoreBackup(backup)
            location.reload()
          }}
        />
      </label>

      <button
        type="button"
        className={className}
        onClick={async () => downloadBackup(await buildBackup())}
      >
        <RiDownloadLine size={18} />
        Export
      </button>
    </>
  )
}

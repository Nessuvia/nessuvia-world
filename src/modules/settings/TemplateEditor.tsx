import type { InstructTemplate } from '../../core/params/paramDef'
import { defaultTemplate } from '../../core/params/paramDef'

const rows: { key: keyof InstructTemplate; label: string }[] = [
  { key: 'firstPrefix', label: 'Start of prompt' },
  { key: 'systemPrefix', label: 'System prefix' },
  { key: 'systemSuffix', label: 'System suffix' },
  { key: 'userPrefix', label: 'User prefix' },
  { key: 'userSuffix', label: 'User suffix' },
  { key: 'modelPrefix', label: 'Model prefix' },
  { key: 'modelSuffix', label: 'Model suffix' },
]

/** The sequences that wrap each message for a text-completion endpoint. */
export default function TemplateEditor({
  template,
  onChange,
}: {
  template: InstructTemplate
  onChange: (template: InstructTemplate) => void
}) {
  const set = <K extends keyof InstructTemplate>(key: K, value: InstructTemplate[K]) =>
    onChange({ ...template, [key]: value })

  return (
    <div className="templateEditor">
      <div className="templateGrid">
        {rows.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input
              value={(template[key] as string) ?? ''}
              onChange={(e) => set(key, e.target.value as InstructTemplate[typeof key])}
            />
          </label>
        ))}
      </div>
      <label>
        Stop sequences (comma-separated)
        <input
          value={template.stopSequences.join(', ')}
          onChange={(e) =>
            set(
              'stopSequences',
              e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            )
          }
        />
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={template.trimTrailingSpace}
          onChange={(e) => set('trimTrailingSpace', e.target.checked)}
        />
        Trim trailing whitespace from the prompt
      </label>
      <div className="editorActions">
        <button type="button" className="secondary" onClick={() => onChange(defaultTemplate())}>
          Reset to ChatML
        </button>
      </div>
    </div>
  )
}

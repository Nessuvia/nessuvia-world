import { useMemo, useState } from 'react'
import { RiTextSnippet } from '@remixicon/react'
import {
  newSecondPassRule,
  useSecondPass,
  useSettings,
  type SecondPassRule,
} from '../../core/stores/settingsStore'
import { findTextMatches, standingNotes } from '../../core/secondPass/textRules'
import { defaultBundle, restoreBundle, staleBundledRules } from '../../core/secondPass/defaultRules'
import { downloadRules, parseRules } from '../../core/secondPass/ruleJson'
import RuleCardHead from './RuleCardHead'
import './settings.css'

/** The syntax error for a rule's find, or null. Only regex rules can fail: a literal is escaped. */
function ruleError(rule: SecondPassRule): string | null {
  if (!rule.regex || !rule.find.trim()) return null
  try {
    new RegExp(rule.find)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

/**
 * Free-text rules: words and phrases to report to the Second Pass model, with the instruction
 * written by the author.
 *
 * Separate from the Grammar Hammer because they are a different kind of thing. A Hammer rule
 * matches parts of speech and can strip or replace the text itself; these match words the way Find
 * & Replace does and only ever report, so they belong to Second Pass and nowhere else.
 */
export default function TextRulesPanel() {
  const settings = useSecondPass()
  const patch = useSettings((s) => s.setSecondPass)
  const rules = settings.textRules
  const [preview, setPreview] = useState('')
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState('')

  /** Append what the JSON holds. Import adds; it never replaces the list, so a file with one rule
   *  in it cannot cost you the other forty. */
  const addJson = (text: string) => {
    try {
      patch({ textRules: [...rules, ...parseRules(text)] })
      setPaste('')
      setImportError('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that.')
    }
  }

  const patchRule = (id: string, over: Partial<SecondPassRule>) =>
    patch({ textRules: rules.map((r) => (r.id === id ? { ...r, ...over } : r)) })

  // Live preview, the same harness the Hammer panel offers: type a find, see what it would report.
  const matches = useMemo(() => {
    if (!preview.trim()) return null
    return findTextMatches(preview, rules, 'assistant')
  }, [preview, rules])

  // How many rules a restore would add, so the button can say whether it would do anything. Matched
  // by id and by content, so a row left from an older bundle counts as already present.
  const adds = restoreBundle(rules).length - rules.length
  // Rows from a bundle this build no longer ships. Not duplicates, so a restore leaves them; shown
  // separately so a list cannot quietly hold two generations of defaults.
  const stale = staleBundledRules(rules)
  const standing = standingNotes(rules, 'assistant')

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>
          <RiTextSnippet size={14} className="hammerIcon" /> Free-text rules
        </h3>
      </span>

      <ul className="ruleCards screenBody">
        {rules.map((rule) => {
          const error = ruleError(rule)
          return (
            <li key={rule.id} className="card ruleCard">
              <RuleCardHead
                enabled={rule.enabled}
                label={rule.label ?? ''}
                scope={rule.scope}
                onChange={(over) => patchRule(rule.id, over)}
                onCopy={() => {
                  const i = rules.findIndex((r) => r.id === rule.id)
                  patch({ textRules: rules.toSpliced(i + 1, 0, { ...rule, id: crypto.randomUUID() }) })
                }}
                onDelete={() => patch({ textRules: rules.filter((r) => r.id !== rule.id) })}
              />
              <label className="ruleField">
                <span>Find</span>
                <input
                  className="patternInput"
                  value={rule.find}
                  placeholder="Leave blank to apply to every reply"
                  onChange={(e) => patchRule(rule.id, { find: e.target.value })}
                />
              </label>
              {rule.find ? (
                <div className="ruleField">
                  <span>Match</span>
                  <div className="ruleActionRow">
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={rule.regex}
                        onChange={(e) => patchRule(rule.id, { regex: e.target.checked })}
                      />
                      Regex
                    </label>
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={rule.caseSensitive}
                        onChange={(e) => patchRule(rule.id, { caseSensitive: e.target.checked })}
                      />
                      Match case
                    </label>
                  </div>
                </div>
              ) : (
                <p className="hint">Applies to every reply.</p>
              )}
              <label className="ruleField">
                <span>Tell the model</span>
                <textarea
                  className="ruleNoteInput"
                  rows={3}
                  value={rule.note}
                  placeholder="Stop opening sentences on an adverb."
                  onChange={(e) => patchRule(rule.id, { note: e.target.value })}
                />
              </label>
              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
        {rules.length === 0 && <p className="hint">No rules.</p>}
      </ul>

      <div className="grammarActions">
        <button type="button" onClick={() => patch({ textRules: [...rules, newSecondPassRule()] })}>
          Add rule
        </button>
        {/* Puts back the whole shipped state: the missing rules, and both built-in checks. Rules
            already present, by id or by wording, are left exactly as they are. */}
        <button
          type="button"
          onClick={() => {
            const bundle = defaultBundle()
            patch({
              textRules: restoreBundle(rules),
              repetition: bundle.repetition,
              sprawl: bundle.sprawl,
              triplet: bundle.triplet,
            })
          }}
        >
          Restore defaults{adds > 0 ? ` (+${adds})` : ''}
        </button>
        {stale.length > 0 && (
          <button
            type="button"
            className="danger"
            title="Remove rules left over from an older bundle"
            onClick={() =>
              patch({ textRules: rules.filter((r) => !stale.some((x) => x.id === r.id)) })
            }
          >
            Remove {stale.length} old default{stale.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div className="grammarActions">
        {/* File inputs can't be styled; the label is the button. */}
        <label className="ruleImportButton">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) addJson(await file.text())
            }}
          />
        </label>
        <button type="button" onClick={() => downloadRules(rules)} disabled={rules.length === 0}>
          Export JSON
        </button>
      </div>
      <div className="ruleImport">
        <textarea
          className="ruleImportInput"
          value={paste}
          rows={3}
          placeholder="…or paste rule JSON here"
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="grammarActions">
          <button type="button" disabled={!paste.trim()} onClick={() => addJson(paste)}>
            Add pasted rules
          </button>
        </div>
        {importError && <p className="hint danger">{importError}</p>}
        <p className="hint">
          Takes an export, a bare array of rules, or a single rule object. Imported rules are added
          to the list, not swapped in for it.
        </p>
      </div>

      <div className="grammarPreview">
        <textarea
          value={preview}
          placeholder="Paste sample text to see what would be reported…"
          rows={4}
          onChange={(e) => setPreview(e.target.value)}
        />
        {matches && matches.length > 0 && (
          <ul className="textRuleMatches">
            {matches.map((note, i) => (
              <li key={i}>
                <span className="strippedSpan">{note.slice}</span> {note.message}
              </li>
            ))}
          </ul>
        )}
        {matches && matches.length === 0 && preview.trim() && <p className="hint">No matches.</p>}
        {standing.length > 0 && (
          <p className="hint">
            {standing.length} {standing.length === 1 ? 'rule applies' : 'rules apply'} to every
            reply, on top of any matches.
          </p>
        )}
      </div>
    </section>
  )
}

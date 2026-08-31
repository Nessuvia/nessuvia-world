import { useMemo, useState } from 'react'
import { RiHammerLine } from '@remixicon/react'
import {
  newGrammarHammerRule,
  seedGrammarHammerRules,
  useSecondPass,
  useSettings,
  type GrammarHammerRule,
} from '../../core/stores/settingsStore'
import RuleCardHead from './RuleCardHead'
import { tryCompile, POS_TAGS } from '../../core/hammer/pattern'
import { previewStrips, stripText } from '../../core/hammer/strip'
import './settings.css'

/** Returns the syntax error message for a rule's pattern, or null if it compiles. */
function ruleError(rule: GrammarHammerRule): string | null {
  if (!rule.pattern.trim()) return null
  const r = tryCompile(rule.pattern, rule.caseSensitive)
  return 'error' in r ? r.error : null
}

/** Grammar Hammer: slop constructions matched by POS patterns, stripped or flagged inside Second
 *  Pass. The Enable toggle here is Second Pass's own, since the rules do nothing without it. */
export default function GrammarHammerPanel() {
  const gh = useSecondPass()
  const patchGh = useSettings((s) => s.setSecondPass)
  const [preview, setPreview] = useState('')
  const [cheat, setCheat] = useState(false)

  const patchRule = (id: string, patch: Partial<GrammarHammerRule>) =>
    patchGh({ rules: gh.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  // Live preview runs all enabled rules (including ones with errors, which skip) against the
  // sample text. Doubles as the dev harness: type a pattern, see it strip immediately.
  const previewResult = useMemo(() => {
    if (!preview.trim() || !gh.enabled) return null
    return previewStrips(preview, gh.rules, 'assistant')
  }, [preview, gh.rules, gh.enabled])

  // The actual text a message would render, repaired, with removals gone and replacements in place.
  const resultText = useMemo(() => {
    if (!preview.trim() || !gh.enabled) return null
    return stripText(preview, gh.rules, 'assistant').text
  }, [preview, gh.rules, gh.enabled])

  return (
    <section className="textRules grammarHammer screenFrame">
      <span className="titleContainer">
        <h3>
          <RiHammerLine size={14} className="hammerIcon" /> Grammar Hammer
        </h3>
        <label className="checkboxRow">
          <input type="checkbox" checked={gh.enabled} onChange={(e) => patchGh({ enabled: e.target.checked })} />
          Enable
        </label>
      </span>

      <ul className="ruleCards screenBody">
        {gh.rules.map((rule) => {
          const error = ruleError(rule)
          return (
            <li key={rule.id} className="card ruleCard">
              <RuleCardHead
                enabled={rule.enabled}
                label={rule.label ?? ''}
                scope={rule.scope}
                onChange={(patch) => patchRule(rule.id, patch)}
                onCopy={() => {
                  const i = gh.rules.findIndex((r) => r.id === rule.id)
                  patchGh({ rules: gh.rules.toSpliced(i + 1, 0, { ...rule, id: crypto.randomUUID() }) })
                }}
                onDelete={() => patchGh({ rules: gh.rules.filter((r) => r.id !== rule.id) })}
              />
              <label className="ruleField">
                <span>Pattern</span>
                <input
                  className="patternInput"
                  value={rule.pattern}
                  placeholder="with a [adj] [noun]"
                  onChange={(e) => patchRule(rule.id, { pattern: e.target.value })}
                />
              </label>
              <div className="ruleField">
                <span>Action</span>
                <div className="ruleActionRow">
                  <select
                    value={rule.action}
                    onChange={(e) => patchRule(rule.id, { action: e.target.value as GrammarHammerRule['action'] })}
                  >
                    <option value="strip">Remove match</option>
                    <option value="replace">Replace with…</option>
                    <option value="flag">Report to the model</option>
                  </select>
                  {rule.action === 'replace' && (
                    <input
                      className="patternInput"
                      value={rule.replacement ?? ''}
                      placeholder="It's not $1, but $2..."
                      onChange={(e) => patchRule(rule.id, { replacement: e.target.value })}
                    />
                  )}
                </div>
              </div>
              {error && <p className="hint danger">{error}</p>}
            </li>
          )
        })}
      </ul>

      <div className="grammarActions">
        <button type="button" onClick={() => patchGh({ rules: [...gh.rules, newGrammarHammerRule()] })}>
          Add rule
        </button>
        {gh.rules.length === 0 && (
          <button type="button" onClick={() => patchGh({ rules: seedGrammarHammerRules() })}>
            Add example rules
          </button>
        )}
        <button type="button" onClick={() => setCheat(!cheat)}>
          {cheat ? 'Hide cheat sheet' : 'Cheat sheet'}
        </button>
      </div>

      {cheat && (
        <div className="panel cheatSheet">
          <p>
            <strong>POS slots:</strong> {POS_TAGS.map((t) => `[${t}]`).join(' ')}
          </p>
          <p>
            <strong>[word]</strong> matches any one word.
          </p>
          <p>
            <strong>Quantifiers:</strong> <code>[adj]?</code> optional · <code>[adj]+</code> one or more ·{' '}
            <code>[adj]{'{2}'}</code> exactly two · <code>[adj]{'{1,3}'}</code> one to three ·{' '}
            <code>[adj]{'{2,}'}</code> two or more
          </p>
          <p>Literal tokens match the surface word, case-insensitive unless the rule opts in.</p>
          <p>
            <strong>Replace refs:</strong> <code>$0</code> whole match ·{' '}
            <code>$1</code>…<code>$n</code> each pattern token in order
          </p>
        </div>
      )}

      <div className="grammarPreview">
        <textarea
          value={preview}
          placeholder="Paste sample text to preview stripping…"
          rows={4}
          onChange={(e) => setPreview(e.target.value)}
        />
        {previewResult && previewResult.removed.length > 0 && (
          <>
            <div className="previewOut">
              {renderPreview(previewResult.text, previewResult.removed)}
            </div>
            <p className="previewLabel">Result</p>
            <div className="previewOut previewResult">{resultText}</div>
          </>
        )}
        {previewResult && previewResult.removed.length === 0 && preview.trim() && (
          <p className="hint">No matches.</p>
        )}
      </div>
    </section>
  )
}

/** Render the preview text with removed spans struck through, and any replacement shown after. */
function renderPreview(
  text: string,
  removed: Array<{ start: number; end: number; slice: string; replacement: string }>,
) {
  if (removed.length === 0) return text
  const out: React.ReactNode[] = []
  let i = 0
  removed.forEach((r, idx) => {
    if (r.start > i) out.push(text.slice(i, r.start))
    out.push(
      <span key={`s${idx}`} className="strippedSpan">
        {r.slice}
      </span>,
    )
    if (r.replacement) {
      out.push(
        <span key={`r${idx}`} className="replacedSpan">
          {r.replacement}
        </span>,
      )
    }
    i = r.end
  })
  if (i < text.length) out.push(text.slice(i))
  return out
}

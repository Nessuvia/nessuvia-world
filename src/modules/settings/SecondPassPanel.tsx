import { useSecondPass, useSettings } from '../../core/stores/settingsStore'
import { standingNotes } from '../../core/secondPass/textRules'
import ConnectionPicker from '../../app/ConnectionPicker'
import GrammarHammerPanel from './GrammarHammerPanel'
import TextRulesPanel from './TextRulesPanel'
import './settings.css'

/**
 * Second Pass: the enable toggle, which connection edits, the repetition check, and the standing
 * instruction, over the two rule lists.
 *
 * Free-text rules are authored here because they only ever report and have nowhere else to live.
 * The Grammar Hammer renders here too, since a rule set to "Report to the model" is a check as
 * much as a free-text rule is; its other two actions edit the text on the way through.
 */
export default function SecondPassPanel() {
  const settings = useSecondPass()
  const patch = useSettings((s) => s.setSecondPass)
  // Standing rules force the second request whether or not anything matched, so the skip setting
  // has nothing left to skip while any are on. Say so rather than let it read as broken.
  const alwaysOn = standingNotes(settings.textRules, 'assistant').length
  const rep = settings.repetition
  const patchRep = (over: Partial<typeof rep>) => patch({ repetition: { ...rep, ...over } })
  const spr = settings.sprawl
  const patchSpr = (over: Partial<typeof spr>) => patch({ sprawl: { ...spr, ...over } })

  return (
    <div className="textRulesCards">
      <section className="textRules screenFrame">
        <span className="titleContainer">
          <h3>Second Pass</h3>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            Enable
          </label>
        </span>

        <div className="screenBody secondPassBody">
          <p className="hint">
            Each reply is generated, checked against the rules below, then sent back to a model to
            rewrite. Rules with nothing in their Find field apply to every reply.
          </p>

          <ConnectionPicker
            value={settings.connectionId}
            onChange={(connectionId) => patch({ connectionId })}
            allowActive
            label="Editing connection"
            disabled={!settings.enabled}
          />

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={settings.skipWhenClean}
              disabled={!settings.enabled}
              onChange={(e) => patch({ skipWhenClean: e.target.checked })}
            />
            Skip the second request when nothing is found
          </label>
          <p className="hint">
            {alwaysOn > 0
              ? `${alwaysOn} ${alwaysOn === 1 ? 'rule applies' : 'rules apply'} to every reply, so the second request runs every time regardless of this setting. Disable or delete those rules to let it skip.`
              : 'Nothing found means the reply is used as written, and only one request is made.'}
          </p>

          <label className="secondPassPrompt">
            Standing instruction
            <textarea
              className="secondPassPromptInput"
              rows={3}
              value={settings.userPrompt}
              disabled={!settings.enabled}
              placeholder="Applied to every reply, on top of anything found."
              onChange={(e) => patch({ userPrompt: e.target.value })}
            />
          </label>
          <p className="hint">
            Filled in, the second request runs on every reply, including ones where nothing was
            found.
          </p>

          <span className="secondPassSectionTitle">Sentence sprawl</span>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={spr.enabled}
              disabled={!settings.enabled}
              onChange={(e) => patchSpr({ enabled: e.target.checked })}
            />
            Report sentences that run on
          </label>
          <p className="hint">
            Catches clauses chained at the same level with commas and "and". A rule cannot do this
            one: what makes a sentence sprawl is how many joints it has, not which words fill them.
          </p>
          <div className="secondPassNumbers">
            <label className="secondPassNumber">
              Words
              <input
                className="secondPassNumberInput"
                type="number"
                min={10}
                max={200}
                value={spr.maxWords}
                disabled={!settings.enabled || !spr.enabled}
                onChange={(e) => patchSpr({ maxWords: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Commas
              <input
                className="secondPassNumberInput"
                type="number"
                min={1}
                max={20}
                value={spr.maxCommas}
                disabled={!settings.enabled || !spr.enabled}
                onChange={(e) => patchSpr({ maxCommas: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Conjunctions
              <input
                className="secondPassNumberInput"
                type="number"
                min={1}
                max={20}
                value={spr.maxConjunctions}
                disabled={!settings.enabled || !spr.enabled}
                onChange={(e) => patchSpr({ maxConjunctions: Number(e.target.value) })}
              />
            </label>
          </div>

          <span className="secondPassSectionTitle">Repetition</span>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={rep.enabled}
              disabled={!settings.enabled}
              onChange={(e) => patchRep({ enabled: e.target.checked })}
            />
            Report phrases reused from earlier replies
          </label>
          <p className="hint">
            Separate from the rules below because it compares the reply against earlier ones rather
            than matching anything in it.
          </p>
          <div className="secondPassNumbers">
            <label className="secondPassNumber">
              Phrase length
              <input
                className="secondPassNumberInput"
                type="number"
                min={2}
                max={12}
                value={rep.phrase}
                disabled={!settings.enabled || !rep.enabled}
                onChange={(e) => patchRep({ phrase: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Earlier replies using it
              <input
                className="secondPassNumberInput"
                type="number"
                min={1}
                max={20}
                value={rep.repeats}
                disabled={!settings.enabled || !rep.enabled}
                onChange={(e) => patchRep({ repeats: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Replies to look back over
              <input
                className="secondPassNumberInput"
                type="number"
                min={1}
                max={40}
                value={rep.lookback}
                disabled={!settings.enabled || !rep.enabled}
                onChange={(e) => patchRep({ lookback: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      </section>

      <TextRulesPanel />
      <GrammarHammerPanel />
    </div>
  )
}

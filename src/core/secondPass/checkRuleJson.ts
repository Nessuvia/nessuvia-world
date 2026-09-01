import assert from 'node:assert'
import { exportRules, parseRules } from './ruleJson.ts'
import { defaultSecondPassRules } from './defaultRules.ts'

// Round trip. Ids are reissued on the way in, everything else survives.
const shipped = defaultSecondPassRules()
const back = parseRules(exportRules(shipped))
assert.equal(back.length, shipped.length)
assert.deepEqual(
  back.map((r) => ({ ...r, id: '' })),
  shipped.map((r) => ({ ...r, id: '', label: r.label || undefined })),
)
assert.ok(back.every((r, i) => r.id !== shipped[i].id))

// A bare array and a single object are both accepted.
assert.equal(parseRules('[{"note":"a"},{"note":"b"}]').length, 2)
assert.equal(parseRules('{"note":"just the one"}').length, 1)

// Defaults fill in for everything the file left out.
const [d] = parseRules('{"note":"n"}')
assert.equal(d.enabled, true)
assert.equal(d.regex, false)
assert.equal(d.caseSensitive, false)
assert.equal(d.scope, 'assistant')
assert.equal(d.label, undefined)

// A scope that is not one of the three falls back rather than reaching the store.
assert.equal(parseRules('{"note":"n","scope":"nonsense"}')[0].scope, 'assistant')
assert.equal(parseRules('{"note":"n","scope":"both"}')[0].scope, 'both')

// Rejections, each with the position in the message.
assert.throws(() => parseRules('not json'), /Not JSON/)
assert.throws(() => parseRules('[{"note":"ok"},{"find":"","note":"  "}]'), /Rule 2/)
assert.throws(() => parseRules('[{"find":"([a","regex":true,"note":"n"}]'), /bad regex/)
assert.throws(() => parseRules('[{"note":"ok"},"nope"]'), /Rule 2 is not an object/)
assert.throws(() => parseRules('[]'), /No rules/)

// An unescaped bracket is only a problem when the rule says regex.
assert.equal(parseRules('[{"find":"([a","note":"n"}]')[0].find, '([a')

console.log('checkRuleJson ok')

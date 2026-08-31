// Run: node --experimental-strip-types src/core/secondPass/checkDefaultRules.ts
import assert from 'node:assert/strict'
import { defaultBundle, defaultSecondPassRules, restoreBundle, staleBundledRules } from './defaultRules.ts'
import { compileRule, findTextMatches, standingNotes } from './textRules.ts'

const rules = defaultSecondPassRules()

// --- the bundle is well-formed --------------------------------------------
{
  assert.equal(rules.length, 25, `expected 25 bundled rules, got ${rules.length}`)

  const ids = new Set(rules.map((r) => r.id))
  assert.equal(ids.size, rules.length, 'duplicate id in the bundle')

  for (const r of rules) {
    assert.ok(r.enabled, `${r.id} should ship enabled`)
    assert.ok(r.label?.trim(), `${r.id} needs a label for its card`)
    assert.ok(r.note.trim(), `${r.id} needs a note: it is what the model actually reads`)
    assert.equal(r.scope, 'assistant', `${r.id} should apply to model output`)
  }

  // Sixteen match and nine always apply. The split is the point of the bundle: a matched rule is
  // free on a clean reply, so leaning on standing rules costs tokens on every single request.
  const matched = rules.filter((r) => r.find)
  assert.equal(matched.length, 16, `expected 16 matching rules, got ${matched.length}`)
  assert.equal(rules.length - matched.length, 9)
}

// --- every bundled pattern compiles ---------------------------------------
{
  // A rule whose regex does not compile is skipped silently at send time, so it would ship dead
  // with nothing to show for it.
  for (const r of rules.filter((x) => x.find)) {
    assert.ok(r.regex, `${r.id} has a find, so it should be a regex rule`)
    assert.ok(compileRule(r) !== null, `${r.id} has a pattern that does not compile: ${r.find}`)
  }
}

// --- the matching rules actually match ------------------------------------
{
  // One sample per rule that should trip it. Guards against a pattern that compiles and never fires,
  // which is the failure a syntax check cannot see.
  const samples: Record<string, string> = {
    'default:ai-vocabulary': 'We delve into the rich tapestry of it.',
    'default:verb-inflation': 'We utilize it prior to launch.',
    'default:copula-avoidance': 'The library serves as an alternative.',
    'default:negative-parallelism': 'It is not just fast, but cheap.',
    'default:puffed-significance': 'It plays a crucial role here.',
    'default:participle-commentary': 'They shipped it, highlighting their commitment.',
    'default:vague-attribution': 'Experts say it works.',
    'default:empty-openers': "In today's fast-paced world, things change.",
    'default:pseudo-wisdom': 'Context is everything.',
    'default:transition-stacking': 'Furthermore, the API supports batching.',
    'default:em-dash': 'She paused — then left.',
    'default:curly-quotes': 'He said “hello” to her.',
    'default:hedging': 'It could be argued that this helps.',
    'default:assistant-scaffolding': 'Certainly! Here is the answer.',
    'default:model-artifacts': 'See contentReference for details.',
    'default:canned-summaries': 'In conclusion, it went well.',
  }

  for (const rule of rules.filter((r) => r.find)) {
    const sample = samples[rule.id]
    assert.ok(sample, `no sample for ${rule.id}`)
    const hits = findTextMatches(sample, [rule], 'assistant')
    assert.ok(hits.length > 0, `${rule.id} did not match its own sample: ${sample}`)
    // The note the author wrote is what reaches the model, not the generated fallback.
    assert.equal(hits[0].message, rule.note)
  }

  // And they stay quiet on prose that does none of it.
  const clean = 'She put the cup down and asked him what he wanted.'
  assert.equal(findTextMatches(clean, rules, 'assistant').length, 0, 'a clean sentence tripped a rule')
}

// --- ids are stable, which is what makes "Add default rules" restore -------
{
  // Called twice, the same rules come back with the same ids. Generated ids would make the button
  // duplicate the bundle instead of filling the gaps in it.
  const again = defaultSecondPassRules()
  assert.deepEqual(again.map((r) => r.id), rules.map((r) => r.id))
  // Namespaced, so a user's own rule can never collide with one and block its restore.
  for (const r of rules) assert.ok(r.id.startsWith('default:'), r.id)
}

// --- restoring only fills the gaps ----------------------------------------
{
  const kept = rules.filter((r) => r.id !== 'default:em-dash')
  const edited = kept.map((r) =>
    r.id === 'default:hedging' ? { ...r, note: 'my own wording' } : r,
  )
  const restored = restoreBundle(edited)
  assert.equal(restored.length, rules.length)
  assert.equal(new Set(restored.map((r) => r.id)).size, rules.length, 'restore duplicated a rule')
  assert.ok(restored.some((r) => r.id === 'default:em-dash'), 'the deleted rule should come back')
  // An edited rule keeps the user's wording rather than being overwritten by the bundle.
  assert.equal(restored.find((r) => r.id === 'default:hedging')!.note, 'my own wording')

  // Idempotent: a second press adds nothing, and returns the same array rather than a copy.
  assert.equal(restoreBundle(restored), restored)
  assert.equal(restoreBundle(rules).length, rules.length)

  // A user's own rules are never touched.
  const mine = [{ ...rules[0], id: 'mine', find: 'zzz', note: 'my rule' }]
  const withMine = restoreBundle(mine)
  assert.equal(withMine.length, rules.length + 1)
  assert.ok(withMine.some((r) => r.id === 'mine'))
}

// --- restoring across a bundle change never stacks a second copy -----------
{
  // The case ids alone cannot see: a row that says exactly what a bundled rule says, carrying a
  // different id because it came from an older bundle or from the Copy button. Matching on content
  // as well is what stops a restore adding a duplicate of it.
  const older = rules.map((r) => ({ ...r, id: `legacy:${r.id.slice('default:'.length)}` }))
  const restored = restoreBundle(older)
  assert.equal(restored.length, older.length, 'content-identical rows should not be re-added')

  // Change the wording of one and it is no longer the same rule, so the bundled version comes back
  // alongside it. That is the honest answer: two rules that say different things are two rules.
  const reworded = older.map((r) =>
    r.id === 'legacy:em-dash' ? { ...r, note: 'something else entirely' } : r,
  )
  assert.equal(restoreBundle(reworded).length, older.length + 1)

  // Whitespace is not a difference.
  const padded = older.map((r) => ({ ...r, note: `  ${r.note}  ` }))
  assert.equal(restoreBundle(padded).length, padded.length)
}

// --- rows from a bundle this build no longer ships -------------------------
{
  assert.equal(staleBundledRules(rules).length, 0, 'the current bundle is not stale')
  // A leftover from the fiction bundle that shipped before this one.
  const fiction = { ...rules[0], id: 'default:no-emotion-labels', find: '', note: 'No emotion labels.' }
  const mixed = [...rules, fiction]
  assert.equal(staleBundledRules(mixed).length, 1)
  assert.equal(staleBundledRules(mixed)[0].id, 'default:no-emotion-labels')
  // A restore leaves it alone: it is not a duplicate of anything currently shipped.
  assert.equal(restoreBundle(mixed).length, mixed.length)
  // A user's own rule is never stale, whatever it says.
  assert.equal(staleBundledRules([{ ...rules[0], id: 'mine' }]).length, 0)
}

// --- the bundle covers the built-in checks too ------------------------------
{
  // "All of these should be bundled": the two checks are settings rather than rules, but they are
  // part of the shipped state, so one restore has to put them back as well.
  const bundle = defaultBundle()
  assert.equal(bundle.rules.length, rules.length)
  assert.ok(bundle.repetition.enabled)
  assert.ok(bundle.sprawl.enabled)
  assert.equal(bundle.sprawl.maxCommas, 4)
  assert.equal(bundle.repetition.phrase, 4)
}

// --- the standing half reaches the model on every pass ---------------------
{
  const notes = standingNotes(rules, 'assistant')
  assert.equal(notes.length, 9, 'only the find-less rules should apply unconditionally')
  for (const n of notes) assert.equal(n.span, undefined)
  // Disabling one drops it and leaves the others.
  const first = rules.findIndex((r) => !r.find)
  const off = standingNotes(rules.map((r, i) => (i === first ? { ...r, enabled: false } : r)), 'assistant')
  assert.equal(off.length, 8)
}

console.log('checkDefaultRules OK')

// Run: node --experimental-strip-types src/core/params/checkParamDef.ts
import assert from 'node:assert'
import type { Connection } from '../stores/settingsStore'
import type { ParamDef } from './paramDef.ts'
import { coerceValue, defFromSnippet, inferKind, labelFromKey } from './paramDef.ts'
import { builtinParamDefs, recommendedKeys } from './builtins.ts'
import { availableDefs, budgetOf, maxTokensOf, recommendedParams, withParam, withoutParam } from './connectionParams.ts'

const defs = builtinParamDefs()
const find = (key: string) => defs.find((d) => d.key === key)!

// --- the pasted snippet decides the shape --------------------------------
{
  assert.strictEqual(inferKind(0.8).kind, 'number')
  assert.strictEqual(inferKind(true).kind, 'bool')
  assert.strictEqual(inferKind(['a', 'b']).kind, 'stringList')
  assert.strictEqual(inferKind({ nested: 1 }).kind, 'json')
  assert.strictEqual(inferKind('text').kind, 'text')

  const def = defFromSnippet('{ "dry_multiplier": 0.8 }')!
  assert.strictEqual(def.key, 'dry_multiplier')
  assert.strictEqual(def.label, 'Dry multiplier')
  assert.strictEqual(def.kind, 'number')
  assert.strictEqual(def.default, 0.8)
  assert.deepStrictEqual(def.appliesTo, ['chat', 'text'])

  // Only the first key is read: the modal makes one element at a time.
  assert.strictEqual(defFromSnippet('{"a":1,"b":2}')!.key, 'a')

  // Anything that isn't a JSON object is refused rather than guessed at.
  assert.strictEqual(defFromSnippet('not json'), null)
  assert.strictEqual(defFromSnippet('[1,2]'), null)
  assert.strictEqual(defFromSnippet('{}'), null)
  assert.strictEqual(defFromSnippet('"a string"'), null)
  assert.strictEqual(defFromSnippet('null'), null)

  assert.strictEqual(labelFromKey('xtc_probability'), 'Xtc probability')
  assert.strictEqual(labelFromKey(''), '')
}

// --- coerceValue: undefined means "leave the key out of the body" --------
{
  assert.strictEqual(coerceValue(find('temperature'), '0.7'), 0.7)
  assert.strictEqual(coerceValue(find('temperature'), 'abc'), undefined)
  assert.strictEqual(coerceValue(find('max_tokens'), 512), 512)
  assert.strictEqual(coerceValue(find('temperature'), 0), 0) // zero is a value, not a blank

  assert.deepStrictEqual(coerceValue(find('stop'), ['###', '']), ['###'])
  assert.deepStrictEqual(coerceValue(find('stop'), 'a, b'), ['a', 'b'])
  assert.strictEqual(coerceValue(find('stop'), []), undefined)
  assert.strictEqual(coerceValue(find('stop'), ''), undefined)

  const json: ParamDef = { ownerId: 'local', key: 'j', label: 'J', kind: 'json', default: '', appliesTo: ['chat'] }
  assert.deepStrictEqual(coerceValue(json, '{"a":1}'), { a: 1 })
  assert.strictEqual(coerceValue(json, '  '), undefined)
  assert.strictEqual(coerceValue(json, '{"broken"'), undefined) // never sends half a body

  const bool: ParamDef = { ownerId: 'local', key: 'b', label: 'B', kind: 'bool', default: false, appliesTo: ['chat'] }
  assert.strictEqual(coerceValue(bool, false), false)
  assert.strictEqual(coerceValue(bool, 'yes'), true)
}

// --- the library is coherent ---------------------------------------------
{
  const keys = defs.map((d) => d.key)
  assert.strictEqual(new Set(keys).size, keys.length, 'two builtins share a key')
  for (const def of defs) {
    assert.ok(def.appliesTo.length, `${def.key} applies to nothing`)
    assert.ok(def.builtin, `${def.key} is not marked builtin`)
    // A list default is legitimately empty — the param is added but nothing is filled in yet, and
    // an empty list means "don't send the key". Every other kind has to produce a real value.
    if (def.kind !== 'stringList') {
      assert.notStrictEqual(coerceValue(def, def.default), undefined, `${def.key} default is unsendable`)
    }
  }
  // Everything a recommended set names has to exist, or the button silently does less.
  for (const type of ['chat', 'text'] as const) {
    for (const key of recommendedKeys[type]) {
      const def = defs.find((d) => d.key === key)
      assert.ok(def, `recommended ${key} is not in the library`)
      assert.ok(def.appliesTo.includes(type), `recommended ${key} does not apply to ${type}`)
    }
  }
}

// --- connection helpers ---------------------------------------------------
{
  const connection: Connection = {
    id: 'c1', name: 'n', type: 'chat', endpointUrl: '', apiKey: '', model: 'm',
    params: [{ key: 'temperature', value: 0.7 }],
    contextLimit: 8192, safetyMarginPct: 5,
  }

  // max_tokens absent falls back rather than sending NaN into the budget.
  assert.strictEqual(maxTokensOf(connection), 512)
  assert.strictEqual(maxTokensOf(withParam(connection, 'max_tokens', 2000)), 2000)
  assert.strictEqual(maxTokensOf(withParam(connection, 'max_tokens', 'nope')), 512)

  // withParam appends when absent, replaces in place when present, and never mutates.
  const added = withParam(connection, 'top_p', 0.9)
  assert.strictEqual(added.params.length, 2)
  assert.strictEqual(withParam(added, 'top_p', 0.5).params.length, 2)
  assert.strictEqual(connection.params.length, 1)
  assert.strictEqual(withoutParam(added, 'top_p').params.length, 1)

  assert.deepStrictEqual(budgetOf(connection), { contextLimit: 8192, safetyMarginPct: 5, maxTokens: 512 })
  assert.strictEqual(budgetOf(undefined), undefined)

  // Recommended keeps what the user already set and adds the rest at their defaults.
  const recommended = recommendedParams(connection, defs)
  assert.strictEqual(recommended.find((p) => p.key === 'temperature')!.value, 0.7)
  for (const key of recommendedKeys.chat) {
    assert.ok(recommended.some((p) => p.key === key), `recommended missed ${key}`)
  }

  // The library offers only defs of the right type that aren't already on the connection.
  const library = availableDefs({ ...connection, params: recommended }, defs)
  assert.ok(!library.some((d) => recommended.some((p) => p.key === d.key)))
  assert.ok(library.every((d) => d.appliesTo.includes('chat')))
  assert.ok(!availableDefs(connection, defs).some((d) => d.key === 'repetition_penalty')) // text-only
  assert.ok(availableDefs({ ...connection, type: 'text' }, defs).some((d) => d.key === 'repetition_penalty'))
}

console.log('ok')

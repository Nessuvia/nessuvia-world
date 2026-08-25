// Run: node --experimental-strip-types src/core/connectors/checkModelQuery.ts
import assert from 'node:assert'
import { parseModelQuery, modelsUrl } from './listModels.ts'

// detailed=true always present; blank input adds nothing else.
assert.strictEqual(parseModelQuery('').toString(), 'detailed=true')
assert.strictEqual(parseModelQuery(undefined).toString(), 'detailed=true')

// pairs parsed, whitespace trimmed, value may hold colons.
const p = parseModelQuery(' model_scope:subscription, newest:true ')
assert.strictEqual(p.get('model_scope'), 'subscription')
assert.strictEqual(p.get('newest'), 'true')

// malformed pairs (no colon, empty key) are skipped.
const q = parseModelQuery('garbage, :novalue, ok:1')
assert.strictEqual(q.get('ok'), '1')
assert.strictEqual([...q.keys()].sort().join(','), 'detailed,ok')

// modelsUrl: same base path as chat, detailed always on.
assert.strictEqual(
  modelsUrl('https://nano-gpt.com/api/v1', undefined),
  'https://nano-gpt.com/api/v1/models?detailed=true',
)
// scope rewrites the path (subscription/paid variants), not the query string.
assert.strictEqual(
  modelsUrl('https://nano-gpt.com/api/v1', 'scope:subscription, sort:mostused'),
  'https://nano-gpt.com/api/subscription/v1/models?detailed=true&sort=mostused',
)

console.log('ok')

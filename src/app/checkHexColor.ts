import assert from 'node:assert'
import { normalizeHex, sanitizeHexText } from './hexColor.ts'

// Typing into the field: junk is dropped, case is normalized, the leading # is not doubled.
assert.strictEqual(sanitizeHexText('aabbcc'), '#AABBCC')
assert.strictEqual(sanitizeHexText('#aabbcc'), '#AABBCC')
assert.strictEqual(sanitizeHexText('##aa bb-cc'), '#AABBCC')
assert.strictEqual(sanitizeHexText('hsl(1,2,3)'), '#123')
assert.strictEqual(sanitizeHexText(''), '')
assert.strictEqual(sanitizeHexText('#'), '')

// Length caps: six digits without alpha, eight with it.
assert.strictEqual(sanitizeHexText('aabbccdd'), '#AABBCC')
assert.strictEqual(sanitizeHexText('aabbccdd', true), '#AABBCCDD')
assert.strictEqual(sanitizeHexText('aabbccddee', true), '#AABBCCDD')

// Complete values.
assert.strictEqual(normalizeHex('#aabbcc'), '#AABBCC')
assert.strictEqual(normalizeHex('abc'), '#AABBCC')
assert.strictEqual(normalizeHex('#abcd', true), '#AABBCCDD')
assert.strictEqual(normalizeHex('#aabbccdd', true), '#AABBCCDD')

// An empty field is the unset value every caller already understands.
assert.strictEqual(normalizeHex(''), '')
assert.strictEqual(normalizeHex('#'), '')

// Half-typed values leave the stored color alone.
assert.strictEqual(normalizeHex('#a'), null)
assert.strictEqual(normalizeHex('#ab'), null)
assert.strictEqual(normalizeHex('#abcd'), null)
assert.strictEqual(normalizeHex('#abcde'), null)
assert.strictEqual(normalizeHex('#abcdef0', true), null)

// Alpha pasted into a field that has nowhere to keep it drops to the opaque color.
assert.strictEqual(normalizeHex('#aabbccdd'), '#AABBCC')

// Nothing ever comes back as something CSS can't take.
for (const raw of ['#a', 'zzz', '#abcdef', 'abcd', '#aabbccddee']) {
  for (const alpha of [false, true]) {
    const out = normalizeHex(raw, alpha)
    assert.ok(out === null || out === '' || /^#([0-9A-F]{6}|[0-9A-F]{8})$/.test(out), raw)
  }
}

console.log('checkHexColor: ok')

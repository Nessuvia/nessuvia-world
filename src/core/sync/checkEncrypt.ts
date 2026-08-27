import assert from 'node:assert'
import { decryptText, encryptText, isEncrypted } from './encrypt.ts'

const secret = JSON.stringify({ state: { connections: [{ apiKey: 'topsecret' }] } })

const cipher = await encryptText(secret, 'correct horse')
assert(isEncrypted(cipher))
// The whole point: the plaintext must not be sitting in what goes to the bucket.
assert(!cipher.includes('topsecret'))
assert.equal(await decryptText(cipher, 'correct horse'), secret)

// A wrong passphrase fails loudly rather than returning garbage.
await assert.rejects(() => decryptText(cipher, 'wrong horse'), /Wrong passphrase/)

// Salt and IV are per write, so the same input twice is not the same ciphertext.
assert.notEqual(await encryptText(secret, 'correct horse'), cipher)

// Plain settings written before encryption was turned on still read as plain.
assert.equal(isEncrypted(secret), false)
assert.equal(isEncrypted('not json'), false)
await assert.rejects(() => decryptText(secret, 'correct horse'), /not written by this app/)

console.log('checkEncrypt ok')

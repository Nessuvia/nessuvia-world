// Run: node --experimental-strip-types src/core/multiplayer/checkRelayConfig.ts
import assert from 'node:assert'
import {
  emptyRelayConfig,
  inviteLink,
  relayConfigured,
  relayFromLink,
  relayHost,
  validRelayUrl,
} from './relayConfig.ts'

// --- validRelayUrl --------------------------------------------------------

assert.equal(validRelayUrl('wss://relay.example.net/connection/websocket'), true)
assert.equal(validRelayUrl('wss://relay.example.net'), true)
// Plaintext is refused rather than left to fail as mixed content in the browser.
assert.equal(validRelayUrl('ws://localhost:8000/connection/websocket'), false)
assert.equal(validRelayUrl('https://relay.example.net'), false)
assert.equal(validRelayUrl('relay.example.net'), false)
assert.equal(validRelayUrl(''), false)
// Anything at all can arrive on the `r` parameter, and none of it may throw.
assert.equal(validRelayUrl('javascript:alert(1)'), false)
assert.equal(validRelayUrl('wss://'), false)

// --- relayConfigured ------------------------------------------------------

// Supabase depends on the build's env values, which the caller supplies.
assert.equal(relayConfigured({ kind: 'supabase', url: '' }, true), true)
assert.equal(relayConfigured({ kind: 'supabase', url: '' }, false), false)
// A self-hosted relay is configured by its URL alone, with or without Supabase in the build.
assert.equal(relayConfigured({ kind: 'centrifugo', url: 'wss://r.example.net' }, false), true)
assert.equal(relayConfigured({ kind: 'centrifugo', url: '' }, true), false)

// --- relayHost ------------------------------------------------------------

assert.equal(relayHost({ kind: 'centrifugo', url: 'wss://r.example.net:8443/ws' }), 'r.example.net:8443')
assert.equal(relayHost({ kind: 'supabase', url: '' }), '')
assert.equal(relayHost({ kind: 'centrifugo', url: 'nonsense' }), '')

// --- the invite link round trip -------------------------------------------

const origin = 'https://xenia.nessuvia.com'

// A Supabase session's link is the bare path it has always been: no parameter, nothing to parse.
assert.equal(inviteLink(origin, 'abc123', emptyRelayConfig), `${origin}/join/abc123`)
assert.deepEqual(relayFromLink(null), emptyRelayConfig)

const selfHosted = { kind: 'centrifugo' as const, url: 'wss://r.example.net/connection/websocket' }
const link = inviteLink(origin, 'abc123', selfHosted)
assert.equal(
  link,
  `${origin}/join/abc123?r=wss%3A%2F%2Fr.example.net%2Fconnection%2Fwebsocket`,
)
// What the browser hands JoinView is the decoded parameter, so read it back the same way.
assert.deepEqual(relayFromLink(new URL(link).searchParams.get('r')), selfHosted)

// A URL with a query of its own survives the round trip rather than truncating the link.
const withQuery = { kind: 'centrifugo' as const, url: 'wss://r.example.net/ws?x=1&y=2' }
const queryLink = inviteLink(origin, 'abc123', withQuery)
assert.deepEqual(relayFromLink(new URL(queryLink).searchParams.get('r')), withQuery)

// An `r` that is not a usable relay is undefined: the guest is told the link is bad rather than
// pointed at whatever it said.
assert.equal(relayFromLink('ws://localhost:8000'), undefined)
assert.equal(relayFromLink('http://evil.example/'), undefined)

console.log('checkRelayConfig ok')

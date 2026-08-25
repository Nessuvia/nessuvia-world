// Run: node --experimental-strip-types src/modules/chat/checkFormatStamp.ts
import assert from 'node:assert'
import { formatStamp } from './formatStamp.ts'

// Local time in, local time out — construct with local-time components.
assert.strictEqual(formatStamp(new Date(2026, 7, 10, 14, 5).getTime()), '08/10/2026 14:05')
assert.strictEqual(formatStamp(new Date(2026, 0, 1, 0, 0).getTime()), '01/01/2026 00:00')
assert.strictEqual(formatStamp(new Date(1999, 11, 31, 23, 59).getTime()), '12/31/1999 23:59')

console.log('formatStamp ok')

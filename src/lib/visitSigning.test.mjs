import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { canonicalPayload, signPayload } from './visitSigning.js'

// The server (api/agent/[action].js) signs with Node's createHmac over the same string.
test('browser signature equals the server signature for the same visit', async () => {
  const fields = { session_id: 's1', latitude: 5.0123456, longitude: 7.9, gps_accuracy_m: 12.4, monotonic_elapsed_ms: 5000.6, is_mock_location: false, platform: 'web', photos: ['b', 'a'] }
  const payload = canonicalPayload(fields)
  assert.equal(payload, 's1|5.0123456|7.9000000|12|5001|false|web|a,b')
  const key = 'abc123'
  const server = crypto.createHmac('sha256', key).update(payload).digest('hex')
  assert.equal(await signPayload(key, payload), server)
})

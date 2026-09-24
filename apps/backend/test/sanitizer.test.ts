import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sanitizeExecution, sanitizeWorkflow } from '../src/sanitizer.js'

test('sanitizer redacts nested execution content and is deterministic', () => {
  const raw = {
    status: 'success',
    data: { headers: { authorization: 'Bearer secret' }, body: { email: 'person@example.test' } },
    binary: Buffer.from('private bytes'),
  }
  const first = sanitizeExecution(raw)
  const second = sanitizeExecution(raw)
  assert.equal(first.privacyMode, 'sanitized_only')
  assert.equal(first.sanitizerVersion, '1')
  assert.equal(first.digest, second.digest)
  assert.doesNotMatch(JSON.stringify(first.value), /secret|person@example|private bytes/)
})

test('workflow sanitizer retains node type structure but not node parameter values', () => {
  const result = sanitizeWorkflow({
    nodes: [{ type: 'n8n-nodes-base.webhook', typeVersion: 2, parameters: { path: 'customer-name', token: 'abc' } }],
  })
  const serialized = JSON.stringify(result.value)
  assert.match(serialized, /n8n-nodes-base\.webhook/)
  assert.doesNotMatch(serialized, /customer-name|abc/)
})

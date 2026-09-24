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
  assert.equal(first.sanitizerVersion, '2')
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

test('untrusted keys and scalar names cannot carry execution personal data', () => {
  const result = sanitizeExecution({
    status: 'success',
    data: { json: { 'jane@example.test': 'value', type: 'jane@example.test', status: 42, 'person-phone': { mode: 'jane@example.test' } } },
  })
  assert.equal((result.value as { status: string }).status, 'success')
  assert.doesNotMatch(JSON.stringify(result.value), /jane@example\.test|person-phone|value|42/)
})

test('workflow parameter subtrees cannot reuse safe node metadata fields', () => {
  const result = sanitizeWorkflow({
    nodes: [{ type: 'n8n-nodes-base.webhook', typeVersion: 2, parameters: {
      type: 'jane@example.test', active: true, data: { typeVersion: 42, 'jane@example.test': 'private' },
    } }],
  })
  const nodes = (result.value as { nodes: Array<{ type: string; typeVersion: number }> }).nodes
  assert.equal(nodes[0]?.type, 'n8n-nodes-base.webhook')
  assert.equal(nodes[0]?.typeVersion, 2)
  assert.doesNotMatch(JSON.stringify(result.value), /jane@example\.test|private|42|true/)
})

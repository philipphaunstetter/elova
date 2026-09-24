import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeProviderOrigin } from '../src/provider-url.js'

test('n8n provider origins are limited to Tailnet identities', () => {
  for (const origin of [
    'http://100.64.0.1:5678',
    'http://100.127.255.254:5678',
    'http://gx10.client.example.ts.net:5678',
    'http://[fd7a:115c:a1e0::1]:5678',
  ]) {
    assert.equal(normalizeProviderOrigin(origin, false), new URL(origin).origin)
  }
  for (const origin of [
    'https://gx10.client.example.ts.net:5678',
    'http://10.0.0.2:5678',
    'http://api.example.com:5678',
    'http://gx10:5678',
    'http://127.0.0.1:5678',
    'http://100.100.10.20:5678/path',
  ]) {
    assert.throws(() => normalizeProviderOrigin(origin, false), /Provider URL/)
  }
})

test('development loopback is explicit and does not accept lookalike hostnames', () => {
  assert.equal(normalizeProviderOrigin('http://127.0.0.1:5678', true), 'http://127.0.0.1:5678')
  assert.throws(() => normalizeProviderOrigin('http://127.attacker.example:5678', true), /Tailnet/)
})

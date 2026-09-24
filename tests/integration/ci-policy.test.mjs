import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflowUrl = new URL('../../.github/workflows/ci.yml', import.meta.url)
const workflow = await readFile(workflowUrl, 'utf8')

function extractRunBlocks(source) {
  const lines = source.split('\n')
  const blocks = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[index])
    if (!match) continue

    const indentation = match[1].length
    const firstLine = match[2]
    const block = [firstLine]
    while (index + 1 < lines.length) {
      const next = lines[index + 1]
      if (next.trim() && next.length - next.trimStart().length <= indentation)
        break
      block.push(next.trim())
      index += 1
    }
    blocks.push(block.join('\n'))
  }

  return blocks
}

test('candidate workflow cannot build, log in to, or publish container images', () => {
  assert.doesNotMatch(
    workflow,
    /(?:docker|podman|buildah|nerdctl)\/(?:build|login|metadata)/i,
  )
  assert.doesNotMatch(workflow, /build-push-action|kaniko|packages:\s*write/i)

  for (const command of extractRunBlocks(workflow)) {
    assert.doesNotMatch(
      command,
      /(?:^|[;&|\s])(?:docker|podman|buildah|nerdctl)(?:\s|$)|(?:^|\s)(?:npm\s+)?publish(?:\s|$)/i,
    )
  }
})

test('candidate workflow has no application credentials or live integration targets', () => {
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i)
  assert.doesNotMatch(workflow, /dockerhub|newflowio|n8n|tailnet|gx10/i)
  assert.doesNotMatch(workflow, /https?:\/\/(?!10\.255\.255\.1|127\.0\.0\.1)/i)
})

test('only an ephemeral PostgreSQL service image is declared', () => {
  const images = [...workflow.matchAll(/^\s+image:\s*(\S+)\s*$/gm)].map(
    (match) => match[1],
  )
  assert.deepEqual(images, ['postgres:16-alpine'])
  assert.match(workflow, /^\s+services:\s*$/m)
  assert.match(
    workflow,
    /postgresql:\/\/elova_test:elova_test_password@127\.0\.0\.1:5432\/elova_test/,
  )
})

test('required independent and integration evidence is present', () => {
  for (const job of [
    'frontend-quality:',
    'backend-quality:',
    'contract-drift:',
    'postgres-integration:',
    'security:',
  ]) {
    assert.match(workflow, new RegExp(`^  ${job.replace(':', '\\:')}`, 'm'))
  }

  for (const evidence of [
    'Lint frontend independently',
    'Type-check frontend independently',
    'Run frontend unit tests independently',
    'Build frontend native artifact independently',
    'Lint backend independently',
    'Type-check backend independently',
    'Run backend unit tests independently',
    'Build backend native artifact independently',
    'Reject generated contract or client drift',
    'Verify baseline migration and advisory locking',
    'Verify startup, readiness, BFF failures, leakage, and shutdown',
    'Scan production dependencies',
    'Scan tracked files for committed secrets',
  ]) {
    assert.ok(
      workflow.includes(evidence),
      `missing workflow evidence: ${evidence}`,
    )
  }
})

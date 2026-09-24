import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { load } from 'js-yaml'

const workflowUrl = new URL('../../.github/workflows/ci.yml', import.meta.url)
const parsed = load(await readFile(workflowUrl, 'utf8'))

function record(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value
}

const workflow = record(parsed, 'workflow')
const jobs = record(workflow.jobs, 'workflow jobs')
for (const [jobName, value] of Object.entries(jobs)) {
  const job = record(value, `job ${jobName}`)
  assert.equal(job['runs-on'], 'ubuntu-latest')
  assert.ok(Array.isArray(job.steps), `job ${jobName} must define steps`)
  for (const stepValue of job.steps) {
    const step = record(stepValue, `step in ${jobName}`)
    assert.equal(typeof step.run === 'string' || typeof step.uses === 'string', true)
  }
}

function runCommands(jobName) {
  return jobs[jobName].steps.flatMap((step) =>
    typeof step.run === 'string' ? [step.run] : [],
  )
}

function usedActions(jobName) {
  return jobs[jobName].steps.flatMap((step) =>
    typeof step.uses === 'string' ? [step.uses] : [],
  )
}

function hasCommand(jobName, fragment) {
  return runCommands(jobName).some((command) => command.includes(fragment))
}

function valuesBelow(value) {
  if (Array.isArray(value)) return value.flatMap(valuesBelow)
  if (value && typeof value === 'object') return Object.values(value).flatMap(valuesBelow)
  return [value]
}

test('workflow model exposes only the native CI jobs and read permission', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch'])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(Object.keys(jobs).sort(), [
    'backend-quality',
    'contract-drift',
    'frontend-quality',
    'native-operations',
    'postgres-integration',
    'security',
    'workflow-policy',
  ])

  for (const job of Object.values(jobs)) {
    assert.equal(job.container, undefined)
    assert.notEqual(job.permissions?.packages, 'write')
  }
})

test('normalized actions and commands have no image publication path', () => {
  const actions = Object.keys(jobs).flatMap(usedActions)
  for (const action of actions) {
    assert.doesNotMatch(action, /(?:docker|podman|buildah|nerdctl)\/(?:build|login|metadata)/i)
    assert.doesNotMatch(action, /build-push-action|kaniko/i)
  }

  const commands = Object.keys(jobs).flatMap(runCommands)
  for (const command of commands) {
    assert.doesNotMatch(
      command,
      /(?:^|[;&|\s])(?:docker|podman|buildah|nerdctl)(?:\s|$)|(?:^|\s)(?:npm\s+)?publish(?:\s|$)/i,
    )
  }
})

test('normalized workflow contains no live credentials or integration targets', () => {
  const scalarValues = valuesBelow(workflow).filter((value) => typeof value === 'string')
  for (const value of scalarValues) {
    assert.doesNotMatch(value, /\$\{\{\s*secrets\./i)
  }

  const backendUrls = scalarValues.filter((value) => value.startsWith('http://'))
  assert.deepEqual([...new Set(backendUrls)], ['http://100.100.10.20:3001'])
  assert.deepEqual(jobs['postgres-integration'].services.postgres.env, {
    POSTGRES_USER: 'elova_test',
    POSTGRES_PASSWORD: 'elova_test_password',
    POSTGRES_DB: 'elova_test',
  })
})

test('only the integration job declares an ephemeral PostgreSQL service', () => {
  const declaredServices = Object.entries(jobs).flatMap(([jobName, job]) =>
    Object.entries(job.services ?? {}).map(([serviceName, service]) => ({
      jobName,
      serviceName,
      image: service.image,
    })),
  )
  assert.deepEqual(declaredServices, [{
    jobName: 'postgres-integration',
    serviceName: 'postgres',
    image: 'postgres:16-alpine',
  }])
})

test('jobs execute independent quality, integration, and security evidence', () => {
  assert.equal(hasCommand('frontend-quality', 'eslint -- apps/frontend'), true)
  assert.equal(hasCommand('frontend-quality', 'tsc -- --noEmit -p apps/frontend/tsconfig.json'), true)
  assert.equal(hasCommand('frontend-quality', 'npm test --workspace @elova/frontend'), true)
  assert.equal(hasCommand('frontend-quality', 'npm run build --workspace @elova/frontend'), true)

  assert.equal(hasCommand('backend-quality', 'eslint -- apps/backend/src apps/backend/test'), true)
  assert.equal(hasCommand('backend-quality', 'tsc -- --noEmit -p apps/backend/tsconfig.json'), true)
  assert.equal(hasCommand('backend-quality', 'npm test --workspace @elova/backend'), true)
  assert.equal(hasCommand('backend-quality', 'npm run build --workspace @elova/backend'), true)

  assert.equal(hasCommand('contract-drift', 'tests/integration/contract.test.mjs'), true)
  assert.equal(hasCommand('contract-drift', 'git diff --exit-code -- packages/api-contract'), true)
  assert.equal(hasCommand('native-operations', 'ops/tests/test-native-release.sh'), true)
  assert.equal(hasCommand('postgres-integration', 'tests/integration/postgres.test.mjs'), true)
  assert.equal(hasCommand('postgres-integration', 'tests/integration/native-services.test.mjs'), true)
  assert.deepEqual(jobs['postgres-integration'].needs, [
    'frontend-quality',
    'backend-quality',
    'contract-drift',
    'workflow-policy',
    'native-operations',
  ])

  assert.equal(hasCommand('security', 'npm audit --omit=dev --audit-level=high'), true)
  assert.equal(
    usedActions('security').some((action) => action.startsWith('trufflesecurity/trufflehog@')),
    true,
  )
  assert.equal(
    usedActions('security').some((action) => action.startsWith('actions/dependency-review-action@')),
    true,
  )
})

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { promisify } from 'node:util'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const frontendPort = 43180
const backendPort = 43181
const execFileAsync = promisify(execFile)

async function nativeScriptCommand(packageRoot, scriptName) {
  const metadata = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  )
  const script = metadata.scripts?.[scriptName]
  assert.ok(script, `${metadata.name} must define its native ${scriptName} command`)
  assert.doesNotMatch(
    script,
    /[;&|`$<>]/,
    `${scriptName} command must not require a shell`,
  )
  const [executable, ...args] = script.trim().split(/\s+/)

  if (executable === 'node') return [process.execPath, args]
  throw new Error(
    `unsupported native ${scriptName} executable for ${metadata.name}: ${executable}`,
  )
}

async function extractArtifact(artifactDirectory, service, stagingRoot) {
  const destination = join(stagingRoot, service)
  await mkdir(destination)
  await execFileAsync('tar', [
    '-xzf',
    join(artifactDirectory, `elova-${service}.tgz`),
    '--directory',
    destination,
  ])
  const packageRoot = join(destination, 'package')
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(metadata.name, `@elova/${service}`)
  return packageRoot
}

function managedProcess(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const capture = (chunk) => {
    output = `${output}${chunk}`.slice(-12_000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  return { child, output: () => output }
}

async function expectFailedStartup(process, name) {
  const result = await Promise.race([
    once(process.child, 'exit').then(([code, signal]) => ({ code, signal })),
    delay(5_000).then(() => null),
  ])
  if (!result) {
    process.child.kill('SIGKILL')
    throw new Error(`${name} did not exit after startup failure`)
  }
  assert.equal(result.signal, null, `${name} was killed by ${result.signal}\n${process.output()}`)
  assert.equal(result.code, 1, `${name} did not fail startup\n${process.output()}`)
}

async function stopGracefully(process, name) {
  if (process.child.exitCode !== null || process.child.signalCode !== null)
    return
  process.child.kill('SIGTERM')
  const result = await Promise.race([
    once(process.child, 'exit').then(([code, signal]) => ({ code, signal })),
    delay(10_000).then(() => null),
  ])
  if (!result) {
    process.child.kill('SIGKILL')
    throw new Error(`${name} did not stop within its native shutdown window`)
  }
  assert.equal(
    result.signal,
    null,
    `${name} was killed by ${result.signal}\n${process.output()}`,
  )
  assert.equal(
    result.code,
    name === 'frontend' ? 143 : 0,
    `${name} exited unsuccessfully\n${process.output()}`,
  )
}

async function waitFor(url, expectedStatus, process, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (
      process &&
      (process.child.exitCode !== null || process.child.signalCode !== null)
    ) {
      throw new Error(
        `service exited before ${url} became ready\n${process.output()}`,
      )
    }
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.status === expectedStatus) return response
      lastError = new Error(`received status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(200)
  }
  throw new Error(
    `timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`,
  )
}

async function fixture(name) {
  const path = join(repositoryRoot, 'packages/api-contract/fixtures', name)
  return JSON.parse(await readFile(path, 'utf8'))
}

function serializedResponse(response, body) {
  return JSON.stringify({ headers: Object.fromEntries(response.headers), body })
}

function assertNoPrivateLeak(value, markers) {
  for (const marker of markers) {
    assert.ok(
      !value.toLowerCase().includes(marker.toLowerCase()),
      `private marker leaked: ${marker}`,
    )
  }
  assert.doesNotMatch(
    value,
    /ELOVA_BACKEND_URL|DATABASE_URL|postgres(?:ql)?:\/\//i,
  )
}

async function browserFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await browserFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function inspectBrowserArtifacts(origin, markers, staticRoot) {
  const response = await fetch(origin, { redirect: 'follow' })
  assert.equal(response.status, 200)
  const html = await response.text()
  assertNoPrivateLeak(serializedResponse(response, html), markers)

  const assetPaths = new Set(
    [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith('/_next/static/')),
  )
  assert.ok(
    assetPaths.size > 0,
    'frontend page must expose at least one built browser asset',
  )

  for (const path of assetPaths) {
    const assetResponse = await fetch(new URL(path, origin))
    assert.equal(assetResponse.status, 200, `browser asset is missing: ${path}`)
  }

  const files = await browserFiles(staticRoot)
  assert.ok(files.length > 0, 'frontend build must contain browser artifacts')
  for (const path of files) {
    const data = await readFile(path)
    if (data.includes(0)) continue
    assertNoPrivateLeak(data.toString('utf8'), markers)
  }
}

test('packaged native services honor the contract without exposing their private boundary', async (context) => {
  const artifactDirectory = process.env.ELOVA_NATIVE_ARTIFACT_DIR
  assert.ok(artifactDirectory, 'ELOVA_NATIVE_ARTIFACT_DIR must identify packaged release artifacts')
  const stagingRoot = await mkdtemp(join(tmpdir(), 'elova-native-artifacts-'))
  context.after(() => rm(stagingRoot, { recursive: true, force: true }))
  const backendRoot = await extractArtifact(artifactDirectory, 'backend', stagingRoot)
  const frontendRoot = await extractArtifact(artifactDirectory, 'frontend', stagingRoot)

  const backendHost = '127.0.0.1'
  const backendName = 'gx10.integration-test.ts.net'
  const lookupOverride = join(stagingRoot, 'tailnet-lookup.cjs')
  await writeFile(lookupOverride, `
const dns = require('node:dns')
const originalLookup = dns.lookup
const originalPromiseLookup = dns.promises.lookup
const backendName = ${JSON.stringify(backendName)}
const backendHost = ${JSON.stringify(backendHost)}
dns.lookup = function lookup(hostname, options, callback) {
  if (hostname !== backendName) return originalLookup.call(this, hostname, options, callback)
  if (typeof options === 'function') {
    callback = options
    options = {}
  } else if (typeof options === 'number') {
    options = { family: options }
  } else {
    options ??= {}
  }
  process.nextTick(() => callback(
    null,
    options.all ? [{ address: backendHost, family: 4 }] : backendHost,
    options.all ? undefined : 4,
  ))
}
dns.promises.lookup = async function lookup(hostname, options = {}) {
  if (hostname !== backendName) return originalPromiseLookup.call(this, hostname, options)
  return options.all
    ? [{ address: backendHost, family: 4 }]
    : { address: backendHost, family: 4 }
}
`)
  const backendOrigin = `http://${backendName}:${backendPort}`
  const directBackendOrigin = `http://${backendHost}:${backendPort}`
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`
  const commonEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
  }
  assert.ok(commonEnvironment.DATABASE_URL, 'DATABASE_URL must identify the ephemeral PostgreSQL service')
  const backendEnvironment = {
    ...commonEnvironment,
    ELOVA_BACKEND_HOST: backendHost,
    ELOVA_SESSION_SECRET: Buffer.alloc(32, 17).toString('base64'),
    ELOVA_CREDENTIAL_KEY: Buffer.alloc(32, 23).toString('base64'),
    PORT: String(backendPort),
  }
  const frontendEnvironment = {
    ...commonEnvironment,
    ELOVA_BACKEND_URL: backendOrigin,
    NODE_OPTIONS: [
      commonEnvironment.NODE_OPTIONS,
      `--require=${lookupOverride}`,
    ].filter(Boolean).join(' '),
  }
  // Packaged frontend defaults must be loopback-only on the native port too.
  delete frontendEnvironment.HOSTNAME
  delete frontendEnvironment.PORT

  const [migrationExecutable, migrationArguments] =
    await nativeScriptCommand(backendRoot, 'migrate')
  await execFileAsync(migrationExecutable, migrationArguments, {
    cwd: backendRoot,
    env: backendEnvironment,
  })

  const [backendExecutable, backendArguments] =
    await nativeScriptCommand(backendRoot, 'start')
  const [frontendExecutable, frontendArguments] =
    await nativeScriptCommand(frontendRoot, 'start')

  const occupiedPort = createServer()
  occupiedPort.listen(backendPort, backendHost)
  await once(occupiedPort, 'listening')
  try {
    const blockedBackend = managedProcess(backendExecutable, backendArguments, {
      cwd: backendRoot,
      env: backendEnvironment,
    })
    await expectFailedStartup(blockedBackend, 'backend with occupied port')
  } finally {
    occupiedPort.close()
    await once(occupiedPort, 'close')
  }

  const backend = managedProcess(backendExecutable, backendArguments, {
    cwd: backendRoot,
    env: backendEnvironment,
  })

  const frontend = managedProcess(frontendExecutable, frontendArguments, {
    cwd: frontendRoot,
    env: frontendEnvironment,
  })

  const hangingUpstream = createServer(() => {})
  context.after(async () => {
    if (hangingUpstream.listening) {
      hangingUpstream.closeAllConnections?.()
      hangingUpstream.close()
      await once(hangingUpstream, 'close')
    }
    if (backend.child.exitCode === null && backend.child.signalCode === null)
      backend.child.kill('SIGKILL')
    if (frontend.child.exitCode === null && frontend.child.signalCode === null)
      frontend.child.kill('SIGKILL')
  })

  const live = await waitFor(`${directBackendOrigin}/v1/health/live`, 200, backend)
  assert.equal(live.headers.get('x-elova-api-version'), '1')
  assert.deepEqual(await live.json(), await fixture('liveness.json'))

  const ready = await waitFor(`${directBackendOrigin}/v1/health/ready`, 200, backend)
  assert.equal(ready.headers.get('x-elova-api-version'), '1')
  assert.deepEqual(await ready.json(), await fixture('readiness-ready.json'))
  // A second loopback address models an interface outside the private bind;
  // nothing on the backend port should listen there (or on a wildcard bind).
  await assert.rejects(fetch(`http://127.0.0.2:${backendPort}/v1/health/live`, {
    signal: AbortSignal.timeout(2_000),
  }))

  const proxiedRequestId = `integration-${Date.now()}`
  const proxied = await waitFor(
    `${frontendOrigin}/api/v1/health/live`,
    200,
    frontend,
  )
  await assert.rejects(fetch(`http://127.0.0.2:${frontendPort}/api/v1/health/live`, {
    signal: AbortSignal.timeout(2_000),
  }))
  const correlated = await fetch(`${frontendOrigin}/api/v1/health/live`, {
    cache: 'no-store',
    headers: { 'x-request-id': proxiedRequestId },
  })
  const proxiedText = await correlated.text()
  assert.deepEqual(await proxied.json(), await fixture('liveness.json'))
  assert.deepEqual(JSON.parse(proxiedText), await fixture('liveness.json'))
  assert.equal(correlated.headers.get('x-request-id'), proxiedRequestId)
  assert.equal(correlated.headers.get('x-elova-api-version'), null)

  const leakMarkers = [
    backendOrigin,
    backendHost,
    'elova_test_password',
  ]
  assertNoPrivateLeak(serializedResponse(correlated, proxiedText), leakMarkers)
  await inspectBrowserArtifacts(
    frontendOrigin,
    leakMarkers,
    join(frontendRoot, 'apps/frontend/.next/static'),
  )

  await stopGracefully(backend, 'backend')

  const unavailable = await fetch(
    `${frontendOrigin}/api/v1/health/live?failure=unavailable`,
    {
      cache: 'no-store',
      headers: { 'x-request-id': `unavailable-${Date.now()}` },
    },
  )
  const unavailableText = await unavailable.text()
  assert.equal(unavailable.status, 502)
  assert.deepEqual(
    JSON.parse(unavailableText),
    await fixture('bff-unavailable.json'),
  )
  assertNoPrivateLeak(
    serializedResponse(unavailable, unavailableText),
    leakMarkers,
  )

  hangingUpstream.listen(backendPort, backendHost)
  await once(hangingUpstream, 'listening')

  const timeout = await fetch(
    `${frontendOrigin}/api/v1/health/live?failure=timeout`,
    {
      cache: 'no-store',
      headers: { 'x-request-id': `timeout-${Date.now()}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  const timeoutText = await timeout.text()
  assert.equal(timeout.status, 504)
  assert.deepEqual(JSON.parse(timeoutText), await fixture('bff-timeout.json'))
  assertNoPrivateLeak(serializedResponse(timeout, timeoutText), leakMarkers)

  hangingUpstream.closeAllConnections?.()
  hangingUpstream.close()
  await once(hangingUpstream, 'close')
  await stopGracefully(frontend, 'frontend')
})

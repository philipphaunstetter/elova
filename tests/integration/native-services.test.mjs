import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const frontendRoot = join(repositoryRoot, 'apps/frontend')
const backendRoot = join(repositoryRoot, 'apps/backend')
const frontendPort = 43100
const backendPort = 43200

function privateAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      const octets = address.address.split('.').map(Number)
      const isPrivate =
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      if (isPrivate) return address.address
    }
  }
  throw new Error(
    'CI runner needs a private non-loopback address for the native service boundary test',
  )
}

async function nativeStartCommand(packageRoot) {
  const metadata = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  )
  const script = metadata.scripts?.start
  assert.ok(script, `${metadata.name} must define its native start command`)
  assert.doesNotMatch(
    script,
    /[;&|`$<>]/,
    'start command must not require a shell',
  )
  const [executable, ...args] = script.trim().split(/\s+/)

  if (executable === 'node') return [process.execPath, args]
  if (executable === 'next') {
    return [
      process.execPath,
      [join(repositoryRoot, 'node_modules/next/dist/bin/next'), ...args],
    ]
  }
  throw new Error(
    `unsupported native start executable for ${metadata.name}: ${executable}`,
  )
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
    0,
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

async function inspectBrowserArtifacts(origin, markers) {
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

  const staticRoot = join(frontendRoot, '.next/static')
  const files = await browserFiles(staticRoot)
  assert.ok(files.length > 0, 'frontend build must contain browser artifacts')
  for (const path of files) {
    const data = await readFile(path)
    if (data.includes(0)) continue
    assertNoPrivateLeak(data.toString('utf8'), markers)
  }
}

test('native services honor the contract without exposing their private boundary', async (context) => {
  const backendHost = privateAddress()
  const backendOrigin = `http://${backendHost}:${backendPort}`
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`
  const commonEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
  }

  const [backendExecutable, backendArguments] =
    await nativeStartCommand(backendRoot)
  const [frontendExecutable, frontendArguments] =
    await nativeStartCommand(frontendRoot)

  const backend = managedProcess(backendExecutable, backendArguments, {
    cwd: backendRoot,
    env: {
      ...commonEnvironment,
      ELOVA_BACKEND_HOST: backendHost,
      PORT: String(backendPort),
    },
  })

  const frontend = managedProcess(frontendExecutable, frontendArguments, {
    cwd: frontendRoot,
    env: {
      ...commonEnvironment,
      ELOVA_BACKEND_URL: backendOrigin,
      HOSTNAME: '127.0.0.1',
      PORT: String(frontendPort),
    },
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

  const live = await waitFor(`${backendOrigin}/v1/health/live`, 200, backend)
  assert.equal(live.headers.get('x-elova-api-version'), '1')
  assert.deepEqual(await live.json(), await fixture('liveness.json'))

  const ready = await waitFor(`${backendOrigin}/v1/health/ready`, 200, backend)
  assert.equal(ready.headers.get('x-elova-api-version'), '1')
  assert.deepEqual(await ready.json(), await fixture('readiness-ready.json'))

  const proxiedRequestId = `integration-${Date.now()}`
  const proxied = await waitFor(
    `${frontendOrigin}/api/v1/health/live`,
    200,
    frontend,
  )
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
    '10.255.255.1:4100',
    'elova_test_password',
  ]
  assertNoPrivateLeak(serializedResponse(correlated, proxiedText), leakMarkers)
  await inspectBrowserArtifacts(frontendOrigin, leakMarkers)

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

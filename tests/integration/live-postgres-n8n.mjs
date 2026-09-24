// Opt-in live test: run only against an explicitly authorized, empty throwaway PostgreSQL
// database and two synthetic n8n HTTP fixtures. No production services are used.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backend = resolve(root, 'apps/backend');
const frontend = resolve(root, 'apps/frontend');
const databaseUrl = process.env.ELOVA_LIVE_DATABASE_URL;
const fixtureA = process.env.ELOVA_LIVE_N8N_A;
const fixtureB = process.env.ELOVA_LIVE_N8N_B;
if (process.env.ELOVA_LIVE_ISOLATED_FIXTURE !== 'yes' || !databaseUrl || !fixtureA || !fixtureB) {
  throw new Error('Explicit isolated fixture acknowledgement, PostgreSQL URL, and two synthetic n8n URLs are required');
}
for (const value of [databaseUrl, fixtureA, fixtureB]) {
  const url = new URL(value);
  assert.ok(value === databaseUrl ? ['postgres:', 'postgresql:'].includes(url.protocol) : url.protocol === 'http:');
  assert.equal(url.hostname, '127.0.0.1', 'Fixtures must be bound to loopback');
}
assert.notEqual(fixtureA, fixtureB);

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const children = [];
const secret = () => randomBytes(32).toString('base64');
const sessionSecret = secret();
const credentialKey = secret();
const email = 'owner@isolated.example.test';
const password = `  ${randomBytes(24).toString('hex')}  `;
const apiKeyA = `synthetic-key-a-${randomBytes(12).toString('hex')}`;
const apiKeyB = `synthetic-key-b-${randomBytes(12).toString('hex')}`;
const backendEnv = {
  ...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl,
  ELOVA_SESSION_SECRET: sessionSecret, ELOVA_CREDENTIAL_KEY: credentialKey,
};

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const number = server.address().port;
  server.close();
  await once(server, 'close');
  return number;
}

function run(file, args, cwd, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output = (output + chunk.toString()).slice(-8000);
    });
    child.on('error', reject);
    child.on('close', code => resolveResult({ code, output }));
  });
}

function start(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    output = (output + chunk.toString()).slice(-4000);
  });
  children.push(child);
  return { child, diagnostics: () => output };
}

async function ready(url, processHandle) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (processHandle.child.exitCode !== null) throw new Error(`Service exited: ${processHandle.diagnostics()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Startup is asynchronous. */ }
    await new Promise(done => setTimeout(done, 200));
  }
  throw new Error(`Service did not start: ${processHandle.diagnostics()}`);
}

async function request(origin, path, options, expected) {
  const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(body)}`);
  return { response, body };
}

try {
  // Never apply migrations to a database with existing application tables.
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  assert.deepEqual(tables.rows, [], 'Disposable database must start empty');
  const migration = await run(resolve(backend, 'dist/src/migrate.js'), [], backend, backendEnv);
  assert.equal(migration.code, 0, `Migration failed: ${migration.output}`);
  const operatorEnv = {
    ...backendEnv, ELOVA_BOOTSTRAP_EMAIL: email, ELOVA_BOOTSTRAP_NAME: 'Synthetic Owner',
    ELOVA_BOOTSTRAP_PASSWORD: password,
  };
  const first = await run(resolve(backend, 'dist/src/bootstrap-owner.js'), [], backend, operatorEnv);
  assert.equal(first.code, 0, `Operator bootstrap failed: ${first.output}`);
  const second = await run(resolve(backend, 'dist/src/bootstrap-owner.js'), [], backend, operatorEnv);
  assert.equal(second.code, 2, `Repeated bootstrap was not refused: ${second.output}`);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM owners')).rows[0].count, 1);

  const backendPort = await port();
  const frontendPort = await port();
  const privateOrigin = `http://127.0.0.1:${backendPort}`;
  const publicOrigin = `http://127.0.0.1:${frontendPort}`;
  const backendServer = start(resolve(backend, 'dist/src/server.js'), [], backend, {
    ...backendEnv, ELOVA_BACKEND_HOST: '127.0.0.1', PORT: String(backendPort),
  });
  await ready(`${privateOrigin}/v1/health/ready`, backendServer);
  const frontendServer = start(resolve(root, 'node_modules/next/dist/bin/next'),
    ['dev', '--hostname', '127.0.0.1', '--port', String(frontendPort)], frontend,
    { ...process.env, NODE_ENV: 'development', ELOVA_BACKEND_URL: privateOrigin });
  await ready(`${publicOrigin}/health/live`, frontendServer);
  const api = `${publicOrigin}/api`;
  const json = (body, cookie) => ({
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

  // Operator-created PostgreSQL owner is the only accepted login identity.
  await request(api, '/v1/auth/login', json({ email, password: 'incorrect' }), 401);
  const login = await request(api, '/v1/auth/login', json({ email, password }), 200);
  assert.equal(login.body.user.email, email);
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie ?? '', /^elova_session=/);
  await request(api, '/v1/auth/session', {}, 401);
  await request(api, '/v1/providers', {}, 401);
  await request(api, '/v1/auth/session', { headers: { cookie: 'elova_session=eyJmb3JnZWQiOiJ0cnVlIn0' } }, 401);
  await request(api, '/v1/auth/session', { headers: { cookie } }, 200);
  assert.deepEqual((await request(api, '/v1/providers', { headers: { cookie } }, 200)).body.providers, []);

  // Both fixture responses contain fabricated personal data. Never print raw bodies.
  for (const fixture of [fixtureA, fixtureB]) {
    const workflow = await request(fixture, '/api/v1/workflows?limit=100', {}, 200);
    const execution = await request(fixture, '/api/v1/executions?includeData=true&limit=100', {}, 200);
    assert.equal(workflow.body.data.length, 1);
    assert.equal(execution.body.data.length, 1);
  }
  const add = (name, baseUrl, apiKey) => json({ name, baseUrl, apiKey }, cookie);
  const providerA = (await request(api, '/v1/providers', add('Fixture A', fixtureA, apiKeyA), 201)).body.provider;
  assert.equal(providerA.baseUrl, `http://[redacted]:${new URL(fixtureA).port}`);
  await request(api, '/v1/providers', add('Duplicate A', fixtureA, 'another-synthetic-key'), 409);
  const encrypted = (await pool.query('SELECT encrypted_api_key FROM n8n_providers WHERE id = $1', [providerA.id])).rows[0].encrypted_api_key;
  assert.notEqual(encrypted, apiKeyA);
  assert.equal(JSON.stringify((await request(api, '/v1/providers', { headers: { cookie } }, 200)).body).includes(apiKeyA), false);
  assert.deepEqual((await request(api, `/v1/providers/${providerA.id}/sync`, json({}, cookie), 200)).body,
    { workflows: 1, executions: 1 });

  const providerB = (await request(api, '/v1/providers', add('Fixture B', fixtureB, apiKeyB), 201)).body.provider;
  assert.notEqual(providerA.id, providerB.id);
  assert.deepEqual((await request(api, `/v1/providers/${providerB.id}/sync`, json({}, cookie), 200)).body,
    { workflows: 1, executions: 1 });
  const providers = (await request(api, '/v1/providers', { headers: { cookie } }, 200)).body.providers;
  assert.equal(providers.length, 2);
  assert.deepEqual(new Set(providers.map(provider => provider.baseUrl)),
    new Set([fixtureA, fixtureB].map(origin => `http://[redacted]:${new URL(origin).port}`)));
  const histories = await pool.query(`SELECT p.id, p.base_url, w.provider_id AS workflow_provider,
      e.provider_id AS execution_provider, e.status, e.duration_ms,
      w.sanitized_definition::text AS workflow_content, e.sanitized_content::text AS execution_content,
      w.privacy_mode AS workflow_privacy, e.privacy_mode AS execution_privacy
    FROM n8n_providers p JOIN workflows w ON w.provider_id = p.id
    JOIN executions e ON e.workflow_id = w.id ORDER BY p.base_url`);
  assert.equal(histories.rows.length, 2);
  assert.deepEqual(new Set(histories.rows.map(row => row.base_url)), new Set([fixtureA, fixtureB]));
  for (const row of histories.rows) {
    assert.equal(row.workflow_provider, row.id);
    assert.equal(row.execution_provider, row.id);
    assert.equal(row.workflow_privacy, 'sanitized_only');
    assert.equal(row.execution_privacy, 'sanitized_only');
    for (const sensitive of ['jane@example.test', 'bob@example.test', 'synthetic-token-a',
      'synthetic-token-b', 'synthetic-api-secret-a', 'synthetic-password-a', 'Jane Doe', 'Example Street 1']) {
      assert.equal(`${row.workflow_content} ${row.execution_content}`.includes(sensitive), false,
        'Raw synthetic content was persisted');
    }
    assert.match(row.execution_content, /\[redacted\]/);
  }
  assert.deepEqual(new Set(histories.rows.map(row => row.status)), new Set(['success', 'error']));
  const executions = (await request(api, '/v1/executions', { headers: { cookie } }, 200)).body.executions;
  assert.equal(executions.length, 2);
  assert.deepEqual(new Set(executions.map(item => item.providerId)), new Set([providerA.id, providerB.id]));
  assert.equal((await request(api, '/v1/workflows', { headers: { cookie } }, 200)).body.workflows.length, 2);
  assert.equal((await request(api, '/v1/dashboard/metrics', { headers: { cookie } }, 200)).body.totalExecutions, 2);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM sessions')).rows[0].count, 1);
  const dashboard = (await request(api, '/v1/dashboard/metrics', { headers: { cookie } }, 200)).body;
  const ownerSession = (await request(api, '/v1/auth/session', { headers: { cookie } }, 200)).body;
  if (process.env.ELOVA_LIVE_EVIDENCE_DIR) {
    for (const route of ['login', 'settings']) {
      const response = await fetch(`${publicOrigin}/${route}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      await writeFile(resolve(process.env.ELOVA_LIVE_EVIDENCE_DIR, `live-${route}.html`), await response.text());
    }
  }
  const logout = await fetch(`${api}/v1/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
  await request(api, '/v1/auth/session', { headers: { cookie } }, 401);
  console.log(JSON.stringify({
    operator: { firstExit: first.code, retryExit: second.code, ownerCount: 1 },
    authentication: { incorrectPassword: 401, unsignedCookie: 401, anonymousSettings: 401,
      signedSession: ownerSession, authenticatedSettings: 200, revokedSession: 401 },
    providers: providers.map(provider => ({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl })),
    duplicateOrigin: 409, encryptedCredential: true,
    observability: { dashboard, executions: executions.map(item => ({ providerId: item.providerId,
      status: item.status, durationMs: item.durationMs })), workflowCount: 2 },
    persistence: { ownerCount: 1, providerCount: 2, workflowCount: 2, executionCount: 2,
      modes: histories.rows.map(row => ({ providerId: row.id, workflowPrivacy: row.workflow_privacy,
        executionPrivacy: row.execution_privacy, status: row.status })) },
    sanitation: 'Synthetic personal data and secrets absent from both persisted content columns',
  }));
} finally {
  for (const child of children.reverse()) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    }
  }
  await pool.end();
}

import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { backendIsReady } from "../src/server/backend-health";

const PRIVATE_URL = "http://100.100.10.20:8787";

test.beforeEach(() => {
  process.env.ELOVA_BACKEND_URL = PRIVATE_URL;
});

test("uses the generated readiness operation against the private /v1 base", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = (async (input) => {
    requested = input instanceof Request ? input.url : input.toString();
    return Response.json(
      {
        status: "ready",
        checks: { database: "ready", migrations: "ready" },
      },
      { headers: { "x-elova-api-version": "1" } },
    );
  }) as typeof fetch;

  try {
    assert.equal(await backendIsReady(), true);
    assert.equal(requested, `${PRIVATE_URL}/v1/health/ready`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allows the backend readiness checks to use their full budget", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const signal = input instanceof Request ? input.signal : undefined;
    await delay(3_200, undefined, { signal });
    return Response.json(
      {
        status: "ready",
        checks: { database: "ready", migrations: "ready" },
      },
      { headers: { "x-elova-api-version": "1" } },
    );
  }) as typeof fetch;

  try {
    assert.equal(await backendIsReady(), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed for missing or incompatible API versions", async () => {
  const originalFetch = globalThis.fetch;
  let version: string | null = null;
  globalThis.fetch = (async () => {
    const headers = new Headers();
    if (version) headers.set("x-elova-api-version", version);
    return Response.json(
      {
        status: "ready",
        checks: { database: "ready", migrations: "ready" },
      },
      { headers },
    );
  }) as typeof fetch;

  try {
    assert.equal(await backendIsReady(), false);
    version = "2";
    assert.equal(await backendIsReady(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed for malformed or unavailable readiness responses without logging details", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  globalThis.fetch = (async () => Response.json(
    { stack: `database failed at ${PRIVATE_URL}` },
    { status: 503 },
  )) as typeof fetch;

  try {
    assert.equal(await backendIsReady(), false);
    assert.deepEqual(logged, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

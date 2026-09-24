import assert from "node:assert/strict";
import test from "node:test";
import { proxyToBackend } from "../src/server/bff-proxy";

const PRIVATE_URL = "http://100.100.10.20:8787";

function browserRequest(path = "/api/v1/health/ready", init: RequestInit = {}): Request {
  return new Request(`https://elova.example${path}`, {
    ...init,
    headers: {
      origin: "https://elova.example",
      "sec-fetch-site": "same-origin",
      ...(init.headers ?? {}),
    },
  });
}

test.beforeEach(() => {
  process.env.ELOVA_BACKEND_URL = PRIVATE_URL;
});

test("forwards same-origin requests to the private /v1 path without forwarding host headers", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  const fakeFetch: typeof fetch = async (input, init) => {
    capturedUrl = input.toString();
    capturedHeaders = new Headers(init?.headers);
    return Response.json({ status: "live" }, { headers: { "x-request-id": "request-1" } });
  };

  const response = await proxyToBackend(
    browserRequest("/api/v1/health/live?probe=1", {
      headers: {
        origin: "https://elova.example",
        host: "elova.example",
        authorization: "Bearer opaque",
        "x-forwarded-host": "attacker.invalid",
      },
    }),
    ["health", "live"],
    fakeFetch,
  );

  assert.equal(response.status, 200);
  assert.equal(capturedUrl, `${PRIVATE_URL}/v1/health/live?probe=1`);
  assert.equal(capturedHeaders.get("authorization"), "Bearer opaque");
  assert.equal(capturedHeaders.has("host"), false);
  assert.equal(capturedHeaders.has("x-forwarded-host"), false);
  assert.equal(response.headers.get("x-request-id"), "request-1");
});

test("rejects cross-origin browser access before contacting the backend", async () => {
  let called = false;
  const fakeFetch: typeof fetch = async () => {
    called = true;
    return Response.json({ status: "live" });
  };

  const response = await proxyToBackend(
    browserRequest(undefined, { headers: { origin: "https://attacker.invalid", "sec-fetch-site": "cross-site" } }),
    ["health", "live"],
    fakeFetch,
  );

  assert.equal(response.status, 403);
  assert.equal(called, false);
  assert.equal(response.headers.has("access-control-allow-origin"), false);
});

test("turns an upstream 503 into a minimal response without headers, cookies, or private details", async () => {
  const fakeFetch: typeof fetch = async () => new Response(
    JSON.stringify({ stack: `connect ECONNREFUSED ${PRIVATE_URL}`, database: "postgres.internal" }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        location: `${PRIVATE_URL}/admin`,
        "set-cookie": `backend=${PRIVATE_URL}; Path=/`,
        server: "gx10",
        "x-internal-host": "gx10.internal",
      },
    },
  );

  const response = await proxyToBackend(browserRequest(), ["health", "ready"], fakeFetch);
  const text = await response.text();

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(text), {
    error: { code: "BACKEND_UNAVAILABLE", message: "Service temporarily unavailable" },
  });
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("server"), false);
  assert.equal(response.headers.has("x-internal-host"), false);
  assert.equal(text.includes("100.100.10.20"), false);
  assert.equal(text.includes("8787"), false);
  assert.equal(text.includes("postgres.internal"), false);
});

test("does not expose private redirect targets", async () => {
  const fakeFetch: typeof fetch = async () => new Response(null, {
    status: 302,
    headers: { location: `${PRIVATE_URL}/login` },
  });

  const response = await proxyToBackend(browserRequest(), ["health", "ready"], fakeFetch);
  assert.equal(response.status, 502);
  assert.equal(response.headers.has("location"), false);
  assert.equal((await response.text()).includes(PRIVATE_URL), false);
});

test("redacts the configured endpoint from successful JSON and safe-header candidates", async () => {
  const fakeFetch: typeof fetch = async () => Response.json(
    { status: "live", diagnostic: `${PRIVATE_URL}/v1`, backendPort: "8787" },
    { headers: { etag: `\"${PRIVATE_URL}\"`, "set-cookie": `origin=${PRIVATE_URL}` } },
  );

  const response = await proxyToBackend(browserRequest(), ["health", "live"], fakeFetch);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes("100.100.10.20"), false);
  assert.equal(text.includes("8787"), false);
  assert.equal(response.headers.has("etag"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("network failures do not log or return exception details", async () => {
  const messages: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => messages.push(args);
  try {
    const fakeFetch: typeof fetch = async () => {
      throw new Error(`connect failed at ${PRIVATE_URL}`);
    };
    const response = await proxyToBackend(browserRequest(), ["health", "ready"], fakeFetch);
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.equal(text.includes(PRIVATE_URL), false);
    assert.deepEqual(messages, []);
  } finally {
    console.error = originalError;
  }
});

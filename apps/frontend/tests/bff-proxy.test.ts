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
    return Response.json(
      { status: "live" },
      { headers: { "x-elova-api-version": "1", "x-request-id": "request-1" } },
    );
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

test("workspace selection uses the same-origin BFF and forwards only the session cookie", async () => {
  const requests: Array<{ url: string; body: string; cookie: string | null }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    requests.push({ url: input.toString(), body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "",
      cookie: new Headers(init?.headers).get("cookie") });
    return Response.json({ activeWorkspaceId: "33333333-3333-4333-8333-333333333333" },
      { headers: { "x-elova-api-version": "1" } });
  };
  const switched = await proxyToBackend(browserRequest("/api/v1/workspaces/select", {
    method: "POST", headers: { origin: "https://elova.example", cookie: "elova_session=synthetic" },
    body: JSON.stringify({ workspaceId: "33333333-3333-4333-8333-333333333333" }),
  }), ["workspaces", "select"], fakeFetch);
  assert.equal(switched.status, 200);
  assert.deepEqual(requests.map((item) => item.url), [`${PRIVATE_URL}/v1/workspaces/select`]);
  assert.equal(requests[0]?.cookie, "elova_session=synthetic");
  assert.match(requests[0]?.body ?? "", /workspaceId/);
});

test("forwards the displayed workspace ID on credential writes and preserves stale-workspace rejection", async () => {
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  let upstreamWorkspaceId: string | null = null;
  let upstreamBody = "";
  const response = await proxyToBackend(browserRequest("/api/v1/providers", {
    method: "POST", headers: { "content-type": "application/json", "x-elova-workspace-id": workspaceId },
    body: JSON.stringify({ name: "Synthetic", baseUrl: "http://100.100.10.21:5678", apiKey: "synthetic-only" }),
  }), ["providers"], async (_input, init) => {
    upstreamWorkspaceId = new Headers(init?.headers).get("x-elova-workspace-id");
    upstreamBody = new TextDecoder().decode(init?.body as ArrayBuffer);
    return Response.json({ error: { code: "WORKSPACE_CHANGED", message: "Refresh the workspace before retrying" } },
      { status: 409, headers: { "x-elova-api-version": "1" } });
  });
  assert.equal(upstreamWorkspaceId, workspaceId);
  assert.equal(JSON.parse(upstreamBody).name, "Synthetic");
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "WORKSPACE_CHANGED");
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
        "x-elova-api-version": "1",
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

test("preserves known versioned backend client errors", async () => {
  const fakeFetch: typeof fetch = async () => Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } },
    {
      status: 405,
      headers: {
        etag: `\"${PRIVATE_URL}\"`,
        "x-elova-api-version": "1",
        "x-request-id": "method-error-1",
      },
    },
  );

  const response = await proxyToBackend(
    browserRequest("/api/v1/health/live", { method: "POST" }),
    ["health", "live"],
    fakeFetch,
  );

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), {
    error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
  });
  assert.equal(response.headers.get("x-request-id"), "method-error-1");
  assert.equal(response.headers.has("etag"), false);
});

test("requires a versioned, structurally safe backend client error", async () => {
  const unversioned = await proxyToBackend(
    browserRequest("/api/v1/health/live", { method: "POST" }),
    ["health", "live"],
    async () => Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, { status: 405 }),
  );
  assert.equal(unversioned.status, 502);

  const sanitized = await proxyToBackend(
    browserRequest("/api/v1/health/live", { method: "POST" }),
    ["health", "live"],
    async () => new Response(
      JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: `${PRIVATE_URL} failed` } }),
      { status: 405, headers: { "content-type": "application/json", "x-elova-api-version": "1" } },
    ),
  );
  assert.equal(sanitized.status, 405);
  assert.equal((await sanitized.text()).includes(PRIVATE_URL), false);

  const malformed = await proxyToBackend(
    browserRequest("/api/v1/health/live", { method: "POST" }),
    ["health", "live"],
    async () => Response.json(
      { error: { code: "lowercase-code", message: "unsafe" } },
      { status: 405, headers: { "x-elova-api-version": "1" } },
    ),
  );
  assert.equal(malformed.status, 502);
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

test("rejects successful responses without the expected API version", async () => {
  for (const version of [null, "2"]) {
    const fakeFetch: typeof fetch = async () => {
      const headers = new Headers();
      if (version) headers.set("x-elova-api-version", version);
      return Response.json({ status: "live" }, { headers });
    };

    const response = await proxyToBackend(browserRequest(), ["health", "live"], fakeFetch);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: { code: "BACKEND_UNAVAILABLE", message: "Service temporarily unavailable" },
    });
  }
});

test("redacts endpoint strings without changing JSON numbers", async () => {
  const fakeFetch: typeof fetch = async () => Response.json(
    {
      status: "live",
      diagnostic: `${PRIVATE_URL}/v1`,
      nested: { backend: "100.100.10.20", duration: 8787 },
      backendPort: "8787",
    },
    {
      headers: {
        etag: `\"${PRIVATE_URL}\"`,
        "set-cookie": `origin=${PRIVATE_URL}`,
        "x-elova-api-version": "1",
      },
    },
  );

  const response = await proxyToBackend(browserRequest(), ["health", "live"], fakeFetch);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "live",
    diagnostic: "[redacted]/v1",
    nested: { backend: "[redacted]", duration: 8787 },
    backendPort: "8787",
  });
  assert.equal(response.headers.has("etag"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("preserves distinct safe upstream cookies", async () => {
  const headers = new Headers({
    "content-type": "application/json",
    "x-elova-api-version": "1",
  });
  headers.append("set-cookie", "session=one; Path=/; HttpOnly");
  headers.append("set-cookie", "csrf=two; Path=/; SameSite=Strict");
  headers.append("set-cookie", `backend=${PRIVATE_URL}; Path=/`);

  const response = await proxyToBackend(
    browserRequest(),
    ["health", "live"],
    async () => new Response(JSON.stringify({ status: "live" }), { headers }),
  );

  assert.deepEqual(response.headers.getSetCookie(), [
    "session=one; Path=/; HttpOnly",
    "csrf=two; Path=/; SameSite=Strict",
  ]);
});

test("rejects streamed request bodies as soon as they exceed the limit", async () => {
  let called = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
  });
  const request = new Request("https://elova.example/api/v1/workflows", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const fakeFetch: typeof fetch = async () => {
    called = true;
    return Response.json({ ok: true });
  };

  const response = await proxyToBackend(request, ["workflows"], fakeFetch);
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("enforces one deadline across request and response streams", async () => {
  const stalledRequest = new Request("https://elova.example/api/v1/workflows", {
    method: "POST",
    body: new ReadableStream<Uint8Array>(),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const requestTimeout = await proxyToBackend(
    stalledRequest,
    ["workflows"],
    async () => Response.json({ ok: true }),
    20,
  );
  assert.equal(requestTimeout.status, 504);

  const stalledResponse = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
    },
  });
  const responseTimeout = await proxyToBackend(
    browserRequest(),
    ["health", "ready"],
    async () => new Response(stalledResponse, {
      headers: {
        "content-type": "application/json",
        "x-elova-api-version": "1",
      },
    }),
    20,
  );
  assert.equal(responseTimeout.status, 504);
});

test("stops reading upstream responses at the byte limit", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
  });
  const response = await proxyToBackend(
    browserRequest(),
    ["health", "ready"],
    async () => new Response(body, {
      headers: {
        "content-type": "application/json",
        "x-elova-api-version": "1",
      },
    }),
  );

  assert.equal(response.status, 502);
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

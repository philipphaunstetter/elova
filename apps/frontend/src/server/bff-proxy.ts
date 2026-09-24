import "server-only";

import type { BffFailure } from "@elova/api-contract";
import { hasExpectedApiVersion } from "./api-version";
import { getBackendOrigin, getPrivateEndpointTokens } from "./backend-config";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "x-csrf-token",
  "x-request-id",
  "x-correlation-id",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "etag",
  "retry-after",
  "x-request-id",
] as const;
const KNOWN_CLIENT_ERRORS = new Map<number, { code: string; message: string }>([
  [400, { code: "BAD_REQUEST", message: "Bad request" }],
  [404, { code: "NOT_FOUND", message: "Not found" }],
  [405, { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }],
]);

function json(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function failure(kind: "unavailable" | "timeout", status?: number): Response {
  const body: BffFailure = kind === "timeout"
    ? { error: { code: "BACKEND_TIMEOUT", message: "Service timed out" } }
    : { error: { code: "BACKEND_UNAVAILABLE", message: "Service temporarily unavailable" } };
  return json(body, status ?? (kind === "timeout" ? 504 : 502));
}

function rejected(status: number): Response {
  return json({ error: { code: "REQUEST_REJECTED", message: "Request could not be completed" } }, status);
}

export function isSameOriginBrowserRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const requestHost = request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    return false;
  }
}

function sanitize(value: string, privateTokens: string[]): string {
  return privateTokens.reduce((result, token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(escaped, "gi"), "[redacted]");
  }, value);
}

function sanitizeJson(value: unknown, privateTokens: string[]): unknown {
  if (typeof value === "string") return sanitize(value, privateTokens);
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, privateTokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        sanitize(key, privateTokens),
        sanitizeJson(item, privateTokens),
      ]),
    );
  }
  return value;
}

function safeResponseHeaders(upstream: Response, privateTokens: string[]): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (!value || sanitize(value, privateTokens) !== value) continue;
    if (name === "x-request-id" && (value.length > 128 || !/^[\w.:-]+$/.test(value))) continue;
    headers.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    if (sanitize(cookie, privateTokens) === cookie) headers.append("set-cookie", cookie);
  }
  return headers;
}

class BodyLimitError extends Error {}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted"));

  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Request aborted"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readLimitedBody(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<ArrayBuffer | undefined> {
  if (!stream) return undefined;

  const reader = stream.getReader();
  let body = new Uint8Array(Math.min(maximumBytes, 64 * 1024));
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      const nextTotal = total + value.byteLength;
      if (nextTotal > maximumBytes) throw new BodyLimitError();
      if (nextTotal > body.byteLength) {
        const capacity = Math.min(maximumBytes, Math.max(nextTotal, body.byteLength * 2));
        const expanded = new Uint8Array(capacity);
        expanded.set(body);
        body = expanded;
      }
      body.set(value, total);
      total = nextTotal;
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      void error;
    }
  }

  return body.slice(0, total).buffer;
}

async function readSanitizedJson(
  upstream: Response,
  privateTokens: string[],
  signal: AbortSignal,
): Promise<{ parsed: unknown; serialized: string }> {
  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) throw new TypeError("Invalid JSON response");

  const bytes = await readLimitedBody(upstream.body, MAX_RESPONSE_BYTES, signal);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const serialized = JSON.stringify(sanitizeJson(parsed, privateTokens));
  if (serialized === undefined) throw new TypeError("Invalid JSON response");
  return { parsed, serialized };
}

function isKnownClientError(status: number, value: unknown): boolean {
  const expected = KNOWN_CLIENT_ERRORS.get(status);
  if (!expected || !value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length !== 1 || !("error" in value)) return false;
  const error = value.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  return Object.keys(error).length === 2 &&
    "code" in error && error.code === expected.code &&
    "message" in error && error.message === expected.message;
}

async function requestBody(request: Request, signal: AbortSignal): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_REQUEST_BYTES) {
      throw new BodyLimitError();
    }
  }

  return readLimitedBody(request.body, MAX_REQUEST_BYTES, signal);
}

function upstreamUrl(origin: URL, path: string[], requestUrl: URL): URL {
  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const target = new URL(`/v1/${safePath}`, origin);
  target.search = requestUrl.search;
  return target;
}

export async function proxyToBackend(
  request: Request,
  path: string[],
  fetchImplementation: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  if (!isSameOriginBrowserRequest(request)) return rejected(403);
  if (request.method === "OPTIONS") return rejected(403);

  let origin: URL;
  try {
    origin = getBackendOrigin();
  } catch {
    return failure("unavailable");
  }
  const privateTokens = getPrivateEndpointTokens(origin);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let body: ArrayBuffer | undefined;
    try {
      body = await requestBody(request, controller.signal);
    } catch {
      return timedOut ? failure("timeout") : rejected(413);
    }

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    let upstream: Response;
    try {
      upstream = await fetchImplementation(upstreamUrl(origin, path, new URL(request.url)), {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      return failure(timedOut ? "timeout" : "unavailable");
    }

    if (upstream.status >= 300 && upstream.status < 400) return failure("unavailable");
    if (upstream.status === 504) return failure("timeout");
    if (!hasExpectedApiVersion(upstream)) return failure("unavailable");

    if (KNOWN_CLIENT_ERRORS.has(upstream.status)) {
      try {
        const { parsed, serialized } = await readSanitizedJson(
          upstream,
          privateTokens,
          controller.signal,
        );
        if (!isKnownClientError(upstream.status, parsed)) return failure("unavailable");
        return new Response(serialized, {
          status: upstream.status,
          headers: safeResponseHeaders(upstream, privateTokens),
        });
      } catch {
        return failure(timedOut ? "timeout" : "unavailable");
      }
    }

    if (!upstream.ok) {
      return failure("unavailable", upstream.status === 503 ? 503 : 502);
    }
    if (upstream.status === 204 || upstream.status === 205) {
      return new Response(null, { status: upstream.status, headers: safeResponseHeaders(upstream, privateTokens) });
    }

    try {
      const { serialized } = await readSanitizedJson(upstream, privateTokens, controller.signal);
      return new Response(serialized, {
        status: upstream.status,
        headers: safeResponseHeaders(upstream, privateTokens),
      });
    } catch {
      return failure(timedOut ? "timeout" : "unavailable");
    }
  } finally {
    clearTimeout(timer);
  }
}

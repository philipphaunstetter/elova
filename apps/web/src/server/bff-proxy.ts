import "server-only";

import type { BffFailure } from "@elova/api-client";
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
  "set-cookie",
  "x-request-id",
] as const;

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

function safeResponseHeaders(upstream: Response, privateTokens: string[]): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (!value || sanitize(value, privateTokens) !== value) continue;
    if (name === "x-request-id" && (value.length > 128 || !/^[\w.:-]+$/.test(value))) continue;
    headers.set(name, value);
  }
  return headers;
}

async function requestBody(request: Request): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new RangeError();

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_REQUEST_BYTES) throw new RangeError();
  return body;
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

  let body: ArrayBuffer | undefined;
  try {
    body = await requestBody(request);
  } catch {
    return rejected(413);
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

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
  } finally {
    clearTimeout(timer);
  }

  if (upstream.status >= 300 && upstream.status < 400) return failure("unavailable");
  if (!upstream.ok) {
    if (upstream.status === 504) return failure("timeout");
    return failure("unavailable", upstream.status === 503 ? 503 : 502);
  }
  if (upstream.status === 204 || upstream.status === 205) {
    return new Response(null, { status: upstream.status, headers: safeResponseHeaders(upstream, privateTokens) });
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) return failure("unavailable");

  let text: string;
  try {
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_RESPONSE_BYTES) return failure("unavailable");
    text = new TextDecoder().decode(bytes);
    JSON.parse(text);
  } catch {
    return failure("unavailable");
  }

  const sanitized = sanitize(text, privateTokens);
  return new Response(sanitized, {
    status: upstream.status,
    headers: safeResponseHeaders(upstream, privateTokens),
  });
}

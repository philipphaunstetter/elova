import "server-only";

import { isIP } from "node:net";

export class BackendConfigurationError extends Error {
  constructor() {
    super("Private backend is not configured");
    this.name = "BackendConfigurationError";
  }
}

function isTailnetIpv4(hostname: string): boolean {
  const [first, second] = hostname.split(".").map(Number);
  return first === 100 && second >= 64 && second <= 127;
}

function isDnsLabel(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

function isMagicDnsName(hostname: string): boolean {
  const labels = hostname.split(".");
  if (labels.length === 1) return isDnsLabel(labels[0]);
  return labels.length >= 4 && hostname.endsWith(".ts.net") && labels.every(isDnsLabel);
}

function isTailnetHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (isIP(normalized) === 4) return isTailnetIpv4(normalized);
  if (isIP(normalized) === 6) return normalized.startsWith("fd7a:115c:a1e0:");
  return isMagicDnsName(normalized);
}

export function getBackendOrigin(): URL {
  const configured = process.env.ELOVA_BACKEND_URL?.trim();
  if (!configured) throw new BackendConfigurationError();

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new BackendConfigurationError();
  }

  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isOriginOnly = url.pathname === "/" && !url.search && !url.hash;
  if (!isHttp || !isOriginOnly || url.username || url.password) {
    throw new BackendConfigurationError();
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
  if (process.env.NODE_ENV === "production" && (isLoopback || !isTailnetHostname(hostname))) {
    throw new BackendConfigurationError();
  }

  return url;
}

export function getPrivateEndpointTokens(url: URL): string[] {
  const tokens = [url.origin, url.host, url.hostname.replace(/^\[|\]$/g, "")];
  return [...new Set(tokens.filter((token) => token.length >= 2))].sort((a, b) => b.length - a.length);
}

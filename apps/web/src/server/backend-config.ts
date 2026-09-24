import "server-only";

import { isIP } from "node:net";

const PRIVATE_HOST_SUFFIXES = [".internal", ".local", ".ts.net"];

export class BackendConfigurationError extends Error {
  constructor() {
    super("Private backend is not configured");
    this.name = "BackendConfigurationError";
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) return isPrivateIpv6(normalized);

  return !normalized.includes(".") || PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
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
  if (process.env.NODE_ENV === "production" && (isLoopback || !isPrivateHostname(hostname))) {
    throw new BackendConfigurationError();
  }

  return url;
}

export function getPrivateEndpointTokens(url: URL): string[] {
  const tokens = [url.origin, url.host, url.hostname.replace(/^\[|\]$/g, ""), url.port];
  return [...new Set(tokens.filter((token) => token.length >= 2))].sort((a, b) => b.length - a.length);
}

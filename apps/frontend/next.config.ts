import { resolve } from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
];

const buildId = process.env.ELOVA_BUILD_ID?.trim() || "local";
if (!/^[A-Za-z0-9._-]{1,128}$/.test(buildId)) {
  throw new Error("ELOVA_BUILD_ID must be an immutable source identifier");
}

const nextConfig: NextConfig = {
  generateBuildId: async () => buildId,
  output: "standalone",
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

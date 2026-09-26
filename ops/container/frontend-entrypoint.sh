#!/bin/sh
set -eu

# Inspect names only. Values must never be echoed into logs or image layers.
node -e '
const keys = Object.keys(process.env);
const forbidden = keys.filter(k => k === "ELOVA_DEV_HTTP_COOKIE_ORIGIN" ||
  k === "DATABASE_URL" || k === "DATABASE_URL_FILE" ||
  k.startsWith("ELOVA_SESSION_SECRET") || k.startsWith("ELOVA_CREDENTIAL_KEY") ||
  k.startsWith("NEXT_PUBLIC_"));
if (!process.env.ELOVA_BACKEND_URL || forbidden.length) {
  console.error("Frontend requires a runtime backend origin and forbids browser/backend credentials or HTTP cookie opt-in");
  process.exit(1);
}
'
exec "$@"

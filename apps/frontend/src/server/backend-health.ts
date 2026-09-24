import "server-only";

import { getReadiness, type Readiness } from "@elova/api-contract";
import { createClient } from "@elova/api-contract/client";
import { hasExpectedApiVersion } from "./api-version";
import { getBackendOrigin } from "./backend-config";

const HEALTH_TIMEOUT_MS = 8_000;

function isReadiness(value: unknown): value is Readiness {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Readiness>;
  return (
    (candidate.status === "ready" || candidate.status === "not_ready") &&
    typeof candidate.checks === "object" &&
    candidate.checks !== null &&
    (candidate.checks.database === "ready" || candidate.checks.database === "not_ready") &&
    (candidate.checks.migrations === "ready" || candidate.checks.migrations === "not_ready")
  );
}

export async function backendIsReady(): Promise<boolean> {
  try {
    const origin = getBackendOrigin();
    const client = createClient({
      baseUrl: new URL("/v1", origin).toString().replace(/\/$/, ""),
    });
    const result = await getReadiness({
      client,
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    return (
      result.response?.status === 200 &&
      hasExpectedApiVersion(result.response) &&
      isReadiness(result.data) &&
      result.data.status === "ready"
    );
  } catch {
    return false;
  }
}

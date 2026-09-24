import type { Liveness } from "@elova/api-contract";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const body: Liveness = { status: "live" };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

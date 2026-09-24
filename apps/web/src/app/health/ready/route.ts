import { backendIsReady } from "@/server/backend-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ready = await backendIsReady();
  return Response.json(
    { status: ready ? "ready" : "not_ready" },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

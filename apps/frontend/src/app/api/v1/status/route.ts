import { backendIsReady } from "@/server/backend-health";
import { isSameOriginBrowserRequest } from "@/server/bff-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginBrowserRequest(request)) {
    return Response.json(
      { error: { code: "REQUEST_REJECTED", message: "Request could not be completed" } },
      { status: 403 },
    );
  }

  const ready = await backendIsReady();
  return Response.json(
    { status: ready ? "ready" : "not_ready" },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AppNav } from "../app-nav";
import { WorkspaceSwitcher } from "../workspace-switcher";

type Metrics = {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number | null;
  averageDurationMs: number | null;
};

type Execution = {
  id: string;
  providerExecutionId: string;
  status: string;
  workflowName: string | null;
  providerName: string;
  startedAt: string | null;
  durationMs: number | null;
  privacyMode: string;
  sanitizerVersion: string;
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const onUnauthorized = useCallback(() => setState("unauthorized"), []);
  const onWorkspaceError = useCallback(() => setState("error"), []);

  useEffect(() => {
    if (workspaceId === null) return;
    if (!workspaceId) { setState("error"); return; }
    let active = true;
    const options = { cache: "no-store" as const, headers: { "x-elova-workspace-id": workspaceId } };
    void Promise.all([
      fetch("/api/v1/dashboard/metrics", options),
      fetch("/api/v1/executions?limit=20", options),
    ]).then(async ([metricsResponse, executionsResponse]) => {
      if (!active) return;
      if (metricsResponse.status === 401 || executionsResponse.status === 401) {
        setState("unauthorized");
        return;
      }
      if (!metricsResponse.ok || !executionsResponse.ok) throw new Error("request failed");
      const metricsBody = await metricsResponse.json() as Metrics;
      const executionBody = await executionsResponse.json() as { executions: Execution[] };
      if (!active) return;
      setMetrics(metricsBody);
      setExecutions(executionBody.executions);
      setState("ready");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [workspaceId]);

  return (
    <main className="app-shell">
      <AppNav />
      <section className="dashboard-panel">
        <p className="eyebrow">Private PostgreSQL evidence</p>
        <h1>Workflow observability</h1>
        {state !== "unauthorized" && <WorkspaceSwitcher onWorkspaceChange={setWorkspaceId} onUnauthorized={onUnauthorized} onError={onWorkspaceError} />}
        {state === "loading" && <p className="notice">Loading current execution evidence…</p>}
        {state === "unauthorized" && <p className="notice">Sign in with your operator-enrolled administrator account.</p>}
        {state === "error" && <p className="notice error">Observability data is temporarily unavailable.</p>}
        {state === "ready" && metrics && (
          <>
            <div className="metric-grid">
              <Metric label="Success rate" value={metrics.successRate === null ? "No data" : `${Math.round(metrics.successRate * 100)}%`} />
              <Metric label="Total executions" value={String(metrics.totalExecutions)} />
              <Metric label="Failed executions" value={String(metrics.failedExecutions)} />
              <Metric label="Average duration" value={metrics.averageDurationMs === null ? "No data" : `${metrics.averageDurationMs} ms`} />
            </div>
            <section className="table-card">
              <div><h2>Recent executions</h2><p>Execution content is sanitized before storage.</p></div>
              {executions.length === 0 ? <p className="empty">No synchronized executions yet.</p> : (
                <div className="table-wrap"><table><thead><tr><th>Workflow</th><th>Status</th><th>Started</th><th>Duration</th><th>Privacy</th></tr></thead>
                  <tbody>{executions.map((execution) => <tr key={execution.id}>
                    <td>{execution.workflowName ?? execution.providerExecutionId}</td><td>{execution.status}</td>
                    <td>{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "—"}</td>
                    <td>{execution.durationMs === null ? "—" : `${execution.durationMs} ms`}</td>
                    <td>{execution.privacyMode} · v{execution.sanitizerVersion}</td>
                  </tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong></article>;
}

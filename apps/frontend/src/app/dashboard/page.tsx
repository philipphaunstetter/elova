"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppFooter, AppNav } from "../app-nav";
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
  const onWorkspaceChange = useCallback((id: string) => {
    setWorkspaceId(id);
    setState(id ? "loading" : "error");
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const options = { cache: "no-store" as const, signal: controller.signal, headers: { "x-elova-workspace-id": workspaceId } };
    void Promise.all([
      fetch("/api/v1/dashboard/metrics", options),
      fetch("/api/v1/executions?limit=20", options),
    ]).then(async ([metricsResponse, executionsResponse]) => {
      if (controller.signal.aborted) return;
      if (metricsResponse.status === 401 || executionsResponse.status === 401) {
        setState("unauthorized");
        return;
      }
      if (!metricsResponse.ok || !executionsResponse.ok) throw new Error("request failed");
      const [metricsBody, executionBody] = await Promise.all([
        metricsResponse.json() as Promise<Metrics>,
        executionsResponse.json() as Promise<{ executions: Execution[] }>,
      ]);
      if (controller.signal.aborted) return;
      setMetrics(metricsBody);
      setExecutions(executionBody.executions);
      setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [workspaceId]);

  return (
    <div className="app-shell">
      <AppNav />
      <main id="main" tabIndex={-1} className="shell page-content">
        <div className="page-heading">
          <div><p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Private workspace</p><h1>Workflow <em>observability.</em></h1><p className="intro">Review synchronized n8n execution outcomes and recent history in the selected workspace.</p></div>
          <span className="heading-tag">EXECUTION EVIDENCE / N8N</span>
        </div>
        {state !== "unauthorized" && <WorkspaceSwitcher onWorkspaceChange={onWorkspaceChange} onUnauthorized={onUnauthorized} onError={onWorkspaceError} />}
        {state === "loading" && <p className="notice" role="status">Loading current execution evidence…</p>}
        {state === "unauthorized" && <div className="notice" role="status"><p>Sign in with your operator-enrolled account to view execution evidence.</p><Link className="text-link" href="/login">Sign in <span aria-hidden="true">↗</span></Link></div>}
        {state === "error" && <p className="notice error" role="alert">Observability data is temporarily unavailable. Please try again later.</p>}
        {state === "ready" && metrics && (
          <>
            <section className="metric-section" aria-label="Execution metrics">
              <p className="section-index">01 / AT A GLANCE</p>
              <div className="metric-grid">
                <Metric label="Success rate" value={metrics.successRate === null ? "No data" : `${Math.round(metrics.successRate * 100)}%`} />
                <Metric label="Total executions" value={String(metrics.totalExecutions)} />
                <Metric label="Failed executions" value={String(metrics.failedExecutions)} />
                <Metric label="Average duration" value={metrics.averageDurationMs === null ? "No data" : `${metrics.averageDurationMs} ms`} />
              </div>
            </section>
            <section className="table-card" aria-labelledby="recent-title">
              <div className="card-heading"><div><p className="section-index">02 / RECENT ACTIVITY</p><h2 id="recent-title">Recent executions</h2></div><p>Execution content is sanitized before storage.</p></div>
              {executions.length === 0 ? <p className="empty">No synchronized executions yet.</p> : (
                <div className="table-wrap"><table><thead><tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Started</th><th scope="col">Duration</th><th scope="col">Privacy</th></tr></thead>
                  <tbody>{executions.map((execution) => <tr key={execution.id}>
                    <td className="workflow-name">{execution.workflowName ?? execution.providerExecutionId}</td><td><span className="status-pill">{execution.status}</span></td>
                    <td>{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "—"}</td>
                    <td>{execution.durationMs === null ? "—" : `${execution.durationMs} ms`}</td>
                    <td>{execution.privacyMode} · v{execution.sanitizerVersion}</td>
                  </tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong></article>;
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppNav } from "../app-nav";
import { WorkspaceSwitcher } from "../workspace-switcher";

async function workspaceChanged(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
  return body?.error?.code === "WORKSPACE_CHANGED";
}

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  status: string;
  lastSyncedAt: string | null;
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const onUnauthorized = useCallback(() => setUnauthorized(true), []);

  async function refresh(id: string) {
    const response = await fetch("/api/v1/providers", { cache: "no-store", headers: { "x-elova-workspace-id": id } });
    if (response.status === 401) { setUnauthorized(true); return; }
    if (!response.ok) {
      setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying." : "Settings are temporarily unavailable.");
      return;
    }
    setProviders(((await response.json()) as { providers: Provider[] }).providers);
  }

  useEffect(() => {
    if (!workspaceId) { setProviders([]); return; }
    let active = true;
    void fetch("/api/v1/providers", { cache: "no-store", headers: { "x-elova-workspace-id": workspaceId } }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { setUnauthorized(true); return; }
      if (!response.ok) {
        setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying." : "Settings are temporarily unavailable.");
        return;
      }
      const result = await response.json() as { providers: Provider[] };
      if (active) setProviders(result.providers);
    }).catch(() => { if (active) setMessage("Settings are temporarily unavailable."); });
    return () => { active = false; };
  }, [workspaceId]);

  async function addProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/providers", {
      method: "POST",
      headers: { "content-type": "application/json", "x-elova-workspace-id": workspaceId },
      body: JSON.stringify({ name: form.get("name"), baseUrl: form.get("baseUrl"), apiKey: form.get("apiKey") }),
    });
    if (!response.ok) {
      if (response.status === 401) { setUnauthorized(true); return; }
      setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying."
        : "The private n8n connection could not be saved. Existing origins cannot be replaced.");
      return;
    }
    event.currentTarget.reset();
    setMessage("Connection saved. The API key is encrypted in PostgreSQL.");
    await refresh(workspaceId);
  }

  async function synchronize(id: string) {
    if (!workspaceId) return;
    setMessage("Synchronizing sanitized workflow and execution evidence…");
    const response = await fetch(`/api/v1/providers/${id}/sync`, {
      method: "POST", headers: { "x-elova-workspace-id": workspaceId },
    });
    if (response.status === 401) { setUnauthorized(true); return; }
    setMessage(response.ok ? "Synchronization completed." : await workspaceChanged(response)
      ? "Workspace changed in another tab. Reload before retrying."
      : response.status === 409 ? "Synchronization already in progress. Try again after it finishes."
      : response.status === 429 ? "Sync capacity reached. Try again shortly."
      : "Synchronization failed without storing raw content.");
    await refresh(workspaceId);
  }

  return (
    <main className="app-shell">
      <AppNav />
      <section className="dashboard-panel narrow">
        <p className="eyebrow">Authenticated settings</p><h1>n8n connections</h1>
        <p className="intro left">Connections belong to the selected workspace. Each private origin has a separate immutable identity and history.</p>
        {!unauthorized && <WorkspaceSwitcher onWorkspaceChange={setWorkspaceId} onUnauthorized={onUnauthorized} />}
        {unauthorized ? <p className="notice">Sign in before configuring n8n.</p> : (
          <>
            <form className="form-card" onSubmit={addProvider}>
              <label>Connection name<input name="name" maxLength={120} required /></label>
              <label>Private Tailnet origin<input name="baseUrl" type="url" placeholder="http://gx10.example.ts.net:5678" required /></label>
              <label>API key<input name="apiKey" type="password" autoComplete="off" required /></label>
              <button className="button primary" disabled={!workspaceId}>Add connection</button>
            </form>
            {message && <p className="notice" role="status">{message}</p>}
            <div className="provider-list">{providers.map((provider) => <article className="provider-card" key={provider.id}>
              <div><h2>{provider.name}</h2><p>{provider.baseUrl}</p><small>{provider.status} · {provider.lastSyncedAt ? `last sync ${new Date(provider.lastSyncedAt).toLocaleString()}` : "not synchronized"}</small></div>
              <button className="button" disabled={!workspaceId} onClick={() => void synchronize(provider.id)}>Sync now</button>
            </article>)}</div>
          </>
        )}
      </section>
    </main>
  );
}

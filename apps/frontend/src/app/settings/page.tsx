"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppFooter, AppNav } from "../app-nav";
import { WorkspaceSwitcher } from "../workspace-switcher";
import { resolveSettingsAccess, type SettingsAccess } from "./workspace-access";

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
  const [providerResult, setProviderResult] = useState<{ workspaceId: string; providers: Provider[] } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [access, setAccess] = useState<SettingsAccess | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const providers = providerResult?.workspaceId === workspaceId && access?.workspaceId === workspaceId
    ? providerResult.providers : [];
  const accessGeneration = useRef(0);
  const currentWorkspace = useRef(workspaceId);
  const onUnauthorized = useCallback(() => {
    accessGeneration.current += 1;
    setUnauthorized(true);
    setAccess(null);
    setProviderResult(null);
  }, []);
  const onWorkspaceError = useCallback(() => setMessage("Workspaces are unavailable."), []);

  const refreshAccess = useCallback(async (id: string): Promise<boolean> => {
    const generation = ++accessGeneration.current;
    setChecking(true);
    try {
      const [workspacesResponse, sessionResponse] = await Promise.all([
        fetch("/api/v1/workspaces", { cache: "no-store" }),
        fetch("/api/v1/auth/session", { cache: "no-store" }),
      ]);
      if (generation !== accessGeneration.current || currentWorkspace.current !== id) return false;
      if (workspacesResponse.status === 401 || sessionResponse.status === 401) { onUnauthorized(); return false; }
      if (!workspacesResponse.ok || !sessionResponse.ok) throw new Error("Workspace role unavailable");
      const selected = resolveSettingsAccess(await workspacesResponse.json(), await sessionResponse.json(), id);
      if (generation !== accessGeneration.current || currentWorkspace.current !== id) return false;
      if (!selected) {
        setAccess(null);
        setProviderResult(null);
        setMessage("Workspace access changed in another tab or your membership was removed. Select a workspace again.");
        return false;
      }
      setAccess(selected);
      setMessage((previous) => previous.startsWith("Workspace access changed") ||
        previous.startsWith("Workspace permissions could not") ? "" : previous);
      return selected.canManageConnections;
    } catch {
      if (generation === accessGeneration.current && currentWorkspace.current === id) {
        setAccess(null);
        setProviderResult(null);
        setMessage("Workspace permissions could not be verified. Retry after reconnecting.");
      }
      return false;
    } finally {
      if (generation === accessGeneration.current) setChecking(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    currentWorkspace.current = workspaceId;
    accessGeneration.current += 1;
    if (!workspaceId || unauthorized) return;
    let active = true;
    const check = () => { if (document.visibilityState === "visible") void refreshAccess(workspaceId); };
    void Promise.resolve().then(() => { if (active) return refreshAccess(workspaceId); });
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 15_000);
    return () => {
      active = false;
      accessGeneration.current += 1;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [workspaceId, unauthorized, refreshAccess]);

  async function refresh(id: string) {
    try {
      const response = await fetch("/api/v1/providers", { cache: "no-store", headers: { "x-elova-workspace-id": id } });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) {
        if (response.status === 403 || response.status === 409) {
          setAccess(null);
          setProviderResult(null);
          void refreshAccess(id);
        }
        setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying." : "Settings are temporarily unavailable.");
        return;
      }
      const result = await response.json() as { providers: Provider[] };
      if (currentWorkspace.current === id) setProviderResult({ workspaceId: id, providers: result.providers });
    } catch {
      if (currentWorkspace.current === id) setMessage("Settings are temporarily unavailable.");
    }
  }

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void fetch("/api/v1/providers", { cache: "no-store", headers: { "x-elova-workspace-id": workspaceId } }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) {
        if (response.status === 403 || response.status === 409) {
          setAccess(null);
          setProviderResult(null);
          void refreshAccess(workspaceId);
        }
        setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying." : "Settings are temporarily unavailable.");
        return;
      }
      const result = await response.json() as { providers: Provider[] };
      if (active && currentWorkspace.current === workspaceId) setProviderResult({ workspaceId, providers: result.providers });
    }).catch(() => { if (active) setMessage("Settings are temporarily unavailable."); });
    return () => { active = false; };
  }, [workspaceId, onUnauthorized, refreshAccess]);

  async function addProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = workspaceId;
    if (!id || access?.workspaceId !== id || !access.canManageConnections || checking || saving) return;
    const formElement = event.currentTarget;
    setSaving(true);
    setMessage("");
    try {
      if (!await refreshAccess(id) || currentWorkspace.current !== id) return;
      const form = new FormData(formElement);
      const response = await fetch("/api/v1/providers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-elova-workspace-id": id },
        body: JSON.stringify({ name: form.get("name"), baseUrl: form.get("baseUrl"), apiKey: form.get("apiKey") }),
      });
      if (!response.ok) {
        if (response.status === 401) { onUnauthorized(); return; }
        if (response.status === 403 || response.status === 409) {
          setAccess(null);
          void refreshAccess(id);
        }
        if (currentWorkspace.current === id) setMessage(await workspaceChanged(response) ? "Workspace changed in another tab. Reload before retrying."
          : response.status === 403 ? "Your workspace role changed. Connections are read-only."
          : "The private n8n connection could not be saved. Existing origins cannot be replaced.");
        return;
      }
      if (currentWorkspace.current !== id) return;
      formElement.reset();
      setMessage("Connection saved. The API key is encrypted in PostgreSQL.");
      await refresh(id);
    } catch {
      if (currentWorkspace.current === id) setMessage("The connection could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function synchronize(id: string) {
    const selectedId = workspaceId;
    if (!selectedId || access?.workspaceId !== selectedId || !access.canManageConnections || checking || syncing) return;
    setSyncing(id);
    try {
      if (!await refreshAccess(selectedId) || currentWorkspace.current !== selectedId) return;
      setMessage("Synchronizing sanitized workflow and execution evidence…");
      const response = await fetch(`/api/v1/providers/${encodeURIComponent(id)}/sync`, {
        method: "POST", headers: { "x-elova-workspace-id": selectedId },
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403 || response.status === 409) {
        setAccess(null);
        void refreshAccess(selectedId);
      }
      if (currentWorkspace.current !== selectedId) return;
      setMessage(response.ok ? "Synchronization completed." : await workspaceChanged(response)
        ? "Workspace changed in another tab. Reload before retrying."
        : response.status === 403 ? "Your workspace role changed. Connections are read-only."
        : response.status === 409 ? "Synchronization already in progress. Try again after it finishes."
        : response.status === 429 ? "Sync capacity reached. Try again shortly."
        : "Synchronization failed without storing raw content.");
      await refresh(selectedId);
    } catch {
      if (currentWorkspace.current === selectedId) setMessage("Synchronization could not be started. Please try again.");
    } finally {
      setSyncing(null);
    }
  }

  const canManage = !!access && access.workspaceId === workspaceId && access.canManageConnections;

  return (
    <div className="app-shell">
      <AppNav />
      <main id="main" tabIndex={-1} className="shell page-content settings-layout">
        <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Authenticated settings</p><h1>n8n <em>connections.</em></h1><p className="intro">Connections belong to the selected workspace. An n8n connection is optional; no API key is needed to use your workspace.</p></div><span className="heading-tag">PRIVATE CONNECTIONS / N8N</span></div>
        {!unauthorized && <WorkspaceSwitcher onWorkspaceChange={setWorkspaceId} onUnauthorized={onUnauthorized} onError={onWorkspaceError} />}
        {!unauthorized && !workspaceId && !message && <p className="notice" role="status">Loading connections…</p>}
        {unauthorized && <div className="notice" role="status"><p>Sign in before configuring n8n.</p><Link className="text-link" href="/login">Sign in <span aria-hidden="true">↗</span></Link></div>}
        {!unauthorized && <>
          {workspaceId && access?.workspaceId !== workspaceId && <p className="notice" role="status">Checking workspace permissions before enabling connections.</p>}
          {access && access.workspaceId === workspaceId && !access.canManageConnections &&
            <p className="notice" role="status">Read-only workspace access ({access.role}). You can view sanitized data, but only an owner or admin can add or sync connections.</p>}
          {workspaceId && <div className={canManage ? "settings-grid" : "settings-grid settings-grid-readonly"}>
            {canManage && <section className="form-surface" aria-labelledby="add-title">
              <p className="section-index">01 / ADD CONNECTION</p><h2 id="add-title">Connect n8n</h2>
              <p className="subtle">Each private origin keeps its own identity and history. To change instances, add a new connection.</p>
              <form className="form-card" onSubmit={addProvider}>
                <label>Connection name<input name="name" maxLength={120} required /></label>
                <label>Private Tailnet origin<input name="baseUrl" type="url" placeholder="http://n8n.example.ts.net:5678" required /></label>
                <label>API key<input name="apiKey" type="password" autoComplete="off" required /></label>
                <button className="button primary" disabled={checking || saving}>{saving ? "Saving…" : "Add connection"} <span aria-hidden="true">↗</span></button>
              </form>
            </section>}
            <section className="connections-surface" aria-labelledby="connections-title">
              <p className="section-index">02 / YOUR CONNECTIONS</p><h2 id="connections-title">Connected instances</h2>
              {access?.workspaceId === workspaceId && providerResult?.workspaceId === workspaceId && providers.length === 0 &&
                <p className="empty">No n8n connections in this workspace yet.</p>}
              <div className="provider-list">{providers.map((provider) => <article className="provider-card" key={provider.id}>
                <div className="provider-details"><h3>{provider.name}</h3><p>{provider.baseUrl}</p><small>{provider.status} · {provider.lastSyncedAt ? `last sync ${new Date(provider.lastSyncedAt).toLocaleString()}` : "not synchronized"}</small></div>
                {canManage && <button className="button" disabled={checking || syncing !== null} onClick={() => void synchronize(provider.id)}>{syncing === provider.id ? "Syncing…" : "Sync now"}</button>}
              </article>)}</div>
            </section>
          </div>}
          {message && <p className="notice" role="status">{message}</p>}
        </>}
      </main>
      <AppFooter />
    </div>
  );
}

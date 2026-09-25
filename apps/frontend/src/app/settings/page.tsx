"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppFooter, AppNav } from "../app-nav";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  status: string;
  lastSyncedAt: string | null;
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/v1/providers", { cache: "no-store" });
      if (response.status === 401) { setState("unauthorized"); return; }
      if (!response.ok) throw new Error("request failed");
      setProviders(((await response.json()) as { providers: Provider[] }).providers);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/providers", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setState("unauthorized"); return; }
      if (!response.ok) throw new Error("request failed");
      const body = await response.json() as { providers: Provider[] };
      if (controller.signal.aborted) return;
      setProviders(body.providers);
      setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  async function addProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/v1/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), baseUrl: form.get("baseUrl"), apiKey: form.get("apiKey") }),
      });
      if (response.status === 401) { setState("unauthorized"); return; }
      if (!response.ok) { setMessage("The private n8n connection could not be saved. Existing origins cannot be replaced."); return; }
      formElement.reset();
      setMessage("Connection saved.");
      await refresh();
    } catch {
      setMessage("The connection could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function synchronize(id: string) {
    setSyncing(id);
    setMessage("Synchronizing sanitized workflow and execution evidence…");
    try {
      const response = await fetch(`/api/v1/providers/${encodeURIComponent(id)}/sync`, { method: "POST" });
      if (response.status === 401) { setState("unauthorized"); return; }
      setMessage(response.ok ? "Synchronization completed." : response.status === 409
        ? "Synchronization already in progress. Try again after it finishes."
        : response.status === 429 ? "Sync capacity reached. Try again shortly."
        : "Synchronization failed without storing raw content.");
      await refresh();
    } catch {
      setMessage("Synchronization could not be started. Please try again.");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main id="main" tabIndex={-1} className="shell page-content settings-layout">
        <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Authenticated settings</p><h1>n8n <em>connections.</em></h1><p className="intro">Connect a private n8n origin to synchronize workflow and execution evidence.</p></div><span className="heading-tag">PRIVATE CONNECTIONS / N8N</span></div>
        {state === "loading" && <p className="notice" role="status">Loading connections…</p>}
        {state === "unauthorized" && <div className="notice" role="status"><p>Sign in before configuring n8n.</p><Link className="text-link" href="/login">Sign in <span aria-hidden="true">↗</span></Link></div>}
        {state === "error" && <div className="notice error" role="alert"><p>Settings are temporarily unavailable.</p><button className="button" onClick={() => void refresh()}>Try again</button></div>}
        {state === "ready" && <>
          <div className="settings-grid">
            <section className="form-surface" aria-labelledby="add-title">
              <p className="section-index">01 / ADD CONNECTION</p><h2 id="add-title">Connect n8n</h2>
              <p className="subtle">Each private origin keeps its own identity and history. To change instances, add a new connection.</p>
              <form className="form-card" onSubmit={addProvider}>
                <label>Connection name<input name="name" maxLength={120} required /></label>
                <label>Private Tailnet origin<input name="baseUrl" type="url" placeholder="http://n8n.example.ts.net:5678" required /></label>
                <label>API key<input name="apiKey" type="password" autoComplete="off" required /></label>
                <button className="button primary" disabled={saving}>{saving ? "Saving…" : "Add connection"} <span aria-hidden="true">↗</span></button>
              </form>
            </section>
            <section className="connections-surface" aria-labelledby="connections-title">
              <p className="section-index">02 / YOUR CONNECTIONS</p><h2 id="connections-title">Connected instances</h2>
              {providers.length === 0 ? <p className="empty">No n8n connections yet. Add a private origin to begin synchronizing.</p> : (
                <div className="provider-list">{providers.map((provider) => <article className="provider-card" key={provider.id}>
                  <div className="provider-details"><h3>{provider.name}</h3><p>{provider.baseUrl}</p><small>{provider.status} · {provider.lastSyncedAt ? `last sync ${new Date(provider.lastSyncedAt).toLocaleString()}` : "not synchronized"}</small></div>
                  <button className="button" disabled={syncing !== null} onClick={() => void synchronize(provider.id)}>{syncing === provider.id ? "Syncing…" : "Sync now"}</button>
                </article>)}</div>
              )}
            </section>
          </div>
          {message && <p className="notice" role="status">{message}</p>}
        </>}
      </main>
      <AppFooter />
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";

type Workspace = { id: string; name: string; role: string };

export function WorkspaceSwitcher({ onWorkspaceChange, onUnauthorized }: {
  onWorkspaceChange: (id: string) => void;
  onUnauthorized: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/v1/workspaces", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { if (mounted) onUnauthorized(); return; }
      if (!response.ok) throw new Error("workspaces unavailable");
      const result = await response.json() as { workspaces: Workspace[]; activeWorkspaceId: string | null };
      if (!mounted) return;
      setWorkspaces(result.workspaces);
      setActive(result.activeWorkspaceId ?? "");
      onWorkspaceChange(result.activeWorkspaceId ?? "");
    }).catch(() => { if (mounted) setMessage("Workspaces are unavailable."); });
    return () => { mounted = false; };
  }, [onWorkspaceChange, onUnauthorized]);

  async function select(id: string) {
    setPending(true);
    try {
      const response = await fetch("/api/v1/workspaces/select", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!response.ok) throw new Error("selection failed");
      window.location.reload();
    } catch { setMessage("Unable to switch workspace."); setPending(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const name = new FormData(event.currentTarget).get("name");
    try {
      const response = await fetch("/api/v1/workspaces", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("creation failed");
      window.location.reload();
    } catch { setMessage("Unable to create workspace."); setPending(false); }
  }

  return <section className="workspace-controls" aria-label="Workspace">
    <label>Current workspace <select aria-label="Current workspace" value={active} disabled={pending}
      onChange={(event) => void select(event.target.value)}>
      <option value="" disabled>Select workspace</option>
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
    </select></label>
    <form onSubmit={create}><input name="name" aria-label="New workspace name" placeholder="New workspace name"
      maxLength={120} required disabled={pending} /> <button className="button" disabled={pending}>Create workspace</button></form>
    {message && <p role="status">{message}</p>}
  </section>;
}

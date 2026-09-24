"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "ready" | "not_ready";

export function StatusCard() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/status", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => setStatus(response.ok ? "ready" : "not_ready"))
      .catch(() => {
        if (!controller.signal.aborted) setStatus("not_ready");
      });
    return () => controller.abort();
  }, []);

  const label = status === "checking"
    ? "Checking private service…"
    : status === "ready"
      ? "Private service available"
      : "Private service temporarily unavailable";

  return (
    <section className="status-card" aria-live="polite">
      <span className={`status-dot status-${status}`} aria-hidden="true" />
      <div>
        <p className="status-label">Service status</p>
        <p className="status-value">{label}</p>
      </div>
    </section>
  );
}

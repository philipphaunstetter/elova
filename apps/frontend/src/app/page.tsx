import Link from "next/link";
import { AppNav } from "./app-nav";
import { StatusCard } from "./status-card";

export default function HomePage() {
  return (
    <main className="app-shell">
      <AppNav />
      <section className="service-panel">
        <p className="eyebrow">Workflow observability</p>
        <h1>Know how every n8n workflow is performing.</h1>
        <p className="intro">
          Elova stores workflow structure and execution outcomes in private PostgreSQL on GX10. Sensitive
          workflow and execution content is sanitized before it is persisted.
        </p>
        <div className="actions">
          <Link className="button primary" href="/dashboard">Open dashboard</Link>
          <Link className="button" href="/settings">Configure n8n</Link>
        </div>
        <StatusCard />
      </section>
    </main>
  );
}

import Link from "next/link";
import { StatusCard } from "./status-card";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header>
        <Link className="brand" href="/" aria-label="Elova home">
          <span className="brand-mark">e</span>
          <span>elova</span>
        </Link>
      </header>
      <section className="service-panel">
        <p className="eyebrow">Workflow observability</p>
        <h1>Elova is connecting</h1>
        <p className="intro">
          The frontend is online. Workflow and execution views remain unavailable until the private service is ready.
        </p>
        <StatusCard />
      </section>
    </main>
  );
}

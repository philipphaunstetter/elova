import Link from "next/link";
import { AppFooter, AppNav } from "./app-nav";
import { StatusCard } from "./status-card";

export default function HomePage() {
  return (
    <div className="app-shell">
      <AppNav />
      <main id="main" tabIndex={-1}>
        <section className="shell home-hero" aria-labelledby="home-title">
          <div className="home-copy">
            <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Workflow observability for n8n</p>
            <h1 id="home-title">See the story behind <em>your workflows.</em></h1>
            <p className="intro">Bring n8n execution outcomes into focus. Sign in to review synchronized history or configure a private connection.</p>
            <div className="actions">
              <Link className="button primary" href="/dashboard">Open dashboard <span aria-hidden="true">↗</span></Link>
              <Link className="text-link" href="/settings">Configure n8n <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
          <div className="home-visual">
            <div className="visual-top"><span>YOUR WORKFLOWS, IN CONTEXT</span><span aria-hidden="true">✳</span></div>
            <div className="visual-center" aria-hidden="true">
              <span>n8n workflow</span><span className="visual-line" /><span className="visual-node">Execution outcomes <b>↗</b></span>
            </div>
            <div className="visual-bottom"><span>OWNER WORKSPACE</span><strong>From run to result.</strong></div>
          </div>
        </section>
        <section className="home-status shell" aria-label="Service availability">
          <div><p className="section-index">01 / SERVICE STATUS</p><h2>Your private service, at a glance.</h2><p className="subtle">Availability is checked through the same-origin application gateway.</p></div>
          <StatusCard />
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

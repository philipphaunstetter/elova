import Link from "next/link";

function Wordmark() {
  return <span className="wordmark">Elova<span aria-hidden="true"> ✳</span></span>;
}

export function AppNav() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="brand" href="/" aria-label="Elova home"><Wordmark /></Link>
          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/settings">Settings</Link>
            <Link className="nav-login" href="/login">Sign in</Link>
          </nav>
        </div>
      </header>
    </>
  );
}

export function AppFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <Link className="brand" href="/" aria-label="Elova home"><Wordmark /></Link>
        <p>Private n8n workflow observability</p>
      </div>
    </footer>
  );
}

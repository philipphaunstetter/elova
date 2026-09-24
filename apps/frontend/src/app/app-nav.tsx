import Link from "next/link";

export function AppNav() {
  return (
    <header>
      <Link className="brand" href="/" aria-label="Elova home">
        <span className="brand-mark">e</span>
        <span>elova</span>
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/settings">Settings</Link>
        <Link href="/login">Login</Link>
      </nav>
    </header>
  );
}

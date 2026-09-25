"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppFooter, AppNav } from "../app-nav";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        setError("Sign in failed. Check your account credentials.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sign in is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main id="main" tabIndex={-1} className="shell page-content auth-layout">
        <div className="auth-intro">
          <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Private workspace access</p>
          <h1>Welcome <em>back.</em></h1>
          <p className="intro">Sign in to view your workspace and its workflow execution evidence.</p>
          <p className="auth-note">The first super administrator and admin workspace are enrolled once through a protected local operator handoff.</p>
        </div>
        <section className="form-surface" aria-labelledby="login-title">
          <p className="section-index">01 / SIGN IN</p>
          <h2 id="login-title">Sign in to Elova</h2>
          <form onSubmit={submit} className="form-card">
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

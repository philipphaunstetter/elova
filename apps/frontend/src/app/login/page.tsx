"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "../app-nav";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    setPending(false);
    if (!response.ok) {
      setError("Login failed. Check your account credentials.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <AppNav />
      <section className="form-panel">
        <p className="eyebrow">Private workspace access</p>
        <h1>Sign in to Elova</h1>
        <p className="intro">The first super administrator and admin workspace are enrolled once through a protected local operator handoff.</p>
        <form onSubmit={submit} className="form-card">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

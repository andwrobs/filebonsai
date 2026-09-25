import { useState, type FormEvent } from "react";
import { redirect, useNavigate } from "react-router";

import { filebonsaiService } from "../../src/lib/api/filebonsai-service.js";

// "authentik" when the backend has Authentik OIDC sign-in configured.
const oidcProvider = import.meta.env.VITE_FILEBONSAI_OIDC as string | undefined;

export async function clientLoader() {
  const result = await filebonsaiService().getCurrentSession();
  if (result.data) return redirect("/");
  if (result.response.status === 401) return null;
  throw new Response("Sign-in is unavailable.", { status: result.response.status });
}

clientLoader.hydrate = true;

export function meta() {
  return [{ title: "Sign in · Filebonsai" }];
}

export default function SignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const passwordInput = event.currentTarget.elements.namedItem("password") as HTMLInputElement;
    const password = passwordInput.value;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await filebonsaiService().login(password);
      passwordInput.value = "";
      if (result.data) {
        void navigate("/", { replace: true });
        return;
      }
      setMessage(result.response.status === 429
        ? "Too many attempts. Wait before trying again."
        : result.response.status === 401
          ? "Password not recognized. Try again."
          : "Could not sign in. Please try again.");
    } catch {
      passwordInput.value = "";
      setMessage("Could not connect. Check the server and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="sign-in-shell">
    <section className="sign-in-card" aria-labelledby="sign-in-heading">
      <p className="sign-in-brand">Filebonsai</p>
      <p className="eyebrow">Your Library</p>
      <h1 id="sign-in-heading">Sign in</h1>
      <p className="sign-in-intro">Enter the password for the local owner account.</p>
      <form onSubmit={event => void submit(event)}>
        <label htmlFor="owner-password">Password</label>
        <input autoComplete="current-password" autoFocus id="owner-password" name="password" required type="password" />
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {oidcProvider === "authentik"
        ? <a className="secondary-button sign-in-oidc" href="/oauth2/authorization/authentik">Continue with Authentik</a>
        : null}
      <p className="sign-in-help">First time here? Ask the server operator to set up the owner account.</p>
    </section>
  </main>;
}

export function ErrorBoundary() {
  return <main className="route-error">
    <p className="eyebrow">Unavailable</p>
    <h1>Sign-in is unavailable</h1>
    <p>Check the server connection, then try again.</p>
    <a className="primary-button" href="/sign-in">Try again</a>
  </main>;
}

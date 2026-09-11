import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { ta } from "@/lib/shop/admin-i18n";
import { authHasAdmin } from "@/lib/shop/fn-admin";

export const Route = createFileRoute("/login")({ component: Login });

function mapAuthError(raw: string): string {
  if (/invalid origin/i.test(raw)) {
    return "Домен не в списке доверенных. Задайте BETTER_AUTH_URL=http://ВАШ_IP:8080 и перезапустите сервер.";
  }
  if (/закрыта|forbidden/i.test(raw)) return raw;
  return raw || ta("login_failed");
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    authHasAdmin()
      .then((r) => setHasAdmin(r.hasAdmin))
      .catch(() => setHasAdmin(false));
  }, []);

  if (isPending) {
    return <main className="grid-bg min-h-screen" />;
  }
  if (user) return <Navigate to="/admin" />;

  const allowSignup = hasAdmin === false;

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        if (!allowSignup) throw new Error("Регистрация закрыта. Обратитесь к супер-админу.");
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0] ?? "Admin",
          callbackURL: "/admin",
        });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/admin",
        });
        if (err) throw new Error(err.message);
      }
      window.location.href = "/admin";
    } catch (err) {
      setError(mapAuthError(err instanceof Error ? err.message : ta("login_failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid-bg relative min-h-screen px-4 py-12">
      <div className="scanlines absolute inset-0 opacity-40" />
      <div className="relative mx-auto w-full max-w-md space-y-6">
        <Link to="/" className="font-mono text-xs tracking-[0.3em] text-primary">
          {ta("login_kicker")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{ta("login_title")}</h1>
        <p className="text-sm text-muted">{hasAdmin ? ta("login_copy_existing") : ta("login_copy")}</p>
        <div className="panel space-y-3 rounded-xl p-5">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/admin" })}
              >
                {ta("continue_with", { p: p.label })}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">{ta("signin_disabled")}</p>
          )}
          <div className="flex items-center gap-3 py-2 text-[11px] tracking-widest text-faint uppercase">
            <span className="h-px flex-1 bg-border" />
            {ta("email")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="space-y-3" onSubmit={onEmail}>
            <label className="block text-xs text-muted">
              {ta("email")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="username"
              />
            </label>
            <label className="block text-xs text-muted">
              {ta("password")}
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={mode === "up" ? 12 : 8}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "in" ? ta("sign_in") : ta("create_admin")}
            </Button>
          </form>
          {allowSignup ? (
            <button
              type="button"
              className="text-xs text-cyan"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? ta("create_first") : ta("have_account")}
            </button>
          ) : (
            <p className="text-xs text-muted">{ta("signup_closed")}</p>
          )}
        </div>
      </div>
    </main>
  );
}

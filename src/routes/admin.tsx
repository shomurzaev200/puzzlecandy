import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { adminMe, adminNotifications } from "@/lib/shop/fn-session";
import { AdminShell } from "@/components/admin/shell";
import { ta } from "@/lib/shop/admin-i18n";
import { Button } from "@/components/ui/button";
import type { AdminActor } from "@/lib/shop/admin";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { user, isPending } = useCurrentUserState();
  const [admin, setAdmin] = useState<AdminActor | null | "forbidden" | "signed-out">(null);
  const [unread, setUnread] = useState(0);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFail(null);
    adminMe()
      .then(setAdmin)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setFail(message);
        if (/unauthorized|401/i.test(message)) setAdmin("signed-out");
        else setAdmin("forbidden");
      });
    adminNotifications()
      .then((n) => setUnread(n.filter((x) => !x.read_at).length))
      .catch(() => setUnread(0));
  }, [user]);

  if (isPending || (user && admin === null)) {
    return (
      <div className="grid-bg min-h-screen p-8">
        <div className="mx-auto h-40 max-w-xl animate-pulse rounded-xl bg-panel" />
      </div>
    );
  }
  if (!user || admin === "signed-out") return <RedirectToSignIn />;
  if (admin === "forbidden") {
    return (
      <main className="grid-bg grid min-h-screen place-items-center p-6 text-center">
        <div className="panel max-w-md rounded-xl p-8">
          <h1 className="text-xl font-semibold">{ta("no_seat")}</h1>
          <p className="mt-2 text-sm text-muted">{ta("no_seat_copy")}</p>
          {fail ? <p className="mt-3 font-mono text-xs text-danger">{fail}</p> : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/login" className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm">
              {ta("sign_in")}
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                void signOut().catch(() => undefined);
              }}
            >
              {ta("logout")}
            </Button>
          </div>
        </div>
      </main>
    );
  }
  if (!admin) return <RedirectToSignIn />;

  return (
    <AdminShell
      permissions={admin.permissions}
      unread={unread}
      role={admin.role}
      email={admin.email}
      name={admin.name}
    >
      <Outlet />
    </AdminShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  CreditCard,
  LayoutDashboard,
  Shield,
  Truck,
} from "lucide-react";
import { publicStats } from "@/lib/shop/fn-admin";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ta } from "@/lib/shop/admin-i18n";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isPending } = useCurrentUserState();
  const [stats, setStats] = useState<{ deals: number; products: number } | null>(null);
  useEffect(() => {
    publicStats()
      .then(setStats)
      .catch(() => setStats({ deals: 0, products: 0 }));
  }, []);

  return (
    <main className="grid-bg relative min-h-screen overflow-hidden">
      <div className="scanlines absolute inset-0 opacity-30" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-border-strong text-primary glow-sm">
            <Shield className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[11px] tracking-[0.28em] text-primary">🍬 PUZZLECANDY</p>
            <p className="text-xs text-muted">{ta("brand_panel")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isPending ? <div className="size-8 animate-pulse rounded-full bg-raised" /> : null}
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <Link
              to="/login"
              className="rounded-md border border-border px-3 py-2 text-sm text-fg hover:border-primary"
            >
              {ta("operator_login")}
            </Link>
          </SignedOut>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-6">
        <p className="font-mono text-xs tracking-[0.28em] text-cyan">{ta("land_kicker")}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {ta("land_title")}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          {ta("land_copy")}
        </p>
        <div className="mt-8 flex flex-wrap gap-6 font-mono text-sm">
          <Stat label={ta("deals")} value={String(stats?.deals ?? 0).padStart(4, "0")} />
          <Stat label={ta("kpi_skus")} value={String(stats?.products ?? 0)} />
          <Stat label={ta("hours")} value="10:00–22:00" />
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Portal
            to="/shop"
            icon={<Bot className="size-5" />}
            kicker={ta("land_k_shop")}
            title={ta("land_shop")}
            copy={ta("land_shop_copy")}
          />
          <Portal
            to="/pay"
            icon={<CreditCard className="size-5" />}
            kicker={ta("land_k_pay")}
            title={ta("land_pay")}
            copy={ta("land_pay_copy")}
          />
          <Portal
            to="/courier"
            icon={<Truck className="size-5" />}
            kicker={ta("land_k_cour")}
            title={ta("land_cour")}
            copy={ta("land_cour_copy")}
          />
          <Portal
            to="/admin"
            icon={<LayoutDashboard className="size-5" />}
            kicker={ta("land_k_admin")}
            title={ta("land_admin")}
            copy={ta("land_admin_copy")}
          />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.2em] text-faint uppercase">{label}</p>
      <p className="mt-1 text-2xl text-primary tabular-nums">{value}</p>
    </div>
  );
}

function Portal({
  to,
  icon,
  kicker,
  title,
  copy,
}: {
  to: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <Link
      to={to}
      className="panel group flex flex-col rounded-xl p-5 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between text-primary">
        {icon}
        <ArrowUpRight className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-6 font-mono text-[10px] tracking-[0.28em] text-cyan">{kicker}</p>
      <h2 className="mt-1 text-xl font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
    </Link>
  );
}

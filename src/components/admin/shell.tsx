import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  Briefcase,
  ChevronRight,
  ClipboardList,
  FolderTree,
  Headphones,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCw,
  Rows3,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  Truck,
  Users,
  Wallet,
  Webhook,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Command } from "cmdk";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/lib/auth/gates";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/shop/types";
import { ta, roleLabel, toneClass, statusLabel } from "@/lib/shop/admin-i18n";
import { InboxBell, SidePins, useDensity } from "./ops-kit";
import { evalCommandCalc, loadSoundPrefs, playPing, slaLevel, slaMinutes } from "@/lib/shop/ops-client";
import { opsSearch } from "@/lib/shop/fn-ops";
import { adminNavCounts } from "@/lib/shop/fn-admin";

type BadgeKey = "orders" | "payments" | "errors" | "tickets" | "unread";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: Permission;
  badge?: BadgeKey;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: ta("nav_group_overview"),
    items: [
      { to: "/admin", label: ta("nav_dashboard"), icon: LayoutDashboard, perm: "dashboard" },
      { to: "/admin/analytics", label: ta("nav_analytics"), icon: Activity, perm: "analytics.read" },
    ],
  },
  {
    id: "ops",
    label: ta("nav_group_ops"),
    items: [
      { to: "/admin/orders", label: ta("nav_orders"), icon: ClipboardList, perm: "orders.read", badge: "orders" },
      { to: "/admin/payments", label: ta("nav_payments"), icon: Wallet, perm: "payments.read", badge: "payments" },
      { to: "/admin/transactions", label: ta("nav_transactions"), icon: Receipt, perm: "transactions.read" },
      { to: "/admin/refunds", label: "Возвраты", icon: RefreshCw, perm: "payments.read" },
      { to: "/admin/approvals", label: "Согласования", icon: ShieldCheck, perm: "dashboard" },
      { to: "/admin/couriers", label: ta("nav_couriers"), icon: Truck, perm: "couriers.read" },
      { to: "/admin/map", label: ta("nav_map"), icon: Map, perm: "map.read" },
      { to: "/admin/payouts", label: "Выплаты", icon: Wallet, perm: "couriers.read" },
      { to: "/admin/ops", label: "Операции", icon: Sparkles, perm: "dashboard" },
    ],
  },
  {
    id: "catalog",
    label: ta("nav_group_catalog"),
    items: [
      { to: "/admin/products", label: ta("nav_products"), icon: ShoppingBag, perm: "products.read" },
      { to: "/admin/categories", label: ta("nav_categories"), icon: FolderTree, perm: "categories.write" },
      { to: "/admin/reviews", label: ta("nav_reviews"), icon: Star, perm: "reviews.moderate" },
      { to: "/admin/promo", label: "Промокоды", icon: Ticket, perm: "settings.read" },
    ],
  },
  {
    id: "people",
    label: ta("nav_group_people"),
    items: [
      { to: "/admin/users", label: ta("nav_users"), icon: Users, perm: "users.read" },
      { to: "/admin/segments", label: "Сегменты", icon: Users, perm: "users.read" },
      { to: "/admin/jobs", label: ta("nav_jobs"), icon: Briefcase, perm: "jobs.write" },
    ],
  },
  {
    id: "comms",
    label: ta("nav_group_comms"),
    items: [
      { to: "/admin/support", label: ta("nav_support"), icon: Headphones, perm: "support.read", badge: "tickets" },
      { to: "/admin/bots", label: ta("nav_bots"), icon: Bot, perm: "bots.manage" },
      { to: "/admin/notifications", label: ta("nav_notifications"), icon: Bell, perm: "notifications.read", badge: "unread" },
      { to: "/admin/canned", label: "Шаблоны", icon: MessageSquareText, perm: "support.write" },
    ],
  },
  {
    id: "system",
    label: ta("nav_group_system"),
    items: [
      { to: "/admin/staff", label: ta("nav_roles"), icon: Shield, perm: "roles.write" },
      { to: "/admin/audit", label: ta("nav_audit"), icon: ScrollText, perm: "audit.read" },
      { to: "/admin/errors", label: ta("nav_errors"), icon: AlertTriangle, perm: "errors.read", badge: "errors" },
      { to: "/admin/settings", label: ta("nav_settings"), icon: Settings, perm: "settings.read" },
      { to: "/admin/rules", label: "Правила", icon: ShieldCheck, perm: "settings.read" },
      { to: "/admin/keys", label: "API-ключи", icon: KeyRound, perm: "settings.secrets" },
      { to: "/admin/webhooks", label: "Вебхуки", icon: Webhook, perm: "settings.write" },
      { to: "/admin/handover", label: "Смена", icon: RefreshCw, perm: "dashboard" },
      { to: "/admin/changelog", label: "Что нового", icon: ScrollText, perm: "dashboard" },
      { to: "/admin/help", label: "Справка", icon: Search, perm: "dashboard" },
    ],
  },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const COMMANDS: Array<{ id: string; label: string; to: string; keywords: string }> = [
  { id: "user", label: ta("cmd_find_user"), to: "/admin/users", keywords: "пользователь user @ " },
  { id: "product", label: ta("cmd_create_product"), to: "/admin/products", keywords: "товар создать product" },
  { id: "balance", label: ta("cmd_balance"), to: "/admin/users", keywords: "баланс money" },
  { id: "pay", label: ta("cmd_pending_pay"), to: "/admin/payments?status=PENDING", keywords: "платеж pending" },
  { id: "order", label: ta("cmd_find_order"), to: "/admin/orders", keywords: "заказ ord" },
  { id: "couriers", label: ta("cmd_couriers"), to: "/admin/couriers", keywords: "курьер" },
  { id: "map", label: ta("cmd_map"), to: "/admin/map", keywords: "карта map" },
  { id: "bots", label: ta("nav_bots"), to: "/admin/bots", keywords: "telegram бот" },
];

type Counts = { orders: number; payments: number; errors: number; tickets: number };

function isActivePath(pathname: string, to: string) {
  if (to === "/admin") return pathname === "/admin";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function crumbLabel(pathname: string) {
  if (pathname === "/admin") return ta("crumbs_home");
  const item = NAV.find((n) => n.to !== "/admin" && (pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return item?.label ?? pathname.replace("/admin/", "");
}

export function AdminShell({
  children,
  permissions,
  unread,
  role,
  email,
  name,
}: {
  children: ReactNode;
  permissions: Permission[];
  unread: number;
  role: string;
  email?: string | null;
  name?: string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQ, setCmdQ] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [live, setLive] = useState(true);
  const [counts, setCounts] = useState<Counts>({ orders: 0, payments: 0, errors: 0, tickets: 0 });
  const { density, set: setDensity } = useDensity();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("pc.sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    adminNavCounts()
      .then(setCounts)
      .catch(() => undefined);
    const t = window.setInterval(() => {
      adminNavCounts()
        .then(setCounts)
        .catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(t);
  }, []);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((n) => !n.perm || permissions.includes(n.perm)),
      })).filter((g) => g.items.length > 0),
    [permissions],
  );
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
      if (e.key === "F1") {
        e.preventDefault();
        void navigate({ to: "/admin/$section", params: { section: "help" } });
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      setLive(true);
      try {
        const data = JSON.parse(ev.data) as { type?: string; title?: string; body?: string };
        if (!data?.title) return;
        toast(data.title, { description: data.body });
        const prefs = loadSoundPrefs();
        if (prefs.enabled && prefs.events.includes(data.type ?? "")) {
          playPing(prefs.volume);
        }
      } catch {
        /* ping */
      }
    };
    return () => es.close();
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("pc.sidebar", next ? "collapsed" : "open");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function go(to: string) {
    setDrawer(false);
    setCmdOpen(false);
    const [path] = to.split("?");
    void navigate({ to: path });
  }

  function badgeValue(key?: BadgeKey) {
    if (!key) return 0;
    if (key === "unread") return unread;
    return counts[key] ?? 0;
  }

  function NavList({ compact }: { compact: boolean }) {
    return (
      <nav className="space-y-4 px-2 pb-4">
        {groups.map((g) => (
          <div key={g.id}>
            {compact ? (
              <div className="mx-auto mb-1 h-px w-6 bg-border" />
            ) : (
              <p className="px-3 pb-1 text-[10px] font-medium tracking-[0.16em] text-faint uppercase">{g.label}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = isActivePath(pathname, n.to);
                const Icon = n.icon;
                const count = badgeValue(n.badge);
                const critical = n.badge === "errors" && count > 0;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    title={compact ? n.label : undefined}
                    onClick={() => setDrawer(false)}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                      compact && "justify-center px-0",
                      active
                        ? "border-l-2 border-primary bg-primary/10 font-medium text-primary"
                        : "border-l-2 border-transparent text-muted hover:bg-raised/80 hover:text-fg",
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted group-hover:text-fg")} />
                    {compact ? null : <span className="min-w-0 flex-1 truncate">{n.label}</span>}
                    {!compact && count > 0 ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                          critical ? "bg-danger/20 text-danger" : "bg-raised text-muted",
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                    {compact && count > 0 ? (
                      <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  const brand = (
    <div className={cn("flex items-center gap-2.5 px-3 py-3", collapsed && "justify-center px-2")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10">
        <Boxes className="size-4 text-primary" />
      </div>
      {collapsed ? null : (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-wide text-fg">PUZZLECANDY</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-primary">{roleLabel(role)}</p>
        </div>
      )}
    </div>
  );

  const profile = (
    <div className={cn("border-t border-border p-2", collapsed && "px-1")}>
      <div className={cn("flex items-center gap-2 rounded-lg px-2 py-2", collapsed && "justify-center px-0")}>
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">
          {(name || email || "A").slice(0, 1).toUpperCase()}
        </div>
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-fg">{name || roleLabel(role)}</p>
            <p className="truncate text-[11px] text-muted">{email || "оператор"}</p>
          </div>
        )}
        {collapsed ? null : <AdminUser confirm />}
      </div>
    </div>
  );

  const sidebarInner = (
    <>
      {brand}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList compact={collapsed} />
        {collapsed ? null : <SidePins />}
      </div>
      {profile}
    </>
  );

  return (
    <div className="admin-shell grid-bg flex h-[100dvh] overflow-hidden" data-density={density}>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          className: "panel !bg-surface !text-fg !border-border",
        }}
      />
      <aside
        className={cn(
          "admin-sidebar hidden h-full shrink-0 flex-col border-r border-border lg:flex",
          collapsed ? "w-16" : "w-[260px]",
        )}
      >
        {sidebarInner}
      </aside>
      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-bg/70" aria-label={ta("close")} onClick={() => setDrawer(false)} />
          <div className="admin-sidebar relative flex h-full w-[min(86vw,280px)] flex-col border-r border-border">
            <div className="flex items-center justify-between pr-1">
              {brand}
              <button type="button" className="grid size-11 place-items-center" onClick={() => setDrawer(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavList compact={false} />
            </div>
            {profile}
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-3 backdrop-blur-md lg:px-4">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-md border border-border lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label={ta("menu")}
          >
            <Menu className="size-4" />
          </button>
          <button
            type="button"
            className="hidden size-10 place-items-center rounded-md border border-border text-muted hover:text-fg lg:grid"
            onClick={toggleCollapsed}
            title={collapsed ? ta("nav_expand") : ta("nav_collapse")}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <div className="hidden items-center gap-1 text-[12px] text-muted sm:flex">
            <Link to="/admin" className="hover:text-fg">
              {ta("crumbs_home")}
            </Link>
            {pathname !== "/admin" ? (
              <>
                <ChevronRight className="size-3.5" />
                <span className="text-fg">{crumbLabel(pathname)}</span>
              </>
            ) : null}
          </div>
          <GlobalSearch />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hidden min-h-10 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] text-muted sm:flex"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="size-3.5" />
              {ta("cmd_hint")}
            </button>
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] sm:inline-flex",
                live ? "border-primary/30 text-primary" : "border-danger/30 text-danger",
              )}
              title={live ? ta("sys_ok") : ta("nav_errors")}
            >
              <span className={cn("size-1.5 rounded-full", live ? "bg-primary" : "bg-danger")} />
              {ta("sys_live")}
            </span>
            <button
              type="button"
              className="hidden size-10 place-items-center rounded-md border border-border text-muted sm:grid"
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
              title="Плотность"
            >
              <Rows3 className="size-4" />
            </button>
            <InboxBell unread={unread} />
            <div className="hidden lg:block">
              <AdminUser confirm />
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>
      </div>
      {cmdOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-start bg-bg/70 pt-[12vh]">
          <button type="button" className="absolute inset-0" aria-label={ta("close")} onClick={() => setCmdOpen(false)} />
          <Command className="relative z-10 mx-auto w-[min(640px,92vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-glow">
            <Command.Input
              autoFocus
              placeholder={ta("cmd_placeholder")}
              className="min-h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
              onValueChange={setCmdQ}
            />
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-sm text-muted">{ta("empty")}</Command.Empty>
              {evalCommandCalc(cmdQ).ok ? (
                <div className="mb-2 rounded-md border border-cyan/30 bg-raised px-3 py-2 font-mono text-sm text-cyan">
                  {(evalCommandCalc(cmdQ) as { ok: true; result: string; detail: string }).result}
                  <p className="text-[11px] text-muted">{(evalCommandCalc(cmdQ) as { ok: true; result: string; detail: string }).detail}</p>
                </div>
              ) : null}
              {COMMANDS.concat(items.map((n) => ({ id: n.to, label: n.label, to: n.to, keywords: n.label }))).map((c) => (
                <Command.Item
                  key={c.id}
                  value={`${c.label} ${c.keywords}`}
                  onSelect={() => go(c.to)}
                  className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm data-[selected=true]:bg-raised data-[selected=true]:text-primary"
                >
                  {c.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setHits({});
      return;
    }
    timer.current = setTimeout(() => {
      opsSearch({ data: { q: q.trim() } })
        .then((r) => {
          setHits(r as Record<string, Array<Record<string, unknown>>>);
          setOpen(true);
        })
        .catch(() => setHits({}));
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const groups = useMemo(
    () =>
      [
        ["users", ta("nav_users"), "/admin/users"],
        ["orders", ta("nav_orders"), "/admin/orders"],
        ["payments", ta("nav_payments"), "/admin/payments"],
        ["products", ta("nav_products"), "/admin/products"],
        ["tickets", ta("nav_support"), "/admin/support"],
        ["couriers", ta("nav_couriers"), "/admin/couriers"],
        ["logs", ta("nav_audit"), "/admin/audit"],
      ] as const,
    [],
  );

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-panel/80 px-3">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim() && setOpen(true)}
          placeholder={ta("search_placeholder")}
          className="min-h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>
      {open && q.trim() ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-glow">
          {groups.map(([key, label, to]) => {
            const rows = hits[key] ?? [];
            if (!rows.length) return null;
            return (
              <div key={key} className="mb-2">
                <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-faint">{label}</p>
                {rows.slice(0, 5).map((row) => (
                  <button
                    key={String(row.id)}
                    type="button"
                    className="flex min-h-10 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-raised"
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: "/admin/$section", params: { section: to.replace("/admin/", "") } });
                    }}
                  >
                    <span>
                      {String(row.username ?? row.first_name ?? row.public_code ?? row.subject ?? row.id)}
                    </span>
                    {row.status ? <span className={cn("text-xs", toneClass(String(row.status)))}>{statusLabel(String(row.status))}</span> : null}
                  </button>
                ))}
              </div>
            );
          })}
          {!groups.some(([k]) => (hits[k] ?? []).length) ? <p className="px-2 py-4 text-sm text-muted">{ta("empty")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PageTitle({ kicker, title, actions }: { kicker: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-mono text-[11px] tracking-[0.28em] text-cyan">{kicker}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="panel rounded-xl p-4">
      <p className="text-[11px] tracking-[0.18em] text-faint uppercase">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl tabular-nums", warn ? "text-warn" : "text-fg")}>{value}</p>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary"
      />
    </label>
  );
}

export function Badge({ value }: { value: string | null | undefined }) {
  return <span className={cn("text-sm font-medium", toneClass(value))}>{statusLabel(value)}</span>;
}

const subscribeToNothing = () => () => {};
const noGateOnServer = () => false;

function AdminUser({ confirm = false }: { confirm?: boolean }) {
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, noGateOnServer);
  return (
    <div className="flex items-center gap-1">
      <div className="[&_button]:hidden">
        <UserButton />
      </div>
      {authEnabled && !gateSession ? (
        <button
          type="button"
          disabled={signingOut}
          className="grid size-9 place-items-center rounded-md text-muted hover:bg-raised hover:text-danger"
          title={ta("logout")}
          onClick={() => {
            if (confirm && !window.confirm(ta("logout_confirm"))) return;
            setSigningOut(true);
            void signOut().catch(() => setSigningOut(false));
          }}
        >
          <LogOut className="size-4" />
          <span className="sr-only">{signingOut ? ta("signing_out") : ta("logout")}</span>
        </button>
      ) : null}
    </div>
  );
}

export function WaitBadge({ since }: { since: unknown }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!since) return null;
  const start = new Date(String(since)).getTime();
  if (!Number.isFinite(start)) return null;
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const mins = slaMinutes(since, now) ?? 0;
  const level = slaLevel(since, now);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = h
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs",
        level === "ok" && "text-muted",
        level === "warn" && "bg-warn/10 text-warn",
        level === "crit" && "sla-blink bg-danger/15 text-danger",
      )}
    >
      {level === "crit" || level === "warn" ? `SLA ${mins} мин` : `${ta("sla")}: ${label}`}
    </span>
  );
}

export function SavedFilters({
  storageKey,
  current,
  onApply,
}: {
  storageKey: string;
  current: string;
  onApply: (value: string) => void;
}) {
  const [items, setItems] = useState<Array<{ name: string; value: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]") as Array<{ name: string; value: string }>;
    } catch {
      return [];
    }
  });
  function persist(next: Array<{ name: string; value: string }>) {
    setItems(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((f) => (
        <Button key={f.name} variant={current === f.value ? "primary" : "ghost"} onClick={() => onApply(f.value)}>
          {f.name}
        </Button>
      ))}
      <Button
        variant="plain"
        onClick={() => {
          const name = window.prompt(ta("filter_name"), current === "PENDING" ? ta("filter_pending_pay") : current);
          if (!name?.trim()) return;
          persist([...items.filter((x) => x.name !== name.trim()), { name: name.trim(), value: current }]);
        }}
      >
        {ta("save_filter")}
      </Button>
    </div>
  );
}


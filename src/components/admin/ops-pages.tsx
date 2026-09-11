import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, PageTitle, StatCard } from "./shell";
import { Timeline } from "./ops-kit";
import { formatMoney } from "@/lib/shop/money";
import { asInt } from "@/lib/shop/codec";
import { ta, statusLabel } from "@/lib/shop/admin-i18n";
import { CHANGELOG } from "@/lib/shop/ops-client";
import {
  opsAnomalies,
  opsApprovalDecide,
  opsApprovals,
  opsBroadcast,
  opsCanned,
  opsCannedSave,
  opsHandover,
  opsHandovers,
  opsImport,
  opsKeyCreate,
  opsKeyRevoke,
  opsKeys,
  opsPayoutAdd,
  opsPayouts,
  opsPromoApply,
  opsPromoSave,
  opsPromos,
  opsReconcile,
  opsRefundCreate,
  opsRefundDecide,
  opsRefunds,
  opsRuleSave,
  opsRules,
  opsSegments,
  opsWebhookReplay,
  opsWebhookSave,
  opsWebhooks,
} from "@/lib/shop/fn-ops";
import { adminCouriers, adminUsers } from "@/lib/shop/fn-admin";

function money(v: unknown) {
  return formatMoney(asInt(v));
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const reload = () => {
    fn()
      .then(setData)
      .catch(() => setData(null));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, reload };
}

export function RefundsPage() {
  const { data, reload } = useLoad(() => opsRefunds());
  const users = useLoad(() => adminUsers({ data: { status: "ALL" } }));
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("возврат");
  return (
    <div>
      <PageTitle kicker="ФИНАНСЫ" title="Возвраты" />
      <div className="panel mb-4 grid gap-2 rounded-xl p-4 sm:grid-cols-4">
        <label className="text-xs text-muted">
          Клиент
          <select className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {(users.data ?? []).map((u) => (
              <option key={String(u.id)} value={String(u.id)}>
                {String(u.first_name ?? u.username)} ({money(u.balance_cents)})
              </option>
            ))}
          </select>
        </label>
        <Field label="Сумма USD" value={amount} onChange={setAmount} />
        <Field label="Причина" value={reason} onChange={setReason} />
        <Button
          onClick={async () => {
            if (!userId) return;
            await opsRefundCreate({ data: { userId, amountCents: Math.round(Number(amount) * 100), reason } });
            reload();
          }}
        >
          Создать заявку
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((r) => (
          <li key={String(r.id)} className="panel flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3">
            <div>
              <p className="font-mono text-xs text-cyan">{String(r.public_code)}</p>
              <p>
                {String(r.first_name ?? r.username)} · {money(r.amount_cents)} · {statusLabel(String(r.status))}
              </p>
              <p className="text-xs text-muted">{String(r.reason ?? "")}</p>
            </div>
            {String(r.status) === "REQUESTED" || String(r.status) === "APPROVED" ? (
              <div className="flex gap-2">
                <Button onClick={async () => { await opsRefundDecide({ data: { id: String(r.id), decision: "APPROVED" } }); reload(); }}>Одобрить</Button>
                <Button variant="danger" onClick={async () => { await opsRefundDecide({ data: { id: String(r.id), decision: "REJECTED" } }); reload(); }}>Отклонить</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PromoPage() {
  const { data, reload } = useLoad(() => opsPromos());
  const [code, setCode] = useState("WELCOME10");
  const [percent, setPercent] = useState("10");
  const [userId, setUserId] = useState("");
  const users = useLoad(() => adminUsers({ data: { status: "ALL" } }));
  return (
    <div>
      <PageTitle kicker="МАРКЕТИНГ" title="Промокоды" />
      <div className="panel mb-4 grid gap-2 rounded-xl p-4 sm:grid-cols-4">
        <Field label="Код" value={code} onChange={setCode} />
        <Field label="% скидки" value={percent} onChange={setPercent} />
        <Button
          onClick={async () => {
            await opsPromoSave({ data: { code, kind: "PERCENT", percent: Number(percent) } });
            reload();
          }}
        >
          Создать
        </Button>
      </div>
      <div className="panel mb-4 flex flex-wrap gap-2 rounded-xl p-4">
        <select className="min-h-11 rounded-md border border-border bg-bg px-2" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Клиент</option>
          {(users.data ?? []).map((u) => (
            <option key={String(u.id)} value={String(u.id)}>
              {String(u.first_name ?? u.username)}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!userId) return;
            await opsPromoApply({ data: { code, userId } });
          }}
        >
          Применить клиенту
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((p) => (
          <li key={String(p.id)} className="panel rounded-lg px-4 py-3">
            <p className="font-mono text-cyan">{String(p.code)}</p>
            <p className="text-sm text-muted">
              {String(p.kind)} · {String(p.percent)}% · использовано {String(p.used_count)} · сэкономлено {money(p.saved_cents)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PayoutsPage() {
  const { data, reload } = useLoad(() => opsPayouts());
  const couriers = useLoad(() => adminCouriers());
  const [courierId, setCourierId] = useState("");
  const [amount, setAmount] = useState("5");
  const [reason, setReason] = useState("начисление за доставку");
  const [kind, setKind] = useState<"ACCRUAL" | "BONUS" | "PENALTY" | "PAYOUT">("ACCRUAL");
  return (
    <div>
      <PageTitle kicker="КУРЬЕРЫ" title="Выплаты курьерам" />
      <div className="panel mb-4 grid gap-2 rounded-xl p-4 sm:grid-cols-5">
        <select className="min-h-11 rounded-md border border-border bg-bg px-2" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
          <option value="">Курьер</option>
          {(couriers.data ?? []).map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {String(c.first_name ?? c.username)}
            </option>
          ))}
        </select>
        <select className="min-h-11 rounded-md border border-border bg-bg px-2" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="ACCRUAL">Начисление</option>
          <option value="BONUS">Бонус</option>
          <option value="PENALTY">Штраф</option>
          <option value="PAYOUT">Выплата</option>
        </select>
        <Field label="USD" value={amount} onChange={setAmount} />
        <Field label="Основание" value={reason} onChange={setReason} />
        <Button
          onClick={async () => {
            if (!courierId) return;
            await opsPayoutAdd({ data: { courierId, kind, amountCents: Math.round(Number(amount) * 100), reason } });
            reload();
          }}
        >
          Провести
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((p) => (
          <li key={String(p.id)} className="panel flex justify-between rounded-lg px-4 py-3 text-sm">
            <span>
              {String(p.first_name ?? p.username)} · {statusLabel(String(p.kind))} · {String(p.reason ?? "")}
            </span>
            <span className="font-mono text-primary">{money(p.amount_cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SegmentsPage() {
  const { data } = useLoad(() => opsSegments());
  const [seg, setSeg] = useState("active");
  const [body, setBody] = useState("Новая коллекция PuzzleCandy уже в витрине.");
  const [sent, setSent] = useState<string | null>(null);
  const labels: Record<string, string> = {
    new: "🆕 новые",
    vip: "💎 VIP",
    sleeping: "😴 спящие",
    churn: "⚠️ риск оттока",
    active: "🔥 активные",
  };
  return (
    <div>
      <PageTitle kicker="КЛИЕНТЫ" title="Сегменты и рассылки" />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.keys(labels).map((k) => (
          <Button key={k} variant={seg === k ? "primary" : "ghost"} onClick={() => setSeg(k)}>
            {labels[k]} ({(data?.[k as keyof typeof data] ?? []).length})
          </Button>
        ))}
      </div>
      <div className="panel mb-4 space-y-2 rounded-xl p-4">
        <textarea className="min-h-24 w-full rounded-md border border-border bg-bg p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button
          onClick={async () => {
            const r = await opsBroadcast({ data: { segment: seg, body } });
            setSent(r.ok ? `Отправлено: ${r.sent}` : "Ошибка");
          }}
        >
          Отправить сегменту
        </Button>
        {sent ? <p className="text-sm text-primary">{sent}</p> : null}
      </div>
      <ul className="space-y-1 text-sm">
        {((data?.[seg as keyof typeof data] as Array<Record<string, unknown>> | undefined) ?? []).map((u) => (
          <li key={String(u.id)} className="panel rounded-md px-3 py-2">
            {String(u.first_name ?? u.username)} · {money(u.balance_cents)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RulesPageOps() {
  const { data, reload } = useLoad(() => opsRules());
  const [name, setName] = useState("Крупный платёж нового клиента");
  return (
    <div>
      <PageTitle kicker="АВТОМАТИЗАЦИИ" title="Правила" />
      <div className="panel mb-4 space-y-2 rounded-xl p-4">
        <Field label="Название" value={name} onChange={setName} />
        <p className="text-xs text-muted">{`IF payment.amount > $1000 THEN flag = fraud-review`}</p>
        <Button
          onClick={async () => {
            await opsRuleSave({
              data: {
                name,
                ifJson: { field: "payment.amount", op: ">", value: 100000 },
                thenJson: { flag: "fraud-review", notify: "risk" },
              },
            });
            reload();
          }}
        >
          Добавить правило
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((r) => (
          <li key={String(r.id)} className="panel rounded-lg px-4 py-3">
            <p>{String(r.name)}</p>
            <p className="text-xs text-muted">срабатываний: {String(r.fire_count)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApprovalsPage() {
  const { data, reload } = useLoad(() => opsApprovals());
  return (
    <div>
      <PageTitle kicker="ОЧЕРЕДЬ" title="Ожидают согласования" />
      <ul className="space-y-2">
        {(data ?? []).map((a) => (
          <li key={String(a.id)} className="panel flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3">
            <div>
              <p>{String(a.title)}</p>
              <p className="text-xs text-muted">{statusLabel(String(a.status))} · {a.amount_cents ? money(a.amount_cents) : ""}</p>
            </div>
            {String(a.status) === "PENDING" ? (
              <div className="flex gap-2">
                <Button onClick={async () => { await opsApprovalDecide({ data: { id: String(a.id), decision: "APPROVED" } }); reload(); }}>Одобрить</Button>
                <Button variant="danger" onClick={async () => { await opsApprovalDecide({ data: { id: String(a.id), decision: "REJECTED" } }); reload(); }}>Отклонить</Button>
              </div>
            ) : null}
          </li>
        ))}
        {!(data ?? []).length ? <p className="text-muted">Очередь пуста</p> : null}
      </ul>
    </div>
  );
}

export function HandoverPage() {
  const { data, reload } = useLoad(() => opsHandovers());
  const [last, setLast] = useState<Record<string, unknown> | null>(null);
  return (
    <div>
      <PageTitle
        kicker="СМЕНА"
        title="Передача смены"
        actions={
          <Button
            onClick={async () => {
              const r = await opsHandover();
              setLast(r.report as Record<string, unknown>);
              reload();
            }}
          >
            Завершить смену
          </Button>
        }
      />
      {last ? (
        <div className="panel mb-4 rounded-xl p-4">
          <p>Платежи: {String(last.pendingPay)}</p>
          <p>Доставки: {String(last.pendingDel)}</p>
          <p>Тикеты: {String(last.tickets)}</p>
        </div>
      ) : null}
      <ul className="space-y-2">
        {(data ?? []).map((h) => (
          <li key={String(h.id)} className="panel rounded-lg px-4 py-3 text-sm">
            {String(h.created_at)} · смена {String(h.from_admin)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KeysPage() {
  const { data, reload } = useLoad(() => opsKeys());
  const [name, setName] = useState("crm");
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <div>
      <PageTitle kicker="API" title="Ключи доступа" />
      <div className="mb-4 flex gap-2">
        <Field label="Имя" value={name} onChange={setName} />
        <Button
          onClick={async () => {
            const r = await opsKeyCreate({ data: { name, scopes: "read:orders" } });
            setSecret(r.key);
            reload();
          }}
        >
          Создать
        </Button>
      </div>
      {secret ? <p className="mb-3 font-mono text-xs text-warn">Сохраните ключ: {secret}</p> : null}
      <ul className="space-y-2">
        {(data ?? []).map((k) => (
          <li key={String(k.id)} className="panel flex items-center justify-between rounded-lg px-4 py-3">
            <div>
              <p>{String(k.name)}</p>
              <p className="font-mono text-xs text-muted">
                {String(k.prefix)}… · {String(k.scopes)}
              </p>
            </div>
            {k.revoked_at ? (
              <span className="text-xs text-muted">отозван</span>
            ) : (
              <Button variant="danger" onClick={async () => { await opsKeyRevoke({ data: { id: String(k.id) } }); reload(); }}>
                Отозвать
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WebhooksPage() {
  const { data, reload } = useLoad(() => opsWebhooks());
  const [url, setUrl] = useState("https://example.com/hook");
  return (
    <div>
      <PageTitle kicker="ИНТЕГРАЦИИ" title="Вебхуки" />
      <div className="mb-4 flex gap-2">
        <Field label="URL" value={url} onChange={setUrl} />
        <Button
          onClick={async () => {
            await opsWebhookSave({ data: { url, events: "payment.approved,order.created" } });
            reload();
          }}
        >
          Добавить
        </Button>
      </div>
      <ul className="space-y-2">
        {(data?.hooks ?? []).map((h) => (
          <li key={String(h.id)} className="panel flex items-center justify-between rounded-lg px-4 py-3">
            <div>
              <p className="font-mono text-xs">{String(h.url)}</p>
              <p className="text-xs text-muted">{String(h.events)}</p>
            </div>
            <Button variant="ghost" onClick={async () => { await opsWebhookReplay({ data: { id: String(h.id) } }); reload(); }}>
              Replay
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CannedPage() {
  const { data, reload } = useLoad(() => opsCanned());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("Здравствуйте, {name}! Заказ #{order_id} в работе.");
  return (
    <div>
      <PageTitle kicker="ШАБЛОНЫ" title="Быстрые ответы" />
      <div className="panel mb-4 space-y-2 rounded-xl p-4">
        <Field label="Название" value={title} onChange={setTitle} />
        <textarea className="min-h-24 w-full rounded-md border border-border bg-bg p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button
          onClick={async () => {
            await opsCannedSave({ data: { title, body } });
            setTitle("");
            reload();
          }}
        >
          Сохранить шаблон
        </Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((c) => (
          <li key={String(c.id)} className="panel rounded-lg px-4 py-3">
            <p>{String(c.title)}</p>
            <p className="text-xs text-muted">{String(c.body)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogPage() {
  return (
    <div>
      <PageTitle kicker="WHAT'S NEW" title="Что нового" />
      {CHANGELOG.map((c) => (
        <div key={c.version} className="panel mb-3 rounded-xl p-4">
          <p className="font-mono text-cyan">v{c.version}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {c.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function OpsHubPage() {
  const anomalies = useLoad(() => opsAnomalies());
  const rec = useLoad(() => opsReconcile());
  const [csv, setCsv] = useState("name,price,stock\nMatcha bark,12,20");
  const [imp, setImp] = useState<string | null>(null);
  return (
    <div>
      <PageTitle kicker="OPS" title="Операционный центр" />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Ledger депозиты" value={rec.data ? money(rec.data.ledger) : "—"} />
        <StatCard label="Платежи APPROVED" value={rec.data ? money(rec.data.provider) : "—"} />
        <StatCard label="Сверка" value={rec.data?.match ? "✅" : "расхождения"} warn={rec.data ? !rec.data.match : false} />
      </div>
      <h2 className="mt-6 text-lg">Аномалии</h2>
      <ul className="mt-2 space-y-2">
        {(anomalies.data ?? []).map((a, i) => (
          <li key={i} className="panel rounded-lg px-4 py-3 text-sm">
            {a.level === "crit" ? "⚠️ " : ""}
            {a.title}
          </li>
        ))}
        {!(anomalies.data ?? []).length ? <p className="text-muted">Странностей нет</p> : null}
      </ul>
      <h2 className="mt-6 text-lg">Импорт CSV</h2>
      <textarea className="mt-2 min-h-32 w-full rounded-md border border-border bg-panel p-3 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
      <Button
        className="mt-2"
        onClick={async () => {
          const r = await opsImport({ data: { kind: "products", csv } });
          setImp(`Загружено: ${r.loaded} · пропущено: ${r.skipped}`);
        }}
      >
        Импортировать товары
      </Button>
      {imp ? <p className="mt-2 text-sm text-primary">{imp}</p> : null}
      {rec.data && !rec.data.match ? (
        <div className="mt-4 text-sm">
          {(rec.data.missingInLedger as Array<{ public_code: string }>).map((x) => (
            <p key={x.public_code}>нет в ledger: {x.public_code}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HelpPage() {
  return (
    <div>
      <PageTitle kicker="F1" title="Справка" />
      <div className="panel space-y-2 rounded-xl p-4 text-sm">
        <p>Ctrl+K — командная строка и калькулятор курсов</p>
        <p>Ctrl+/ — умный поиск @user #ORD $250 tx:</p>
        <p>↑ ↓ Enter — навигация по спискам</p>
        <p>Ctrl+V — вставка скриншота чека на странице платежей</p>
        <p>Правый клик по строке — контекстное меню</p>
        <p>Звук — только в колокольчике Inbox и в Настройках → Уведомления</p>
      </div>
      <div className="mt-4">
        <Timeline
          items={[
            { at: "10:12", title: "Создан заказ" },
            { at: "10:14", title: "Оплачен" },
            { at: "10:20", title: "Назначен курьер" },
          ]}
        />
      </div>
    </div>
  );
}

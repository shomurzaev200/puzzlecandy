import { many, one, sql as getSql } from "./db";
import { nid, nextPublicCode } from "./ids";
import { notify } from "./audit";
import { publish } from "./events";

export async function openTicket(opts: { userId: string; body: string }) {
  const db = await getSql();
  let ticket = await one<{ id: string; public_code: string }>(
    db,
    `select id, public_code from support_tickets where user_id=$1 and status <> 'CLOSED' order by created_at desc limit 1`,
    [opts.userId],
  );
  if (!ticket) {
    const id = nid("tkt");
    const code = await nextPublicCode(db, "TKT");
    await db.query(
      `insert into support_tickets (id, public_code, user_id, subject, status) values ($1,$2,$3,$4,'OPEN')`,
      [id, code, opts.userId, opts.body.slice(0, 80)],
    );
    ticket = { id, public_code: code };
    await notify({
      type: "NEW_SUPPORT",
      title: `Обращение ${code}`,
      body: opts.body.slice(0, 140),
      entityType: "ticket",
      entityId: id,
    });
    publish({
      type: "NEW_SUPPORT",
      title: `Новое обращение ${code}`,
      body: opts.body.slice(0, 140),
      entityType: "ticket",
      entityId: id,
    });
  }
  await db.query(
    `insert into support_messages (id, ticket_id, sender_type, sender_id, body) values ($1,$2,'USER',$3,$4)`,
    [nid("msg"), ticket.id, opts.userId, opts.body],
  );
  await db.query(`update support_tickets set updated_at=now(), status=case when status='CLOSED' then 'OPEN' else status end where id=$1`, [
    ticket.id,
  ]);
  return ticket;
}

export async function adminReply(opts: { ticketId: string; adminId: string; body: string }) {
  const db = await getSql();
  const ticket = await one<{ id: string; user_id: string; public_code: string }>(
    db,
    `select id, user_id, public_code from support_tickets where id=$1`,
    [opts.ticketId],
  );
  if (!ticket) return null;
  await db.query(
    `insert into support_messages (id, ticket_id, sender_type, sender_id, body) values ($1,$2,'ADMIN',$3,$4)`,
    [nid("msg"), ticket.id, opts.adminId, opts.body],
  );
  await db.query(
    `update support_tickets set status='WAITING', updated_at=now() where id=$1`,
    [ticket.id],
  );
  return ticket;
}

export async function applyJob(opts: { userId: string; jobId: string; message?: string }) {
  const db = await getSql();
  const job = await one<{ id: string; status: string }>(db, `select id, status from jobs where id=$1`, [opts.jobId]);
  if (!job || job.status !== "ACTIVE") return { ok: false as const, error: "CLOSED" };
  const dup = await one(db, `select id from job_applications where job_id=$1 and user_id=$2`, [opts.jobId, opts.userId]);
  if (dup) return { ok: false as const, error: "EXISTS" };
  const id = nid("jap");
  await db.query(
    `insert into job_applications (id, job_id, user_id, message, status) values ($1,$2,$3,$4,'PENDING')`,
    [id, opts.jobId, opts.userId, opts.message ?? ""],
  );
  await notify({
    type: "JOB_APPLICATION",
    title: "Заявка на работу",
    entityType: "job_application",
    entityId: id,
  });
  publish({ type: "JOB_APPLICATION", title: "Новая заявка на работу", entityType: "job_application", entityId: id });
  return { ok: true as const, id };
}

export async function globalSearch(q: string) {
  const db = await getSql();
  const like = `%${q.replaceAll("%", "").slice(0, 80)}%`;
  const [users, orders, products, payments, tickets, couriers] = await Promise.all([
    many(db, `select id, telegram_id, username, first_name, public_code from shop_users where username ilike $1 or first_name ilike $1 or cast(telegram_id as text) ilike $1 or referral_code ilike $1 or id ilike $1 or coalesce(public_code,'') ilike $1 limit 8`, [like]),
    many(db, `select id, public_code, status, total_cents from orders where public_code ilike $1 or id ilike $1 limit 8`, [like]),
    many(db, `select id, slug, name_i18n, status from products where slug ilike $1 or id ilike $1 or name_i18n::text ilike $1 limit 8`, [like]),
    many(db, `select id, public_code, status, amount_cents from payments where public_code ilike $1 or id ilike $1 limit 8`, [like]),
    many(db, `select id, public_code, status, subject from support_tickets where public_code ilike $1 or subject ilike $1 limit 8`, [like]),
    many(db, `select id, username, first_name, telegram_id from couriers where username ilike $1 or first_name ilike $1 or cast(telegram_id as text) ilike $1 limit 8`, [like]),
  ]);
  let kyc = users.slice(0, 0);
  try {
    kyc = await many(db, `select id, public_code, status, user_id from kyc_submissions where public_code ilike $1 or id ilike $1 limit 8`, [like]);
  } catch {
    kyc = [];
  }
  return { users, orders, products, payments, tickets, couriers, kyc };
}

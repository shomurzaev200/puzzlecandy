import { asInt, many, one, sql as getSql } from "./db";
import { nid, nextPublicCode } from "./ids";
import { audit, notify } from "./audit";
import { publish } from "./events";
import { pushTelegram } from "./telegram-notify";

export type KycDraft = {
  first_name?: string;
  last_name?: string;
  patronymic?: string;
  birth_date?: string;
  document_file_id?: string | null;
  document_url?: string | null;
  video_file_id?: string | null;
  video_url?: string | null;
};

export async function getOrCreateKycDraft(userId: string) {
  const db = await getSql();
  const open = await one(
    db,
    `select * from kyc_submissions where user_id=$1 and status in ('DRAFT','UNDER_REVIEW','REJECTED') order by created_at desc limit 1`,
    [userId],
  );
  if (open && String(open.status) !== "REJECTED") return open;
  const id = nid("kyc");
  const code = await nextPublicCode(db, "KYC");
  const created = await one(
    db,
    `insert into kyc_submissions (id, public_code, user_id, status) values ($1,$2,$3,'DRAFT') returning *`,
    [id, code, userId],
  );
  return created!;
}

export async function patchKyc(id: string, userId: string, patch: KycDraft) {
  const db = await getSql();
  await db.query(
    `update kyc_submissions set
       first_name=coalesce($3, first_name),
       last_name=coalesce($4, last_name),
       patronymic=coalesce($5, patronymic),
       birth_date=coalesce($6, birth_date),
       document_file_id=coalesce($7, document_file_id),
       document_url=coalesce($8, document_url),
       video_file_id=coalesce($9, video_file_id),
       video_url=coalesce($10, video_url),
       updated_at=now()
     where id=$1 and user_id=$2 and status in ('DRAFT','REJECTED')`,
    [
      id,
      userId,
      patch.first_name ?? null,
      patch.last_name ?? null,
      patch.patronymic ?? null,
      patch.birth_date ?? null,
      patch.document_file_id ?? null,
      patch.document_url ?? null,
      patch.video_file_id ?? null,
      patch.video_url ?? null,
    ],
  );
  return one(db, `select * from kyc_submissions where id=$1`, [id]);
}

export async function submitKyc(id: string, userId: string) {
  const db = await getSql();
  const row = await one<{
    id: string;
    public_code: string;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    document_file_id: string | null;
    video_file_id: string | null;
    document_url: string | null;
    video_url: string | null;
  }>(db, `select * from kyc_submissions where id=$1 and user_id=$2`, [id, userId]);
  if (!row) return { ok: false as const, error: "NOT_FOUND" };
  if (!row.first_name || !row.last_name || !row.birth_date) return { ok: false as const, error: "INCOMPLETE" };
  if (!row.document_file_id && !row.document_url) return { ok: false as const, error: "NO_DOCUMENT" };
  if (!row.video_file_id && !row.video_url) return { ok: false as const, error: "NO_VIDEO" };
  await db.query(
    `update kyc_submissions set status='UNDER_REVIEW', submitted_at=now(), updated_at=now() where id=$1`,
    [id],
  );
  await db.query(`update shop_users set kyc_status='UNDER_REVIEW', updated_at=now() where id=$1`, [userId]);
  await notify({
    type: "KYC_PENDING",
    title: `KYC ${row.public_code}`,
    body: `${row.first_name} ${row.last_name}`,
    entityType: "kyc",
    entityId: id,
  });
  publish({
    type: "KYC_PENDING",
    title: `Новая KYC ${row.public_code}`,
    body: `${row.first_name} ${row.last_name}`,
    entityType: "kyc",
    entityId: id,
  });
  return { ok: true as const, publicCode: row.public_code };
}

export async function reviewKyc(opts: {
  id: string;
  adminId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  if (opts.decision === "REJECTED" && !opts.reason?.trim()) return { ok: false as const, error: "REASON_REQUIRED" };
  const db = await getSql();
  const claimed = await one<{ id: string; user_id: string; public_code: string; status: string }>(
    db,
    `update kyc_submissions
        set status=$2, reviewed_by=$3, reviewed_at=now(), reject_reason=$4, updated_at=now()
      where id=$1 and status='UNDER_REVIEW'
      returning id, user_id, public_code, status`,
    [opts.id, opts.decision, opts.adminId, opts.reason ?? null],
  );
  if (!claimed) {
    const cur = await one<{ status: string }>(db, `select status from kyc_submissions where id=$1`, [opts.id]);
    if (cur?.status === opts.decision) return { ok: true as const, duplicate: true };
    return { ok: false as const, error: "NOT_PENDING" };
  }
  await db.query(`update shop_users set kyc_status=$2, updated_at=now() where id=$1`, [claimed.user_id, opts.decision]);
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: opts.decision === "APPROVED" ? "kyc.approve" : "kyc.reject",
    entity: "kyc",
    entityId: claimed.id,
    newValue: { reason: opts.reason, status: opts.decision },
  });
  const user = await one<{ telegram_id: number }>(db, `select telegram_id from shop_users where id=$1`, [claimed.user_id]);
  if (user) {
    const text =
      opts.decision === "APPROVED"
        ? `✅ Проверка пройдена.\nЗаявка: ${claimed.public_code}`
        : `❌ Проверка не пройдена.\nЗаявка: ${claimed.public_code}\nПричина:\n${opts.reason}`;
    await pushTelegram(asInt(user.telegram_id), text);
  }
  return { ok: true as const, duplicate: false };
}

export async function listKyc(status?: string) {
  const db = await getSql();
  if (status && status !== "ALL") {
    return many(
      db,
      `select k.*, u.telegram_id, u.username, u.public_code as user_code
         from kyc_submissions k join shop_users u on u.id=k.user_id
        where k.status=$1 order by k.created_at desc limit 200`,
      [status],
    );
  }
  return many(
    db,
    `select k.*, u.telegram_id, u.username, u.public_code as user_code
       from kyc_submissions k join shop_users u on u.id=k.user_id
      order by k.created_at desc limit 200`,
  );
}

export function nid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function referralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "PC";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function padSeq(n: number, width = 6): string {
  return String(n).padStart(width, "0");
}

export function ymd(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export type SeqName =
  | "PAY"
  | "ORD"
  | "TKT"
  | "TSK"
  | "DEALS"
  | "JOB";

export async function nextPublicCode(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  kind: SeqName,
): Promise<string> {
  const rows = await sql.query<{ value: number }>(
    `insert into id_sequences (name, value) values ($1, 1)
     on conflict (name) do update set value = id_sequences.value + 1
     returning value`,
    [kind],
  );
  return `${kind}-${ymd()}-${padSeq(rows[0]?.value ?? 1)}`;
}

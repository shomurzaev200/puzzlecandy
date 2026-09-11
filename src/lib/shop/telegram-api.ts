export async function telegramApi(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<unknown> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: unknown; description?: string }
    | null;
  if (!json || !json.ok) {
    const err = new Error("TELEGRAM_UNREACHABLE");
    (err as Error & { detail?: string }).detail = json?.description ?? `HTTP ${res.status}`;
    throw err;
  }
  return json.result;
}

export async function telegramApiForm(token: string, method: string, form: FormData, timeoutMs = 20000): Promise<unknown> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: unknown; description?: string }
    | null;
  if (!json || !json.ok) {
    const err = new Error("TELEGRAM_UNREACHABLE");
    (err as Error & { detail?: string }).detail = json?.description ?? `HTTP ${res.status}`;
    throw err;
  }
  return json.result;
}

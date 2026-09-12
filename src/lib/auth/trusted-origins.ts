/**
 * Origins Better Auth may accept on credentialed POSTs.
 * Same-origin (Origin host === request Host) is always trusted.
 * Extra origins come from BETTER_AUTH_URL / APP_PUBLIC_URL / BETTER_AUTH_TRUSTED_ORIGINS.
 */
const PREVIEW_HOSTS = ["*.grok-sandbox.com"];

export const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

function envVal(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Reject empty hosts (`http://:8080`) — Better Auth throws and kills Vite. */
export function isUsableHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function originsFromEnv(): string[] {
  const raw = [
    envVal("BETTER_AUTH_URL"),
    envVal("APP_PUBLIC_URL"),
    envVal("BETTER_AUTH_TRUSTED_ORIGINS"),
    envVal("TRUSTED_ORIGINS"),
  ]
    .filter(Boolean)
    .join(",");
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(isUsableHttpUrl);
}

export function hostsFromOrigins(origins: string[]): string[] {
  const hosts: string[] = [];
  for (const o of origins) {
    try {
      hosts.push(new URL(o).host);
    } catch {
      /* skip */
    }
  }
  return hosts;
}

export function requestSelfOrigins(request: Request): string[] {
  const originHeader = request.headers.get("origin") || "";
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    ?.trim();
  const proto = (request.headers.get("x-forwarded-proto") || inferProto(originHeader, request.url))
    .split(",")[0]
    ?.trim()
    .replace(/:$/, "") || "http";
  const out: string[] = [];
  if (host) out.push(`${proto}://${host}`);
  if (originHeader && originHeader !== "null") {
    try {
      const originUrl = new URL(originHeader);
      if (host && originUrl.host === host) out.push(originUrl.origin);
    } catch {
      /* ignore malformed Origin */
    }
  }
  return out;
}

function inferProto(originHeader: string, requestUrl: string): string {
  try {
    if (originHeader && originHeader !== "null") return new URL(originHeader).protocol.replace(":", "");
  } catch {
    /* ignore */
  }
  try {
    const u = new URL(requestUrl);
    if (u.protocol === "http:" || u.protocol === "https:") return u.protocol.replace(":", "");
  } catch {
    /* ignore */
  }
  return "http";
}

/** True when Origin is this request (CSRF-safe same-origin). */
export function isSameOriginRequest(originHeader: string, request: Request): boolean {
  if (!originHeader || originHeader === "null") return false;
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    ?.trim();
  if (!host) return false;
  try {
    return new URL(originHeader).host === host;
  } catch {
    return false;
  }
}

export function staticTrustedOrigins(): string[] {
  return [
    ...LOCAL_DEV_ORIGINS,
    ...PREVIEW_HOSTS,
    ...PREVIEW_HOSTS.flatMap((h) => [`https://${h}`, `http://${h}`]),
    ...originsFromEnv(),
  ];
}

export function resolveTrustedOrigins(request?: Request): string[] {
  const list = staticTrustedOrigins();
  if (request) list.push(...requestSelfOrigins(request));
  return [...new Set(list.filter(Boolean))];
}

export function allowedHosts(): string[] {
  return [
    ...PREVIEW_HOSTS,
    "localhost",
    "127.0.0.1",
    "[::1]",
    ...hostsFromOrigins(originsFromEnv()).map((h) => h.split(":")[0] ?? h),
  ];
}

export function publicBaseURL(): string | undefined {
  const raw = envVal("BETTER_AUTH_URL") ?? envVal("APP_PUBLIC_URL");
  if (!raw) return undefined;
  const trimmed = raw.replace(/\/$/, "");
  return isUsableHttpUrl(trimmed) ? trimmed : undefined;
}

/** HTTPS-only Host cookies; HTTP IP deploys cannot set `__Host-` / Secure cookies. */
export function useHttpsCookies(): boolean {
  const url = publicBaseURL();
  if (url?.startsWith("https://")) return true;
  if (envVal("GROK_PROJECT_ID")) return true;
  if (envVal("AUTH_COOKIE_SECURE") === "true") return true;
  if (envVal("AUTH_COOKIE_SECURE") === "false") return false;
  return false;
}

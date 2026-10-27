import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

export type GoogleUser = { sub: string; email: string; name: string };
/** `force` pede chaves novas, ignorando o cache. */
export type KeyFetcher = (force?: boolean) => Promise<JsonWebKey[]>;

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const KEYS_TTL_MS = 60 * 60 * 1000;
const FORCE_MIN_GAP_MS = 60 * 1000;
const MAX_TOKEN_LEN = 4096;
const CLOCK_SKEW_S = 60;

let cached: { keys: JsonWebKey[]; at: number } | null = null;
let lastFetchAt = 0;
let inflight: Promise<JsonWebKey[]> | null = null;

/** Chaves públicas do Google, com cache de 1 h. `force` refaz a busca, no máximo 1 vez por minuto. */
export const googleKeys: KeyFetcher = async (force = false) => {
  const now = Date.now();
  if (cached && now - cached.at < KEYS_TTL_MS && !(force && now - lastFetchAt >= FORCE_MIN_GAP_MS)) return cached.keys;
  inflight ??= (async () => {
    try {
      lastFetchAt = Date.now();
      const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`certs ${res.status}`);
      const body = (await res.json()) as { keys?: JsonWebKey[] };
      if (!Array.isArray(body.keys)) throw new Error("certs sem keys");
      cached = { keys: body.keys, at: Date.now() };
      return cached.keys;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

function decodeJson(part: string): Record<string, unknown> | null {
  const v: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Confere o ID token do Google (RS256, emissor, app, validade, e-mail verificado). Nunca lança. */
export async function verifyGoogleToken(
  idToken: string,
  clientId: string,
  fetchKeys: KeyFetcher = googleKeys,
): Promise<GoogleUser | null> {
  try {
    if (typeof idToken !== "string" || !clientId || idToken.length > MAX_TOKEN_LEN) return null;
    const parts = idToken.split(".");
    if (parts.length !== 3 || parts.some((p) => !p)) return null;
    const [h, p, s] = parts;
    const header = decodeJson(h);
    const claims = decodeJson(p);
    if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return null;

    let jwk = (await fetchKeys()).find((k) => (k as { kid?: string }).kid === header.kid);
    jwk ??= (await fetchKeys(true)).find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;

    const key = createPublicKey({ key: jwk, format: "jwk" });
    if (!verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) return null;

    if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= Date.now() / 1000) return null;
    if (claims.email_verified !== true) return null;
    if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email) return null;

    const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : claims.email;
    return { sub: claims.sub, email: claims.email, name };
  } catch {
    return null;
  }
}

function mac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/** Sessão própria do jogo: `<payload base64url>.<assinatura base64url>`, payload `{ id, exp }` (exp em segundos). */
export function signSession(accountId: string, secret: string, days = 60): string {
  const exp = Math.floor(Date.now() / 1000 + days * 86400);
  const payload = Buffer.from(JSON.stringify({ id: accountId, exp })).toString("base64url");
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

/** Devolve o id da conta se a sessão for autêntica e estiver no prazo; senão null. Nunca lança. */
export function readSession(token: string, secret: string): string | null {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LEN) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, sig] = parts;
    const given = Buffer.from(sig, "base64url");
    const want = mac(payload, secret);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
    const data = decodeJson(payload);
    if (!data || typeof data.id !== "string" || !data.id || typeof data.exp !== "number") return null;
    return data.exp > Date.now() / 1000 ? data.id : null;
  } catch {
    return null;
  }
}

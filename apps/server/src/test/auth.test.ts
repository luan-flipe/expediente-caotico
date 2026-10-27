import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readSession, signSession, verifyGoogleToken } from "../auth";

const CLIENT_ID = "meu-app.apps.googleusercontent.com";
const KID = "chave-1";

function newKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" } as JsonWebKey;
  return { privateKey, jwk };
}

const good = newKeys();
const other = newKeys();
const keys = async () => [good.jwk];

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

function makeToken(
  claims: Record<string, unknown> = {},
  opts: { key?: KeyObject; header?: Record<string, unknown> } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: KID, ...opts.header };
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "ana@firma.com",
    email_verified: true,
    name: "Ana Souza",
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const body = `${b64(header)}.${b64(payload)}`;
  const sig = createSign("RSA-SHA256").update(body).sign(opts.key ?? good.privateKey).toString("base64url");
  return `${body}.${sig}`;
}

describe("verifyGoogleToken", () => {
  it("aceita token válido e devolve sub, email e nome", async () => {
    const r = await verifyGoogleToken(makeToken(), CLIENT_ID, keys);
    expect(r).toEqual({ sub: "1234567890", email: "ana@firma.com", name: "Ana Souza" });
  });

  it("aceita o emissor sem https", async () => {
    expect(await verifyGoogleToken(makeToken({ iss: "accounts.google.com" }), CLIENT_ID, keys)).not.toBeNull();
  });

  it("usa o e-mail como nome quando o token não traz nome", async () => {
    const r = await verifyGoogleToken(makeToken({ name: undefined }), CLIENT_ID, keys);
    expect(r?.name).toBe("ana@firma.com");
  });

  it("recusa assinatura de outra chave", async () => {
    const t = makeToken({}, { key: other.privateKey });
    expect(await verifyGoogleToken(t, CLIENT_ID, keys)).toBeNull();
  });

  it("recusa aud de outro app", async () => {
    expect(await verifyGoogleToken(makeToken({ aud: "outro.apps.googleusercontent.com" }), CLIENT_ID, keys)).toBeNull();
  });

  it("recusa emissor diferente do Google", async () => {
    expect(await verifyGoogleToken(makeToken({ iss: "https://evil.example.com" }), CLIENT_ID, keys)).toBeNull();
  });

  it("recusa token vencido, mas tolera 60 s de relógio", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyGoogleToken(makeToken({ exp: now - 120 }), CLIENT_ID, keys)).toBeNull();
    expect(await verifyGoogleToken(makeToken({ exp: now - 30 }), CLIENT_ID, keys)).not.toBeNull();
  });

  it("recusa token sem exp", async () => {
    expect(await verifyGoogleToken(makeToken({ exp: undefined }), CLIENT_ID, keys)).toBeNull();
  });

  it("recusa e-mail não verificado", async () => {
    expect(await verifyGoogleToken(makeToken({ email_verified: false }), CLIENT_ID, keys)).toBeNull();
    expect(await verifyGoogleToken(makeToken({ email_verified: "true" }), CLIENT_ID, keys)).toBeNull();
  });

  it("recusa alg diferente de RS256 (none e HS256)", async () => {
    expect(await verifyGoogleToken(makeToken({}, { header: { alg: "none" } }), CLIENT_ID, keys)).toBeNull();
    expect(await verifyGoogleToken(makeToken({}, { header: { alg: "HS256" } }), CLIENT_ID, keys)).toBeNull();
  });

  it("kid ausente nas chaves: refaz a busca uma única vez (forçada) e recusa", async () => {
    const calls: Array<boolean | undefined> = [];
    const fetchKeys = async (force?: boolean) => {
      calls.push(force);
      return [good.jwk];
    };
    expect(await verifyGoogleToken(makeToken({}, { header: { kid: "desconhecida" } }), CLIENT_ID, fetchKeys)).toBeNull();
    expect(calls).toEqual([undefined, true]);
  });

  it("kid ausente no cache mas presente após a busca forçada: aceita", async () => {
    const fetchKeys = async (force?: boolean) => (force ? [good.jwk] : []);
    expect(await verifyGoogleToken(makeToken(), CLIENT_ID, fetchKeys)).not.toBeNull();
  });

  it("recusa lixo que não é JWT e nunca lança", async () => {
    for (const lixo of ["", "abc", "a.b", "a.b.c", "....", "{}", "x".repeat(5000)]) {
      expect(await verifyGoogleToken(lixo, CLIENT_ID, keys)).toBeNull();
    }
    expect(await verifyGoogleToken(undefined as unknown as string, CLIENT_ID, keys)).toBeNull();
  });

  it("devolve null se a busca das chaves falhar", async () => {
    const boom = async () => {
      throw new Error("sem rede");
    };
    expect(await verifyGoogleToken(makeToken(), CLIENT_ID, boom)).toBeNull();
  });

  it("recusa clientId vazio", async () => {
    expect(await verifyGoogleToken(makeToken({ aud: "" }), "", keys)).toBeNull();
  });
});

describe("sessão própria", () => {
  const SECRET = "segredo-de-teste";

  it("ida e volta devolve o id da conta", () => {
    expect(readSession(signSession("conta-1", SECRET), SECRET)).toBe("conta-1");
  });

  it("recusa assinatura adulterada", () => {
    const t = signSession("conta-1", SECRET);
    const [p, s] = t.split(".");
    const flipped = s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
    expect(readSession(`${p}.${flipped}`, SECRET)).toBeNull();
    expect(readSession(`${p}.`, SECRET)).toBeNull();
  });

  it("recusa payload adulterado mantendo a assinatura", () => {
    const [p, s] = signSession("conta-1", SECRET).split(".");
    const forged = JSON.parse(Buffer.from(p, "base64url").toString());
    forged.id = "conta-2";
    expect(readSession(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${s}`, SECRET)).toBeNull();
  });

  it("recusa sessão vencida", () => {
    expect(readSession(signSession("conta-1", SECRET, -1), SECRET)).toBeNull();
  });

  it("recusa segredo diferente", () => {
    expect(readSession(signSession("conta-1", SECRET), "outro-segredo")).toBeNull();
  });

  it("recusa lixo sem lançar", () => {
    for (const lixo of ["", "abc", "a.b", "a.b.c", "....", "x".repeat(5000)]) {
      expect(readSession(lixo, SECRET)).toBeNull();
    }
    expect(readSession(undefined as unknown as string, SECRET)).toBeNull();
  });
});

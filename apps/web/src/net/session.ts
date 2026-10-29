import type { PlayerProfile, RankingView, ReplayData } from "@ec/shared";

/** Conta logada: sessão do jogo (assinada pelo servidor) e o nome guardado na conta. */
export interface Account {
  session: string;
  name: string;
}

const ACCOUNT_KEY = "ec.session";
const GSI_URL = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential?: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    const a = raw ? (JSON.parse(raw) as Partial<Account>) : null;
    return a && typeof a.session === "string" && typeof a.name === "string" ? { session: a.session, name: a.name } : null;
  } catch {
    return null;
  }
}

export function storeAccount(a: Account | null): void {
  try {
    if (a) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* sem storage */
  }
}

/** Sessão do jogo para mandar em create/join/resume; sem login, visitante. */
export function loginSession(): string | undefined {
  return loadAccount()?.session;
}

let config: Promise<{ googleClientId: string | null }> | null = null;

/** Configuração pública do servidor (uma vez por página). Falhou: segue sem login. */
export function loadConfig(): Promise<{ googleClientId: string | null }> {
  config ??= fetch("/api/config")
    .then((r) => (r.ok ? r.json() : { googleClientId: null }))
    .then((c: { googleClientId?: unknown }) => ({ googleClientId: typeof c.googleClientId === "string" ? c.googleClientId : null }))
    .catch(() => ({ googleClientId: null }));
  return config;
}

let gsi: Promise<GoogleId> | null = null;

/** Carrega o script oficial do Google uma vez. */
export function loadGoogle(): Promise<GoogleId> {
  gsi ??= new Promise<GoogleId>((ok, fail) => {
    if (window.google?.accounts?.id) return ok(window.google.accounts.id);
    const s = document.createElement("script");
    s.src = GSI_URL;
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? ok(window.google.accounts.id) : fail(new Error("Google indisponível")));
    s.onerror = () => {
      gsi = null;
      fail(new Error("Não foi possível carregar o login do Google"));
    };
    document.head.appendChild(s);
  });
  return gsi;
}

/** Troca a credencial do Google pela sessão do jogo. */
export async function login(credential: string): Promise<Account> {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const body = (await r.json().catch(() => ({}))) as { session?: string; name?: string; error?: string };
  if (!r.ok || !body.session) throw new Error(body.error ?? "Não foi possível entrar");
  return { session: body.session, name: body.name ?? "" };
}

export async function fetchReplay(pista: string, linha: number): Promise<ReplayData> {
  const r = await fetch(`/api/replay?pista=${encodeURIComponent(pista)}&linha=${linha}`);
  if (r.status === 404) throw new Error("Essa volta não está mais no ranking");
  if (!r.ok) throw new Error("Replay indisponível");
  return (await r.json()) as ReplayData;
}

/** Perfil de um jogador (`id` = apelido do ranking, ou "eu" para o próprio). Manda a sessão para o "eu" valer. */
export async function fetchPerfil(id: string): Promise<PlayerProfile> {
  const session = loginSession();
  const r = await fetch(`/api/perfil?id=${encodeURIComponent(id)}`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  if (r.status === 404) throw new Error("Esse jogador não está no ranking");
  if (r.status === 401) throw new Error("Entre com a conta para ver o seu perfil");
  if (!r.ok) throw new Error("Perfil indisponível");
  return (await r.json()) as PlayerProfile;
}

export async function fetchRanking(): Promise<RankingView> {
  const session = loginSession();
  const r = await fetch("/api/ranking", { headers: session ? { authorization: `Bearer ${session}` } : {} });
  if (!r.ok) throw new Error("Ranking indisponível");
  return (await r.json()) as RankingView;
}

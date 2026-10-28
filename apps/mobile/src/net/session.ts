import * as Linking from "expo-linking";
import type { PlayerProfile, RankingView, ReplayData } from "@ec/shared";
import { readJson, writeJson } from "../storage";

/** Conta logada: sessão do jogo (assinada pelo servidor) e o nome guardado na conta. */
export interface Account {
  session: string;
  name: string;
}

const ACCOUNT_KEY = "ec.account";

export function loadAccount(): Account | null {
  const a = readJson<Partial<Account>>(ACCOUNT_KEY);
  return a && typeof a.session === "string" && typeof a.name === "string" ? { session: a.session, name: a.name } : null;
}

export function storeAccount(a: Account | null): void {
  writeJson(ACCOUNT_KEY, a);
}

export function loginSession(): string | undefined {
  return loadAccount()?.session;
}

const configCache = new Map<string, Promise<{ googleClientId: string | null }>>();

export function loadConfig(server: string): Promise<{ googleClientId: string | null }> {
  let p = configCache.get(server);
  if (!p) {
    p = fetch(`${server}/api/config`)
      .then((r) => (r.ok ? r.json() : { googleClientId: null }))
      .then((c: { googleClientId?: unknown }) => ({ googleClientId: typeof c.googleClientId === "string" ? c.googleClientId : null }))
      .catch(() => ({ googleClientId: null }));
    configCache.set(server, p);
  }
  return p;
}

/** Abre o login Google oficial na página do servidor; ao entrar, ela devolve a sessão pelo link expedientecaotico://. */
export async function openBrowserLogin(server: string): Promise<void> {
  await Linking.openURL(`${server}/?app=1`);
}

export async function fetchRanking(server: string): Promise<RankingView> {
  const session = loginSession();
  const r = await fetch(`${server}/api/ranking`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  if (!r.ok) throw new Error("Ranking indisponível");
  return (await r.json()) as RankingView;
}

export async function fetchReplay(server: string, pista: string, linha: number): Promise<ReplayData> {
  const r = await fetch(`${server}/api/replay?pista=${encodeURIComponent(pista)}&linha=${linha}`);
  if (r.status === 404) throw new Error("Essa volta não está mais no ranking");
  if (!r.ok) throw new Error("Replay indisponível");
  return (await r.json()) as ReplayData;
}

export async function fetchPerfil(server: string, id: string): Promise<PlayerProfile> {
  const session = loginSession();
  const r = await fetch(`${server}/api/perfil?id=${encodeURIComponent(id)}`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  if (r.status === 404) throw new Error("Esse jogador não está no ranking");
  if (r.status === 401) throw new Error("Entre com a conta para ver o seu perfil");
  if (!r.ok) throw new Error("Perfil indisponível");
  return (await r.json()) as PlayerProfile;
}

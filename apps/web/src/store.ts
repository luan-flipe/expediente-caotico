import { useSyncExternalStore } from "react";
import {
  ITEM_NAMES,
  PRESETS,
  randomChair,
  sanitizeAvatar,
  sanitizeChair,
  type AvatarDNA,
  type ChairDNA,
  type GhostLap,
  type LobbyState,
  type PrivateState,
  type RacePrivate,
  type RaceResultRow,
  type RaceSnapshot,
  type ResultRow,
  type ServerMsg,
  type Snapshot,
} from "@ec/shared";
import { Connection } from "./net/connection";
import { loadAccount, loginSession, storeAccount, type Account } from "./net/session";

export interface FeedItem {
  id: number;
  at: number;
  text: string;
  kind: "kill" | "info" | "me";
}

export interface State {
  editing: boolean;
  avatar: AvatarDNA;
  chair: ChairDNA;
  myId: string | null;
  code: string | null;
  lobby: LobbyState | null;
  results: ResultRow[] | null;
  raceResults: RaceResultRow[] | null;
  error: string | null;
  online: boolean;
  snap: Snapshot | null;
  me: PrivateState | null;
  rsnap: RaceSnapshot | null;
  rme: RacePrivate | null;
  feed: FeedItem[];
  scoreboard: boolean;
  /** boneco.glb carregado; telas refazem miniaturas e prévias. */
  modelReady: boolean;
  /** Boneco e cadeira terminaram de carregar (ou falharam, ou estourou o tempo): a tela de carregamento some. */
  assetsReady: boolean;
  /** Progresso da tela de carregamento, de 0 a 1. */
  loadProgress: number;
  /** Conta logada (Google); null joga como visitante. */
  account: Account | null;
  /** Tela do ranking da firma aberta por cima da tela inicial ou do lobby. */
  ranking: boolean;
  /** Configurações abertas por cima da tela atual (inclusive da partida, que segue rodando). */
  settingsOpen: boolean;
  /** Fantasmas da pista no contra o relógio (o último enviado pelo servidor). */
  ghosts: Ghosts | null;
}

export interface Ghosts {
  mine: GhostLap | null;
  record: (GhostLap & { name: string }) | null;
}

const AVATAR_KEY = "ec.avatar";
const CHAIR_KEY = "ec.chair";
const SESSION_KEY = "ec.session";

function loadAvatar(): AvatarDNA {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (raw) return sanitizeAvatar(JSON.parse(raw));
  } catch {
    /* sem storage */
  }
  return PRESETS[Math.floor(Math.random() * PRESETS.length)].dna;
}

function loadChair(): ChairDNA {
  try {
    const raw = localStorage.getItem(CHAIR_KEY);
    if (raw) return sanitizeChair(JSON.parse(raw));
  } catch {
    /* sem storage */
  }
  return randomChair(Math.random);
}

let state: State = {
  editing: false,
  avatar: loadAvatar(),
  chair: loadChair(),
  myId: null,
  code: null,
  lobby: null,
  results: null,
  raceResults: null,
  error: null,
  online: false,
  snap: null,
  me: null,
  rsnap: null,
  rme: null,
  feed: [],
  scoreboard: false,
  modelReady: false,
  assetsReady: false,
  loadProgress: 0,
  account: loadAccount(),
  ranking: false,
  settingsOpen: false,
  ghosts: null,
};
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

export function saveAvatar(avatar: AvatarDNA): void {
  const clean = sanitizeAvatar(avatar);
  setState({ avatar: clean });
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(clean));
  } catch {
    /* sem storage */
  }
  if (state.lobby) net.send({ t: "avatar", avatar: clean, chair: state.chair });
}

export function saveChair(chair: ChairDNA): void {
  const clean = sanitizeChair(chair);
  setState({ chair: clean });
  try {
    localStorage.setItem(CHAIR_KEY, JSON.stringify(clean));
  } catch {
    /* sem storage */
  }
  if (state.lobby) net.send({ t: "avatar", avatar: state.avatar, chair: clean });
}

export function setAccount(account: Account | null): void {
  storeAccount(account);
  setState({ account });
}

export function savedSession(): { code: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(code: string, token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, token }));
  } catch {
    /* sem storage */
  }
}

export function leaveRoom(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem storage */
  }
  net.send({ t: "leave" }, false);
  net.close();
  history.replaceState(null, "", location.pathname);
  setState({ lobby: null, results: null, raceResults: null, code: null, myId: null, snap: null, me: null, rsnap: null, rme: null, feed: [], ghosts: null });
}

let feedId = 0;
function pushFeed(items: Omit<FeedItem, "id" | "at">[]): void {
  if (!items.length) return;
  const now = performance.now();
  const feed = [...state.feed, ...items.map((i) => ({ ...i, id: ++feedId, at: now }))].filter((f) => now - f.at < 6000).slice(-6);
  setState({ feed });
}

function nameOf(id: string | null): string {
  if (!id) return "o escritório";
  return state.snap?.players.find((p) => p.id === id)?.name ?? state.lobby?.players.find((p) => p.id === id)?.name ?? "alguém";
}

const HIT_TEXT = { spin: "grampeou", slip: "molhou de café", resma: "barrou com papel", postit: "colou um post-it em" } as const;

function raceFeed(s: RaceSnapshot): void {
  const me = state.myId;
  const items: Omit<FeedItem, "id" | "at">[] = [];
  for (const e of s.events) {
    const mine = e.id === me || ("by" in e && e.by === me);
    if (e.type === "hit") {
      if (e.kind === "blocked") items.push({ kind: mine ? "me" : "info", text: `A Pasta do Jurídico de ${nameOf(e.id)} barrou o ataque` });
      else if (e.by && e.by !== e.id) items.push({ kind: mine ? "me" : "kill", text: `${nameOf(e.by)} ${HIT_TEXT[e.kind]} ${nameOf(e.id)}` });
    } else if (e.type === "finish") {
      items.push({ kind: mine ? "me" : "info", text: `${nameOf(e.id)} chegou em ${e.place}º` });
    } else if (e.type === "item" && e.id === me) {
      items.push({ kind: "me", text: `Você usou ${ITEM_NAMES[e.item]}` });
    }
  }
  pushFeed(items);
}

function onMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case "welcome":
      saveSession(msg.code, msg.token);
      history.replaceState(null, "", `?sala=${msg.code}`);
      setState({ myId: msg.id, code: msg.code, error: null });
      return;
    case "lobby":
      setState({ lobby: msg.state, ...(msg.state.phase === "match" ? { results: null, raceResults: null } : {}) });
      return;
    case "results":
      setState({ results: msg.rows, raceResults: null, snap: null, me: null, feed: [] });
      return;
    case "rresults":
      setState({ raceResults: msg.rows, results: null, rsnap: null, rme: null, feed: [] });
      return;
    case "rsnap":
      setState({ rsnap: msg.s, rme: msg.me });
      raceFeed(msg.s);
      return;
    case "ghosts":
      setState({ ghosts: { mine: msg.mine, record: msg.record } });
      return;
    case "snap": {
      const items: Omit<FeedItem, "id" | "at">[] = [];
      setState({ snap: msg.s, me: msg.me });
      for (const e of msg.s.events) {
        if (e.type === "kill") {
          const mine = e.killer === state.myId || e.victim === state.myId;
          items.push({ kind: mine ? "me" : "kill", text: e.killer ? `${nameOf(e.killer)} demitiu ${nameOf(e.victim)}` : `${nameOf(e.victim)} pediu as contas` });
        } else if (e.type === "info" && (!e.player || e.player === state.myId)) {
          items.push({ kind: "info", text: e.text });
        }
      }
      pushFeed(items);
      return;
    }
    case "error":
      if (msg.msg === "Sessão expirada") leaveRoom();
      if (msg.msg === "Sessão aberta em outra aba") setState({ lobby: null, snap: null, me: null });
      setState({ error: msg.msg });
      return;
    default:
      return;
  }
}

export const net = new Connection(onMessage, (online) => setState({ online }), savedSession, loginSession);

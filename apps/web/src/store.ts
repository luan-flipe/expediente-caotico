import { useSyncExternalStore } from "react";
import { PRESETS, sanitizeAvatar, type AvatarDNA, type LobbyState, type PrivateState, type ResultRow, type ServerMsg, type Snapshot } from "@ec/shared";
import { Connection } from "./net/connection";

export interface FeedItem {
  id: number;
  at: number;
  text: string;
  kind: "kill" | "info" | "me";
}

export interface State {
  editing: boolean;
  avatar: AvatarDNA;
  myId: string | null;
  code: string | null;
  lobby: LobbyState | null;
  results: ResultRow[] | null;
  error: string | null;
  online: boolean;
  snap: Snapshot | null;
  me: PrivateState | null;
  feed: FeedItem[];
  scoreboard: boolean;
}

const AVATAR_KEY = "ec.avatar";
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

let state: State = {
  editing: false,
  avatar: loadAvatar(),
  myId: null,
  code: null,
  lobby: null,
  results: null,
  error: null,
  online: false,
  snap: null,
  me: null,
  feed: [],
  scoreboard: false,
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
  if (state.lobby) net.send({ t: "avatar", avatar: clean });
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
  net.close();
  history.replaceState(null, "", location.pathname);
  setState({ lobby: null, results: null, code: null, myId: null, snap: null, me: null, feed: [] });
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
  return state.snap?.players.find((p) => p.id === id)?.name ?? "alguém";
}

function onMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case "welcome":
      saveSession(msg.code, msg.token);
      history.replaceState(null, "", `?sala=${msg.code}`);
      setState({ myId: msg.id, code: msg.code, error: null });
      return;
    case "lobby":
      setState({ lobby: msg.state, ...(msg.state.phase === "match" ? { results: null } : {}) });
      return;
    case "results":
      setState({ results: msg.rows, snap: null, me: null, feed: [] });
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
      setState({ error: msg.msg });
      return;
    default:
      return;
  }
}

export const net = new Connection(onMessage, (online) => setState({ online }), savedSession);

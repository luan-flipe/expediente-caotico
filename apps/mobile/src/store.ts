import { useSyncExternalStore } from "react";
import Constants from "expo-constants";
import {
  ITEM_NAMES,
  PRESETS,
  randomChair,
  sanitizeAvatar,
  sanitizeChair,
  type AvatarDNA,
  type Award,
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
import { normalizeServer, serverFromHostUri } from "./net/serverUrl";
import { loadAccount, loginSession, storeAccount, type Account } from "./net/session";
import { setGlobalAudioMuted } from "./sound";
import { readJson, writeJson } from "./storage";

export interface FeedItem {
  id: number;
  at: number;
  text: string;
  kind: "kill" | "info" | "me";
}

/** Uma mensagem do chat rápido, como aparece no canto da sala de espera. */
export interface ChatItem {
  id: number;
  at: number;
  from: string;
  kind: "phrase" | "emote";
  index: number;
}

export interface Ghosts {
  mine: GhostLap | null;
  record: (GhostLap & { name: string }) | null;
}

export interface State {
  editing: boolean;
  avatar: AvatarDNA;
  chair: ChairDNA;
  myId: string | null;
  code: string | null;
  lobby: LobbyState | null;
  results: ResultRow[] | null;
  awards: Award[];
  raceResults: RaceResultRow[] | null;
  error: string | null;
  online: boolean;
  snap: Snapshot | null;
  me: PrivateState | null;
  rsnap: RaceSnapshot | null;
  rme: RacePrivate | null;
  feed: FeedItem[];
  scoreboard: boolean;
  /** Modelos 3D carregados; telas refazem miniaturas e prévias. */
  modelReady: boolean;
  /** Origem http(s) do servidor do jogo. */
  server: string;
  muted: boolean;
  /** Conta logada (Google); null joga como visitante. */
  account: Account | null;
  /** Tela do ranking da firma aberta por cima da tela inicial ou do lobby. */
  ranking: boolean;
  /** Perfil aberto: apelido público do jogador ("eu" = o próprio, com conta logada). */
  perfil: string | null;
  /** Replay de um recorde de volta aberto por cima do ranking (pista e linha da aba). */
  replay: { pista: string; linha: number } | null;
  /** Configurações abertas por cima da tela atual (inclusive da partida). */
  settingsOpen: boolean;
  /** Menu de pausa aberto na partida: trava controles locais enquanto o servidor segue rodando. */
  pauseOpen: boolean;
  /** Fantasmas da pista no contra o relógio. */
  ghosts: Ghosts | null;
  /** Últimas mensagens do chat rápido. */
  chat: ChatItem[];
  /** Painel do chat rápido aberto. */
  chatOpen: boolean;
  /** Aviso de desafio da semana cumprido. */
  toast: { id: number; text: string; points: number } | null;
}

const AVATAR_KEY = "ec.avatar";
const CHAIR_KEY = "ec.chair";
const SESSION_KEY = "ec.session";
const SERVER_KEY = "ec.server";
const MUTED_KEY = "ec.muted";

function loadAvatar(): AvatarDNA {
  const raw = readJson<unknown>(AVATAR_KEY);
  if (raw) return sanitizeAvatar(raw);
  return PRESETS[Math.floor(Math.random() * PRESETS.length)].dna;
}

function loadChair(): ChairDNA {
  const raw = readJson<unknown>(CHAIR_KEY);
  return raw ? sanitizeChair(raw) : randomChair(Math.random);
}

/** Servidor salvo; senão o de EXPO_PUBLIC_SERVER_URL; senão o computador que roda o Metro. */
function defaultServer(): string {
  const saved = readJson<string>(SERVER_KEY);
  if (saved) return saved;
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env) return normalizeServer(env);
  return serverFromHostUri(Constants.expoConfig?.hostUri) ?? "http://localhost:2567";
}

const initialMuted = readJson<boolean>(MUTED_KEY) ?? false;
setGlobalAudioMuted(initialMuted);

let state: State = {
  editing: false,
  avatar: loadAvatar(),
  chair: loadChair(),
  myId: null,
  code: null,
  lobby: null,
  results: null,
  awards: [],
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
  server: defaultServer(),
  muted: initialMuted,
  account: loadAccount(),
  ranking: false,
  perfil: null,
  replay: null,
  settingsOpen: false,
  pauseOpen: false,
  ghosts: null,
  chat: [],
  chatOpen: false,
  toast: null,
};
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

export function saveAvatar(avatar: AvatarDNA): void {
  const clean = sanitizeAvatar(avatar);
  setState({ avatar: clean });
  writeJson(AVATAR_KEY, clean);
  if (state.lobby) net.send({ t: "avatar", avatar: clean, chair: state.chair });
}

export function saveChair(chair: ChairDNA): void {
  const clean = sanitizeChair(chair);
  setState({ chair: clean });
  writeJson(CHAIR_KEY, clean);
  if (state.lobby) net.send({ t: "avatar", avatar: state.avatar, chair: clean });
}

export function setAccount(account: Account | null): void {
  storeAccount(account);
  setState({ account });
}

export function saveServer(input: string): void {
  const server = normalizeServer(input);
  if (!server || server === state.server) return;
  writeJson(SERVER_KEY, server);
  net.close();
  setState({ server, error: null });
}

export function setMuted(muted: boolean): void {
  writeJson(MUTED_KEY, muted);
  setGlobalAudioMuted(muted);
  setState({ muted });
}

export function savedSession(): { code: string; token: string } | null {
  return readJson(SESSION_KEY);
}

export function leaveRoom(): void {
  writeJson(SESSION_KEY, null);
  net.send({ t: "leave" }, false);
  net.close();
  setState({
    lobby: null,
    results: null,
    awards: [],
    raceResults: null,
    code: null,
    myId: null,
    snap: null,
    me: null,
    rsnap: null,
    rme: null,
    feed: [],
    scoreboard: false,
    ghosts: null,
    chat: [],
    chatOpen: false,
    pauseOpen: false,
    settingsOpen: false,
  });
}

let feedId = 0;
let chatId = 0;
let toastId = 0;
const TOAST_MS = 7000;

function pushFeed(items: Omit<FeedItem, "id" | "at">[]): void {
  if (!items.length) return;
  const now = performance.now();
  const feed = [...state.feed, ...items.map((i) => ({ ...i, id: ++feedId, at: now }))].filter((f) => now - f.at < 6000).slice(-6);
  setState({ feed });
}

function nameOf(id: string | null): string {
  if (!id) return "o escritório";
  const sp = state.snap?.players.find((p) => p.id === id);
  if (sp?.isZombie) return "um zumbi";
  return sp?.name ?? state.lobby?.players.find((p) => p.id === id)?.name ?? "alguém";
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
      writeJson(SESSION_KEY, { code: msg.code, token: msg.token });
      setState({ myId: msg.id, code: msg.code, error: null });
      return;
    case "lobby":
      setState({
        lobby: msg.state,
        scoreboard: false,
        pauseOpen: false,
        ...(msg.state.phase === "match" ? { results: null, raceResults: null, awards: [] } : {}),
      });
      return;
    case "results":
      setState({ results: msg.rows, awards: msg.awards, raceResults: null, snap: null, me: null, feed: [], scoreboard: false, pauseOpen: false, chatOpen: false });
      return;
    case "rresults":
      setState({ raceResults: msg.rows, awards: msg.awards, results: null, rsnap: null, rme: null, feed: [], scoreboard: false, pauseOpen: false, chatOpen: false });
      return;
    case "rsnap":
      setState({ rsnap: msg.s, rme: msg.me });
      raceFeed(msg.s);
      return;
    case "chat":
      setState({ chat: [...state.chat, { id: ++chatId, at: performance.now(), from: msg.from, kind: msg.kind, index: msg.index }].slice(-8) });
      return;
    case "challenge": {
      const id = ++toastId;
      setState({ toast: { id, text: msg.text, points: msg.points } });
      setTimeout(() => {
        if (state.toast?.id === id) setState({ toast: null });
      }, TOAST_MS);
      return;
    }
    case "ghosts":
      setState({ ghosts: { mine: msg.mine, record: msg.record } });
      return;
    case "snap": {
      const items: Omit<FeedItem, "id" | "at">[] = [];
      setState({ snap: msg.s, me: msg.me });
      for (const e of msg.s.events) {
        if (e.type === "kill") {
          const mine = e.killer === state.myId || e.victim === state.myId;
          const victimZombie = msg.s.players.find((p) => p.id === e.victim)?.isZombie;
          if (!victimZombie) {
            items.push({ kind: mine ? "me" : "kill", text: e.killer ? `${nameOf(e.killer)} demitiu ${nameOf(e.victim)}` : `${nameOf(e.victim)} pediu as contas` });
          }
        } else if (e.type === "info" && (!e.player || e.player === state.myId)) {
          items.push({ kind: "info", text: e.text });
        }
      }
      pushFeed(items);
      return;
    }
    case "error":
      if (msg.msg === "Sessão expirada") leaveRoom();
      if (msg.msg === "Sessão aberta em outra aba") setState({ lobby: null, snap: null, me: null, rsnap: null, rme: null, scoreboard: false, pauseOpen: false });
      setState({ error: msg.msg });
      return;
    default:
      return;
  }
}

export const net = new Connection(
  onMessage,
  (online) => setState({ online }),
  savedSession,
  () => state.server,
  loginSession,
);

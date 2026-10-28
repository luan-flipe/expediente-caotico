import { useEffect, useState } from "react";
import { CHAT_EMOTES, CHAT_PHRASES } from "@ec/shared";
import { chatText } from "../chatBubbles";
import { keyLabel, useSettings } from "../settings";
import { getState, net, setState, useStore } from "../store";
import { IS_TOUCH } from "../touch";

/** Teclas dos emotes enquanto o painel está aberto (as frases usam 1 a 8). */
const EMOTE_KEYS = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN"] as const;
/** Quanto tempo uma mensagem fica no canto do lobby. */
const FEED_MS = 6000;

const DIGIT = /^(?:Digit|Numpad)([1-8])$/;

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function setOpen(open: boolean): void {
  if (getState().chatOpen === open) return;
  setState({ chatOpen: open });
  // com o mouse preso não dá para clicar: solta, e o jogo sabe que foi de propósito (chatOpen já está ligado)
  if (open && document.pointerLockElement) document.exitPointerLock();
}

function send(kind: "phrase" | "emote", index: number): void {
  net.send(kind === "phrase" ? { t: "chat", index } : { t: "emote", index }, false);
  setOpen(false);
}

/**
 * Chat rápido: frases e emotes prontos, sem texto livre. A tecla (configurável por modo) abre o painel,
 * 1 a 8 mandam as frases, Z X C V B N mandam os emotes, Esc ou a mesma tecla fecham. Também dá para clicar.
 */
export function QuickChat() {
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  const open = useStore((s) => s.chatOpen);
  const chat = useStore((s) => s.chat);
  const editing = useStore((s) => s.editing);
  const settings = useSettings();
  const mode = lobby?.mode === "shooter" ? "shooter" : "race";
  const chatKey = settings.keys[mode].chat;
  const inRoom = !!lobby && !!myId;
  const [, tick] = useState(0);

  useEffect(() => {
    if (!inRoom) {
      if (getState().chatOpen) setState({ chatOpen: false });
      return;
    }
    // fase de captura: com o painel aberto, as teclas dele não chegam ao jogo
    const onKey = (e: KeyboardEvent) => {
      const st = getState();
      if (st.settingsOpen || st.editing || isTyping(e.target)) return;
      if (st.chatOpen) {
        const swallow = () => {
          e.preventDefault();
          e.stopPropagation();
        };
        if (e.code === "Escape" || e.code === chatKey) {
          swallow();
          if (!e.repeat) setOpen(false);
          return;
        }
        const digit = DIGIT.exec(e.code);
        const emote = EMOTE_KEYS.indexOf(e.code as (typeof EMOTE_KEYS)[number]);
        if (digit) {
          swallow();
          if (!e.repeat) send("phrase", Number(digit[1]) - 1);
        } else if (emote >= 0) {
          swallow();
          if (!e.repeat) send("emote", emote);
        }
        return;
      }
      if (e.code === chatKey && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inRoom, chatKey]);

  // o canto do lobby esvazia sozinho: reavalia a cada meio segundo enquanto houver mensagem
  const hasChat = chat.length > 0;
  useEffect(() => {
    if (!hasChat) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [hasChat]);

  if (!inRoom || editing) return null;
  const inMatch = lobby.phase === "match";
  const now = performance.now();
  const recent = chat.filter((c) => now - c.at < FEED_MS).slice(-4);
  const nameOf = (id: string) => lobby.players.find((p) => p.id === id)?.name ?? "alguém";

  return (
    <>
      {!inMatch && recent.length > 0 && (
        <div className="qc-feed" aria-live="polite">
          {recent.map((c) => (
            <div key={c.id}>
              <b>{nameOf(c.from)}</b>
              {chatText(c.kind, c.index)}
            </div>
          ))}
        </div>
      )}
      {!inMatch && !open && (
        <button className="btn small qc-open" onClick={() => setOpen(true)}>
          {IS_TOUCH ? "Chat rápido" : `Chat rápido (${keyLabel(chatKey)})`}
        </button>
      )}
      {open && (
        <div className="qc-backdrop" onClick={() => setOpen(false)}>
          <div className="qc-panel" role="dialog" aria-label="Chat rápido" onClick={(e) => e.stopPropagation()}>
            <p className="label" style={{ margin: 0 }}>
              {IS_TOUCH ? "Chat rápido (toque fora para fechar)" : `Chat rápido (${keyLabel(chatKey)} ou Esc fecha)`}
            </p>
            <div className="qc-grid">
              {CHAT_PHRASES.map((p, i) => (
                <button className="btn" key={p} onClick={() => send("phrase", i)}>
                  <span className="qc-key">{i + 1}</span>
                  {p}
                </button>
              ))}
            </div>
            <div className="qc-grid emotes">
              {CHAT_EMOTES.map((em, i) => (
                <button className="btn" key={em} aria-label={`Emote ${em}`} onClick={() => send("emote", i)}>
                  {em}
                  <span className="qc-key">{keyLabel(EMOTE_KEYS[i])}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

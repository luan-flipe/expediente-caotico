import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ABILITIES } from "@ec/shared";
import { getSettings, useSettings } from "../settings";
import { getState, setState, useStore } from "../store";
import { pressKey, steerFromDrag, stickVector, touchInput } from "../touch";

/** Raio do analógico e do volante (px) e zona morta (fração do raio). */
const STICK_R = 60;
const STICK_DEAD = 0.15;
const WHEEL_R = 80;
const WHEEL_DEAD = 0.08;
/** No modo de toque a toque, o tiro fica apertado só o bastante para o próximo envio (30 por segundo). */
const TAP_FIRE_MS = 70;

type PE = RPointerEvent<HTMLElement>;

/** Prende o dedo no elemento (o soltar chega aqui mesmo fora dele); ponteiro já solto não pode ser preso. */
function capture(e: PE): void {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* ponteiro inválido */
  }
}

/** Botão que segura a tecla enquanto o dedo está nele (vale para vários dedos ao mesmo tempo). */
function HoldButton({ code, release = true, className, label, children, onDown, onUp }: { code?: string; release?: boolean; className?: string; label: string; children: ReactNode; onDown?: () => void; onUp?: () => void }) {
  const [on, setOn] = useState(false);
  // ref e não estado: um toque rápido solta antes do React redesenhar, e a tecla não pode ficar presa
  const held = useRef(false);
  const down = (e: PE) => {
    e.preventDefault();
    capture(e);
    held.current = true;
    setOn(true);
    if (code) pressKey(code, true);
    onDown?.();
  };
  const up = () => {
    if (!held.current) return;
    held.current = false;
    setOn(false);
    // release=false: quem solta a tecla é o onUp (tiro com tempo mínimo)
    if (code && release) pressKey(code, false);
    onUp?.();
  };
  return (
    <button type="button" aria-label={label} className={`tc-btn ${className ?? ""} ${on ? "on" : ""}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

/** Botão de toque único: aperta e solta a tecla na hora (habilidade, item, voltar para a pista). */
function TapButton({ code, className, label, children, onTap }: { code?: string; className?: string; label: string; children: ReactNode; onTap?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`tc-btn ${className ?? ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (code) {
          pressKey(code, true);
          pressKey(code, false);
        }
        onTap?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Área de arrasto que acompanha um dedo só (o primeiro que encostou nela). */
function useDrag(onMove: (dx: number, dy: number, mx: number, my: number) => void, onEnd: () => void) {
  const ref = useRef<{ id: number; x: number; y: number; lx: number; ly: number } | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const handlers = {
    onPointerDown: (e: PE) => {
      if (ref.current) return;
      e.preventDefault();
      capture(e);
      const r = e.currentTarget.getBoundingClientRect();
      ref.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
      setOrigin({ x: e.clientX - r.left, y: e.clientY - r.top, dx: 0, dy: 0 });
    },
    onPointerMove: (e: PE) => {
      const d = ref.current;
      if (!d || d.id !== e.pointerId) return;
      onMove(e.clientX - d.x, e.clientY - d.y, e.clientX - d.lx, e.clientY - d.ly);
      d.lx = e.clientX;
      d.ly = e.clientY;
      setOrigin((o) => (o ? { ...o, dx: e.clientX - d.x, dy: e.clientY - d.y } : o));
    },
    onPointerUp: (e: PE) => {
      if (ref.current?.id !== e.pointerId) return;
      ref.current = null;
      setOrigin(null);
      onEnd();
    },
  };
  return { origin, handlers: { ...handlers, onPointerCancel: handlers.onPointerUp } };
}

/** Engrenagem, chat e placar: o que no teclado é Esc, T e Tab. */
function TopButtons() {
  const scoreboard = useStore((s) => s.scoreboard);
  return (
    <div className="tc-top">
      <TapButton className="small" label="Placar" onTap={() => setState({ scoreboard: !getState().scoreboard })}>
        {scoreboard ? "Fechar placar" : "Placar"}
      </TapButton>
      <TapButton className="small" label="Chat rápido" onTap={() => setState({ chatOpen: true })}>
        Chat
      </TapButton>
      <TapButton className="small icon" label="Configurações" onTap={() => setState({ settingsOpen: true })}>
        ⚙
      </TapButton>
    </div>
  );
}

function RotateHint() {
  return (
    <div className="rotate-hint" role="alert">
      <div className="rotate-phone" />
      <p>Gire o celular para jogar deitado</p>
    </div>
  );
}

function ShooterControls() {
  const keys = useSettings().keys.shooter;
  const autoFire = useSettings().touchAutoFire;
  const me = useStore((s) => s.me);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stick = useDrag(
    (dx, dy) => {
      touchInput.move = stickVector(dx, dy, STICK_R, STICK_DEAD);
    },
    () => {
      touchInput.move = { x: 0, y: 0 };
    },
  );
  const aim = useDrag(
    (_dx, _dy, mx, my) => {
      touchInput.look.x += mx;
      touchInput.look.y += my;
    },
    () => {},
  );

  // o tiro fica apertado pelo menos até o próximo envio, senão um toque rápido não chega ao servidor
  const firedAt = useRef(0);
  const fireDown = () => {
    firedAt.current = performance.now();
    if (tapTimer.current) clearTimeout(tapTimer.current);
    // toque a toque: um tiro por toque, solta sozinho
    if (!getSettings().touchAutoFire) tapTimer.current = setTimeout(() => pressKey(getSettings().keys.shooter.atirar, false), TAP_FIRE_MS);
  };
  const fireUp = () => {
    if (!getSettings().touchAutoFire) return;
    const wait = Math.max(0, TAP_FIRE_MS - (performance.now() - firedAt.current));
    tapTimer.current = setTimeout(() => pressKey(getSettings().keys.shooter.atirar, false), wait);
  };

  const knob = stick.origin ? stickVector(stick.origin.dx, stick.origin.dy, STICK_R, 0) : null;
  const abilityKeys = [keys.habilidade1, keys.habilidade2, keys.habilidade3];

  return (
    <>
      <div className="tc-zone left" {...stick.handlers}>
        {stick.origin ? (
          <div className="tc-stick" style={{ left: stick.origin.x, top: stick.origin.y }}>
            <i style={{ transform: `translate(${(knob?.x ?? 0) * STICK_R}px, ${-(knob?.y ?? 0) * STICK_R}px)` }} />
          </div>
        ) : (
          <div className="tc-zone-hint">Arraste para andar</div>
        )}
      </div>
      <div className="tc-zone right" {...aim.handlers}>
        {!aim.origin && <div className="tc-zone-hint">Arraste para mirar</div>}
      </div>
      <div className="tc-cluster shooter">
        <div className="tc-abilities">
          {abilityKeys.map((code, i) => {
            const a = me?.abilities[i];
            const def = a ? ABILITIES[a.id] : null;
            const cd = a && a.readyInMs > 0 ? Math.ceil(a.readyInMs / 1000) : 0;
            return (
              <TapButton key={i} code={code} className={`ab ${def ? "" : "empty"}`} label={def ? def.short : `Habilidade ${i + 1} vazia`}>
                <span style={{ borderColor: def?.color }}>{def ? def.short : "vazio"}</span>
                {cd > 0 && <em>{cd}</em>}
              </TapButton>
            );
          })}
        </div>
        <div className="tc-main">
          <TapButton code={keys.esquiva} className="mid" label="Esquiva">
            Esquiva
            {me && me.dodgeInMs > 0 && <em>{Math.ceil(me.dodgeInMs / 1000)}</em>}
          </TapButton>
          <HoldButton code={keys.atirar} release={false} className="big fire" label={autoFire ? "Atirar (segure)" : "Atirar"} onDown={fireDown} onUp={fireUp}>
            Atirar
          </HoldButton>
        </div>
      </div>
    </>
  );
}

function RaceControls() {
  const keys = useSettings().keys.race;
  const me = useStore((s) => s.rme);
  const snap = useStore((s) => s.rsnap);
  const wheel = useDrag(
    (dx) => {
      touchInput.steer = steerFromDrag(dx, WHEEL_R, WHEEL_DEAD);
    },
    () => {
      touchInput.steer = null;
    },
  );
  const steer = wheel.origin ? steerFromDrag(wheel.origin.dx, WHEEL_R, WHEEL_DEAD) : 0;
  const items = !!me && !snap?.timeTrial && !snap?.itemsOff;

  return (
    <>
      <div className="tc-zone left" {...wheel.handlers}>
        {wheel.origin ? (
          <div className="tc-wheel" style={{ left: wheel.origin.x, top: wheel.origin.y, transform: `translate(-50%, -50%) rotate(${steer * 70}deg)` }} />
        ) : (
          <div className="tc-zone-hint">Arraste para os lados para virar</div>
        )}
      </div>
      <div className="tc-cluster race">
        <div className="tc-abilities">
          <TapButton code={keys.voltar} className="mid" label="Voltar para a pista">
            R
          </TapButton>
          {items && (
            // segurar o botão segura resma, poça e grampeador atrás como escudo; soltar usa
            <HoldButton code={keys.item} className={`mid ${me?.item ? "ready" : ""}`} label="Usar item (segure para escudo)">
              Item
            </HoldButton>
          )}
          <HoldButton code={keys.derrapar} className="mid" label="Derrapar">
            Derrapar
          </HoldButton>
        </div>
        <div className="tc-main">
          <HoldButton code={keys.frear} className="mid" label="Frear e dar ré">
            Ré
          </HoldButton>
          <HoldButton code={keys.acelerar} className="big go" label="Acelerar">
            Acelerar
          </HoldButton>
        </div>
      </div>
    </>
  );
}

/** Controles na tela para celular e tablet. Só aparecem em aparelho de toque (quem decide é quem monta). */
export function TouchControls({ mode }: { mode: "shooter" | "race" }) {
  return (
    <div className="touch-ui">
      {mode === "shooter" ? <ShooterControls /> : <RaceControls />}
      <TopButtons />
      <RotateHint />
    </div>
  );
}

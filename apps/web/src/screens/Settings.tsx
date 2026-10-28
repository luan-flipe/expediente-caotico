import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  RACE_ACTIONS,
  RACE_LABELS,
  SENS_MAX,
  SENS_MIN,
  SHOOTER_ACTIONS,
  SHOOTER_LABELS,
  findConflict,
  keyLabel,
  saveSettings,
  useSettings,
  type Quality,
  type Settings as SettingsData,
} from "../settings";
import { setState } from "../store";
import { IS_TOUCH, defaultQuality } from "../touch";

type Mode = "shooter" | "race";
interface Capture {
  mode: Mode;
  action: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="set-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{show(value)}</span>
    </label>
  );
}

/**
 * Configurações do jogador, por cima de qualquer tela (inclusive da partida, que segue rodando).
 * Tudo vale na hora e fica salvo no navegador. Esc fecha (ou cancela a captura de tecla).
 */
export function Settings() {
  const s = useSettings();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const patch = (p: Partial<SettingsData>) => saveSettings({ ...s, ...p });
  const close = () => setState({ settingsOpen: false });

  // enquanto espera a nova tecla, o teclado é todo desta tela (a fase de captura chega antes de qualquer outro ouvinte)
  useEffect(() => {
    if (!capture) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === "Escape") {
        setCapture(null);
        setWarn(null);
        return;
      }
      const keys = s.keys[capture.mode] as Record<string, string>;
      const other = findConflict(keys, capture.action, e.code);
      if (other) {
        const labels = (capture.mode === "shooter" ? SHOOTER_LABELS : RACE_LABELS) as Record<string, string>;
        setWarn(`${keyLabel(e.code)} já é de "${labels[other]}" neste modo. Aperte outra tecla.`);
        return;
      }
      saveSettings({ ...s, keys: { ...s.keys, [capture.mode]: { ...keys, [capture.action]: e.code } } });
      setCapture(null);
      setWarn(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capture, s]);

  const startCapture = (mode: Mode, action: string) => {
    setWarn(null);
    setCapture({ mode, action });
  };

  const column = (mode: Mode, title: string, actions: readonly string[], labels: Record<string, string>) => {
    const keys = s.keys[mode] as Record<string, string>;
    return (
      <div className="card stack">
        <p className="label" style={{ margin: 0 }}>
          {title}
        </p>
        <div className="set-keys">
          {actions.map((a) => {
            const waiting = capture?.mode === mode && capture.action === a;
            return (
              <div className="set-key" key={a}>
                <span>{labels[a]}</span>
                <button className={`btn small keycap ${waiting ? "waiting" : ""}`} onClick={() => startCapture(mode, a)}>
                  {waiting ? "Aperte a nova tecla" : keyLabel(keys[a])}
                </button>
              </div>
            );
          })}
        </div>
        {capture?.mode === mode && (
          <p className={warn ? "set-warn" : "muted"} style={{ margin: 0 }}>
            {warn ?? "Aperte a nova tecla. Esc cancela."}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="settings-overlay" role="dialog" aria-label="Configurações">
      <div className="settings-panel stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="brand" style={{ marginBottom: 0 }}>
            <h1>
              <span>Configurações</span>
            </h1>
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                setCapture(null);
                setWarn(null);
                saveSettings({ ...DEFAULT_SETTINGS, quality: defaultQuality(IS_TOUCH) });
              }}
            >
              Voltar ao padrão
            </button>
            <button className="btn primary" onClick={close}>
              Fechar
            </button>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Tudo vale na hora e fica salvo neste navegador.{IS_TOUCH ? "" : " Esc fecha esta tela."}
        </p>

            <div className="grid-2 even">
              <div className="card stack">
                <p className="label" style={{ margin: 0 }}>
                  {IS_TOUCH ? "Mira (tiroteio)" : "Mouse (tiroteio)"}
                </p>
                <Slider label="Sensibilidade" value={s.mouseSens} min={SENS_MIN} max={SENS_MAX} step={0.05} show={(v) => `${v.toFixed(2)}x`} onChange={(v) => patch({ mouseSens: v })} />
                <label className="set-check">
              <input type="checkbox" checked={s.invertY} onChange={(e) => patch({ invertY: e.target.checked })} />
              <span>Inverter o eixo vertical</span>
            </label>
            {IS_TOUCH && (
              <label className="set-check">
                <input type="checkbox" checked={s.touchAutoFire} onChange={(e) => patch({ touchAutoFire: e.target.checked })} />
                <span>Tiro automático ao segurar o botão</span>
              </label>
            )}
          </div>

          <div className="card stack">
            <p className="label" style={{ margin: 0 }}>
              Som
            </p>
            <Slider label="Geral" value={s.volume.master} min={0} max={1} step={0.01} show={pct} onChange={(v) => patch({ volume: { ...s.volume, master: v } })} />
            <Slider label="Música" value={s.volume.music} min={0} max={1} step={0.01} show={pct} onChange={(v) => patch({ volume: { ...s.volume, music: v } })} />
            <Slider label="Efeitos" value={s.volume.effects} min={0} max={1} step={0.01} show={pct} onChange={(v) => patch({ volume: { ...s.volume, effects: v } })} />
          </div>
        </div>

        <div className="card stack">
          <p className="label" style={{ margin: 0 }}>
            Qualidade gráfica
          </p>
          <div className="seg">
            {(["alta", "leve"] as Quality[]).map((q) => (
              <button key={q} className={s.quality === q ? "on" : ""} onClick={() => patch({ quality: q })}>
                {q === "alta" ? "Alta" : "Leve"}
              </button>
            ))}
          </div>
          <span className="muted">Leve tira as sombras e usa resolução menor, para computador fraco e celular. Vale na hora, até no meio da partida.</span>
        </div>

        {/* no toque não há teclado: os controles são os botões da tela */}
        {!IS_TOUCH && (
          <>
            <div className="grid-2 even">
              {column("shooter", "Teclas do tiroteio", SHOOTER_ACTIONS, SHOOTER_LABELS)}
              {column("race", "Teclas do Rally", RACE_ACTIONS, RACE_LABELS)}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              No Rally as setas também valem para pilotar. A mesma tecla não pode ficar em duas ações do mesmo modo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

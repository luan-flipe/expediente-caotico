import { useMemo, useState, type ReactNode } from "react";
import {
  BEARDS,
  CHAIR_BACKS,
  CHAIR_BASES,
  CHAIR_SEATS,
  CHAIR_TRINKETS,
  CHAIR_WHEELS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  FACES,
  HAIR_COLORS,
  HAIR_STYLES,
  PRESETS,
  SKINS,
  randomChair,
  type AvatarDNA,
  type ChairDNA,
} from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/character";
import { saveAvatar, saveChair, setState, useStore } from "../store";

type NumKey = "skin" | "eyes" | "face" | "hair" | "hairColor" | "beard" | "beardColor";
type Step = "start" | "body" | "hair";
type Start = "preset" | "custom";

/** Abas do boneco, na ordem do crachá. Cada item novo entra numa delas. */
const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Começo" },
  { id: "body", label: "Pele e olhos" },
  { id: "hair", label: "Cabelo e barba" },
];

const STARTS: { id: Start; title: string; text: string }[] = [
  { id: "preset", title: "Funcionário pronto", text: "Comece de um modelo e ajuste o que quiser nas próximas abas." },
  { id: "custom", title: "Do zero", text: "Comece do bebê careca e escolha cada detalhe." },
];

function Swatches({ colors, value, onPick }: { colors: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <button key={c} className={`swatch ${i === value ? "on" : ""}`} style={{ background: c }} onClick={() => onPick(i)} aria-label={c} />
      ))}
    </div>
  );
}

function Seg({ items, value, onPick }: { items: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="seg">
      {items.map((t, i) => (
        <button key={t} className={i === value ? "on" : ""} onClick={() => onPick(i)}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

export function Creator() {
  const saved = useStore((s) => s.avatar);
  const [dna, setDna] = useState<AvatarDNA>(saved);
  const [step, setStep] = useState<Step>("start");
  const [start, setStart] = useState<Start>("custom");
  const [preset, setPreset] = useState(-1);
  const [spin, setSpin] = useState(() => {
    try {
      return localStorage.getItem("ec.creatorSpin") !== "0";
    } catch {
      return true;
    }
  });
  const toggleSpin = () => {
    const next = !spin;
    setSpin(next);
    try {
      localStorage.setItem("ec.creatorSpin", next ? "1" : "0");
    } catch {
      // sem storage a escolha vale só nesta sessão
    }
  };
  const savedChair = useStore((s) => s.chair);
  const [chair, setChair] = useState<ChairDNA>(savedChair);
  const [tab, setTab] = useState(useStore((s) => s.lobby?.mode) === "race" ? 1 : 0);
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const setC = (k: keyof ChairDNA) => (i: number) => setChair((c) => ({ ...c, [k]: i }));
  const ready = useStore((s) => s.modelReady);
  // ready refaz as miniaturas quando o boneco termina de carregar
  const thumbs = useMemo(() => PRESETS.map((p) => avatarThumbnail(p.dna, 120)), [ready]);

  const at = STEPS.findIndex((s) => s.id === step);

  const chooseStart = (s: Start) => {
    setStart(s);
    setPreset(-1);
    if (s === "custom") setDna((d) => ({ ...DEFAULT_AVATAR, name: d.name }));
  };

  const done = () => {
    saveChair(chair);
    saveAvatar(dna);
    setState({ editing: false });
  };

  const panels: Record<Step, ReactNode> = {
    start: (
      <>
        <Field label="Nome no crachá">
          <input className="field" value={dna.name} maxLength={16} onChange={(e) => setDna((d) => ({ ...d, name: e.target.value }))} />
        </Field>
        <Field label="Como você quer começar?">
          <div className="choices">
            {STARTS.map((s) => (
              <button key={s.id} className={`choice ${start === s.id ? "on" : ""}`} onClick={() => chooseStart(s.id)}>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </Field>
        {start === "preset" && (
          <Field label="Escolha um funcionário">
            <div className="presets">
              {PRESETS.map((p, i) => (
                <button
                  key={p.id}
                  title={p.id}
                  className={preset === i ? "on" : ""}
                  onClick={() => {
                    setPreset(i);
                    setDna({ ...p.dna, name: dna.name });
                  }}
                >
                  <img src={thumbs[i]} alt={p.id} />
                </button>
              ))}
            </div>
          </Field>
        )}
      </>
    ),
    body: (
      <>
        <Field label="Cor da pele">
          <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
        </Field>
        <Field label="Cor dos olhos">
          <Swatches colors={EYE_COLORS} value={dna.eyes} onPick={set("eyes")} />
        </Field>
        <Field label="Rosto">
          <Seg items={FACES} value={dna.face} onPick={set("face")} />
        </Field>
      </>
    ),
    hair: (
      <>
        <Field label="Cabelo">
          <Seg items={HAIR_STYLES} value={dna.hair} onPick={set("hair")} />
        </Field>
        {dna.hair !== 0 && (
          <Field label="Cor do cabelo">
            <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
          </Field>
        )}
        <Field label="Barba">
          <Seg items={BEARDS} value={dna.beard} onPick={set("beard")} />
        </Field>
        {dna.beard !== 0 && (
          <Field label="Cor da barba">
            <Swatches colors={HAIR_COLORS} value={dna.beardColor} onPick={set("beardColor")} />
          </Field>
        )}
      </>
    ),
  };

  return (
    <div className="screen">
      <div className="wrap">
        <div className="brand">
          <h1>
            Seu <span>crachá</span>
          </h1>
        </div>
        <div className="seg" style={{ marginBottom: 16 }}>
          {["Boneco", "Cadeira"].map((t, i) => (
            <button key={t} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <div className="stack creator-side">
            <div className="badge">
              <div className="badge-top">
                <span>CRACHÁ</span>
                <button type="button" className="badge-spin" aria-pressed={spin} onClick={toggleSpin}>
                  {spin ? "■ PAUSAR GIRO" : "▶ GIRO AUTOMÁTICO"}
                </button>
              </div>
              <AvatarPreview dna={dna} chair={tab === 1 ? chair : undefined} className="badge-preview" autoRotate={spin} />
              <div className="badge-name">{dna.name}</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={done}>
                Salvar
              </button>
              {tab === 1 && (
                <button className="btn" onClick={() => setChair(randomChair(Math.random))}>
                  Aleatório
                </button>
              )}
              <button className="btn" onClick={() => setState({ editing: false })}>
                Cancelar
              </button>
            </div>
          </div>

          {tab === 1 ? (
            <div className="stack">
              <div className="card editor-grid">
                <div style={{ gridColumn: "1 / -1" }}>
                  <p className="label">Estofado</p>
                  <Swatches colors={CHAIR_SEATS} value={chair.seat} onPick={setC("seat")} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <p className="label">Base</p>
                  <Swatches colors={CHAIR_BASES} value={chair.base} onPick={setC("base")} />
                </div>
                <div>
                  <p className="label">Rodas</p>
                  <Seg items={CHAIR_WHEELS} value={chair.wheels} onPick={setC("wheels")} />
                </div>
                <div>
                  <p className="label">Encosto</p>
                  <Seg items={CHAIR_BACKS} value={chair.back} onPick={setC("back")} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <p className="label">Enfeite</p>
                  <Seg items={CHAIR_TRINKETS} value={chair.trinket} onPick={setC("trinket")} />
                </div>
              </div>
              <div className="card">
                <p className="muted" style={{ margin: 0 }}>
                  Todas as cadeiras andam igual. Aqui é só estilo: quem ganha é quem pilota melhor.
                </p>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="tabs" role="tablist">
                {STEPS.map((s, i) => (
                  <button key={s.id} role="tab" aria-selected={i === at} className={`tab ${i === at ? "on" : ""}`} onClick={() => setStep(s.id)}>
                    <span className="tab-n">{i + 1}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="card step-panel" role="tabpanel">
                <h2 className="step-title">{STEPS[at].label}</h2>
                {panels[step]}
                <div className="step-nav">
                  <button className="btn" disabled={at === 0} onClick={() => setStep(STEPS[at - 1].id)}>
                    ← Anterior
                  </button>
                  {at < STEPS.length - 1 ? (
                    <button className="btn dark" onClick={() => setStep(STEPS[at + 1].id)}>
                      Próximo: {STEPS[at + 1].label} →
                    </button>
                  ) : (
                    <button className="btn primary" onClick={done}>
                      Salvar boneco
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

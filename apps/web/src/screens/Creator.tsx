import { useMemo, useState, type ReactNode } from "react";
import {
  ACCESSORIES,
  BEARDS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  GLASSES,
  HAIR_COLORS,
  HAIR_ORDER,
  HAIR_STYLES,
  HEIGHTS,
  MODELS,
  PANTS,
  PRESETS,
  SHIRTS,
  SHOES,
  SKINS,
  randomAvatar,
  type AvatarDNA,
} from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/character";
import { saveAvatar, setState, useStore } from "../store";

type NumKey = "model" | "skin" | "hair" | "hairColor" | "eyes" | "beard" | "glasses" | "shirt" | "pants" | "shoes" | "accessory" | "height";

type Start = "skin" | "preset" | "custom";
type Step = "start" | "body" | "face" | "hair" | "clothes" | "extras" | "name";

/** Ordem das abas. custom: só aparece para quem monta o boneco (skin pronta fica como veio). */
const STEPS: { id: Step; label: string; custom?: boolean }[] = [
  { id: "start", label: "Começo" },
  { id: "body", label: "Corpo" },
  { id: "face", label: "Rosto", custom: true },
  { id: "hair", label: "Cabelo", custom: true },
  { id: "clothes", label: "Roupa", custom: true },
  { id: "extras", label: "Acessórios", custom: true },
  { id: "name", label: "Nome" },
];

const STARTS: { id: Start; title: string; text: string }[] = [
  { id: "skin", title: "Skin pronta", text: "Um personagem completo, do jeito que veio." },
  { id: "preset", title: "Funcionário pronto", text: "Comece de um modelo e ajuste o que quiser." },
  { id: "custom", title: "Personalizar", text: "Escolha cada detalhe, aba por aba." },
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

/** order muda só a posição dos botões; onPick recebe o índice de items. */
function Seg({ items, value, onPick, order }: { items: string[]; value: number; onPick: (i: number) => void; order?: number[] }) {
  return (
    <div className="seg">
      {(order ?? items.map((_, i) => i)).map((i) => (
        <button key={items[i]} className={i === value ? "on" : ""} onClick={() => onPick(i)}>
          {items[i]}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-group">
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

export function Creator() {
  const saved = useStore((s) => s.avatar);
  const [dna, setDna] = useState<AvatarDNA>(saved);
  const [start, setStart] = useState<Start>(saved.model !== 0 ? "skin" : "custom");
  const [preset, setPreset] = useState(-1);
  const [step, setStep] = useState<Step>("start");
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const ready = useStore((s) => s.modelReady);
  const thumbs = useMemo(() => PRESETS.map((p) => avatarThumbnail(p.dna, 120)), [ready]);
  // skin pronta ignora o crachá, então a miniatura não depende do boneco atual
  const skinThumbs = useMemo(() => MODELS.map((_, i) => (i === 0 ? "" : avatarThumbnail({ ...DEFAULT_AVATAR, model: i }, 120))), [ready]);

  const isSkin = dna.model !== 0;
  const steps = STEPS.filter((s) => !(isSkin && s.custom));
  const at = Math.max(0, steps.findIndex((s) => s.id === step));
  const current = steps[at];

  const chooseStart = (s: Start) => {
    setStart(s);
    if (s === "skin") setDna((d) => ({ ...d, model: d.model === 0 ? 1 : d.model }));
    else setDna((d) => ({ ...d, model: 0 }));
  };

  const done = () => {
    saveAvatar(dna);
    setState({ editing: false });
  };

  const panels: Record<Step, ReactNode> = {
    start: (
      <>
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
        {start === "skin" && (
          <Field label="Escolha a skin">
            <div className="presets">
              {MODELS.map((m, i) =>
                i === 0 ? null : (
                  <button key={m} title={m} className={dna.model === i ? "on" : ""} onClick={() => set("model")(i)}>
                    <img src={skinThumbs[i]} alt={m} />
                  </button>
                ),
              )}
            </div>
          </Field>
        )}
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
        {!isSkin && (
          <Field label="Pele">
            <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
          </Field>
        )}
        <Field label="Altura">
          <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
        </Field>
        {isSkin && <p className="muted">Skin pronta fica do jeito que veio; só a altura muda. Para escolher cada detalhe, volte ao Começo e use "Personalizar".</p>}
      </>
    ),
    face: (
      <>
        <Field label="Cor dos olhos">
          <Swatches colors={EYE_COLORS} value={dna.eyes} onPick={set("eyes")} />
        </Field>
        <Field label="Barba">
          <Seg items={BEARDS} value={dna.beard} onPick={set("beard")} />
        </Field>
        <Field label="Óculos">
          <Seg items={GLASSES} value={dna.glasses} onPick={set("glasses")} />
        </Field>
      </>
    ),
    hair: (
      <>
        <Field label="Corte">
          <Seg items={HAIR_STYLES} order={HAIR_ORDER} value={dna.hair} onPick={set("hair")} />
        </Field>
        <Field label="Cor do cabelo">
          <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
        </Field>
      </>
    ),
    clothes: (
      <>
        <Field label="Camisa">
          <Swatches colors={SHIRTS} value={dna.shirt} onPick={set("shirt")} />
        </Field>
        <Field label="Calça">
          <Swatches colors={PANTS} value={dna.pants} onPick={set("pants")} />
        </Field>
        <Field label="Calçado">
          <Seg items={SHOES} value={dna.shoes} onPick={set("shoes")} />
        </Field>
      </>
    ),
    extras: (
      <Field label="Acessório">
        <Seg items={ACCESSORIES} value={dna.accessory} onPick={set("accessory")} />
      </Field>
    ),
    name: (
      <Field label="Nome no crachá">
        <input className="field" value={dna.name} maxLength={16} onChange={(e) => setDna((d) => ({ ...d, name: e.target.value }))} />
      </Field>
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
        <div className="grid-2">
          <div className="stack creator-side">
            <div className="badge">
              <div className="badge-top">
                <span>CRACHÁ</span>
                <span>ARRASTE PARA GIRAR</span>
              </div>
              <AvatarPreview dna={dna} className="badge-preview" />
              <div className="badge-name">{dna.name}</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={done}>
                Salvar boneco
              </button>
              <button
                className="btn"
                onClick={() => {
                  setStart("custom");
                  setDna((d) => ({ ...randomAvatar(Math.random, d.name), model: 0 }));
                }}
              >
                Aleatório
              </button>
              <button className="btn" onClick={() => setState({ editing: false })}>
                Cancelar
              </button>
            </div>
          </div>

          <div className="stack">
            <div className="tabs" role="tablist">
              {steps.map((s, i) => (
                <button key={s.id} role="tab" aria-selected={i === at} className={`tab ${i === at ? "on" : ""}`} onClick={() => setStep(s.id)}>
                  <span className="tab-n">{i + 1}</span>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="card step-panel" role="tabpanel">
              <h2 className="step-title">{current.label}</h2>
              {panels[current.id]}
              <div className="step-nav">
                <button className="btn" disabled={at === 0} onClick={() => setStep(steps[at - 1].id)}>
                  ← Anterior
                </button>
                {at < steps.length - 1 ? (
                  <button className="btn dark" onClick={() => setStep(steps[at + 1].id)}>
                    Próximo: {steps[at + 1].label} →
                  </button>
                ) : (
                  <button className="btn primary" onClick={done}>
                    Salvar boneco
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

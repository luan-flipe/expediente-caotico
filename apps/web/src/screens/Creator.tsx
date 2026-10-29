import { useMemo, useState, type ReactNode } from "react";
import {
  CHAIR_BACKS,
  CHAIR_BASES,
  CHAIR_SEATS,
  CHAIR_TRINKETS,
  CHAIR_WHEELS,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  FACES,
  HAIR_COLORS,
  HEIGHTS,
  PRESETS,
  SKINS,
  randomAvatar,
  randomChair,
  type AvatarDNA,
  type ChairDNA,
} from "@ec/shared";
import { AvatarPreview, type PreviewAction } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/character";
import { BEARD_LABELS, HAIR_LABELS, PANTS_LABELS, SHIRT_LABELS, SHOE_LABELS } from "../game/wearables";
import { saveAvatar, saveChair, setState, useStore } from "../store";

type Step = "start" | "body" | "hair" | "clothes";
type Start = "preset" | "custom";

/** Abas do boneco, na ordem do crachá. Cada item novo entra numa delas. */
const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Começo" },
  { id: "body", label: "Pele e olhos" },
  { id: "hair", label: "Cabelo e barba" },
  { id: "clothes", label: "Roupas" },
];

const STARTS: { id: Start; title: string; text: string }[] = [
  { id: "preset", title: "Funcionário pronto", text: "Comece de um modelo e ajuste o que quiser nas próximas abas." },
  { id: "custom", title: "Do zero", text: "Comece do boneco padrão e escolha cada detalhe." },
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

/** Cores de roupa: a primeira bolinha deixa a peça na cor original dela (0 no crachá). */
function ClothSwatches({ value, onPick }: { value: number; onPick: (i: number) => void }) {
  return (
    <div className="swatches">
      <button className={`swatch swatch-original ${value === 0 ? "on" : ""}`} onClick={() => onPick(0)} aria-label="Cor original" title="Cor original" />
      {CLOTH_COLORS.map((c, i) => (
        <button key={c} className={`swatch ${i + 1 === value ? "on" : ""}`} style={{ background: c }} onClick={() => onPick(i + 1)} aria-label={c} />
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
  const savedChair = useStore((s) => s.chair);
  const [chair, setChair] = useState<ChairDNA>(savedChair);
  const [tab, setTab] = useState(useStore((s) => s.lobby?.mode) === "race" ? 1 : 0);
  const setC = (k: keyof ChairDNA) => (i: number) => setChair((c) => ({ ...c, [k]: i }));
  const [cheer, setCheer] = useState<PreviewAction>();
  const [step, setStep] = useState<Step>("start");
  const [start, setStart] = useState<Start>("custom");
  const [preset, setPreset] = useState(-1);
  const set = (k: keyof AvatarDNA) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const ready = useStore((s) => s.modelReady);
  // ready refaz as miniaturas quando o boneco termina de carregar
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Seg items={HAIR_LABELS} value={dna.hair} onPick={set("hair")} />
        </Field>
        {dna.hair !== 0 && (
          <Field label="Cor do cabelo">
            <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
          </Field>
        )}
        {BEARD_LABELS.length > 1 && (
          <Field label="Barba">
            <Seg items={BEARD_LABELS} value={dna.beard} onPick={set("beard")} />
          </Field>
        )}
        {dna.beard !== 0 && (
          <Field label="Cor da barba">
            <Swatches colors={HAIR_COLORS} value={dna.beardColor} onPick={set("beardColor")} />
          </Field>
        )}
      </>
    ),
    clothes: (
      <>
        <Field label="Altura">
          <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
        </Field>
        {SHIRT_LABELS.length > 1 && (
          <Field label="Camiseta">
            <Seg items={SHIRT_LABELS} value={dna.shirt} onPick={set("shirt")} />
          </Field>
        )}
        {dna.shirt > 0 && dna.shirt < SHIRT_LABELS.length && (
          <Field label="Cor da camiseta">
            <ClothSwatches value={dna.shirtColor} onPick={set("shirtColor")} />
          </Field>
        )}
        {PANTS_LABELS.length > 1 && (
          <Field label="Calça">
            <Seg items={PANTS_LABELS} value={dna.pants} onPick={set("pants")} />
          </Field>
        )}
        {dna.pants > 0 && dna.pants < PANTS_LABELS.length && (
          <Field label="Cor da calça">
            <ClothSwatches value={dna.pantsColor} onPick={set("pantsColor")} />
          </Field>
        )}
        {SHOE_LABELS.length > 1 && (
          <Field label="Tênis">
            <Seg items={SHOE_LABELS} value={dna.shoes} onPick={set("shoes")} />
          </Field>
        )}
        {dna.shoes > 0 && dna.shoes < SHOE_LABELS.length && (
          <Field label="Cor do tênis">
            <ClothSwatches value={dna.shoesColor} onPick={set("shoesColor")} />
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
                <span>ARRASTE PARA GIRAR</span>
              </div>
              <AvatarPreview dna={dna} chair={tab === 1 ? chair : undefined} action={tab === 1 ? cheer : undefined} className="badge-preview" />
              <div className="badge-name">{dna.name}</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={done}>
                Salvar
              </button>
              <button
                className="btn"
                onClick={() => {
                  const pick = (n: number) => Math.floor(Math.random() * n);
                  setDna((d) => ({
                    ...randomAvatar(Math.random, d.name),
                    hair: pick(HAIR_LABELS.length),
                    beard: Math.random() < 0.3 ? pick(BEARD_LABELS.length) : 0,
                    shirt: pick(SHIRT_LABELS.length),
                    pants: pick(PANTS_LABELS.length),
                    shoes: pick(SHOE_LABELS.length),
                  }));
                  setChair(randomChair(Math.random));
                }}
              >
                Aleatório
              </button>
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
                <button className="btn" style={{ marginTop: 12 }} onClick={() => setCheer((a) => ({ name: "comemorar", seq: (a?.seq ?? 0) + 1 }))}>
                  Comemorar
                </button>
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

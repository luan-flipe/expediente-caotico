import { useMemo, useState } from "react";
import {
  ACCESSORIES,
  CHAIR_BACKS,
  CHAIR_BASES,
  CHAIR_SEATS,
  CHAIR_TRINKETS,
  CHAIR_WHEELS,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEIGHTS,
  PANTS,
  PRESETS,
  SHIRTS,
  SKINS,
  randomAvatar,
  randomChair,
  type AvatarDNA,
  type ChairDNA,
} from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/character";
import { saveAvatar, saveChair, setState, useStore } from "../store";

type NumKey = "skin" | "hair" | "hairColor" | "glasses" | "shirt" | "pants" | "accessory" | "height";

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

export function Creator() {
  const saved = useStore((s) => s.avatar);
  const [dna, setDna] = useState<AvatarDNA>(saved);
  const savedChair = useStore((s) => s.chair);
  const [chair, setChair] = useState<ChairDNA>(savedChair);
  const [tab, setTab] = useState(useStore((s) => s.lobby?.mode) === "race" ? 1 : 0);
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const setC = (k: keyof ChairDNA) => (i: number) => setChair((c) => ({ ...c, [k]: i }));
  const ready = useStore((s) => s.modelReady);
  const thumbs = useMemo(() => PRESETS.map((p) => avatarThumbnail(p.dna, 120)), [ready]);

  const done = () => {
    saveChair(chair);
    saveAvatar(dna);
    setState({ editing: false });
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
          <div className="stack">
            <div className="badge">
              <div className="badge-top">
                <span>CRACHÁ</span>
                <span>ARRASTE PARA GIRAR</span>
              </div>
              <AvatarPreview dna={dna} chair={tab === 1 ? chair : undefined} className="badge-preview" />
              <div className="badge-name">{dna.name}</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={done}>
                Salvar
              </button>
              <button
                className="btn"
                onClick={() => {
                  setDna((d) => randomAvatar(Math.random, d.name));
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
              </div>
            </div>
          ) : (
          <div className="stack">
            <div className="card">
              <p className="label">Nome</p>
              <input className="field" value={dna.name} maxLength={16} onChange={(e) => setDna((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="card editor-grid">
              <div>
                <p className="label">Pele</p>
                <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
              </div>
              <div>
                <p className="label">Cor do cabelo</p>
                <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <p className="label">Cabelo</p>
                <Seg items={HAIR_STYLES} value={dna.hair} onPick={set("hair")} />
              </div>
              <div>
                <p className="label">Camisa</p>
                <Swatches colors={SHIRTS} value={dna.shirt} onPick={set("shirt")} />
              </div>
              <div>
                <p className="label">Calça</p>
                <Swatches colors={PANTS} value={dna.pants} onPick={set("pants")} />
              </div>
              <div>
                <p className="label">Óculos</p>
                <Seg items={GLASSES} value={dna.glasses} onPick={set("glasses")} />
              </div>
              <div>
                <p className="label">Barba</p>
                <Seg items={["Sem barba", "Com barba"]} value={dna.beard ? 1 : 0} onPick={(i) => setDna((d) => ({ ...d, beard: i === 1 }))} />
              </div>
              <div>
                <p className="label">Acessório</p>
                <Seg items={ACCESSORIES} value={dna.accessory} onPick={set("accessory")} />
              </div>
              <div>
                <p className="label">Altura</p>
                <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
              </div>
            </div>
            <div className="card">
              <p className="label">Começar de um funcionário pronto</p>
              <div className="presets">
                {PRESETS.map((p, i) => (
                  <button key={p.id} title={p.id} onClick={() => setDna({ ...p.dna, name: dna.name })}>
                    <img src={thumbs[i]} alt={p.id} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

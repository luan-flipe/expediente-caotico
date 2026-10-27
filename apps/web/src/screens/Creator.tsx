import { useMemo, useState } from "react";
import {
  ACCESSORIES,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEIGHTS,
  PANTS,
  PRESETS,
  SHIRTS,
  SKINS,
  randomAvatar,
  type AvatarDNA,
} from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/avatarMesh";
import { saveAvatar, setState, useStore } from "../store";

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
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const thumbs = useMemo(() => PRESETS.map((p) => avatarThumbnail(p.dna, 120)), []);

  const done = () => {
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
        <div className="grid-2">
          <div className="stack">
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
              <button className="btn" onClick={() => setDna((d) => randomAvatar(Math.random, d.name))}>
                Aleatório
              </button>
              <button className="btn" onClick={() => setState({ editing: false })}>
                Cancelar
              </button>
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { AvatarPreview } from "../game/AvatarPreview";
import { net, saveAvatar, setState, useStore } from "../store";

export function Home() {
  const avatar = useStore((s) => s.avatar);
  const chair = useStore((s) => s.chair);
  const error = useStore((s) => s.error);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("sala")?.toUpperCase() ?? "");
  const [name, setName] = useState(avatar.name);

  const commitName = () => {
    if (name.trim() && name !== avatar.name) saveAvatar({ ...avatar, name });
  };

  const create = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "create", name: name || avatar.name, avatar, chair });
  };

  const join = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "join", code: code.trim().toUpperCase(), name: name || avatar.name, avatar, chair });
  };

  return (
    <div className="screen">
      <div className="wrap">
        <div className="brand">
          <h1>
            Expediente <span>Caótico</span>
          </h1>
        </div>
        <p className="tagline">Tiroteio de bolinha de papel no escritório. Monte seu boneco, chame os colegas e dispute quem bate a meta do dia.</p>

        <div className="grid-2">
          <div className="badge">
            <div className="badge-top">
              <span>CRACHÁ</span>
              <span>VISITANTE</span>
            </div>
            <AvatarPreview dna={avatar} className="badge-preview" />
            <div className="badge-name">{avatar.name}</div>
            <div style={{ padding: "0 16px 16px" }}>
              <button className="btn" onClick={() => setState({ editing: true })}>
                Editar boneco
              </button>
            </div>
          </div>

          <div className="stack">
            {error && <div className="error">{error}</div>}
            <div className="card stack">
              <div>
                <p className="label">Seu nome no crachá</p>
                <input className="field" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
              </div>
              <button className="btn primary" onClick={create} disabled={!name.trim()}>
                Criar sala
              </button>
            </div>
            <div className="card stack">
              <div>
                <p className="label">Entrar com código</p>
                <input
                  className="field code"
                  value={code}
                  maxLength={5}
                  placeholder="ABCDE"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 5 && join()}
                />
              </div>
              <button className="btn dark" onClick={join} disabled={code.length !== 5 || !name.trim()}>
                Entrar na sala
              </button>
            </div>
            <div className="card">
              <p className="label">Controles</p>
              <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
                WASD anda · mouse mira · clique atira · Q E R habilidades · Espaço esquiva · 1 2 3 escolhem evolução · Tab placar · Esc solta o mouse
              </p>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="label">Sobre o jogo</p>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Jogo de navegador gratuito para colegas de escritório: tiroteio de bolinha de papel, corrida de cadeiras (Rally da Firma) e treino contra o relógio. Não precisa de cadastro. O login com Google é opcional e serve só para guardar seus resultados no ranking da firma.
          </p>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            <a href="/privacidade.html">Política de privacidade</a> · <a href="/termos.html">Termos de serviço</a>
          </p>
        </div>
      </div>
    </div>
  );
}

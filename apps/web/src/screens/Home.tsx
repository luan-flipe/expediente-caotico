import { useEffect, useRef, useState } from "react";
import { AvatarPreview } from "../game/AvatarPreview";
import { loadConfig, loadGoogle, login, loginSession } from "../net/session";
import { keyLabel, useSettings } from "../settings";
import { net, saveAvatar, setAccount, setState, useStore } from "../store";

/** Botão oficial do Google; só existe com client id no servidor e sem conta logada. */
function GoogleButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadGoogle()
      .then((id) => {
        if (!alive || !ref.current) return;
        id.initialize({
          client_id: clientId,
          callback: (r) => {
            if (!r.credential) return;
            login(r.credential)
              .then((acc) => setAccount(acc))
              .catch((e: Error) => setState({ error: e.message }));
          },
        });
        id.renderButton(ref.current, { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", locale: "pt-BR" });
      })
      .catch((e: Error) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [clientId]);
  return <div ref={ref} style={{ minHeight: 44 }} />;
}

export function Home() {
  const avatar = useStore((s) => s.avatar);
  const chair = useStore((s) => s.chair);
  const error = useStore((s) => s.error);
  const account = useStore((s) => s.account);
  const keys = useSettings().keys.shooter;
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("sala")?.toUpperCase() ?? "");
  const [name, setName] = useState(avatar.name);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadConfig().then((c) => alive && setClientId(c.googleClientId));
    return () => {
      alive = false;
    };
  }, []);

  const commitName = () => {
    if (name.trim() && name !== avatar.name) saveAvatar({ ...avatar, name });
  };

  const create = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "create", name: name || avatar.name, avatar, chair, session: loginSession() });
  };

  const join = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "join", code: code.trim().toUpperCase(), name: name || avatar.name, avatar, chair, session: loginSession() });
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
              <span>{account ? "NO RANKING" : "VISITANTE"}</span>
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
            <div className="pair">
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
            </div>
            <div className="card stack">
              <div>
                <p className="label">Ranking da firma</p>
                {account ? (
                  <p style={{ margin: 0, fontWeight: 700 }}>Olá, {account.name}</p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    {clientId ? "Entre com o Google para suas partidas contarem no ranking." : "Jogando como visitante."}
                  </p>
                )}
              </div>
              {!account && clientId && <GoogleButton clientId={clientId} />}
              <div className="row">
                <button className="btn" onClick={() => setState({ ranking: true })}>
                  Ver ranking
                </button>
                {account && (
                  <button className="btn" onClick={() => setAccount(null)}>
                    Sair da conta
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="pair" style={{ marginTop: 16 }}>
        <div className="card stack">
          <div>
            <p className="label">Controles</p>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              {[keys.frente, keys.esquerda, keys.tras, keys.direita].map(keyLabel).join(" ")} anda · mouse mira · clique atira · {[keys.habilidade1, keys.habilidade2, keys.habilidade3].map(keyLabel).join(" ")} habilidades · {keyLabel(keys.esquiva)} esquiva ·{" "}
              {[keys.evolucao1, keys.evolucao2, keys.evolucao3].map(keyLabel).join(" ")} escolhem evolução · {keyLabel(keys.placar)} placar · Esc solta o mouse e abre as configurações
            </p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setState({ settingsOpen: true })}>
              Configurações
            </button>
          </div>
        </div>
        <div className="card">
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
    </div>
  );
}

import { useEffect, useState } from "react";
import type { MatchSummary, PlayerProfile } from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { fetchPerfil } from "../net/session";
import { perfilUrl } from "../perfil";
import { fmtRace } from "../race/RaceHud";
import { setState } from "../store";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} de ${y}` : ym;
};

const quando = (at: number) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Volta para a tela de onde veio (ranking ou início) e tira o ?perfil= do endereço. */
function voltar() {
  if (new URLSearchParams(location.search).has("perfil")) history.replaceState(null, "", location.pathname);
  setState({ perfil: null, replay: null });
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="perfil-stat">
      <div className="perfil-num">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

const detalhe = (m: MatchSummary) => (m.mode === "shooter" ? `${m.kills ?? 0} eliminações` : m.bestLapMs ? `melhor volta ${fmtRace(m.bestLapMs)}` : "sem volta completa");

/** Perfil público de um jogador: boneco, totais, recordes, mês, desafios, prêmios e últimas partidas. */
export function Perfil({ id }: { id: string }) {
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setP(null);
    setFail(null);
    fetchPerfil(id)
      .then((d) => alive && setP(d))
      .catch((e: Error) => alive && setFail(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const copy = async () => {
    if (!p) return;
    const url = perfilUrl(location.origin, p.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copie o link do perfil:", url);
    }
  };

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="brand" style={{ marginBottom: 0 }}>
            <h1>
              Perfil do <span>jogador</span>
            </h1>
          </div>
          <button className="btn" onClick={voltar}>
            Voltar
          </button>
        </div>

        {fail && <div className="error">{fail}</div>}
        {!p && !fail && <p className="muted">Carregando o perfil...</p>}

        {p && (
          <div className="grid-2">
            <div className="stack">
              <div className="badge">
                <div className="badge-top">
                  <span>CRACHÁ</span>
                  <span>NO RANKING</span>
                </div>
                <AvatarPreview dna={p.avatar} chair={p.chair} className="badge-preview" />
                <div className="badge-name">{p.name}</div>
                <div style={{ padding: "0 16px 16px" }}>
                  <button className="btn" onClick={() => void copy()}>
                    {copied ? "Copiado!" : "Copiar link do perfil"}
                  </button>
                </div>
              </div>
              <div className="card">
                <p className="label">Funcionário do mês</p>
                <div className="perfil-num">{p.month.position ? `${p.month.position}º lugar` : "Sem pontos"}</div>
                <div className="muted">
                  {p.month.points} {p.month.points === 1 ? "ponto" : "pontos"} em {monthName(p.month.month)}
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="pair">
                <div className="card stack">
                  <p className="label">Tiroteio</p>
                  <div className="perfil-stats">
                    <Stat value={p.stats.shooterWins} label="Vitórias" />
                    <Stat value={p.stats.shooterMatches} label="Partidas" />
                    <Stat value={p.stats.shooterKills} label="Eliminações" />
                  </div>
                </div>
                <div className="card stack">
                  <p className="label">Rally</p>
                  <div className="perfil-stats">
                    <Stat value={p.stats.raceWins} label="Vitórias" />
                    <Stat value={p.stats.racePodiums} label="Pódios" />
                    <Stat value={p.stats.raceMatches} label="Corridas" />
                  </div>
                </div>
              </div>

              <div className="card">
                <p className="label">Recordes de volta</p>
                {p.laps.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Pista</th>
                        <th className="num">Melhor volta</th>
                        <th className="num">Posição</th>
                        <th className="num">Replay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.laps.map((l) => (
                        <tr key={l.track}>
                          <td>{l.trackName}</td>
                          <td className="num">{fmtRace(l.ms)}</td>
                          <td className="num">{l.rank}º</td>
                          <td className="num">
                            <button className="btn small" onClick={() => setState({ replay: { pista: l.track, linha: l.rank } })}>
                              Assistir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Nenhuma volta registrada ainda.</p>
                )}
              </div>

              <div className="pair">
                <div className="card">
                  <p className="label">Desafios da semana</p>
                  <div className="perfil-num">{p.challenges.completed}</div>
                  <div className="muted">{p.challenges.completed === 1 ? "cumprido" : "cumpridos"}</div>
                  <p style={{ margin: "8px 0 0" }}>
                    Esta semana: {p.challenges.week.text}{" "}
                    <span className={p.challenges.week.done ? "tag ok" : "tag"}>{p.challenges.week.done ? "CUMPRIDO" : `${p.challenges.week.value}/${p.challenges.week.target}`}</span>
                  </p>
                </div>
                <div className="card">
                  <p className="label">Prêmios bobos</p>
                  {p.awards.length ? (
                    <ul className="perfil-awards">
                      {p.awards.map((a) => (
                        <li key={a.title}>
                          <strong>{a.count}x</strong> {a.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>Nenhum prêmio ainda.</p>
                  )}
                </div>
              </div>

              <div className="card">
                <p className="label">Últimas partidas</p>
                {p.history.length ? (
                  <div className="perfil-hist">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Modo</th>
                          <th className="num">Colocação</th>
                          <th>Detalhe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.history.slice(0, 10).map((h, i) => (
                          <tr key={`${h.at}-${i}`}>
                            <td>{quando(h.at)}</td>
                            <td>{h.mode === "shooter" ? "Tiroteio" : `Rally${h.trackName ? `, ${h.trackName}` : ""}`}</td>
                            <td className="num">{h.place}º</td>
                            <td>{detalhe(h)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Nenhuma partida registrada ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

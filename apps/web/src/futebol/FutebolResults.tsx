import { useEffect, useState } from "react";
import { FUT_COLORS, type FutMatchStats, type TeamSide } from "@ec/shared";
import { Awards } from "../screens/Awards";
import { CupBracket } from "./CupBracket";
import { jogarDeNovo, net, useStore, type FutResults } from "../store";

/** Quanto tempo o campo fica na tela, com o apito e a festa, antes da tabela de resultados. */
export const FUT_HOLD_MS = 4500;

/** Verdadeiro nos primeiros segundos depois do resultado: a tela mostra o campo com vencedor e perdedor. */
export function useFutHold(res: FutResults | null): boolean {
  const [doneFor, setDoneFor] = useState<FutResults | null>(null);
  useEffect(() => {
    if (!res) return;
    const id = setTimeout(() => setDoneFor(res), FUT_HOLD_MS);
    return () => clearTimeout(id);
  }, [res]);
  return !!res && doneFor !== res;
}

function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#14120f" : "#fffdf7";
}

/** Linhas do resumo: rótulo, valor de cada time e se vem em porcentagem. */
export function statRows(s: FutMatchStats): { label: string; v: [number, number]; pct?: boolean }[] {
  return [
    { label: "Posse de bola", v: s.poss, pct: true },
    { label: "Chutes", v: s.shots },
    { label: "Chutes no gol", v: s.shotsOn },
    { label: "Passes", v: s.passes },
    { label: "Faltas", v: s.fouls },
    { label: "Cartões", v: s.cards },
  ];
}

function StatsPanel({ stats, hex }: { stats: FutMatchStats; hex: (side: TeamSide) => string }) {
  return (
    <div className="fut-stats">
      {statRows(stats).map((r) => {
        const total = r.v[0] + r.v[1];
        const left = total === 0 ? 50 : (r.v[0] / total) * 100;
        return (
          <div className="fut-stat" key={r.label}>
            <b>
              {r.v[0]}
              {r.pct ? "%" : ""}
            </b>
            <span>{r.label}</span>
            <b>
              {r.v[1]}
              {r.pct ? "%" : ""}
            </b>
            <i className="bar">
              <i style={{ width: `${left}%`, background: hex(0) }} />
              <i style={{ width: `${100 - left}%`, background: hex(1) }} />
            </i>
          </div>
        );
      })}
    </div>
  );
}

export function FutebolResults() {
  const res = useStore((s) => s.futResults)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  const teams = lobby?.options.futTeams;
  const isHost = lobby?.hostId === myId;
  const { score, pens, winner } = res.score;
  const name = (side: TeamSide) => teams?.[side]?.name ?? `Time ${side + 1}`;
  const hex = (side: TeamSide) => FUT_COLORS[teams?.[side]?.color ?? side]?.hex ?? "#888";
  const title = winner === null ? "Empate" : `Vitória do ${name(winner)}`;
  const cup = lobby?.cup ?? null;
  const champion = cup?.champion != null ? cup.teams[cup.champion].name : null;
  const mvp = res.stats?.mvpId ? res.rows.find((r) => r.id === res.stats?.mvpId) : undefined;
  const sides: TeamSide[] = [0, 1];

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>
            Futebol da <span>Firma</span>
          </h1>
        </div>
        {champion && (
          <div className="card stack fut-champion">
            <p className="label">Campeonato entre setores</p>
            <h2>Campeão: {champion}</h2>
            <p className="muted" style={{ margin: 0 }}>
              Mande o troféu para a sala de reunião.
            </p>
            {cup && <CupBracket cup={cup} />}
          </div>
        )}
        <div className="card stack">
          <div className="fut-res-head">
            {sides.map((side) => (
              <div key={side} className="fut-res-team" style={{ background: hex(side), color: inkOn(hex(side)), outline: winner === side ? "4px solid #ffe14d" : undefined }}>
                <span>{name(side)}</span>
                <b>{score[side]}</b>
              </div>
            ))}
          </div>
          <h2 className="fut-res-title">{title}</h2>
          {pens && (
            <p className="muted" style={{ margin: 0, textAlign: "center" }}>
              Decidido nos pênaltis: {name(0)} {pens[0]} x {pens[1]} {name(1)}
            </p>
          )}
          {res.stats && <StatsPanel stats={res.stats} hex={hex} />}
          {mvp && (
            <p className="fut-mvp">
              Melhor jogador: <strong>{mvp.name}</strong>
            </p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th className="num">Gols</th>
                <th className="num">Assist.</th>
                <th className="num">Amarelos</th>
                <th className="num">Vermelhos</th>
              </tr>
            </thead>
            <tbody>
              {sides.flatMap((side) =>
                res.rows
                  .filter((r) => r.side === side)
                  .map((r) => (
                    <tr key={r.id} style={r.id === myId ? { background: "#fff6c2" } : undefined}>
                      <td>
                        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                          <i className="fut-res-dot" style={{ background: hex(side) }} />
                          <strong>{r.name}</strong>
                          {r.isBot && <span className="tag">BOT</span>}
                        </div>
                      </td>
                      <td className="num">{r.goals}</td>
                      <td className="num">{r.assists}</td>
                      <td className="num">{r.yellow}</td>
                      <td className="num">{r.red}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
          <Awards />
          {cup && !champion && (
            <>
              <p className="label">Chave do campeonato</p>
              <CupBracket cup={cup} />
            </>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            {isHost ? (
              <>
                <button className="btn primary" onClick={jogarDeNovo}>
                  {champion ? "Novo campeonato" : cup ? "Próxima partida" : "Jogar de novo"}
                </button>
                <button className="btn" onClick={() => net.send({ t: "lobby" })}>
                  Voltar ao lobby
                </button>
              </>
            ) : (
              <span className="muted">Aguardando o anfitrião voltar ao lobby.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

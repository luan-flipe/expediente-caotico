import { ABILITIES } from "@ec/shared";
import { AvatarPreview } from "../game/AvatarPreview";
import { avatarThumbnail } from "../game/character";
import { net, useStore } from "../store";

export function Results() {
  const rows = useStore((s) => s.results)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  useStore((s) => s.modelReady);
  const isHost = lobby?.hostId === myId;
  const winner = rows[0];
  const tie = winner?.tie;
  const isZombies = winner?.teamResult !== undefined;
  const isVictory = winner?.teamResult === "victory";

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>
            {isZombies ? (
              isVictory ? (
                <span style={{ color: "#2e7d32" }}>Vitória dos Sobreviventes!</span>
              ) : (
                <span style={{ color: "#c62828" }}>O Escritório Caiu...</span>
              )
            ) : (
              <>
                Fim do <span>expediente</span>
              </>
            )}
          </h1>
        </div>
        <div className="grid-2">
          <div className="badge">
            <div className="badge-top">
              <span>
                {isZombies
                  ? isVictory
                    ? "TODAS AS 5 HORDAS VENCIDAS!"
                    : `SOBREVIVERAM ATÉ A HORDA ${winner?.waveReached ?? 1}`
                  : tie
                  ? "EMPATE"
                  : "FUNCIONÁRIO DO MÊS"}
              </span>
              <span>{winner?.score ?? 0} PTS</span>
            </div>
            {winner && <AvatarPreview dna={winner.avatar} className="badge-preview" />}
            <div className="badge-name">
              {isZombies
                ? isVictory
                  ? "Equipe Sobrevivente"
                  : "Equipe Derrotada"
                : tie
                ? rows.filter((r) => r.rank === 1).map((r) => r.name).join(" e ")
                : winner?.name}
            </div>
          </div>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Funcionário</th>
                  <th className="num">Pts</th>
                  <th className="num">{isZombies ? "Zumbis" : "Elim."}</th>
                  <th className="num">Assist.</th>
                  <th className="num">Mortes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={r.id === myId ? { background: "#fff6c2" } : undefined}>
                    <td className="num">{r.rank}</td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <img src={avatarThumbnail(r.avatar, 80)} alt="" width={36} height={36} style={{ border: "1.5px solid #1d1b17" }} />
                        <div>
                          <strong>{r.name}</strong>
                          <div>
                            {r.abilities.map((a) => (
                              <span className="chip" key={a.id}>
                                {ABILITIES[a.id].name} {a.level}
                                {a.spec ? ` · ${(a.spec === "A" ? ABILITIES[a.id].specA : ABILITIES[a.id].specB).name}` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{r.score}</td>
                    <td className="num">{r.kills}</td>
                    <td className="num">{r.assists}</td>
                    <td className="num">{r.deaths}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 16 }}>
              {isHost ? (
                <button className="btn primary" onClick={() => net.send({ t: "lobby" })}>
                  Voltar ao lobby
                </button>
              ) : (
                <span className="muted">Aguardando o anfitrião voltar ao lobby.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

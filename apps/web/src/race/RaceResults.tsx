import { ITEM_NAMES } from "@ec/shared";
import { net, useStore } from "../store";
import { Awards } from "../screens/Awards";
import { chairThumbnail } from "./chairMesh";
import { fmtRace, ITEM_ICON } from "./RaceHud";

export function RaceResults() {
  const rows = useStore((s) => s.raceResults)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  useStore((s) => s.modelReady);
  const isHost = lobby?.hostId === myId;
  const trial = lobby?.mode === "timetrial";
  // no treino só sobe ao pódio quem fechou uma volta válida
  const top = trial ? rows.filter((r) => r.bestLapMs !== null) : rows;
  const podium = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          {trial ? (
            <h1>
              Fim do <span>treino</span>
            </h1>
          ) : (
            <h1>
              Rally da <span>Firma</span>
            </h1>
          )}
        </div>
        <div className="podium">
          {podium.map((r) => (
            <div key={r.id} className={`step p${r.place}`}>
              <img src={chairThumbnail(r.avatar, r.chair, 200)} alt={r.name} />
              <div className="who">{r.name}</div>
              <div className="block">{r.place}º</div>
            </div>
          ))}
        </div>
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Piloto</th>
                {!trial && <th className="num">Tempo</th>}
                <th className="num">Melhor volta</th>
                {!trial && <th>Item favorito</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.id === myId ? { background: "#fff6c2" } : undefined}>
                  <td className="num">{r.place}</td>
                  <td>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <img src={chairThumbnail(r.avatar, r.chair, 80)} alt="" width={36} height={36} style={{ border: "1.5px solid #1d1b17" }} />
                      <strong>{r.name}</strong>
                      {r.isBot && <span className="tag">BOT</span>}
                    </div>
                  </td>
                  {!trial && <td className="num">{r.totalMs !== null ? fmtRace(r.totalMs) : `${r.lapsDone} volta${r.lapsDone === 1 ? "" : "s"}`}</td>}
                  <td className="num">{fmtRace(r.bestLapMs)}</td>
                  {!trial && <td>{r.favItem ? `${ITEM_ICON[r.favItem]} ${ITEM_NAMES[r.favItem]}` : "Nenhum"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <Awards />
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
  );
}

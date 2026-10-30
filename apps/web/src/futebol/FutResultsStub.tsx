import { net, useStore } from "../store";

/** Placeholder do resultado (a tela de verdade é da Tarefa 15): placar final e a volta ao lobby. */
export function FutResultsStub() {
  const res = useStore((s) => s.futResults)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  const names = useStore((s) => s.lobby?.options.futTeams);
  const isHost = lobby?.hostId === myId;
  const [a, b] = res.score.score;
  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>
            Fim de <span>jogo</span>
          </h1>
        </div>
        <div className="card stack">
          <h2 style={{ margin: 0 }}>
            {names?.[0]?.name ?? "Time 1"} {a} x {b} {names?.[1]?.name ?? "Time 2"}
          </h2>
          {res.score.pens && (
            <p className="muted" style={{ margin: 0 }}>
              Pênaltis: {res.score.pens[0]} x {res.score.pens[1]}
            </p>
          )}
          {isHost ? (
            <button className="btn primary" onClick={() => net.send({ t: "lobby" })}>
              Voltar ao lobby
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Aguardando o anfitrião voltar ao lobby.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

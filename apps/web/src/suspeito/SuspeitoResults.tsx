import { Awards } from "../screens/Awards";
import { avatarThumbnail } from "../game/character";
import { net, useStore } from "../store";

export function SuspeitoResults() {
  const results = useStore((s) => s.suspeitoResults)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  const isHost = lobby?.hostId === myId;

  const isColabWin = results.winner === "colaborador";

  const reasonLabel = {
    tasks_completed: "Todas as tarefas foram concluídas com sucesso!",
    impostors_ejected: "Todos os sabotadores foram identificados e ejetados!",
    impostors_parity: "Os sabotadores reduziram a equipe até alcançar paridade!",
    sabotage_critical: "Vazamento crítico de dados não foi contido a tempo!",
  }[results.reason];

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>
            {isColabWin ? (
              <span style={{ color: "#2e7d32" }}>Vitória dos Colaboradores!</span>
            ) : (
              <span style={{ color: "#c62828" }}>Vitória dos Sabotadores!</span>
            )}
          </h1>
          <p className="tagline" style={{ marginTop: 4 }}>
            {reasonLabel}
          </p>
        </div>

        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Função Real</th>
                <th>Status</th>
                <th className="num">Tarefas Feitas</th>
                <th className="num">Eliminações</th>
              </tr>
            </thead>
            <tbody>
              {results.rows.map((r) => {
                const isMe = r.id === myId;
                const isSab = r.role === "sabotador";
                return (
                  <tr key={r.id} style={isMe ? { background: "#fff6c2" } : undefined}>
                    <td>
                      <strong>
                        {r.name} {isMe ? "(Você)" : ""}
                      </strong>
                    </td>
                    <td>
                      <span className={`chip ${isSab ? "sabotador-chip" : "colab-chip"}`}>
                        {isSab ? "🔪 Sabotador" : "💼 Colaborador"}
                      </span>
                    </td>
                    <td>
                      <span className={r.alive ? "alive-tag" : "dead-tag"}>
                        {r.alive ? "Sobreviveu" : "Eliminado"}
                      </span>
                    </td>
                    <td className="num">{r.tasksDone}</td>
                    <td className="num">{r.kills}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {results.awards.length > 0 && <Awards />}

        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          {isHost ? (
            <button className="btn primary big" onClick={() => net.send({ t: "lobby" })}>
              Voltar à sala
            </button>
          ) : (
            <p className="muted">Aguardando o anfitrião voltar à sala...</p>
          )}
        </div>
      </div>
    </div>
  );
}

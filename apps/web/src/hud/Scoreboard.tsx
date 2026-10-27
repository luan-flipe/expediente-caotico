import { ABILITIES, type Snapshot } from "@ec/shared";

export function Scoreboard({ snap, myId }: { snap: Snapshot; myId: string }) {
  const rows = [...snap.players].sort((a, b) => b.score - a.score || b.kills - a.kills || b.assists - a.assists);
  return (
    <div className="panel scoreboard">
      <table className="table">
        <thead>
          <tr>
            <th>Funcionário</th>
            <th>Build</th>
            <th className="num">Nív.</th>
            <th className="num">Pts</th>
            <th className="num">Elim.</th>
            <th className="num">Assist.</th>
            <th className="num">Mortes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} style={p.id === myId ? { color: "#ffe14d" } : undefined}>
              <td>
                {p.name}
                {p.isBot ? " (bot)" : ""}
                {!p.connected ? " (caiu)" : ""}
              </td>
              <td style={{ fontSize: 12 }}>{p.abilities.map((a) => `${ABILITIES[a.id].name} ${a.level}${a.spec ?? ""}`).join(" · ") || "-"}</td>
              <td className="num">{p.level}</td>
              <td className="num">{p.score}</td>
              <td className="num">{p.kills}</td>
              <td className="num">{p.assists}</td>
              <td className="num">{p.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

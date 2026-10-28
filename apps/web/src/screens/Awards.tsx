import { useStore } from "../store";

/** Prêmios bobos do fim da partida. Some quando nenhum prêmio tem dado. */
export function Awards() {
  const awards = useStore((s) => s.awards);
  if (!awards.length) return null;
  return (
    <div className="awards">
      <div className="label">Prêmios do expediente</div>
      <div className="awards-list">
        {awards.map((a) => (
          <div className="award" key={a.id}>
            <div className="award-title">{a.title}</div>
            <div className="award-name">{a.winnerName}</div>
            <div className="award-detail">{a.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

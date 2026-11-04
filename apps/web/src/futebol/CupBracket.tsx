import type { Cup } from "@ec/shared";
import { cupRounds } from "./copa";

/** Chave do campeonato entre setores: uma coluna por rodada, o próximo jogo dos humanos em destaque. */
export function CupBracket({ cup }: { cup: Cup }) {
  const rounds = cupRounds(cup);
  return (
    <div className="cup" role="group" aria-label="Chave do campeonato">
      {rounds.map((r) => (
        <div className="cup-round" key={r.name}>
          <h4>{r.name}</h4>
          {r.matches.map((m) => (
            <div className={`cup-match${m.next ? " next" : ""}`} key={m.index}>
              {[m.a, m.b].map((s, i) => (
                <div className={`cup-team${s.won ? " won" : ""}${s.human ? " human" : ""}`} key={i}>
                  <span>{s.name}</span>
                  <b>
                    {s.goals ?? ""}
                    {s.pens !== null && s.goals !== null ? ` (${s.pens})` : ""}
                  </b>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

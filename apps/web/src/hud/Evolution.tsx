import { BALANCE, type EvolutionOption, type PrivateState } from "@ec/shared";
import { keyLabel, useSettings } from "../settings";
import { net } from "../store";
import { IS_TOUCH } from "../touch";

const TYPE_TEXT: Record<EvolutionOption["type"], string> = {
  unlock: "Nova habilidade",
  upgrade: "Melhoria",
  spec: "Especialização (definitiva)",
  stat: "Atributo",
};
const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function Evolution({ options, seq, msLeft, pending, abilities }: { options: EvolutionOption[]; seq: number; msLeft: number; pending: number; abilities: PrivateState["abilities"] }) {
  const full = abilities.length >= BALANCE.maxAbilities;
  const k = useSettings().keys.shooter;
  const pickKeys = [k.evolucao1, k.evolucao2, k.evolucao3].map(keyLabel);
  return (
    <div className="evolution">
      <h3>
        {abilities.length === 0 ? "Escolha sua primeira ferramenta de trabalho" : "Promoção! Escolha uma evolução"}
        {pending > 0 ? ` (+${pending} na fila)` : ""}
      </h3>
      <div className="evo-cards">
        {options.map((o, i) => (
          <button key={o.id} className="evo-card" onClick={() => net.send({ t: "evolve", optionId: o.id, seq })}>
            {!IS_TOUCH && <span className="k">{pickKeys[i]}</span>}
            <div className="type">{TYPE_TEXT[o.type]}</div>
            <div className="t">{o.title}</div>
            <div className="d">{o.desc}</div>
            {o.toLevel ? (
              <div className="lv">
                {o.fromLevel ? `${ROMAN[o.fromLevel]} → ` : ""}
                {ROMAN[o.toLevel]}
                {o.type === "unlock" && full ? " (espaços cheios)" : ""}
              </div>
            ) : null}
          </button>
        ))}
      </div>
      <div className="evo-timer">
        <i style={{ width: `${(msLeft / BALANCE.evolutionTimeoutMs) * 100}%` }} />
      </div>
      <div style={{ fontSize: 12, marginTop: 4, textShadow: "0 1px 3px #000" }}>{IS_TOUCH ? "Toque numa carta." : `Teclas ${pickKeys.join(", ")}.`} Sem escolha em {Math.ceil(msLeft / 1000)} s, vale a primeira.</div>
    </div>
  );
}

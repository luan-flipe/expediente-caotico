import { useEffect, useState } from "react";
import type { ChallengeView } from "@ec/shared";
import { fetchRanking } from "../net/session";
import { useStore } from "../store";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/** Desafio da semana da API; recarrega quando a conta muda. Falha de rede deixa o card de fora. */
export function useChallenge(): ChallengeView | null {
  const account = useStore((s) => s.account);
  const [challenge, setChallenge] = useState<ChallengeView | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRanking()
      .then((v) => alive && setChallenge(v.desafio))
      .catch(() => alive && setChallenge(null));
    return () => {
      alive = false;
    };
  }, [account]);
  return challenge;
}

/** Card do desafio da semana: texto, quanto falta e quem já cumpriu. */
export function ChallengeCard({ challenge }: { challenge: ChallengeView }) {
  const { mine, target, completed } = challenge;
  const value = mine?.value ?? 0;
  const lap = challenge.id === "volta-rapida";
  return (
    <div className="card stack challenge">
      <div>
        <p className="label">Desafio da semana</p>
        <p className="challenge-text">{challenge.text}</p>
        <p className="muted" style={{ margin: 0 }}>
          Vale +{challenge.points} pontos no mês, uma vez por semana. Renova toda segunda.
        </p>
      </div>
      {mine ? (
        <div>
          <div className="challenge-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
            <div style={{ width: `${Math.round((value / target) * 100)}%` }} />
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {mine.done ? "Cumprido! Pontos já somados." : lap ? (mine.bestLapMs !== null ? `Sua melhor volta da semana: ${seconds(mine.bestLapMs)}` : "Nenhuma volta nesta semana ainda.") : `${value} de ${target}`}
          </p>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Entre com o Google para acompanhar seu progresso.
        </p>
      )}
      <div>
        <p className="label">Já cumpriram</p>
        <p style={{ margin: 0, fontWeight: 700 }}>{completed.length ? completed.map((c) => c.name).join(", ") : "Ninguém ainda. Seja o primeiro."}</p>
      </div>
    </div>
  );
}

/** Aviso que aparece na hora em que o servidor diz que o desafio foi cumprido. */
export function ChallengeToast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <strong>Desafio cumprido! +{toast.points} pontos</strong>
      <span>{toast.text}</span>
    </div>
  );
}

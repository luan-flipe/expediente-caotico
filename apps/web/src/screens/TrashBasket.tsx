import { useState } from "react";

const STORAGE_KEY = "ec_cestinhas_total";
const HIT_CHANCE = 0.55;
const THROW_MS = 550;
const RESULT_MS = 900;

function loadTotal(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveTotal(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* sem storage */
  }
}

/** Minigame de espera: arremessar bolinha de papel no cesto enquanto aguarda o anfitrião iniciar. */
export function TrashBasket() {
  const [total, setTotal] = useState(loadTotal);
  const [throwing, setThrowing] = useState(false);
  const [result, setResult] = useState<"hit" | "miss" | null>(null);

  const throwBall = () => {
    if (throwing) return;
    setThrowing(true);
    setResult(null);
    setTimeout(() => {
      const hit = Math.random() < HIT_CHANCE;
      setThrowing(false);
      setResult(hit ? "hit" : "miss");
      if (hit) {
        setTotal((t) => {
          const next = t + 1;
          saveTotal(next);
          return next;
        });
      }
      setTimeout(() => setResult(null), RESULT_MS);
    }, THROW_MS);
  };

  return (
    <div className="trash-basket">
      <button className="btn small" onClick={throwBall} disabled={throwing}>
        {throwing && <span className="paper-ball">📄</span>}
        🗑️ Arremessar bolinha
      </button>
      <span className="muted">Cestinhas no Expediente: {total}</span>
      {result && <span className={`throw-result ${result}`}>{result === "hit" ? "Cestinha!" : "Quase..."}</span>}
    </div>
  );
}

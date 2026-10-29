import { useStore } from "../store";
import mascote from "./mascote.webp";

/** Tela da primeira abertura: aparece só se o boneco e a cadeira demorarem (o CSS atrasa o fade-in). */
export function Loading() {
  const progress = useStore((s) => s.loadProgress);
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div className="screen loading" role="status" aria-live="polite">
      <div className="loading-box">
        <img className="loading-mascot" src={mascote} width={192} height={192} alt="" />
        <div className="brand">
          <h1>
            Expediente <span>Caótico</span>
          </h1>
        </div>
        <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="loading-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="loading-label">Arrumando o escritório... {pct}%</p>
      </div>
    </div>
  );
}

import { useEffect, useMemo, type CSSProperties } from "react";
import type { SuspeitoResultRow } from "@ec/shared";
import { Awards } from "../screens/Awards";
import { avatarThumbnail } from "../game/character";
import { jogarDeNovo, net, setState, useStore } from "../store";
import { playEndGameSound } from "./suspeitoSound";

const REASON_LABEL = {
  tasks_completed: "Todas as tarefas foram concluídas a tempo.",
  impostors_ejected: "Todos os sabotadores foram identificados e ejetados.",
  impostors_parity: "Os sabotadores reduziram a equipe até empatar em número.",
  sabotage_critical: "O vazamento crítico de dados não foi contido a tempo.",
} as const;

const CONFETTI_COLORS = ["#ffe14d", "#22c55e", "#38bdf8", "#f472b6", "#ffffff", "#fb923c"];

function Particles({ victory }: { victory: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: victory ? 56 : 22 }, (_, i) => {
        const h = (i * 2654435761) >>> 0;
        return {
          "--x": `${(h % 1000) / 10}%`,
          "--delay": `${((h >> 10) % 1600) / 1000 + (victory ? 0.4 : 0.9)}s`,
          "--dur": `${(victory ? 2.6 : 5.5) + ((h >> 4) % 1800) / 1000}s`,
          "--spin": `${((h >> 6) % 2 ? 1 : -1) * (360 + ((h >> 8) % 540))}deg`,
          "--drift": `${((h >> 12) % 160) - 80}px`,
          "--c": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        } as CSSProperties;
      }),
    [victory],
  );
  return (
    <div className={`sres-particles ${victory ? "confetti" : "ash"}`} aria-hidden>
      {pieces.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}

function Thumb({ src, name }: { src: string | null; name: string }) {
  return src ? <img src={src} alt="" draggable={false} /> : <span className="sres-initial">{name.slice(0, 1).toUpperCase()}</span>;
}

export function SuspeitoResults() {
  const results = useStore((s) => s.suspeitoResults)!;
  const lobby = useStore((s) => s.lobby);
  const myId = useStore((s) => s.myId);
  const isHost = lobby?.hostId === myId;

  const myRow = results.rows.find((r) => r.id === myId);
  const victory = myRow ? myRow.role === results.winner : null;
  const sabWin = results.winner === "sabotador";

  const thumbs = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of results.rows) {
      const p = lobby?.players.find((x) => x.id === r.id);
      m.set(r.id, p ? avatarThumbnail(p.avatar, 192) : null);
    }
    return m;
  }, [results, lobby?.players]);

  useEffect(() => {
    playEndGameSound(victory !== false);
  }, [results, victory]);

  const winners = results.rows.filter((r) => r.role === results.winner);
  const report = [...results.rows].sort((a, b) => (a.role === b.role ? 0 : a.role === "sabotador" ? -1 : 1));
  const title = victory === null ? "FIM DE EXPEDIENTE" : victory ? "VITÓRIA" : "DERROTA";

  const voltar = () => {
    if (lobby?.phase === "results") net.send({ t: "lobby" });
    setState({ suspeitoResults: null });
  };

  return (
    <div className={`sres ${victory === false ? "lose" : "win"} ${sabWin ? "team-sab" : "team-colab"}`}>
      <div className="sres-backdrop" aria-hidden />
      <Particles victory={victory !== false} />

      <div className="sres-stage">
        <p className="sres-kicker">Fim do expediente</p>
        <h1 className="sres-title" aria-label={title}>
          {[...title].map((ch, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties} aria-hidden>
              {ch === " " ? " " : ch}
            </span>
          ))}
        </h1>
        <p className="sres-sub">
          <strong>{sabWin ? "Os Sabotadores venceram" : "Os Colaboradores venceram"}</strong>
          <span>{REASON_LABEL[results.reason]}</span>
        </p>

        <ul className="sres-lineup">
          {winners.map((r, i) => (
            <li key={r.id} className={r.id === myId ? "me" : undefined} style={{ "--i": i } as CSSProperties}>
              <div className="sres-avatar">
                <Thumb src={thumbs.get(r.id) ?? null} name={r.name} />
                {!r.alive && <span className="sres-ko">Eliminado</span>}
              </div>
              <span className="sres-name">{r.id === myId ? "Você" : r.name}</span>
            </li>
          ))}
        </ul>

        <section className="sres-report">
          <h2>Relatório do expediente</h2>
          <div className="sres-rows">
            {report.map((r: SuspeitoResultRow, i) => {
              const sab = r.role === "sabotador";
              return (
                <div
                  key={r.id}
                  className={`sres-row ${sab ? "sab" : "colab"} ${r.id === myId ? "me" : ""} ${r.alive ? "" : "dead"}`}
                  style={{ "--i": i } as CSSProperties}
                >
                  <div className="sres-mini">
                    <Thumb src={thumbs.get(r.id) ?? null} name={r.name} />
                  </div>
                  <div className="sres-who">
                    <strong>
                      {r.name}
                      {r.id === myId && <em> (você)</em>}
                    </strong>
                    <span className={`sres-role ${sab ? "sab" : "colab"}`}>{sab ? "Sabotador" : "Colaborador"}</span>
                  </div>
                  <div className="sres-stat">
                    <b>{r.tasksDone}</b>
                    <small>tarefas</small>
                  </div>
                  <div className="sres-stat">
                    <b>{r.kills}</b>
                    <small>eliminações</small>
                  </div>
                  <div className="sres-stat">
                    <b>{r.votesReceived}</b>
                    <small>votos</small>
                  </div>
                  <span className={`sres-status ${r.alive ? "ok" : "ko"}`}>{r.alive ? "Sobreviveu" : "Eliminado"}</span>
                </div>
              );
            })}
          </div>
        </section>

        {results.awards.length > 0 && (
          <div className="sres-awards">
            <Awards />
          </div>
        )}

        <div className="sres-actions">
          {isHost && (
            <button className="btn primary big" onClick={jogarDeNovo}>
              Jogar de novo
            </button>
          )}
          <button className={`btn big ${isHost ? "" : "primary"}`} onClick={voltar}>
            Voltar ao lobby
          </button>
        </div>
      </div>
    </div>
  );
}

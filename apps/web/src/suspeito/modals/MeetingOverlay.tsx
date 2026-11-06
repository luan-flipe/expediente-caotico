import { avatarThumbnail } from "../../game/character";
import { net } from "../../store";
import type { SuspeitoMeetingState, SuspeitoPlayerPublic } from "@ec/shared";

interface MeetingOverlayProps {
  meeting: SuspeitoMeetingState;
  players: SuspeitoPlayerPublic[];
  myId: string;
  myVote: string | null;
  phaseRemainingMs: number;
}

export function MeetingOverlay({
  meeting,
  players,
  myId,
  myVote,
  phaseRemainingMs,
}: MeetingOverlayProps) {
  const me = players.find((p) => p.id === myId);
  const isAlive = me?.alive ?? false;
  const isVoting = meeting.phase === "voting";
  const isResult = meeting.phase === "result";

  const remainingSec = Math.ceil(phaseRemainingMs / 1000);

  const castVote = (targetIdOrSkip: string) => {
    if (!isVoting || !isAlive || myVote) return;
    net.send({ t: "suspeitoVote", targetIdOrSkip });
  };

  return (
    <div className="suspeito-meeting-overlay">
      <div className="suspeito-meeting-panel">
        <div className="meeting-header">
          {meeting.reason === "body" ? (
            <div className="meeting-alert body">
              <h2>🚨 OCORRÊNCIA REPORTADA!</h2>
              <p>
                <strong>{meeting.callerName}</strong> encontrou o corpo de{" "}
                <strong>{meeting.reportedVictimName ?? "alguém"}</strong>!
              </p>
            </div>
          ) : (
            <div className="meeting-alert emergency">
              <h2>📢 REUNIÃO EMERGENCIAL</h2>
              <p>
                Convocada por <strong>{meeting.callerName}</strong> na Sala de Reuniões.
              </p>
            </div>
          )}

          <div className="meeting-timer-box">
            <span className="label">
              {isResult ? "Resultado da votação" : isVoting ? "Votação aberta" : "Discussão"}
            </span>
            <div className="meeting-timer">{remainingSec}s</div>
          </div>
        </div>

        {/* Banner de resultado da votação quando a apuração acontece */}
        {isResult && (
          <div className={`meeting-result-banner ${meeting.ejectedRole === "sabotador" ? "impostor-out" : "colab-out"}`}>
            {meeting.ejectedRole === "sabotador" ? (
              <h3>🔥 {meeting.ejectedName} foi removido(a). Era um SABOTADOR!</h3>
            ) : meeting.ejectedRole === "colaborador" ? (
              <h3>💼 {meeting.ejectedName} foi removido(a). NÃO era um Sabotador.</h3>
            ) : meeting.ejectedId === "tie" ? (
              <h3>⚖️ Empate na votação. Ninguém foi removido.</h3>
            ) : (
              <h3>⏭️ Votação pulada pela maioria. Ninguém foi removido.</h3>
            )}
          </div>
        )}

        {/* Grade de participantes para discussão e voto */}
        <div className="meeting-roster">
          {players.map((p) => {
            const hasVoted = meeting.votes[p.id] !== undefined;
            const isMe = p.id === myId;
            const canVoteOn = isVoting && isAlive && !myVote && p.alive;

            // Contagem de votos recebidos no resultado
            let votesOnThisPlayer = 0;
            if (isResult) {
              for (const target of Object.values(meeting.votes)) {
                if (target === p.id) votesOnThisPlayer++;
              }
            }

            return (
              <div
                key={p.id}
                className={`meeting-player-card ${!p.alive ? "dead" : ""} ${p.id === meeting.ejectedId ? "ejected" : ""}`}
              >
                <div className="meeting-avatar-wrap">
                  <img src={avatarThumbnail(p.avatar)} alt={p.name} />
                  {!p.alive && <span className="dead-tag">ELIMINADO</span>}
                </div>

                <div className="meeting-player-info">
                  <span className="meeting-name">
                    {p.name} {isMe ? "(Você)" : ""}
                  </span>
                  <div className="meeting-status-badges">
                    {p.alive && (
                      <span className={`vote-badge ${hasVoted ? "voted" : "thinking"}`}>
                        {hasVoted ? "✓ Votou" : "Decidindo..."}
                      </span>
                    )}
                    {isResult && votesOnThisPlayer > 0 && (
                      <span className="vote-count-badge">🗳️ {votesOnThisPlayer}</span>
                    )}
                  </div>
                </div>

                {canVoteOn && (
                  <button className="btn small primary vote-btn" onClick={() => castVote(p.id)}>
                    Votar
                  </button>
                )}
                {myVote === p.id && <span className="my-vote-tag">Seu voto</span>}
              </div>
            );
          })}
        </div>

        {/* Opção de pular o voto */}
        {isVoting && isAlive && (
          <div className="meeting-skip-row">
            <button
              className={`btn ${myVote === "skip" ? "primary" : ""}`}
              onClick={() => castVote("skip")}
              disabled={myVote !== null}
            >
              {myVote === "skip" ? "✓ Você votou para Pular" : "Pular Voto (Abster-se)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

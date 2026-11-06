import { useEffect, useRef, useState } from "react";
import { SECTORS, type SuspeitoMeetingMessage, type SuspeitoMeetingState, type SuspeitoPlayerPublic } from "@ec/shared";
import { avatarThumbnail } from "../../game/character";
import { net } from "../../store";
import { playVoteCastSound } from "../suspeitoSound";

interface MeetingOverlayProps {
  meeting: SuspeitoMeetingState;
  players: SuspeitoPlayerPublic[];
  myId: string;
  myVote: string | null;
  phaseRemainingMs: number;
}

const KIND_BADGE: Record<SuspeitoMeetingMessage["kind"], { label: string; cls: string }> = {
  report: { label: "🚨 OCORRÊNCIA", cls: "badge-report" },
  accuse: { label: "👀 SUSPEITA", cls: "badge-accuse" },
  alibi: { label: "📍 ÁLIBI", cls: "badge-alibi" },
  defense: { label: "🛡️ DEFESA", cls: "badge-defense" },
  chat: { label: "💬 DEPOIMENTO", cls: "badge-chat" },
};

export function MeetingOverlay({
  meeting,
  players,
  myId,
  myVote,
  phaseRemainingMs,
}: MeetingOverlayProps) {
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const me = players.find((p) => p.id === myId);
  const isAlive = me?.alive ?? false;
  const isDiscussion = meeting.phase === "discussion";
  const isVoting = meeting.phase === "voting";
  const isResult = meeting.phase === "result";

  const remainingSec = Math.ceil(phaseRemainingMs / 1000);
  const reportedSectorName = meeting.reportedBodySector
    ? SECTORS[meeting.reportedBodySector]?.name
    : undefined;

  const messages = meeting.messages ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const castVote = (targetIdOrSkip: string) => {
    if (!isVoting || !isAlive || myVote) return;
    playVoteCastSound();
    net.send({ t: "suspeitoVote", targetIdOrSkip });
  };

  const sendStatement = (
    text: string,
    kind: SuspeitoMeetingMessage["kind"] = "chat",
    targetId?: string,
    skipDiscussion?: boolean,
  ) => {
    if (!isAlive || isResult) return;
    const clean = text.trim();
    if (!clean) return;
    net.send({
      t: "suspeitoChat",
      text: clean,
      kind,
      targetId,
      skipDiscussion,
    });
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendStatement(chatText, "chat");
    setChatText("");
  };

  const handleGiveAlibi = () => {
    const sectorName = SECTORS[me?.sector ?? "reuniao"]?.name ?? "Escritório";
    sendStatement(`Eu estava em ${sectorName} cumprindo minhas tarefas do expediente.`, "alibi");
  };

  const handleDefendSelf = () => {
    sendStatement("Sou colaborador! Estava focado nas entregas, não tenho relação com a sabotagem.", "defense");
  };

  const handleAskWhere = () => {
    sendStatement("Onde encontraram o corpo? Alguém viu quem saiu daquele setor?", "chat");
  };

  const handleAccusePlayer = (target: SuspeitoPlayerPublic) => {
    const sectorName = SECTORS[target.sector]?.name ?? "corredor";
    sendStatement(
      `Acho ${target.name} muito suspeito(a) perto de ${sectorName}!`,
      "accuse",
      target.id,
    );
  };

  const handleFastForwardToVoting = () => {
    sendStatement("Já ouvimos os depoimentos, vamos abrir a votação agora!", "chat", undefined, true);
  };

  // Última fala de cada jogador para exibir balão resumido no card
  const latestMessageByPlayer = new Map<string, SuspeitoMeetingMessage>();
  for (const m of messages) {
    latestMessageByPlayer.set(m.senderId, m);
  }

  return (
    <div className="suspeito-meeting-overlay">
      <div className="suspeito-meeting-panel">
        <div className="meeting-header">
          {meeting.reason === "body" ? (
            <div className="meeting-alert body">
              <h2>🚨 OCORRÊNCIA REPORTADA!</h2>
              <p>
                <strong>{meeting.callerName}</strong> encontrou o corpo de{" "}
                <strong>{meeting.reportedVictimName ?? "alguém"}</strong>
                {reportedSectorName ? (
                  <>
                    {" "}no setor <strong>{reportedSectorName}</strong>!
                  </>
                ) : (
                  "!"
                )}
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

          <div className="meeting-header-right">
            {isDiscussion && isAlive && (
              <button
                className="btn small meeting-fastvote-btn"
                onClick={handleFastForwardToVoting}
                title="Encerrar tempo de discussão e liberar os votos imediatamente"
              >
                ⚡ Abrir Votação Agora
              </button>
            )}
            <div className="meeting-timer-box">
              <span className="label">
                {isResult ? "Resultado da votação" : isVoting ? "Votação aberta" : "Discussão"}
              </span>
              <div className="meeting-timer">{remainingSec}s</div>
            </div>
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

        <div className="meeting-body-layout">
          {/* Coluna Esquerda: Grade de participantes para discussão e voto */}
          <div className="meeting-roster-col">
            <div className="meeting-section-title">
              <span>👥 Funcionários na Sala ({players.filter((p) => p.alive).length} vivos)</span>
              {isVoting && isAlive && !myVote && (
                <span className="meeting-vote-prompt">Selecione um suspeito para votar</span>
              )}
            </div>

            <div className="meeting-roster">
              {players.map((p) => {
                const hasVoted = meeting.votes[p.id] !== undefined;
                const isMe = p.id === myId;
                const canVoteOn = isVoting && isAlive && !myVote && p.alive;
                const lastStatement = latestMessageByPlayer.get(p.id);

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
                    className={`meeting-player-card ${!p.alive ? "dead" : ""} ${p.id === meeting.ejectedId ? "ejected" : ""} ${myVote === p.id ? "voted-target" : ""}`}
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
                            {hasVoted ? "✓ Votou" : isDiscussion ? "Ouvindo..." : "Decidindo..."}
                          </span>
                        )}
                        {isResult && votesOnThisPlayer > 0 && (
                          <span className="vote-count-badge">🗳️ {votesOnThisPlayer}</span>
                        )}
                      </div>
                      {lastStatement && (
                        <div className="meeting-mini-quote" title={lastStatement.text}>
                          “{lastStatement.text}”
                        </div>
                      )}
                    </div>

                    <div className="meeting-card-actions">
                      {!isResult && isAlive && p.alive && !isMe && (
                        <button
                          className="btn small accuse-chip-btn"
                          onClick={() => handleAccusePlayer(p)}
                          title={`Acusar ${p.name} no quadro de depoimentos`}
                        >
                          👀 Acusar
                        </button>
                      )}
                      {canVoteOn && (
                        <button className="btn small primary vote-btn" onClick={() => castVote(p.id)}>
                          Votar
                        </button>
                      )}
                      {myVote === p.id && <span className="my-vote-tag">✓ Seu voto</span>}
                    </div>
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
                  {myVote === "skip" ? "✓ Você votou para Pular" : "⏭️ Pular Voto (Abster-se)"}
                </button>
              </div>
            )}
          </div>

          {/* Coluna Direita: Quadro de Depoimentos e Chat */}
          <div className="meeting-chat-col">
            <div className="meeting-section-title">
              <span>📋 Ata de Depoimentos & Álibis</span>
            </div>

            <div className="meeting-chat-feed">
              {messages.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", margin: "24px 0" }}>
                  Aguardando depoimentos dos funcionários...
                </p>
              ) : (
                messages.map((msg) => {
                  const badge = KIND_BADGE[msg.kind] ?? KIND_BADGE.chat;
                  const mine = msg.senderId === myId;
                  return (
                    <div key={msg.id} className={`meeting-chat-msg ${mine ? "mine" : ""} kind-${msg.kind}`}>
                      <div className="meeting-chat-msg-head">
                        <strong>{msg.senderName}</strong>
                        <span className={`meeting-msg-badge ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <p className="meeting-chat-msg-text">{msg.text}</p>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {isAlive && !isResult ? (
              <div className="meeting-chat-controls">
                <div className="meeting-quick-chips">
                  <button type="button" className="quick-statement-chip alibi" onClick={handleGiveAlibi}>
                    📍 Dar meu álibi
                  </button>
                  <button type="button" className="quick-statement-chip defense" onClick={handleDefendSelf}>
                    🛡️ Me defender
                  </button>
                  <button type="button" className="quick-statement-chip question" onClick={handleAskWhere}>
                    ❓ Onde foi?
                  </button>
                </div>

                <form className="meeting-chat-form" onSubmit={handleChatSubmit}>
                  <input
                    className="field meeting-chat-input"
                    placeholder="Escreva seu depoimento ou suspeita..."
                    value={chatText}
                    maxLength={140}
                    onChange={(e) => setChatText(e.target.value)}
                  />
                  <button className="btn small primary" type="submit" disabled={!chatText.trim()}>
                    Enviar
                  </button>
                </form>
              </div>
            ) : (
              !isAlive && (
                <div className="meeting-dead-chat-note">
                  👻 Funcionários eliminados não podem enviar depoimentos nem votar.
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

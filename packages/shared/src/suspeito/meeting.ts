import type { SuspeitoMeetingState } from "./types";

export function createMeeting(params: {
  callerId: string;
  callerName: string;
  reason: "emergency" | "body";
  reportedVictimName?: string;
  discussionMs?: number;
  votingMs?: number;
}): SuspeitoMeetingState {
  const discussionMs = params.discussionMs ?? 20000;
  const votingMs = params.votingMs ?? 25000;

  return {
    phase: "discussion",
    callerId: params.callerId,
    callerName: params.callerName,
    reason: params.reason,
    reportedVictimName: params.reportedVictimName,
    remainingMs: discussionMs,
    totalDiscussionMs: discussionMs,
    totalVotingMs: votingMs,
    votes: {},
    ejectedId: null,
  };
}

export function registerVote(
  meeting: SuspeitoMeetingState,
  voterId: string,
  targetIdOrSkip: string
): boolean {
  if (meeting.phase !== "voting") return false;
  meeting.votes[voterId] = targetIdOrSkip;
  return true;
}

export interface TallyResult {
  ejectedId: string | null; // playerId or null if tie/skip
  outcome: "ejected" | "tie" | "skipped";
  voteCounts: Record<string, number>;
  totalVotes: number;
}

export function tallyVotes(
  votes: Record<string, string>,
  eligibleVoters: string[]
): TallyResult {
  const voteCounts: Record<string, number> = {};
  let totalVotes = 0;

  for (const voter of eligibleVoters) {
    const choice = votes[voter];
    if (choice) {
      voteCounts[choice] = (voteCounts[choice] ?? 0) + 1;
      totalVotes++;
    }
  }

  let maxVotes = 0;
  let topTarget: string | null = null;
  let isTie = false;

  for (const [target, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      topTarget = target;
      isTie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      isTie = true;
    }
  }

  if (isTie || !topTarget) {
    return { ejectedId: null, outcome: "tie", voteCounts, totalVotes };
  }

  if (topTarget === "skip") {
    return { ejectedId: null, outcome: "skipped", voteCounts, totalVotes };
  }

  return { ejectedId: topTarget, outcome: "ejected", voteCounts, totalVotes };
}

import { TRACK_IDS, type TrackId } from "./track";

const DIA_MS = 24 * 60 * 60 * 1000;
/** O dia vira à meia-noite de Brasília (UTC-3), não à do servidor. */
const BRASILIA_MS = 3 * 60 * 60 * 1000;

/** Pista sugerida do dia: gira pela lista de pistas, igual para todo mundo no mesmo dia. */
export function pistaDoDia(agora: number): TrackId {
  const dia = Math.floor((agora - BRASILIA_MS) / DIA_MS);
  return TRACK_IDS[((dia % TRACK_IDS.length) + TRACK_IDS.length) % TRACK_IDS.length]!;
}

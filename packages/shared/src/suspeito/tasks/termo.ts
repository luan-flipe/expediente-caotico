import type { TermoEvaluation, TermoGuess, TermoTaskState } from "../types";

export const TERMO_WORDS = [
  "PRAZO",
  "SALAS",
  "MURAL",
  "METAS",
  "DADOS",
  "LUCRO",
  "PAUTA",
  "TURNO",
  "CABOS",
  "NOTAS",
  "SETOR",
  "CARGO",
  "FOLHA",
  "PONTO",
  "GRUPO",
  "PLANO",
  "FROTA",
  "ENVIO",
  "AVISO",
  "RAMAL",
  "CHEFE",
  "TEMPO",
  "EMAIL",
  "VAGAS",
  "TERMO",
  "GASTO",
  "CAIXA",
  "VENDA",
  "CUSTO",
  "VALOR",
  "REDES",
  "LOGON",
  "ATIVO",
  "SALDO",
  "COPIA",
  "TEXTO",
  "FIRMA",
  "VIRUS",
  "ANEXO",
  "DISCO",
  "COFRE",
  "BANCO",
  "FICHA",
  "BLOCO",
  "TAXAS",
  "VERBA",
  "MIDIA",
  "BRIEF",
  "LOGIN",
  "RESET",
  "PATCH",
  "BOTAO",
  "PAPEL",
  "PASTA",
  "CLUBE",
  "SOCIO",
  "ETICA",
  "VISAO",
  "VIDEO",
  "AUDIT",
  "LOBBY",
  "CHAVE",
  "NORMA",
  "POSTO",
  "GRAFO",
  "PROVA",
  "AJUDA",
  "LINHA",
  "MARCA",
  "CURSO",
  "TRENO",
  "CANAL",
] as const;

export function normalizeWord(word: string): string {
  return word
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Avalia uma tentativa em relação à palavra secreta com tratamento correto de letras repetidas */
export function evaluateTermoGuess(secretWord: string, rawGuess: string): TermoEvaluation[] {
  const secret = normalizeWord(secretWord);
  const guess = normalizeWord(rawGuess);
  const n = secret.length;
  const result: TermoEvaluation[] = [];

  const secretLetterCounts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const ch = secret[i];
    secretLetterCounts[ch] = (secretLetterCounts[ch] ?? 0) + 1;
  }

  // Primeiro passo: identificar posições corretas (verdes)
  const isCorrect: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const ch = guess[i] ?? "";
    if (ch === secret[i]) {
      isCorrect[i] = true;
      secretLetterCounts[ch]--;
    }
  }

  // Segundo passo: identificar presentes em outra posição (amarelas) ou ausentes (cinzas)
  for (let i = 0; i < n; i++) {
    const ch = guess[i] ?? "";
    if (isCorrect[i]) {
      result.push({ letter: ch, status: "correct" });
    } else if (secretLetterCounts[ch] && secretLetterCounts[ch] > 0) {
      result.push({ letter: ch, status: "present" });
      secretLetterCounts[ch]--;
    } else {
      result.push({ letter: ch, status: "absent" });
    }
  }

  return result;
}

export interface TermoChallenge {
  secretWord: string;
  state: TermoTaskState;
}

export function createTermoChallenge(seedWord?: string): TermoChallenge {
  const secretWord = seedWord
    ? normalizeWord(seedWord)
    : TERMO_WORDS[Math.floor(Math.random() * TERMO_WORDS.length)];

  return {
    secretWord,
    state: {
      wordLength: 5,
      maxGuesses: 6,
      guesses: [],
      solved: false,
      failed: false,
    },
  };
}

export function applyTermoGuess(
  challenge: TermoChallenge,
  rawGuess: string
): { valid: boolean; guess?: TermoGuess; solved: boolean; failed: boolean; error?: string } {
  if (challenge.state.solved || challenge.state.failed) {
    return { valid: false, solved: challenge.state.solved, failed: challenge.state.failed, error: "Desafio já finalizado" };
  }

  const guess = normalizeWord(rawGuess);
  if (guess.length !== challenge.state.wordLength) {
    return { valid: false, solved: false, failed: false, error: "A palavra deve ter 5 letras" };
  }

  const evaluations = evaluateTermoGuess(challenge.secretWord, guess);
  const termGuess: TermoGuess = { word: guess, evaluations };
  challenge.state.guesses.push(termGuess);

  const isWin = guess === normalizeWord(challenge.secretWord);
  if (isWin) {
    challenge.state.solved = true;
  } else if (challenge.state.guesses.length >= challenge.state.maxGuesses) {
    challenge.state.failed = true;
  }

  return {
    valid: true,
    guess: termGuess,
    solved: challenge.state.solved,
    failed: challenge.state.failed,
  };
}

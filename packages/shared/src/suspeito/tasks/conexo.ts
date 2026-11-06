import type { ConexoGroup, ConexoTaskState } from "../types";
import { normalizeWord } from "./termo";

export interface ConexoPuzzleData {
  groups: [ConexoGroup, ConexoGroup, ConexoGroup, ConexoGroup];
}

export const CONEXO_PUZZLES: ConexoPuzzleData[] = [
  {
    groups: [
      {
        id: "g1",
        title: "Bebidas da Copa",
        words: ["CAFÉ", "ÁGUA", "CHÁ", "ENERGÉTICO"],
        solved: false,
      },
      {
        id: "g2",
        title: "Departamentos da Empresa",
        words: ["FINANCEIRO", "DIRETORIA", "SUPORTE", "JURÍDICO"],
        solved: false,
      },
      {
        id: "g3",
        title: "Materiais de Escritório",
        words: ["GRAMPEADOR", "CANETA", "POST-IT", "BLOCO"],
        solved: false,
      },
      {
        id: "g4",
        title: "Tecnologias e Ferramentas",
        words: ["PYTHON", "JAVASCRIPT", "DOCKER", "LINUX"],
        solved: false,
      },
    ],
  },
  {
    groups: [
      {
        id: "g1",
        title: "Rotinas de Recursos Humanos",
        words: ["ENTREVISTA", "ADMISSÃO", "FÉRIAS", "HOLERITE"],
        solved: false,
      },
      {
        id: "g2",
        title: "Equipamentos de Informática",
        words: ["MONITOR", "TECLADO", "MOUSE", "ROTEADOR"],
        solved: false,
      },
      {
        id: "g3",
        title: "Documentos Corporativos",
        words: ["CONTRATO", "RELATÓRIO", "PLANILHA", "PROPOSTA"],
        solved: false,
      },
      {
        id: "g4",
        title: "Canais de Comunicação",
        words: ["SLACK", "EMAIL", "TEAMS", "MEET"],
        solved: false,
      },
    ],
  },
];

export interface ConexoChallenge {
  groups: ConexoGroup[];
  state: ConexoTaskState;
}

export function createConexoChallenge(puzzleIndex?: number): ConexoChallenge {
  const puzzle = CONEXO_PUZZLES[puzzleIndex ?? Math.floor(Math.random() * CONEXO_PUZZLES.length)];
  const groups: ConexoGroup[] = puzzle.groups.map((g) => ({ ...g, words: [...g.words] as [string, string, string, string] }));

  // Junta todas as 16 palavras e embaralha
  const allWords = groups.flatMap((g) => g.words);
  for (let i = allWords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
  }

  return {
    groups,
    state: {
      allWords,
      solvedGroups: [],
      mistakesRemaining: 4,
      solved: false,
      failed: false,
    },
  };
}

export function validateConexoSelection(
  challenge: ConexoChallenge,
  selectedWords: string[]
): {
  valid: boolean;
  match?: { title: string; words: string[] };
  oneAway?: boolean;
  solved: boolean;
  failed: boolean;
  error?: string;
} {
  if (challenge.state.solved || challenge.state.failed) {
    return { valid: false, solved: challenge.state.solved, failed: challenge.state.failed, error: "Desafio já finalizado" };
  }

  if (selectedWords.length !== 4) {
    return { valid: false, solved: false, failed: false, error: "Selecione exatamente 4 palavras" };
  }

  const normalizedSelection = selectedWords.map(normalizeWord).sort();

  // Verifica se bate com algum dos grupos ainda não resolvidos
  for (const group of challenge.groups) {
    if (group.solved) continue;
    const normalizedGroup = group.words.map(normalizeWord).sort();
    const count = normalizedSelection.filter((w) => normalizedGroup.includes(w)).length;

    if (count === 4) {
      group.solved = true;
      const solvedGroup = { title: group.title, words: [...group.words] };
      challenge.state.solvedGroups.push(solvedGroup);

      // Remove as palavras do array de ativas
      challenge.state.allWords = challenge.state.allWords.filter(
        (w) => !normalizedGroup.includes(normalizeWord(w))
      );

      if (challenge.state.solvedGroups.length === 4) {
        challenge.state.solved = true;
      }

      return {
        valid: true,
        match: solvedGroup,
        solved: challenge.state.solved,
        failed: false,
      };
    }
  }

  // Se não bateu nenhum grupo com 4, verifica se faltou só 1 (3 de 4) para dar dica
  let oneAway = false;
  for (const group of challenge.groups) {
    if (group.solved) continue;
    const normalizedGroup = group.words.map(normalizeWord).sort();
    const count = normalizedSelection.filter((w) => normalizedGroup.includes(w)).length;
    if (count === 3) {
      oneAway = true;
      break;
    }
  }

  challenge.state.mistakesRemaining = Math.max(0, challenge.state.mistakesRemaining - 1);
  if (challenge.state.mistakesRemaining === 0) {
    challenge.state.failed = true;
  }

  return {
    valid: false,
    oneAway,
    solved: false,
    failed: challenge.state.failed,
  };
}

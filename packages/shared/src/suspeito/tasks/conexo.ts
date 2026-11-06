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
  {
    groups: [
      {
        id: "g1",
        title: "Gestão e Metodologias Ágeis",
        words: ["SPRINT", "BACKLOG", "KANBAN", "SCRUM"],
        solved: false,
      },
      {
        id: "g2",
        title: "Mobiliário Corporativo",
        words: ["CADEIRA", "MESA", "GAVETEIRO", "ARQUIVO"],
        solved: false,
      },
      {
        id: "g3",
        title: "Benefícios do Empregado",
        words: ["VALE-REFEIÇÃO", "CONVÊNIO", "SEGURO", "BÔNUS"],
        solved: false,
      },
      {
        id: "g4",
        title: "Segurança da Informação",
        words: ["SENHA", "FIREWALL", "BACKUP", "TOKEN"],
        solved: false,
      },
    ],
  },
  {
    groups: [
      {
        id: "g1",
        title: "Finanças e Contabilidade",
        words: ["FATURAMENTO", "RECEITA", "DESPESA", "IMPOSTO"],
        solved: false,
      },
      {
        id: "g2",
        title: "Cargos de Liderança",
        words: ["DIRETOR", "GERENTE", "COORDENADOR", "SUPERVISOR"],
        solved: false,
      },
      {
        id: "g3",
        title: "Impressão e Gráfica",
        words: ["TONER", "CARTUCHO", "RESMA", "BANDEJA"],
        solved: false,
      },
      {
        id: "g4",
        title: "Conectividade de Redes",
        words: ["SWITCH", "FIBRA", "CABO", "MODEM"],
        solved: false,
      },
    ],
  },
  {
    groups: [
      {
        id: "g1",
        title: "Reuniões e Eventos",
        words: ["ALINHAMENTO", "RETROSPECTIVA", "WORKSHOP", "PALESTRA"],
        solved: false,
      },
      {
        id: "g2",
        title: "Espaços Comuns",
        words: ["RECEPÇÃO", "CORREDOR", "ELEVADOR", "ESTACIONAMENTO"],
        solved: false,
      },
      {
        id: "g3",
        title: "Métricas de Negócio",
        words: ["CONVERSÃO", "CHURN", "ENGAJAMENTO", "RETENÇÃO"],
        solved: false,
      },
      {
        id: "g4",
        title: "Formas de Armazenamento",
        words: ["NUVEM", "PENDRAIVE", "HD", "SERVIDOR"],
        solved: false,
      },
    ],
  },
  {
    groups: [
      {
        id: "g1",
        title: "Logística e Suprimentos",
        words: ["ESTOQUE", "REMESSA", "FRETE", "RASTREAMENTO"],
        solved: false,
      },
      {
        id: "g2",
        title: "Tipos de Vínculo de Trabalho",
        words: ["ESTÁGIO", "CLT", "TERCEIRIZADO", "TEMPORÁRIO"],
        solved: false,
      },
      {
        id: "g3",
        title: "Periféricos de Áudio e Vídeo",
        words: ["WEBCAM", "HEADSET", "MICROFONE", "CAIXA DE SOM"],
        solved: false,
      },
      {
        id: "g4",
        title: "Ações de Marketing",
        words: ["CAMPANHA", "ANÚNCIO", "NEWSLETTER", "BRANDING"],
        solved: false,
      },
    ],
  },
];

export interface ConexoChallenge {
  groups: ConexoGroup[];
  state: ConexoTaskState;
}

export function createConexoChallenge(puzzleIndex?: number, rng = Math.random): ConexoChallenge {
  const idx = puzzleIndex !== undefined
    ? Math.abs(puzzleIndex) % CONEXO_PUZZLES.length
    : Math.floor(rng() * CONEXO_PUZZLES.length);
  const puzzle = CONEXO_PUZZLES[idx];
  const groups: ConexoGroup[] = puzzle.groups.map((g) => ({ ...g, words: [...g.words] as [string, string, string, string] }));

  // Junta todas as 16 palavras e embaralha
  const allWords = groups.flatMap((g) => g.words);
  for (let i = allWords.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
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
      challenge.state.oneAway = false;

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

  challenge.state.oneAway = oneAway;
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

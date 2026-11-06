import type { ContextoGuess, ContextoTaskState } from "../types";
import { normalizeWord } from "./termo";

export interface ContextoChallengeData {
  target: string;
  category: string;
  hint: string;
  // Ranking semântico pré-computado (palavra -> posição/distância, 1 = alvo)
  rankedWords: Record<string, number>;
}

export const CONTEXTO_CHALLENGES: ContextoChallengeData[] = [
  {
    target: "SALARIO",
    category: "Financeiro & RH",
    hint: "Remuneração mensal recebida pelos colaboradores pelo trabalho realizado.",
    rankedWords: {
      SALARIO: 1,
      PAGAMENTO: 2,
      REMUNERACAO: 3,
      HOLERITE: 4,
      BENEFICIO: 5,
      DINHEIRO: 6,
      CONTA: 12,
      BANCO: 18,
      TRABALHO: 25,
      EMPREGO: 30,
      CONTRATO: 40,
      EMPRESA: 60,
      DESCONTO: 80,
      IMPOSTO: 100,
      CHEFE: 150,
      HORA: 200,
      FERIAS: 220,
      CARGO: 250,
      MESA: 500,
      COMPUTADOR: 600,
      CAFE: 800,
    },
  },
  {
    target: "REUNIAO",
    category: "Gestão & Projetos",
    hint: "Encontro de colegas de trabalho para discutir pautas e metas.",
    rankedWords: {
      REUNIAO: 1,
      ENCONTRO: 2,
      ALINHAMENTO: 3,
      PAUTA: 4,
      CONVERSA: 5,
      APRESENTACAO: 6,
      DISCUSSAO: 8,
      SALA: 15,
      PROJETO: 22,
      FEEDBACK: 30,
      EQUIPE: 35,
      TIME: 45,
      CHEFE: 70,
      METAS: 90,
      CALENDARIO: 120,
      HORARIO: 150,
      ATA: 180,
      CONTRATO: 300,
      CAFE: 450,
      TECLADO: 700,
    },
  },
  {
    target: "COMPUTADOR",
    category: "Tecnologia & TI",
    hint: "Equipamento essencial na mesa de cada colaborador para trabalhar.",
    rankedWords: {
      COMPUTADOR: 1,
      NOTEBOOK: 2,
      PC: 3,
      MAQUINA: 4,
      MONITOR: 5,
      TECLADO: 6,
      MOUSE: 7,
      TELA: 8,
      SISTEMA: 15,
      PROGRAMA: 20,
      INTERNET: 30,
      SOFTWARE: 35,
      REDE: 50,
      SUPORTE: 80,
      ARQUIVO: 120,
      CABO: 160,
      EMAIL: 200,
      MESA: 350,
      TRABALHO: 400,
      CAFE: 650,
    },
  },
];

export interface ContextoChallenge {
  data: ContextoChallengeData;
  state: ContextoTaskState;
}

export function createContextoChallenge(index?: number): ContextoChallenge {
  const data = CONTEXTO_CHALLENGES[index ?? Math.floor(Math.random() * CONTEXTO_CHALLENGES.length)];

  return {
    data,
    state: {
      category: data.category,
      hint: data.hint,
      guesses: [],
      bestDistance: 9999,
      solved: false,
      maxGuesses: 10,
    },
  };
}

export function getProximityTemperature(distance: number): "hot" | "warm" | "cold" {
  if (distance <= 50) return "hot";
  if (distance <= 300) return "warm";
  return "cold";
}

export function applyContextoGuess(
  challenge: ContextoChallenge,
  rawGuess: string
): { valid: boolean; guess?: ContextoGuess; solved: boolean; error?: string } {
  if (challenge.state.solved) {
    return { valid: false, solved: true, error: "Desafio já solucionado!" };
  }

  const guess = normalizeWord(rawGuess);
  if (!guess) {
    return { valid: false, solved: false, error: "Digite uma palavra válida" };
  }

  // Verifica se a palavra já foi enviada
  if (challenge.state.guesses.some((g) => g.word === guess)) {
    return { valid: false, solved: false, error: "Palavra já tentada" };
  }

  // Calcula distância no dicionário ou estima baseado em letras comuns/hash
  let distance: number;
  if (challenge.data.rankedWords[guess] !== undefined) {
    distance = challenge.data.rankedWords[guess];
  } else {
    // Para palavras fora do ranking pré-definido, calcula uma distância plausível acima de 300
    let hash = 0;
    for (let i = 0; i < guess.length; i++) hash = (hash * 31 + guess.charCodeAt(i)) % 500;
    distance = 350 + hash;
  }

  const temperature = getProximityTemperature(distance);
  const contextGuess: ContextoGuess = { word: guess, distance, temperature };

  challenge.state.guesses.push(contextGuess);
  challenge.state.guesses.sort((a, b) => a.distance - b.distance);

  if (distance < challenge.state.bestDistance) {
    challenge.state.bestDistance = distance;
  }

  if (distance === 1) {
    challenge.state.solved = true;
  }

  return {
    valid: true,
    guess: contextGuess,
    solved: challenge.state.solved,
  };
}

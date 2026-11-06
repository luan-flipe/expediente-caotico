import type { Vec2 } from "../types";
import type { SuspeitoSectorId, SuspeitoSectorInfo, SuspeitoTaskType } from "./types";

export interface SuspeitoWall {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface SuspeitoTaskStation {
  id: string;
  name: string;
  description: string;
  sector: SuspeitoSectorId;
  type: SuspeitoTaskType;
  pos: Vec2;
}

export const SECTORS: Record<SuspeitoSectorId, SuspeitoSectorInfo> = {
  arquivo: { id: "arquivo", name: "Arquivo", color: "#8d6e63", floorColor: "#d7ccc8", x: -22, z: -15, w: 12, d: 10 },
  servidores: { id: "servidores", name: "Sala de Servidores", color: "#37474f", floorColor: "#cfd8dc", x: -8, z: -15, w: 12, d: 10 },
  infra: { id: "infra", name: "Infraestrutura", color: "#00695c", floorColor: "#b2dfdb", x: 6, z: -15, w: 12, d: 10 },
  desenvolvimento: { id: "desenvolvimento", name: "Desenvolvimento", color: "#1565c0", floorColor: "#bbdefb", x: 20, z: -15, w: 12, d: 10 },

  diretoria: { id: "diretoria", name: "Diretoria", color: "#4a148c", floorColor: "#e1bee7", x: -22, z: 0, w: 12, d: 12 },
  reuniao: { id: "reuniao", name: "Sala de Reuniões", color: "#e65100", floorColor: "#ffe0b2", x: -4, z: 0, w: 18, d: 12 },
  suporte: { id: "suporte", name: "Suporte Técnico", color: "#00838f", floorColor: "#b2ebf2", x: 12, z: 0, w: 10, d: 12 },
  impressao: { id: "impressao", name: "Impressão", color: "#558b2f", floorColor: "#dcedc8", x: 23, z: 0, w: 10, d: 12 },

  financeiro: { id: "financeiro", name: "Financeiro", color: "#2e7d32", floorColor: "#c8e6c9", x: -22, z: 15, w: 12, d: 10 },
  rh: { id: "rh", name: "Recursos Humanos", color: "#ad1457", floorColor: "#f8bbd0", x: -8, z: 15, w: 12, d: 10 },
  copa: { id: "copa", name: "Copa e Café", color: "#d84315", floorColor: "#ffccbc", x: 6, z: 15, w: 12, d: 10 },
  recepcao: { id: "recepcao", name: "Recepção", color: "#455a64", floorColor: "#eceff1", x: 20, z: 15, w: 12, d: 10 },
};

/** Posição da mesa central e botão de reunião de emergência */
export const EMERGENCY_BUTTON_POS: Vec2 = { x: -4, z: 0 };

/** Pontos de conserto de sabotagens */
export const SABOTAGE_FIX_POSITIONS: Record<string, { sector: SuspeitoSectorId; pos: Vec2 }> = {
  vazamento_dados: { sector: "servidores", pos: { x: -8, z: -17 } },
  falha_energia: { sector: "infra", pos: { x: 6, z: -17 } },
  queda_rede: { sector: "desenvolvimento", pos: { x: 20, z: -17 } },
  impressora_travada: { sector: "impressao", pos: { x: 23, z: 2 } },
};

/** Posições de spawn inicial na sala de reunião ao redor da mesa */
export const SUSPEITO_SPAWNS: Vec2[] = [
  { x: -7, z: -2 },
  { x: -4, z: -2 },
  { x: -1, z: -2 },
  { x: -7, z: 2 },
  { x: -4, z: 2 },
  { x: -1, z: 2 },
  { x: -9, z: 0 },
  { x: 1, z: 0 },
  { x: -6, z: -3.5 },
  { x: -2, z: -3.5 },
  { x: -6, z: 3.5 },
  { x: -2, z: 3.5 },
];

/** Estações de tarefas catalogadas em cada setor */
export const TASK_STATIONS: SuspeitoTaskStation[] = [
  // 1. TERMO - Desafio de palavras corporativas de 5 letras
  {
    id: "task_termo_desenvolvimento",
    name: "Corrigir Código (TERMO)",
    description: "Descubra a palavra-chave de 5 letras no terminal de desenvolvimento.",
    sector: "desenvolvimento",
    type: "termo",
    pos: { x: 22, z: -17 },
  },
  {
    id: "task_termo_rh",
    name: "Validar Candidato (TERMO)",
    description: "Decifre o termo corporativo para aprovar o processo seletivo.",
    sector: "rh",
    type: "termo",
    pos: { x: -6, z: 17 },
  },

  // 2. CONEXO - Agrupamento de 16 palavras em 4 grupos
  {
    id: "task_conexo_reuniao",
    name: "Alinhar Pauta (CONEXO)",
    description: "Agrupe os 4 conjuntos de conceitos corporativos na lousa.",
    sector: "reuniao",
    type: "conexo",
    pos: { x: 2, z: -3 },
  },
  {
    id: "task_conexo_diretoria",
    name: "Planejamento Estratégico (CONEXO)",
    description: "Organize as diretrizes por departamentos e categorias.",
    sector: "diretoria",
    type: "conexo",
    pos: { x: -22, z: -3 },
  },

  // 3. CONTEXTO - Descoberta semântica por proximidade
  {
    id: "task_contexto_suporte",
    name: "Diagnosticar Chamado (CONTEXTO)",
    description: "Identifique a causa raiz do problema pela proximidade do assunto.",
    sector: "suporte",
    type: "contexto",
    pos: { x: 14, z: 2 },
  },
  {
    id: "task_contexto_financeiro",
    name: "Auditoria Contábil (CONTEXTO)",
    description: "Encontre o conceito financeiro investigado pelas dicas de contexto.",
    sector: "financeiro",
    type: "contexto",
    pos: { x: -24, z: 16 },
  },

  // 4. Quick tasks
  {
    id: "task_cabeamento_infra",
    name: "Conectar Cabos do Roteador",
    description: "Ligue os cabos de rede correspondentes no painel de infra.",
    sector: "infra",
    type: "cabeamento",
    pos: { x: 4, z: -17 },
  },
  {
    id: "task_arquivos_arquivo",
    name: "Classificar Pastas e Contratos",
    description: "Organize os lotes de documentos arquivados.",
    sector: "arquivo",
    type: "organizar_arquivos",
    pos: { x: -24, z: -16 },
  },
  {
    id: "task_servidor_servidores",
    name: "Reiniciar Servidor Local",
    description: "Acione a sequência de disjuntores da sala de servidores.",
    sector: "servidores",
    type: "reiniciar_servidor",
    pos: { x: -10, z: -17 },
  },
  {
    id: "task_copa_abastecer",
    name: "Reabastecer Pó de Café",
    description: "Coloque o pó e ligue a cafeteira da copa.",
    sector: "copa",
    type: "cabeamento",
    pos: { x: 8, z: 16 },
  },
  {
    id: "task_impressora_folhas",
    name: "Recarregar Bandeja de Papel",
    description: "Alinhe a resma de papel A4 na impressora central.",
    sector: "impressao",
    type: "organizar_arquivos",
    pos: { x: 25, z: -2 },
  },
  {
    id: "task_recepcao_cracha",
    name: "Cadastrar Crachás de Visitantes",
    description: "Valide as autorizações de entrada na recepção.",
    sector: "recepcao",
    type: "reiniciar_servidor",
    pos: { x: 18, z: 16 },
  },
];

/** Limites gerais do mapa */
export const MAP_BOUNDS = {
  minX: -30,
  maxX: 30,
  minZ: -22,
  maxZ: 22,
};

/** Identifica em qual setor uma posição (x, z) se encontra */
export function sectorAt(pos: Vec2): SuspeitoSectorId {
  for (const s of Object.values(SECTORS)) {
    const halfW = s.w / 2;
    const halfD = s.d / 2;
    if (
      pos.x >= s.x - halfW &&
      pos.x <= s.x + halfW &&
      pos.z >= s.z - halfD &&
      pos.z <= s.z + halfD
    ) {
      return s.id;
    }
  }
  // Se estiver nos corredores, acha o setor mais próximo
  let closest: SuspeitoSectorId = "reuniao";
  let minD = Infinity;
  for (const s of Object.values(SECTORS)) {
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minD) {
      minD = distSq;
      closest = s.id;
    }
  }
  return closest;
}

import type { Vec2 } from "../types";
import type { SuspeitoSectorId, SuspeitoSectorInfo, SuspeitoTaskType } from "./types";

export interface SuspeitoWall {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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

/** Raio de visão padrão e em sabotagem de energia */
export const SUSPEITO_NORMAL_VISION_RADIUS = 8.5;
export const SUSPEITO_SABOTAGE_VISION_RADIUS = 3.5;

/** Pontos de conserto de sabotagens */
export const SABOTAGE_FIX_POSITIONS: Record<string, { sector: SuspeitoSectorId; pos: Vec2 }> = {
  vazamento_dados: { sector: "servidores", pos: { x: -8, z: -17 } },
  falha_energia: { sector: "infra", pos: { x: 6, z: -17 } },
  queda_rede: { sector: "desenvolvimento", pos: { x: 20, z: -17 } },
  impressora_travada: { sector: "impressao", pos: { x: 23, z: 2 } },
};

/** Posições de spawn inicial na sala de reunião ao redor da mesa */
export const SUSPEITO_SPAWNS: Vec2[] = [
  { x: -7, z: -3.0 },
  { x: -4, z: -3.0 },
  { x: -1, z: -3.0 },
  { x: -7, z: 3.0 },
  { x: -4, z: 3.0 },
  { x: -1, z: 3.0 },
  { x: -9.5, z: 0 },
  { x: 1.5, z: 0 },
  { x: -6, z: -4.0 },
  { x: -2, z: -4.0 },
  { x: -6, z: 4.0 },
  { x: -2, z: 4.0 },
];

/** Cria segmento de parede retangular AABB */
function createWall(minX: number, maxX: number, minZ: number, maxZ: number): SuspeitoWall {
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
  };
}

const T = 0.4;   // espessura da parede
const HT = T / 2;
const DW = 2.4;  // largura da abertura de porta
const HDW = DW / 2;

/**
 * Monta as paredes de uma sala retangular com abertura de porta opcional em uma das faces
 */
function buildRoomWalls(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  door?: { face: "north" | "south" | "east" | "west"; center: number }
): SuspeitoWall[] {
  const walls: SuspeitoWall[] = [];

  // Norte (z = minZ)
  if (door?.face === "north") {
    walls.push(createWall(minX, door.center - HDW, minZ - HT, minZ + HT));
    walls.push(createWall(door.center + HDW, maxX, minZ - HT, minZ + HT));
  } else {
    walls.push(createWall(minX, maxX, minZ - HT, minZ + HT));
  }

  // Sul (z = maxZ)
  if (door?.face === "south") {
    walls.push(createWall(minX, door.center - HDW, maxZ - HT, maxZ + HT));
    walls.push(createWall(door.center + HDW, maxX, maxZ - HT, maxZ + HT));
  } else {
    walls.push(createWall(minX, maxX, maxZ - HT, maxZ + HT));
  }

  // Oeste (x = minX)
  if (door?.face === "west") {
    walls.push(createWall(minX - HT, minX + HT, minZ, door.center - HDW));
    walls.push(createWall(minX - HT, minX + HT, door.center + HDW, maxZ));
  } else {
    walls.push(createWall(minX - HT, minX + HT, minZ, maxZ));
  }

  // Leste (x = maxX)
  if (door?.face === "east") {
    walls.push(createWall(maxX - HT, maxX + HT, minZ, door.center - HDW));
    walls.push(createWall(maxX - HT, maxX + HT, door.center + HDW, maxZ));
  } else {
    walls.push(createWall(maxX - HT, maxX + HT, minZ, maxZ));
  }

  return walls;
}

/** Paredes físicas e visuais de todos os setores e obstáculos do mapa */
export const SUSPEITO_WALLS: SuspeitoWall[] = [
  // 1. Limites perimetrais externos do escritório
  createWall(-30.2, 30.2, -22.4, -21.8), // Norte
  createWall(-30.2, 30.2, 21.8, 22.4),   // Sul
  createWall(-30.4, -29.8, -22.2, 22.2), // Oeste
  createWall(29.8, 30.4, -22.2, 22.2),  // Leste

  // 2. Salas do Bloco Norte (portas abrindo para o corredor sul em z = -10)
  // Arquivo: x in [-28, -16], z in [-20, -10]
  ...buildRoomWalls(-28, -16, -20, -10, { face: "south", center: -22 }),
  // Servidores: x in [-14, -2], z in [-20, -10]
  ...buildRoomWalls(-14, -2, -20, -10, { face: "south", center: -8 }),
  // Infra: x in [0, 12], z in [-20, -10]
  ...buildRoomWalls(0, 12, -20, -10, { face: "south", center: 6 }),
  // Desenvolvimento: x in [14, 26], z in [-20, -10]
  ...buildRoomWalls(14, 26, -20, -10, { face: "south", center: 20 }),

  // 3. Salas do Bloco Sul (portas abrindo para o corredor norte em z = 10)
  // Financeiro: x in [-28, -16], z in [10, 20]
  ...buildRoomWalls(-28, -16, 10, 20, { face: "north", center: -22 }),
  // RH: x in [-14, -2], z in [10, 20]
  ...buildRoomWalls(-14, -2, 10, 20, { face: "north", center: -8 }),
  // Copa: x in [0, 12], z in [10, 20]
  ...buildRoomWalls(0, 12, 10, 20, { face: "north", center: 6 }),
  // Recepção: x in [14, 26], z in [10, 20]
  ...buildRoomWalls(14, 26, 10, 20, { face: "north", center: 20 }),

  // 4. Salas do Bloco Central
  // Diretoria: x in [-28, -16], z in [-6, 6] (porta a leste em x = -16, centro z = 0)
  ...buildRoomWalls(-28, -16, -6, 6, { face: "east", center: 0 }),

  // Sala de Reunião: x in [-13, 5], z in [-6, 6] (portas nos 4 pontos cardeais)
  // Norte (z = -6, porta x = -4)
  createWall(-13, -4 - HDW, -6 - HT, -6 + HT),
  createWall(-4 + HDW, 5, -6 - HT, -6 + HT),
  // Sul (z = 6, porta x = -4)
  createWall(-13, -4 - HDW, 6 - HT, 6 + HT),
  createWall(-4 + HDW, 5, 6 - HT, 6 + HT),
  // Oeste (x = -13, porta z = 0)
  createWall(-13 - HT, -13 + HT, -6, -HDW),
  createWall(-13 - HT, -13 + HT, HDW, 6),
  // Leste (x = 5, porta z = 0)
  createWall(5 - HT, 5 + HT, -6, -HDW),
  createWall(5 - HT, 5 + HT, HDW, 6),

  // Suporte Técnico: x in [7, 17], z in [-6, 6] (portas a oeste e norte)
  createWall(7 - HT, 7 + HT, -6, -HDW),
  createWall(7 - HT, 7 + HT, HDW, 6),
  createWall(7, 12 - HDW, -6 - HT, -6 + HT),
  createWall(12 + HDW, 17, -6 - HT, -6 + HT),
  createWall(7, 17, 6 - HT, 6 + HT), // Sul fechado
  createWall(17 - HT, 17 + HT, -6, 6), // Leste fechado

  // Impressão: x in [18, 28], z in [-6, 6] (portas a oeste e norte)
  createWall(18 - HT, 18 + HT, -6, -HDW),
  createWall(18 - HT, 18 + HT, HDW, 6),
  createWall(18, 23 - HDW, -6 - HT, -6 + HT),
  createWall(23 + HDW, 28, -6 - HT, -6 + HT),
  createWall(18, 28, 6 - HT, 6 + HT), // Sul fechado
  createWall(28 - HT, 28 + HT, -6, 6), // Leste fechado

  // 5. Mesa central de reunião (obstáculo sólido que os jogadores contornam)
  createWall(-7.5, -0.5, -1.8, 1.8),
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

  // 4. Tarefas Rápidas
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

  // 5. Quick Time Events (QTEs Corporativos)
  {
    id: "task_qte_reacao_infra",
    name: "Calibrar No-Break (QTE)",
    description: "Acerte o pico de frequência na zona verde do osciloscópio.",
    sector: "infra",
    type: "qte_reacao",
    pos: { x: 8, z: -17 },
  },
  {
    id: "task_qte_sequencia_diretoria",
    name: "Cofre da Diretoria (QTE)",
    description: "Digite a combinação de ramal seguro autorizada.",
    sector: "diretoria",
    type: "qte_sequencia",
    pos: { x: -24, z: 2 },
  },
  {
    id: "task_qte_cabos_servidores",
    name: "Patch Panel de Rede (QTE)",
    description: "Conecte os cabos de rede nas portas corretas dos racks.",
    sector: "servidores",
    type: "qte_cabos",
    pos: { x: -6, z: -17 },
  },
  {
    id: "task_qte_impressora_impressao",
    name: "Destravar Cilindro (QTE)",
    description: "Puxe a folha atolada e reengate a trava do cilindro.",
    sector: "impressao",
    type: "qte_impressora",
    pos: { x: 21, z: 2 },
  },
];

/**
 * Testa se um segmento de reta entre p1 e p2 intercepta uma caixa AABB (Liang-Barsky 2D)
 */
export function segmentIntersectsAABB(p1: Vec2, p2: Vec2, box: SuspeitoWall): boolean {
  if (p1.x >= box.minX && p1.x <= box.maxX && p1.z >= box.minZ && p1.z <= box.maxZ) return true;
  if (p2.x >= box.minX && p2.x <= box.maxX && p2.z >= box.minZ && p2.z <= box.maxZ) return true;

  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;

  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-7) {
    if (p1.x < box.minX || p1.x > box.maxX) return false;
  } else {
    const invD = 1.0 / dx;
    let t1 = (box.minX - p1.x) * invD;
    let t2 = (box.maxX - p1.x) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-7) {
    if (p1.z < box.minZ || p1.z > box.maxZ) return false;
  } else {
    const invD = 1.0 / dz;
    let t1 = (box.minZ - p1.z) * invD;
    let t2 = (box.maxZ - p1.z) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return true;
}

/**
 * Testa se há linha de visão desobstruída entre p1 e p2 (sem paredes interceptando)
 */
export function hasLineOfSight(p1: Vec2, p2: Vec2): boolean {
  for (const wall of SUSPEITO_WALLS) {
    if (segmentIntersectsAABB(p1, p2, wall)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve colisão deslizante (sliding) contra as paredes do escritório
 */
export function resolveWallCollision(pos: Vec2, radius = 0.45): Vec2 {
  let px = pos.x;
  let pz = pos.z;

  // Resolve colisões em múltiplas iterações para lidar com cantos e quinas
  for (let iter = 0; iter < 2; iter++) {
    for (const box of SUSPEITO_WALLS) {
      // Ponto mais próximo da caixa ao círculo do jogador
      const cx = Math.max(box.minX, Math.min(box.maxX, px));
      const cz = Math.max(box.minZ, Math.min(box.maxZ, pz));

      const dx = px - cx;
      const dz = pz - cz;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 1e-5) {
          const overlap = radius - dist;
          px += (dx / dist) * overlap;
          pz += (dz / dist) * overlap;
        } else {
          // Posição caiu exatamente dentro da caixa, empurra para a borda mais próxima
          const toMinX = Math.abs(px - box.minX);
          const toMaxX = Math.abs(px - box.maxX);
          const toMinZ = Math.abs(pz - box.minZ);
          const toMaxZ = Math.abs(pz - box.maxZ);
          const minD = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (minD === toMinX) px = box.minX - radius;
          else if (minD === toMaxX) px = box.maxX + radius;
          else if (minD === toMinZ) pz = box.minZ - radius;
          else pz = box.maxZ + radius;
        }
      }
    }
  }

  // Clampa nos limites globais do mapa
  px = Math.max(MAP_BOUNDS.minX + radius, Math.min(MAP_BOUNDS.maxX - radius, px));
  pz = Math.max(MAP_BOUNDS.minZ + radius, Math.min(MAP_BOUNDS.maxZ - radius, pz));

  return { x: px, z: pz };
}

/** Limites gerais do mapa */
export const MAP_BOUNDS = {
  minX: -29.5,
  maxX: 29.5,
  minZ: -21.5,
  maxZ: 21.5,
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

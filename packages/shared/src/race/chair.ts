/** Veículo de corrida (cadeira ou patinete): só aparência, nenhum valor muda a física. */
export interface ChairDNA {
  /** Índice de VEHICLES. Crachá antigo, sem o campo, fica na cadeira. */
  vehicle: number;
  seat: number;
  base: number;
  wheels: number;
  back: number;
  trinket: number;
}

export const VEHICLES = ["Cadeira", "Patinete elétrico"];
export const SCOOTER = 1;

export const CHAIR_SEATS = [
  "#2b2d42", "#c0392b", "#2e86de", "#27ae60", "#f39c12",
  "#8e44ad", "#e84393", "#16a085", "#7f8c8d", "#f5f0e1",
];
export const CHAIR_BASES = ["#1e1e1e", "#9aa3ad", "#d4af37", "#ffffff", "#b33939", "#3867d6"];
export const CHAIR_WHEELS = ["Comuns", "Neon", "Patinete"];
export const CHAIR_BACKS = ["Baixo", "Alto", "Gamer"];
export const CHAIR_TRINKETS = ["Nenhum", "Bandeirinha", "Buzina", "Caneca", "Plantinha", "Adesivos"];
/** Rótulos de `wheels` no patinete: o mesmo índice da cadeira. */
export const SCOOTER_WHEELS = ["Comuns", "Neon", "Off-road"];

export const DEFAULT_CHAIR: ChairDNA = { vehicle: 0, seat: 0, base: 0, wheels: 0, back: 1, trinket: 0 };

const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);

export function sanitizeChair(raw: unknown): ChairDNA {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CHAIR;
  return {
    vehicle: idx(r.vehicle, VEHICLES.length, d.vehicle),
    seat: idx(r.seat, CHAIR_SEATS.length, d.seat),
    base: idx(r.base, CHAIR_BASES.length, d.base),
    wheels: idx(r.wheels, CHAIR_WHEELS.length, d.wheels),
    back: idx(r.back, CHAIR_BACKS.length, d.back),
    trinket: idx(r.trinket, CHAIR_TRINKETS.length, d.trinket),
  };
}

export function randomChair(rng: () => number): ChairDNA {
  const r = (n: number) => Math.floor(rng() * n);
  return {
    seat: r(CHAIR_SEATS.length),
    base: r(CHAIR_BASES.length),
    wheels: r(CHAIR_WHEELS.length),
    back: r(CHAIR_BACKS.length),
    trinket: r(CHAIR_TRINKETS.length),
    vehicle: rng() < 0.3 ? SCOOTER : 0,
  };
}

import type { ItemId } from "@ec/shared";

export const ITEM_ICON: Record<ItemId, string> = {
  expresso: "☕",
  triplo: "☕☕☕",
  grampeador: "📎",
  poca: "💧",
  resma: "📄",
  aviao: "✈️",
  pasta: "📁",
  postit: "🟨",
};

export const fmtRace = (ms: number | null) => {
  if (ms === null) return "--:--.-";
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}.${Math.floor((t % 1000) / 100)}`;
};

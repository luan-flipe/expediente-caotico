import { useSyncExternalStore } from "react";
import { deveRecarregar } from "./atualizacao";

/** Registra o service worker (só em produção) depois do load e recarrega uma vez quando uma versão nova assume, fora de sala. */
export function registrarSw(emSala: () => boolean): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const tinhaControlador = !!navigator.serviceWorker.controller;
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!deveRecarregar({ tinhaControlador, emSala: emSala(), jaRecarregou })) return;
    jaRecarregou = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("service worker não registrou", err));
  });
}

// Botão "Instalar o jogo": só existe quando o navegador disparou beforeinstallprompt (Chrome/Android/desktop).
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
}
let adiado: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function captarInstalacao(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    adiado = e as EventoInstalacao;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    adiado = null;
    avisar();
  });
}

export function useInstalavel(): boolean {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => adiado !== null,
  );
}

export async function instalar(): Promise<void> {
  const e = adiado;
  if (!e) return;
  adiado = null;
  avisar();
  await e.prompt();
}

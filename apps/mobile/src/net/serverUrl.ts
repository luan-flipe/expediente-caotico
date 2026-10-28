/** Porta padrão do servidor do jogo (apps/server). */
export const SERVER_PORT = 2567;

const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[^.:]+\.local)(:\d+)?$/i;

/**
 * Normaliza o que a pessoa digitou ("192.168.0.10", "jogo.firma.com", "https://jogo.firma.com/")
 * para uma origem http(s) sem barra no fim. Sem protocolo: IP ou localhost é o servidor de dev
 * (http, porta padrão se faltar); domínio é o jogo publicado atrás de proxy (https, porta 443).
 */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^[a-z]+:\/\//i.test(s)) {
    const hasPort = /:\d+$/.test(s);
    if (LOCAL_HOST.test(s)) s = `http://${s}${hasPort ? "" : `:${SERVER_PORT}`}`;
    else s = `${hasPort ? "http" : "https"}://${s}`;
  }
  return s.replace(/^ws(s?):\/\//i, "http$1://");
}

/** Endereço do WebSocket do jogo a partir da origem http(s). */
export function wsUrl(server: string): string {
  return `${normalizeServer(server).replace(/^http/i, "ws")}/ws`;
}

/**
 * Em desenvolvimento o celular já fala com o Metro no IP do computador (hostUri "192.168.0.10:8081");
 * o servidor do jogo roda na mesma máquina, na porta 2567.
 */
export function serverFromHostUri(hostUri: string | null | undefined): string | null {
  const host = hostUri?.split("/")[0]?.replace(/:\d+$/, "");
  if (!host) return null;
  return `http://${host}:${SERVER_PORT}`;
}

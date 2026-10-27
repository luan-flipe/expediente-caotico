import { describe, expect, it } from "vitest";
import { normalizeServer, serverFromHostUri, wsUrl } from "../net/serverUrl";

describe("endereço do servidor", () => {
  it("IP sem porta ganha a porta padrão do jogo", () => {
    expect(normalizeServer("192.168.0.10")).toBe("http://192.168.0.10:2567");
  });

  it("mantém porta, protocolo e tira a barra final", () => {
    expect(normalizeServer(" 10.0.0.5:3000/ ")).toBe("http://10.0.0.5:3000");
    expect(normalizeServer("https://jogo.firma.com/")).toBe("https://jogo.firma.com");
    expect(normalizeServer("wss://jogo.firma.com")).toBe("https://jogo.firma.com");
  });

  it("vazio continua vazio", () => {
    expect(normalizeServer("   ")).toBe("");
  });

  it("WebSocket usa wss com https e o caminho /ws", () => {
    expect(wsUrl("https://jogo.firma.com")).toBe("wss://jogo.firma.com/ws");
    expect(wsUrl("192.168.0.10")).toBe("ws://192.168.0.10:2567/ws");
  });

  it("em dev usa o IP do computador que roda o Metro", () => {
    expect(serverFromHostUri("192.168.0.10:8081")).toBe("http://192.168.0.10:2567");
    expect(serverFromHostUri("192.168.0.10:8081/--/")).toBe("http://192.168.0.10:2567");
    expect(serverFromHostUri(undefined)).toBeNull();
  });
});

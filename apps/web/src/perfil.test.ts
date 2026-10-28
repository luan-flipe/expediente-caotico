import { describe, expect, it } from "vitest";
import { perfilDaUrl, perfilUrl } from "./perfil";

describe("link do perfil", () => {
  it("monta o link com o apelido", () => {
    expect(perfilUrl("https://x.com", "Ab3_-Ab3_-Ab3_-A")).toBe("https://x.com/?perfil=Ab3_-Ab3_-Ab3_-A");
  });

  it("lê o apelido da URL e descarta o que não tem o formato", () => {
    expect(perfilDaUrl("?perfil=Ab3_-Ab3_-Ab3_-A")).toBe("Ab3_-Ab3_-Ab3_-A");
    expect(perfilDaUrl("?sala=ABCDE&perfil=Ab3_-Ab3_-Ab3_-A")).toBe("Ab3_-Ab3_-Ab3_-A");
    expect(perfilDaUrl("")).toBeNull();
    expect(perfilDaUrl("?perfil=curto")).toBeNull();
    expect(perfilDaUrl("?perfil=<script>alert(1)</script>")).toBeNull();
  });
});

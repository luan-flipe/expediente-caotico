import { describe, expect, it } from "vitest";
import { canNativeShare, inviteText, inviteUrl, whatsappUrl } from "./invite";

describe("convite", () => {
  it("monta o link com o código da sala", () => {
    expect(inviteUrl("https://expedientecaotico.cavel.com.br", "ABCDE")).toBe("https://expedientecaotico.cavel.com.br/?sala=ABCDE");
  });

  it("monta a frase com código e link", () => {
    expect(inviteText("https://x.com", "ABCDE")).toBe("Bora jogar Expediente Caótico? Sala ABCDE: https://x.com/?sala=ABCDE");
  });

  it("só usa o compartilhar nativo com suporte e toque", () => {
    expect(canNativeShare({ share: () => {}, maxTouchPoints: 5 })).toBe(true);
    expect(canNativeShare({ share: () => {}, maxTouchPoints: 0 })).toBe(false);
    expect(canNativeShare({ maxTouchPoints: 5 })).toBe(false);
  });
});

describe("whatsappUrl", () => {
  it("codifica o convite inteiro na query", () => {
    const u = whatsappUrl(inviteText("https://x.com", "ABCDE"));
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(u.slice("https://wa.me/?text=".length))).toBe(inviteText("https://x.com", "ABCDE"));
  });
});

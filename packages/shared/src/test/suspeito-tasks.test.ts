import { describe, expect, it } from "vitest";
import {
  applyContextoGuess,
  applyTermoGuess,
  createConexoChallenge,
  createContextoChallenge,
  createQuickTaskChallenge,
  createTermoChallenge,
  evaluateTermoGuess,
  advanceQuickTask,
  validateConexoSelection,
} from "../index";

describe("Tarefas do Expediente Suspeito", () => {
  describe("TERMO", () => {
    it("avalia acertos exatos, presentes e ausentes", () => {
      const evals = evaluateTermoGuess("PRAZO", "PRADO");
      expect(evals[0]).toEqual({ letter: "P", status: "correct" });
      expect(evals[1]).toEqual({ letter: "R", status: "correct" });
      expect(evals[2]).toEqual({ letter: "A", status: "correct" });
      expect(evals[3]).toEqual({ letter: "D", status: "absent" });
      expect(evals[4]).toEqual({ letter: "O", status: "correct" });
    });

    it("trata letras repetidas com precisão", () => {
      // Palavra secreta tem apenas um A: "METAS" (índice 3)
      // Tentativa tem As nos índices 1 e 3: "BAMAS"
      // Em "BAMAS", índice 3 é "A" (coincide com METAS -> correct).
      // O "A" no índice 1 deve ser marcado como absent pois o único A já foi usado no índice 3.
      const evals = evaluateTermoGuess("METAS", "BAMAS");
      expect(evals[3]).toEqual({ letter: "A", status: "correct" });
      expect(evals[1].status).toBe("absent");
    });

    it("resolve o desafio ao acertar a palavra secreta", () => {
      const challenge = createTermoChallenge("SALAS");
      const res = applyTermoGuess(challenge, "SALAS");
      expect(res.valid).toBe(true);
      expect(res.solved).toBe(true);
      expect(challenge.state.solved).toBe(true);
    });

    it("falha após esgotar o limite de tentativas", () => {
      const challenge = createTermoChallenge("SALAS");
      for (let i = 0; i < 5; i++) {
        applyTermoGuess(challenge, "MURAL");
      }
      expect(challenge.state.failed).toBe(false);
      const last = applyTermoGuess(challenge, "MURAL");
      expect(last.failed).toBe(true);
      expect(challenge.state.failed).toBe(true);
    });
  });

  describe("CONEXO", () => {
    it("valida grupo correto e remove palavras ativas", () => {
      const challenge = createConexoChallenge(0);
      const groupWords = ["CAFÉ", "ÁGUA", "CHÁ", "ENERGÉTICO"];
      const res = validateConexoSelection(challenge, groupWords);

      expect(res.valid).toBe(true);
      expect(res.match?.title).toBe("Bebidas da Copa");
      expect(challenge.state.solvedGroups.length).toBe(1);
      expect(challenge.state.allWords.length).toBe(12);
    });

    it("detecta quando falta apenas 1 palavra (3 de 4)", () => {
      const challenge = createConexoChallenge(0);
      // 3 bebidas + 1 de outro grupo
      const almostWords = ["CAFÉ", "ÁGUA", "CHÁ", "PYTHON"];
      const res = validateConexoSelection(challenge, almostWords);

      expect(res.valid).toBe(false);
      expect(res.oneAway).toBe(true);
      expect(challenge.state.mistakesRemaining).toBe(3);
    });
  });

  describe("CONTEXTO", () => {
    it("calcula ranking semântico e detecta temperatura", () => {
      const challenge = createContextoChallenge(0); // target: SALARIO
      const resHot = applyContextoGuess(challenge, "PAGAMENTO");
      expect(resHot.valid).toBe(true);
      expect(resHot.guess?.temperature).toBe("hot");
      expect(resHot.solved).toBe(false);

      const resWin = applyContextoGuess(challenge, "SALARIO");
      expect(resWin.valid).toBe(true);
      expect(resWin.solved).toBe(true);
      expect(challenge.state.solved).toBe(true);
    });
  });

  describe("Quick Tasks", () => {
    it("avança etapas até a conclusão", () => {
      const challenge = createQuickTaskChallenge(3);
      expect(challenge.state.step).toBe(0);

      advanceQuickTask(challenge);
      expect(challenge.state.step).toBe(1);
      expect(challenge.state.completed).toBe(false);

      advanceQuickTask(challenge);
      advanceQuickTask(challenge);
      expect(challenge.state.step).toBe(3);
      expect(challenge.state.completed).toBe(true);
    });
  });
});

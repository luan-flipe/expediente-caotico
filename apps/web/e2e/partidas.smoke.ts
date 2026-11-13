import { expect, test, type Page } from "@playwright/test";

/** Tempo jogado por modo (ms). Total do smoke: 5 modos x ~60 s. */
const JOGO_MS = Number(process.env.SMOKE_JOGO_MS ?? 60_000);

type Modo = {
  nome: string;
  /** Texto do botão de modo no lobby. */
  botaoModo: string;
  /** Cliques extras de configuração antes de iniciar (texto exato do botão). */
  opcoes?: string[];
  /** Teclas pressionadas em ciclo durante a partida. */
  teclas: string[];
  /** Tiroteio e Rally exigem 2+ participantes: junta bots pelo botão do lobby. */
  addBots?: boolean;
  /** Clica no canvas (atirar/usar item) a cada tecla do ciclo. */
  clica?: boolean;
};

const MODOS: Modo[] = [
  { nome: "Tiroteio", botaoModo: "Tiroteio", addBots: true, teclas: ["w", "a", "s", "d", "Space"], clica: true },
  { nome: "Rally da Firma", botaoModo: "Rally da Firma", addBots: true, teclas: ["w", "w", "a", "w", "d", "w"], clica: true },
  { nome: "Contra o relógio", botaoModo: "Contra o relógio", teclas: ["w", "w", "a", "w", "d", "w"] },
  { nome: "Futebol da Firma 2v2", botaoModo: "Futebol da Firma", opcoes: ["2v2"], teclas: ["w", "d", "s", "a", "Space", "f"] },
  { nome: "Futebol da Firma 5v5 Estádio", botaoModo: "Futebol da Firma", opcoes: ["5v5 Estádio"], teclas: ["w", "d", "s", "a", "Space", "f"] },
];

/** Registra o que deve falhar o teste: erro de console, exceção não tratada e resposta HTTP 5xx. */
function vigiar(page: Page): string[] {
  const problemas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problemas.push(`console.error: ${m.text()} (${m.location().url}:${m.location().lineNumber})`);
  });
  page.on("pageerror", (e) => problemas.push([`exceção não tratada: ${e.message}`, ...(e.stack ?? "").split("\n").slice(1, 7)].join("\n")));
  page.on("response", (r) => {
    if (r.status() >= 500) problemas.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problemas;
}

/** O canvas existe, tem tamanho e desenhou algo (um quadro em branco vira PNG minúsculo). */
async function canvasDesenhando(page: Page): Promise<void> {
  const canvas = page.locator("canvas.view");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0, "largura do canvas").toBeGreaterThan(200);
  expect(box?.height ?? 0, "altura do canvas").toBeGreaterThan(200);
  const png = await canvas.screenshot();
  expect(png.length, "canvas parece em branco (PNG minúsculo)").toBeGreaterThan(8_000);
}

test("smoke: Futebol da Firma, treino de chute até sair gol", async ({ page }) => {
  test.setTimeout(240_000);
  const problemas = vigiar(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Criar sala" }).click({ timeout: 60_000 });
  const botaoModo = page.getByRole("button", { name: "Futebol da Firma", exact: true });
  await expect(botaoModo).toBeVisible({ timeout: 15_000 });
  await botaoModo.click();
  await page.getByRole("button", { name: "5v5 Estádio", exact: true }).click();
  await page.getByTitle(/Todos contra o goleiro/).click();
  await page.getByRole("button", { name: "Iniciar treino de chute" }).click();

  // passa pelo "Preparando a partida..." e mostra o placar zerado
  const meuPlacar = page.locator(".fut-top .fut-team").first().locator("b");
  await expect(meuPlacar).toHaveText("0", { timeout: 90_000 });
  await canvasDesenhando(page);

  // a bola nasce no pé: segurar Espaço carrega e soltar chuta para o gol; tenta até o goleiro deixar passar
  const fim = Date.now() + 150_000;
  while (Date.now() < fim && (await meuPlacar.textContent()) === "0") {
    await page.keyboard.down("Space");
    await page.waitForTimeout(1300);
    await page.keyboard.up("Space");
    await page.waitForTimeout(4500);
  }
  await expect(meuPlacar).toHaveText("1");
  expect(problemas, "problemas durante o treino de chute").toEqual([]);
});

for (const modo of MODOS) {
  test(`smoke: ${modo.nome}`, async ({ page }) => {
    const problemas = vigiar(page);
    await page.goto("/");

    // tela inicial -> sala (visitante, boneco padrão)
    await page.getByRole("button", { name: "Criar sala" }).click({ timeout: 60_000 });
    const botaoModo = page.getByRole("button", { name: modo.botaoModo, exact: true });
    await expect(botaoModo).toBeVisible({ timeout: 15_000 });
    await botaoModo.click();
    await expect(botaoModo).toHaveClass(/on/);
    for (const op of modo.opcoes ?? []) await page.getByRole("button", { name: op, exact: true }).click();

    if (modo.addBots) {
      const addBot = page.getByRole("button", { name: "+ Bot estagiário" });
      for (let i = 0; i < 3; i++) await addBot.click();
    }

    await page.getByRole("button", { name: /^Iniciar/ }).click();
    const canvas = page.locator("canvas.view");
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    // joga: teclas em ciclo (e clique, quando o modo usa), até completar o tempo
    const fim = Date.now() + JOGO_MS;
    await canvasDesenhando(page);
    while (Date.now() < fim) {
      for (const t of modo.teclas) {
        await page.keyboard.down(t);
        await page.waitForTimeout(450);
        await page.keyboard.up(t);
        if (modo.clica) await canvas.click({ position: { x: 640, y: 300 }, delay: 30 }).catch(() => undefined);
        if (Date.now() >= fim) break;
      }
    }

    await canvasDesenhando(page);
    expect(problemas, `problemas durante ${modo.nome}`).toEqual([]);
  });
}

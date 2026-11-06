import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.SMOKE_PORT ?? 4599);
/** Pasta de dados descartável: o smoke nunca toca o ranking de verdade. */
const DATA_DIR = mkdtempSync(join(tmpdir(), "ec-smoke-"));

/**
 * Smoke das partidas. Roda contra o build de produção (servidor serve o cliente e o WebSocket
 * na mesma porta), numa porta própria para não brigar com o `pnpm dev`.
 * Pré-requisitos: `pnpm build` e `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.ts",
  timeout: 150_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // WebGL por software (SwiftShader) para rodar sem GPU, inclusive no CI
      args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: "node apps/server/dist/index.js",
    cwd: "../../..",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(PORT), DATA_DIR, NODE_ENV: "production" },
  },
});

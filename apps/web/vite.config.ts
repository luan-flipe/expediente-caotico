import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { pwaSw } from "./src/pwa/plugin";

/** Versão do build: commit (o Coolify passa SOURCE_COMMIT; local usa o git) e data em Brasília. */
function appVersion(): string {
  let sha = process.env.SOURCE_COMMIT ?? "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse HEAD").toString().trim();
    } catch {
      sha = "dev";
    }
  }
  const date = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
  return `${date} ${sha.slice(0, 7)}`;
}

export default defineConfig({
  plugins: [react(), pwaSw()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  optimizeDeps: {
    exclude: ["@ec/shared"],
  },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:2567", ws: true }, "/api": "http://localhost:2567" },
  },
});

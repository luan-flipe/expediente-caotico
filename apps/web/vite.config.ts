import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pwaSw } from "./src/pwa/plugin";

export default defineConfig({
  plugins: [react(), pwaSw()],
  optimizeDeps: {
    exclude: ["@ec/shared"],
  },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:2567", ws: true }, "/api": "http://localhost:2567" },
  },
});

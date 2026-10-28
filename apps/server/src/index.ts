import { randomBytes } from "node:crypto";
import { startServer } from "./app";
import { Store } from "./store";

const port = Number(process.env.PORT ?? 2567);
const store = new Store(process.env.DATA_DIR ?? "./data");
const clientId = process.env.GOOGLE_CLIENT_ID || null;
let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET não definido: usando um segredo aleatório deste processo. As sessões caem a cada reinício.");
}
if (!clientId) console.log("GOOGLE_CLIENT_ID não definido: só entra visitante, sem login.");
startServer(port, { store, auth: { clientId, secret } }).then((s) => {
  console.log(`Expediente Caótico no ar: http://localhost:${s.port}  (WebSocket em /ws)`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void store.flush().finally(() => process.exit(0));
  });
}

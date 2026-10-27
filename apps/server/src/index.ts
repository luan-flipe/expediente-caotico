import { startServer } from "./app";
import { Store } from "./store";

const port = Number(process.env.PORT ?? 2567);
const store = new Store(process.env.DATA_DIR ?? "./data");
startServer(port).then((s) => {
  console.log(`Expediente Caótico no ar: http://localhost:${s.port}  (WebSocket em /ws)`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void store.flush().finally(() => process.exit(0));
  });
}

import { startServer } from "./app";

const port = Number(process.env.PORT ?? 2567);
startServer(port).then((s) => {
  console.log(`Expediente Caótico no ar: http://localhost:${s.port}  (WebSocket em /ws)`);
});

import { Component, StrictMode, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Loading } from "./screens/Loading";
import { captarInstalacao, registrarSw } from "./pwa/registrar";
import { getSettings, subscribeSettings } from "./settings";
import { getState, net, savedSession, setState, useStore } from "./store";
import "./styles.css";
import { IS_TOUCH } from "./touch";

// Limpa service worker em desenvolvimento para não interceptar os arquivos do Vite
if (!import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) void r.unregister();
  });
}

// Captura erros globais em desenvolvimento para depuração imediata
if (!import.meta.env.PROD && typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    console.error("Global JS Error:", e.error);
    const box = document.getElementById("debug-error-box") || document.createElement("div");
    box.id = "debug-error-box";
    box.style.cssText = "position:fixed;top:0;left:0;right:0;background:#d32f2f;color:#fff;padding:16px;z-index:999999;font-family:monospace;white-space:pre-wrap;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    box.textContent = `JS Error: ${e.message}\nArquivo: ${e.filename}:${e.lineno}\n\nStack:\n${e.error?.stack || ""}`;
    document.body.appendChild(box);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled Promise Rejection:", e.reason);
    const box = document.getElementById("debug-rejection-box") || document.createElement("div");
    box.id = "debug-rejection-box";
    box.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#b71c1c;color:#fff;padding:16px;z-index:999999;font-family:monospace;white-space:pre-wrap;box-shadow:0 -4px 12px rgba(0,0,0,0.4);";
    box.textContent = `Unhandled Promise Rejection: ${e.reason?.message || e.reason}\n\nStack:\n${e.reason?.stack || ""}`;
    document.body.appendChild(box);
  });
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RootErrorBoundary:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#d32f2f", background: "#fff", minHeight: "100vh", fontFamily: "monospace" }}>
          <h2>Erro ao renderizar a aplicação:</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.stack || this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// PWA: o service worker só em produção; o botão de instalar escuta o aviso do navegador desde já
registrarSw(() => getState().code !== null);
captarInstalacao();

// modo daltônico: uma classe no <html> troca as cores da interface (ver styles.css)
const aplicarDaltonico = () => document.documentElement.classList.toggle("daltonico", getSettings().daltonico);
aplicarDaltonico();
subscribeSettings(aplicarDaltonico);

// aparelho de toque: o CSS aumenta os alvos e troca as dicas de teclado
if (IS_TOUCH) document.documentElement.classList.add("touch");

// Só React, a tela de carregamento e o estado entram no primeiro código; o resto (Three.js, telas, modos) vem depois.
// O código das telas já começa a baixar junto com os modelos, e a mesma tela de carregamento segura as duas esperas
// (trocar por um fallback de Suspense remontava a tela e ela piscava).
const appModule = import("./App");

const wanted = new URLSearchParams(location.search).get("sala")?.toUpperCase();
const session = savedSession();
if (session && (!wanted || wanted === session.code)) net.resume();

// se o código de carregamento nem baixar, o jogo abre mesmo assim, com os bonecos procedurais
import("./boot").catch((err) => {
  console.warn("carregamento dos modelos falhou, usando versões procedurais", err);
  setState({ assetsReady: true });
});

type AppComponent = (typeof import("./App"))["App"];

function Root() {
  const assetsReady = useStore((s) => s.assetsReady);
  const [App, setApp] = useState<AppComponent | null>(null);
  useEffect(() => {
    void appModule.then((m) => setApp(() => m.App));
  }, []);
  return assetsReady && App ? <App /> : <Loading />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <Root />
    </RootErrorBoundary>
  </StrictMode>,
);

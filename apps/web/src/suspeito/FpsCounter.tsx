import { useState, useEffect } from "react";

interface FpsCounterProps {
  fps: number;
}

export function FpsCounter({ fps }: FpsCounterProps) {
  const [enabled, setEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("expediente_show_fps");
      // Padrão ativado (true) para exibir FPS em tempo real no canto superior
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("expediente_show_fps", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Hotkey F3 para alternar exibição
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="suspeito-fps-wrap">
      {enabled ? (
        <div
          className={`suspeito-fps-badge ${fps < 30 ? "critical" : fps < 45 ? "warn" : "ok"}`}
          onClick={toggle}
          title="Taxa de quadros por segundo. Clique ou pressione F3 para ocultar."
        >
          FPS {fps}
        </div>
      ) : (
        <button
          className="suspeito-fps-toggle-btn"
          onClick={toggle}
          title="Ativar contador de FPS (ou pressione F3)"
        >
          FPS
        </button>
      )}
    </div>
  );
}

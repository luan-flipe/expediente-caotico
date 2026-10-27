/** Mesma paleta da web (apps/web/src/styles.css): papel, tinta e post-it. */
export const C = {
  paper: "#f4efe4",
  paper2: "#ebe3d3",
  card: "#fffdf7",
  ink: "#1d1b17",
  ink2: "#57524a",
  postit: "#ffe14d",
  red: "#ff4d3d",
  blue: "#2f6fdf",
  green: "#1fae6b",
  hudBg: "rgba(20,18,15,0.78)",
  hudInk: "#f7f2e6",
  hudLine: "rgba(255,255,255,0.14)",
};

/** Nomes registrados no expo-font (ver app/_layout.tsx). */
export const F = {
  medium: "BricolageGrotesque_500Medium",
  bold: "BricolageGrotesque_700Bold",
  black: "BricolageGrotesque_800ExtraBold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
};

/** Sombra dura deslocada, a marca visual dos cartões e botões. */
export const hardShadow = (n = 4) => ({ boxShadow: `${n}px ${n}px 0px ${C.ink}` });

/** Cobre o pai inteiro (o absoluteFillObject saiu do React Native). */
export const fill = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const;

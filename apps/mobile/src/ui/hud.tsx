import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { getState, useStore } from "../store";
import { C, F, fill } from "./theme";

const readFrame = () => {
  const s = getState();
  return { snap: s.snap, me: s.me, rsnap: s.rsnap, rme: s.rme };
};

/**
 * Estado da partida para o HUD, relido a 10 Hz em vez de a cada snapshot:
 * o Three.js desenha na mesma thread JS, e cada render do HUD a menos é quadro a mais no 3D.
 */
export function useHudFrame(): ReturnType<typeof readFrame> {
  const [frame, setFrame] = useState(readFrame);
  useEffect(() => {
    const t = setInterval(() => setFrame(readFrame()), 100);
    return () => clearInterval(t);
  }, []);
  return frame;
}

/** Painel escuro translúcido do HUD. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[hud.panel, style]}>{children}</View>;
}

/** Mensagens recentes da partida (eliminações, itens, chegada), com as mesmas cores da web. */
export function Feed({ style }: { style?: StyleProp<ViewStyle> }) {
  const feed = useStore((st) => st.feed);
  const online = useStore((st) => st.online);
  const now = performance.now();
  return (
    <View pointerEvents="none" style={[hud.feed, style]}>
      {!online && <Text style={[hud.feedItem, hud.feedMe]}>Conexão perdida. Reconectando...</Text>}
      {feed
        .filter((f) => now - f.at < 6000)
        .map((f) => (
          <Text
            key={f.id}
            style={[hud.feedItem, f.kind === "me" && hud.feedMe, f.kind === "info" && hud.feedInfo, f.kind === "kill" && hud.feedKill]}
            numberOfLines={1}
          >
            {f.text}
          </Text>
        ))}
    </View>
  );
}

export const hud = StyleSheet.create({
  panel: { backgroundColor: C.hudBg, borderWidth: 2, borderColor: C.hudLine, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10 },
  timer: { fontFamily: F.monoBold, fontSize: 24, color: C.hudInk, paddingHorizontal: 6 },
  small: { fontFamily: F.bold, fontSize: 12, color: C.hudInk },
  bold: { fontFamily: F.bold, fontSize: 15, color: C.hudInk },
  mono: { fontFamily: F.monoBold, fontSize: 12, color: C.hudInk },
  h2: { fontFamily: F.black, fontSize: 26, color: C.hudInk, marginBottom: 4 },
  big: { fontFamily: F.black, fontSize: 22, color: C.hudInk, textShadowColor: "#000", textShadowRadius: 6 },
  count: { fontFamily: F.black, fontSize: 96, color: C.postit, textShadowColor: C.ink, textShadowRadius: 1, textShadowOffset: { width: 5, height: 5 } },
  center: { ...fill, alignItems: "center", justifyContent: "center", gap: 12 },
  feed: { position: "absolute", gap: 4, maxWidth: "36%" },
  feedItem: { fontFamily: F.bold, fontSize: 12, color: C.hudInk, backgroundColor: C.hudBg, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, overflow: "hidden", alignSelf: "flex-start" },
  feedMe: { backgroundColor: "rgba(255,77,61,0.86)", color: "#fff" },
  feedInfo: { backgroundColor: "rgba(47,111,223,0.86)", color: "#fff" },
  feedKill: { borderLeftWidth: 3, borderLeftColor: C.red },
});

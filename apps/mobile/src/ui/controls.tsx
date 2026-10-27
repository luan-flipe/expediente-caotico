import { useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { C, F } from "./theme";
import { STICK_RADIUS } from "./touch";

/*
 * Os controles usam os eventos crus de toque (onTouchStart/Move/End) e não o sistema de responder
 * do React Native: o responder só aceita um dedo por vez, e aqui se anda, mira e atira ao mesmo tempo.
 * Cada toque chega ao componente onde começou, mesmo que o dedo escorregue para fora dele.
 */

type Touch = GestureResponderEvent["nativeEvent"];
const idOf = (t: Touch) => String(t.identifier);

/**
 * Área de toque da tela de jogo. Um dedo que começa na parte esquerda vira joystick (aparece onde tocou);
 * na parte direita, arrastar gira a câmera (só se onLook existir).
 */
export function TouchPad({
  onStick,
  onLook,
  split = 0.45,
  style,
}: {
  onStick: (dx: number, dy: number) => void;
  onLook?: (dx: number, dy: number) => void;
  split?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useRef(1);
  const stick = useRef<{ id: string; x: number; y: number } | null>(null);
  const look = useRef<{ id: string; x: number; y: number } | null>(null);
  const base = useRef(new Animated.ValueXY({ x: -999, y: -999 })).current;
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [active, setActive] = useState(false);

  const start = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const leftSide = t.locationX < width.current * split;
      if (leftSide && !stick.current) {
        stick.current = { id: idOf(t), x: t.pageX, y: t.pageY };
        base.setValue({ x: t.locationX - STICK_RADIUS, y: t.locationY - STICK_RADIUS });
        knob.setValue({ x: 0, y: 0 });
        setActive(true);
      } else if (onLook && !leftSide && !look.current) {
        look.current = { id: idOf(t), x: t.pageX, y: t.pageY };
      }
    }
  };

  const move = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = idOf(t);
      if (stick.current?.id === id) {
        const dx = t.pageX - stick.current.x;
        const dy = t.pageY - stick.current.y;
        const len = Math.hypot(dx, dy);
        const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
        knob.setValue({ x: dx * k, y: dy * k });
        onStick(dx, dy);
      } else if (look.current?.id === id) {
        onLook?.(t.pageX - look.current.x, t.pageY - look.current.y);
        look.current.x = t.pageX;
        look.current.y = t.pageY;
      }
    }
  };

  const end = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = idOf(t);
      if (stick.current?.id === id) {
        stick.current = null;
        onStick(0, 0);
        setActive(false);
      }
      if (look.current?.id === id) look.current = null;
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, style]} onLayout={(e) => (width.current = e.nativeEvent.layout.width)} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <Animated.View pointerEvents="none" style={[st.stickBase, { opacity: active ? 1 : 0, transform: base.getTranslateTransform() }]}>
        <Animated.View style={[st.knob, { transform: knob.getTranslateTransform() }]} />
      </Animated.View>
    </View>
  );
}

/** Botão de segurar (atirar, derrapar, ré): avisa ao apertar e ao soltar. */
export function HoldButton({
  label,
  sub,
  size = 76,
  color = C.hudBg,
  onDown,
  onUp,
  style,
  children,
}: {
  label?: string;
  sub?: string;
  size?: number;
  color?: string;
  onDown: () => void;
  onUp?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [down, setDown] = useState(false);
  const fingers = useRef(new Set<string>());
  return (
    <View
      style={[st.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, down && st.down, style]}
      onTouchStart={(e) => {
        for (const t of e.nativeEvent.changedTouches) fingers.current.add(idOf(t));
        if (!down) {
          setDown(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDown();
        }
      }}
      onTouchEnd={(e) => {
        for (const t of e.nativeEvent.changedTouches) fingers.current.delete(idOf(t));
        if (fingers.current.size === 0) {
          setDown(false);
          onUp?.();
        }
      }}
      onTouchCancel={() => {
        fingers.current.clear();
        setDown(false);
        onUp?.();
      }}
    >
      {children}
      {label ? <Text style={[st.label, { fontSize: Math.max(11, size * 0.17) }]}>{label}</Text> : null}
      {sub ? <Text style={st.sub}>{sub}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  stickBase: {
    position: "absolute",
    left: 0,
    top: 0,
    width: STICK_RADIUS * 2,
    height: STICK_RADIUS * 2,
    borderRadius: STICK_RADIUS,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(20,18,15,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  knob: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,225,77,0.85)", borderWidth: 2, borderColor: C.ink },
  round: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.hudLine },
  down: { transform: [{ scale: 0.92 }], borderColor: C.postit },
  label: { fontFamily: F.black, color: C.hudInk, textAlign: "center" },
  sub: { fontFamily: F.mono, fontSize: 10, color: "#cfc8b8", marginTop: 1 },
});

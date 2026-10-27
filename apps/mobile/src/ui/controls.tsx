import { useEffect, useRef, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { C, F } from "./theme";
import { STICK_RADIUS } from "./touch";

/*
 * Os controles usam os eventos crus de toque (onTouchStart/Move/End) e não o sistema de responder
 * do React Native: o responder só aceita um dedo por vez, e aqui se anda, mira e atira ao mesmo tempo.
 * As posições visuais rodam na UI thread via Reanimated 4 (sem re-renderizar componentes React).
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
  const onStickRef = useRef(onStick);
  const baseX = useSharedValue(-999);
  const baseY = useSharedValue(-999);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    onStickRef.current = onStick;
  }, [onStick]);

  // solta o manche e a câmera se o app sair de foco (notificação, chamada ou troca de app)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") return;
      look.current = null;
      if (stick.current) {
        stick.current = null;
        knobX.value = 0;
        knobY.value = 0;
        opacity.value = 0;
        onStickRef.current(0, 0);
      }
    });
    return () => sub.remove();
  }, [knobX, knobY, opacity]);

  const baseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: baseX.value }, { translateY: baseY.value }],
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }, { translateY: knobY.value }],
  }));

  const start = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const leftSide = t.locationX < width.current * split;
      if (leftSide && !stick.current) {
        stick.current = { id: idOf(t), x: t.pageX, y: t.pageY };
        baseX.value = t.locationX - STICK_RADIUS;
        baseY.value = t.locationY - STICK_RADIUS;
        knobX.value = 0;
        knobY.value = 0;
        opacity.value = withTiming(1, { duration: 90 });
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
        knobX.value = dx * k;
        knobY.value = dy * k;
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
        knobX.value = withSpring(0, { damping: 18, stiffness: 260 });
        knobY.value = withSpring(0, { damping: 18, stiffness: 260 });
        opacity.value = withTiming(0, { duration: 140 });
        onStick(0, 0);
      }
      if (look.current?.id === id) look.current = null;
    }
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      <Animated.View pointerEvents="none" style={[st.stickBase, baseStyle]}>
        <Animated.View style={[st.knob, knobStyle]} />
      </Animated.View>
    </View>
  );
}

/**
 * Botão de segurar (atirar, derrapar, ré): avisa ao apertar e ao soltar.
 * Se `onMove` for passado (ex.: botão Atirar), arrastar o polegar enquanto segura também gira a mira.
 */
export function HoldButton({
  label,
  sub,
  size = 76,
  color = C.hudBg,
  onDown,
  onUp,
  onMove,
  style,
  children,
}: {
  label?: string;
  sub?: string;
  size?: number;
  color?: string;
  onDown: () => void;
  onUp?: () => void;
  onMove?: (dx: number, dy: number) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const fingers = useRef(new Map<string, { x: number; y: number }>());
  const isDown = useRef(false);
  const onUpRef = useRef(onUp);
  const pressed = useSharedValue(0);

  useEffect(() => {
    onUpRef.current = onUp;
  }, [onUp]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") return;
      fingers.current.clear();
      if (isDown.current) {
        isDown.current = false;
        pressed.value = 0;
        onUpRef.current?.();
      }
    });
    return () => sub.remove();
  }, [pressed]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value ? 0.92 : 1 }],
    borderColor: pressed.value ? C.postit : C.hudLine,
  }));

  return (
    <Animated.View
      style={[st.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animStyle, style]}
      onTouchStart={(e) => {
        for (const t of e.nativeEvent.changedTouches) {
          fingers.current.set(idOf(t), { x: t.pageX, y: t.pageY });
        }
        if (!isDown.current) {
          isDown.current = true;
          pressed.value = withSpring(1, { damping: 16, stiffness: 320 });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDown();
        }
      }}
      onTouchMove={(e) => {
        if (!onMove) return;
        for (const t of e.nativeEvent.changedTouches) {
          const prev = fingers.current.get(idOf(t));
          if (!prev) continue;
          onMove(t.pageX - prev.x, t.pageY - prev.y);
          prev.x = t.pageX;
          prev.y = t.pageY;
        }
      }}
      onTouchEnd={(e) => {
        for (const t of e.nativeEvent.changedTouches) fingers.current.delete(idOf(t));
        if (fingers.current.size === 0 && isDown.current) {
          isDown.current = false;
          pressed.value = withSpring(0, { damping: 16, stiffness: 320 });
          onUp?.();
        }
      }}
      onTouchCancel={() => {
        fingers.current.clear();
        if (isDown.current) {
          isDown.current = false;
          pressed.value = 0;
          onUp?.();
        }
      }}
    >
      {children}
      {label ? <Text style={[st.label, { fontSize: Math.max(11, size * 0.17) }]}>{label}</Text> : null}
      {sub ? <Text style={st.sub}>{sub}</Text> : null}
    </Animated.View>
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
  label: { fontFamily: F.black, color: C.hudInk, textAlign: "center" },
  sub: { fontFamily: F.mono, fontSize: 10, color: "#cfc8b8", marginTop: 1 },
});

import { useEffect, useRef, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { C, F } from "./theme";
import { followStick, STICK_RADIUS } from "./touch";

/*
 * Todo controle de partida usa Gesture Handler, nunca onTouchStart/Pressable do React Native:
 * no Android o RN entrega todos os dedos à view tocada pelo primeiro dedo, então com o polegar
 * no manche o toque em Atirar, Derrapar ou numa carta de evolução nunca chegaria ao botão.
 * Os callbacks rodam na thread JS (runOnJS) porque falam com o motor do jogo.
 */

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function useOnBackground(fn: () => void) {
  const ref = useLatest(fn);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") ref.current();
    });
    return () => sub.remove();
  }, [ref]);
}

/**
 * Área de toque da tela de jogo. Um dedo que começa na parte esquerda vira joystick (aparece onde tocou);
 * na parte direita, arrastar gira a câmera (só se onLook existir).
 */
export function TouchPad({
  onStick,
  onLook,
  split = 0.45,
}: {
  onStick: (dx: number, dy: number) => void;
  onLook?: (dx: number, dy: number) => void;
  split?: number;
}) {
  const base = useRef<{ x: number; y: number } | null>(null);
  const onStickRef = useLatest(onStick);
  const onLookRef = useLatest(onLook);
  const baseX = useSharedValue(-999);
  const baseY = useSharedValue(-999);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const opacity = useSharedValue(0);

  const release = () => {
    if (!base.current) return;
    base.current = null;
    knobX.value = withSpring(0, { damping: 18, stiffness: 260 });
    knobY.value = withSpring(0, { damping: 18, stiffness: 260 });
    opacity.value = withTiming(0, { duration: 140 });
    onStickRef.current(0, 0);
  };
  useOnBackground(release);

  const stick = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: (e) => {
      base.current = { x: e.x, y: e.y };
      baseX.value = e.x - STICK_RADIUS;
      baseY.value = e.y - STICK_RADIUS;
      knobX.value = 0;
      knobY.value = 0;
      opacity.value = withTiming(1, { duration: 90 });
    },
    onUpdate: (e) => {
      if (!base.current) return;
      const s = followStick(base.current, { x: e.x, y: e.y });
      base.current = s.base;
      baseX.value = s.base.x - STICK_RADIUS;
      baseY.value = s.base.y - STICK_RADIUS;
      knobX.value = s.dx;
      knobY.value = s.dy;
      onStickRef.current(s.dx, s.dy);
    },
    onFinalize: release,
  });

  const look = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onUpdate: (e) => onLookRef.current?.(e.changeX, e.changeY),
  });

  const baseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: baseX.value }, { translateY: baseY.value }],
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }, { translateY: knobY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <GestureDetector gesture={stick}>
        <View collapsable={false} style={[st.region, { left: 0, width: `${split * 100}%` }]}>
          <Animated.View pointerEvents="none" style={[st.stickBase, baseStyle]}>
            <Animated.View style={[st.knob, knobStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>
      {onLook && (
        <GestureDetector gesture={look}>
          <View collapsable={false} style={[st.region, { left: `${split * 100}%`, right: 0 }]} />
        </GestureDetector>
      )}
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
  const isDown = useRef(false);
  const onDownRef = useLatest(onDown);
  const onUpRef = useLatest(onUp);
  const onMoveRef = useLatest(onMove);
  const pressed = useSharedValue(0);

  const up = () => {
    if (!isDown.current) return;
    isDown.current = false;
    pressed.value = withSpring(0, { damping: 16, stiffness: 320 });
    onUpRef.current?.();
  };
  useOnBackground(up);

  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: () => {
      if (isDown.current) return;
      isDown.current = true;
      pressed.value = withSpring(1, { damping: 16, stiffness: 320 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDownRef.current();
    },
    onUpdate: (e) => {
      if (isDown.current) onMoveRef.current?.(e.changeX, e.changeY);
    },
    onFinalize: up,
  });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value ? 0.92 : 1 }],
    borderColor: pressed.value ? C.postit : C.hudLine,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        collapsable={false}
        style={[st.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animStyle, style]}
      >
        {children}
        {label ? <Text style={[st.label, { fontSize: Math.max(11, size * 0.17) }]}>{label}</Text> : null}
        {sub ? <Text style={st.sub}>{sub}</Text> : null}
      </Animated.View>
    </GestureDetector>
  );
}

/** Dispara no instante do toque (habilidades, esquiva, item): numa briga, esperar soltar o dedo atrasa. */
export function TouchDown({ onDown, style, children }: { onDown: () => void; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const onDownRef = useLatest(onDown);
  const tap = useTapGesture({
    runOnJS: true,
    onBegin: () => onDownRef.current(),
  });
  return (
    <GestureDetector gesture={tap}>
      <View collapsable={false} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
}

export function Tap({
  onPress,
  style,
  bg,
  pressedBg,
  children,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  bg?: string;
  pressedBg?: string;
  children?: ReactNode;
}) {
  const onPressRef = useLatest(onPress);
  const pressed = useSharedValue(0);
  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 24,
    onBegin: () => {
      pressed.value = 1;
    },
    onActivate: () => onPressRef.current(),
    onFinalize: () => {
      pressed.value = 0;
    },
  });
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value ? 0.96 : 1 }],
    ...(bg && pressedBg ? { backgroundColor: pressed.value ? pressedBg : bg } : {}),
  }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View collapsable={false} style={[style, animStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  region: { position: "absolute", top: 0, bottom: 0 },
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

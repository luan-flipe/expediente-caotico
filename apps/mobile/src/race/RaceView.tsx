import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { getState, net, useStore } from "../store";
import { TouchPad } from "../ui/controls";
import { brakeFromStick, steerFrom } from "../ui/touch";
import { useGameScreen } from "../ui/useGameScreen";
import { RaceEngine, type RaceUiSignal } from "./raceEngine";
import { RaceHud } from "./RaceHud";
import { GameGL } from "../ui/GameGL";

/** Estado dos controles da tela; a cadeira acelera sozinha e o botão Ré ou o manche para baixo invertem. */
export interface Pedals {
  steer: number;
  reverse: boolean;
  stickReverse: boolean;
  drift: boolean;
}

export function RaceView({ myId }: { myId: string }) {
  useGameScreen();
  const engineRef = useRef<RaceEngine | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const pedals = useRef<Pedals>({ steer: 0, reverse: false, stickReverse: false, drift: false });
  const players = useStore((st) => st.lobby?.players);
  const muted = useStore((st) => st.muted);

  const push = (patch: Partial<Pedals>) => {
    const p = (pedals.current = { ...pedals.current, ...patch });
    engineRef.current?.setControls({
      steer: p.steer,
      throttle: p.reverse || p.stickReverse ? -1 : 1,
      drift: p.drift,
    });
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const onUi = (sig: RaceUiSignal) => {
      if (sig === "boost2") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (sig === "boost1" || sig === "blocked") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else if (sig === "hit") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else if (sig === "wall") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };
    const engine = new RaceEngine(gl, myId, onUi);
    engineRef.current = engine;
    engine.setPeople(getState().lobby?.players ?? []);
    push({});
    const { rsnap, rme } = getState();
    if (rsnap) engine.applySnapshot(rsnap, rme);
    const off = net.listen((m) => {
      if (m.t === "rsnap") engine.applySnapshot(m.s, m.me);
    });
    cleanup.current = () => {
      off();
      engine.dispose();
      engineRef.current = null;
    };
  };

  useEffect(() => () => cleanup.current(), []);

  useEffect(() => {
    if (players) engineRef.current?.setPeople(players);
  }, [players]);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  return (
    <View style={st.game}>
      <StatusBar hidden />
      <GameGL style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      <TouchPad split={0.5} onStick={(dx, dy) => push({ steer: steerFrom(dx), stickReverse: brakeFromStick(dy) })} />
      <RaceHud myId={myId} engine={engineRef} onPedals={push} />
    </View>
  );
}

const st = StyleSheet.create({
  game: { flex: 1, backgroundColor: "#0f0e0c" },
});

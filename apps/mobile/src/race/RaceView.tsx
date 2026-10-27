import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { StatusBar } from "expo-status-bar";
import { getState, net, useStore } from "../store";
import { TouchPad } from "../ui/controls";
import { steerFrom } from "../ui/touch";
import { useGameScreen } from "../ui/useGameScreen";
import { RaceEngine } from "./raceEngine";
import { RaceHud } from "./RaceHud";
import { GameGL } from "../ui/GameGL";

/** Estado dos controles da tela; a cadeira acelera sozinha e o botão Ré inverte. */
export interface Pedals {
  steer: number;
  reverse: boolean;
  drift: boolean;
}

export function RaceView({ myId }: { myId: string }) {
  useGameScreen();
  const engineRef = useRef<RaceEngine | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const pedals = useRef<Pedals>({ steer: 0, reverse: false, drift: false });
  const players = useStore((st) => st.lobby?.players);
  const muted = useStore((st) => st.muted);

  const push = (patch: Partial<Pedals>) => {
    const p = (pedals.current = { ...pedals.current, ...patch });
    engineRef.current?.setControls({ steer: p.steer, throttle: p.reverse ? -1 : 1, drift: p.drift });
  };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const engine = new RaceEngine(gl, myId);
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
      <TouchPad split={0.5} onStick={(dx) => push({ steer: steerFrom(dx) })} />
      <RaceHud myId={myId} engine={engineRef} onPedals={push} />
    </View>
  );
}

const st = StyleSheet.create({
  game: { flex: 1, backgroundColor: "#0f0e0c" },
});

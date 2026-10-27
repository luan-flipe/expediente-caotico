import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { getState, net, useStore } from "../store";
import { TouchPad } from "../ui/controls";
import { stickVector } from "../ui/touch";
import { useGameScreen } from "../ui/useGameScreen";
import { Engine, type UiSignal } from "./engine";
import { Hud } from "./Hud";
import { GameGL } from "../ui/GameGL";

export function GameView({ myId }: { myId: string }) {
  useGameScreen();
  const engineRef = useRef<Engine | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const players = useStore((st) => st.lobby?.players);
  const [hitAt, setHitAt] = useState(0);
  const [hurtAt, setHurtAt] = useState(0);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const onUi = (s: UiSignal) => {
      if (s === "hit") {
        setHitAt(performance.now());
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (s === "hurt") {
        setHurtAt(performance.now());
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    };
    const engine = new Engine(gl, myId, onUi);
    engineRef.current = engine;
    engine.setAvatars(getState().lobby?.players ?? []);
    const { snap, me } = getState();
    if (snap) engine.applySnapshot(snap, me);
    const off = net.listen((m) => {
      if (m.t === "snap") engine.applySnapshot(m.s, m.me);
    });
    cleanup.current = () => {
      off();
      engine.dispose();
      engineRef.current = null;
    };
  };

  useEffect(() => () => cleanup.current(), []);

  useEffect(() => {
    if (players) engineRef.current?.setAvatars(players);
  }, [players]);

  return (
    <View style={st.game}>
      <StatusBar hidden />
      <GameGL style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      <TouchPad
        onStick={(dx, dy) => {
          const v = stickVector(dx, dy);
          engineRef.current?.setStick(v.x, v.y);
        }}
        onLook={(dx, dy) => engineRef.current?.look(dx, dy)}
      />
      <Hud myId={myId} engine={engineRef} hitAt={hitAt} hurtAt={hurtAt} />
    </View>
  );
}

const st = StyleSheet.create({
  game: { flex: 1, backgroundColor: "#0f0e0c" },
});

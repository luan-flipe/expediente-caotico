import { useEffect, useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ITEM_NAMES, RACE } from "@ec/shared";
import { setMuted, setState, useStore } from "../store";
import { HoldButton } from "../ui/controls";
import { Feed, hud, Panel } from "../ui/hud";
import { Table } from "../ui/Table";
import { C, F, fill } from "../ui/theme";
import { fmtRace, ITEM_ICON } from "./format";
import { Minimap } from "./Minimap";
import type { RaceEngine } from "./raceEngine";
import type { Pedals } from "./RaceView";

/** Botão pequeno do HUD (som, voltar para a pista, placar). */
function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [hud.panel, st.chip, pressed && { borderColor: C.postit }]}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      <Text style={hud.small}>{label}</Text>
    </Pressable>
  );
}

export function RaceHud({ myId, engine, onPedals }: { myId: string; engine: RefObject<RaceEngine | null>; onPedals: (p: Partial<Pedals>) => void }) {
  const snap = useStore((st) => st.rsnap);
  const me = useStore((st) => st.rme);
  const scoreboard = useStore((st) => st.scoreboard);
  const muted = useStore((st) => st.muted);
  const inset = useSafeAreaInsets();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);

  if (!snap) {
    return (
      <View style={hud.center} pointerEvents="none">
        <Text style={hud.big}>Ajustando a cadeira...</Text>
      </View>
    );
  }
  const order = [...snap.karts].sort((a, b) => a.place - b.place);
  const frozen = snap.karts.find((k) => k.id === myId)?.flags.includes("frozen");
  const introLeft = snap.phase === "countdown" ? snap.countdownMs - (RACE.countdownMs - RACE.introMs) : 0;
  const pad = { top: inset.top + 10, left: inset.left + 12, right: inset.right + 12, bottom: inset.bottom + 12 };

  if (introLeft > 0) {
    const first = introLeft > RACE.introMs * 0.45;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[st.bar, { top: 0 }]} />
        <View style={[st.bar, { bottom: 0, justifyContent: "center", paddingHorizontal: pad.left + 20 }]}>
          <Text style={st.speaker}>Comandante</Text>
          <Text style={st.speech}>{first ? "Bom dia, firma! Aqui é o Comandante, sobrevoando o Circuito Corporativo." : "Cintos afivelados, café na mão. Pilotos, liberados para a largada!"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {me && me.blindMs > 0 && (
        <View pointerEvents="none" style={[st.postit, { opacity: Math.min(1, me.blindMs / 400) }]}>
          <Text style={st.postitText}>Reunião às 15h!!</Text>
        </View>
      )}

      <View pointerEvents="none" style={[st.top, { top: pad.top }]}>
        <Panel>
          <Text style={hud.timer}>{fmtRace(me?.raceMs ?? snap.elapsedMs)}</Text>
        </Panel>
        {snap.graceMs !== null && (
          <Panel>
            <Text style={hud.small}>Fim da corrida em {Math.ceil(snap.graceMs / 1000)} s</Text>
          </Panel>
        )}
      </View>

      <Feed style={{ top: pad.top + 92, left: pad.left }} />

      {me && (
        <View pointerEvents="none" style={[st.place, { top: pad.top, left: pad.left }]}>
          <Text style={st.pos}>
            {me.place}
            <Text style={st.posSmall}>º</Text>
            <Text style={st.of}>/{me.total}</Text>
          </Text>
          <Text style={hud.bold}>
            Volta {me.lap}/{snap.laps}
          </Text>
          <Text style={hud.small}>
            Esta {fmtRace(me.finished ? null : me.lapMs)} · Melhor {fmtRace(me.bestLapMs)}
          </Text>
        </View>
      )}

      <View style={[st.right, { top: pad.top, right: pad.right }]} pointerEvents="box-none">
        <Pressable onPress={() => setState({ scoreboard: !scoreboard })}>
          <Panel style={{ padding: 6 }}>
            <Minimap karts={snap.karts} myId={myId} size={128} />
          </Panel>
        </Pressable>
        <View style={st.chips}>
          <Chip label={muted ? "Som: não" : "Som: sim"} onPress={() => setMuted(!muted)} />
          <Chip label="Pista" onPress={() => engine.current?.respawn()} />
          {__DEV__ && <Chip label="Item+" onPress={() => engine.current?.debugItem()} />}
        </View>
      </View>

      {me && (
        <View style={[st.pedals, { right: pad.right, bottom: pad.bottom }]} pointerEvents="box-none">
          <View style={st.pedalCol} pointerEvents="box-none">
            <View
              style={[st.item, me.item && st.itemFull]}
              onTouchStart={() => {
                if (!me.item) return;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                engine.current?.useItem();
              }}
            >
              <Text style={st.itemIco}>{me.item ? ITEM_ICON[me.item] : "?"}</Text>
              <Text style={st.itemName} numberOfLines={1}>
                {me.item ? `${ITEM_NAMES[me.item]}${me.charges > 1 ? ` x${me.charges}` : ""}` : "Sem item"}
              </Text>
            </View>
            <HoldButton size={64} label="Ré" onDown={() => onPedals({ reverse: true })} onUp={() => onPedals({ reverse: false })} />
          </View>
          <HoldButton size={104} label="Derrapar" sub="segure e solte" color="rgba(47,111,223,0.85)" onDown={() => onPedals({ drift: true })} onUp={() => onPedals({ drift: false })} />
        </View>
      )}

      {snap.phase === "countdown" && (
        <View style={hud.center} pointerEvents="none">
          <Text style={hud.count}>{Math.max(1, Math.ceil(snap.countdownMs / 1000))}</Text>
          <Panel>
            <Text style={hud.small}>Polegar esquerdo vira · a cadeira acelera sozinha · segure Derrapar e solte para o turbo · toque no item para usar</Text>
          </Panel>
        </View>
      )}
      {snap.phase === "active" && snap.elapsedMs < 900 && (
        <View style={hud.center} pointerEvents="none">
          <Text style={hud.count}>VAI!</Text>
        </View>
      )}
      {me?.wrongWay && !me.finished && (
        <View style={hud.center} pointerEvents="none">
          <Text style={st.wrong}>Contramão! Dê meia-volta</Text>
        </View>
      )}
      {frozen && (
        <View style={[hud.center, { justifyContent: "flex-end", paddingBottom: 40 }]} pointerEvents="none">
          <Panel>
            <Text style={hud.bold}>Voltando para a pista...</Text>
          </Panel>
        </View>
      )}
      {me?.finished && (
        <View style={hud.center} pointerEvents="none">
          <Panel style={{ alignItems: "center", paddingHorizontal: 28 }}>
            <Text style={hud.h2}>Você chegou em {me.place}º!</Text>
            <Text style={hud.bold}>
              Tempo {fmtRace(me.raceMs)} · melhor volta {fmtRace(me.bestLapMs)}
            </Text>
          </Panel>
        </View>
      )}

      {scoreboard && (
        <Pressable style={st.scoreWrap} onPress={() => setState({ scoreboard: false })}>
          <Panel>
            <Table
              dark
              cols={[
                { title: "#", width: 34, num: true },
                { title: "Piloto", width: 200 },
                { title: "Volta", width: 60, num: true },
              ]}
              rows={order.map((k) => ({
                key: k.id,
                me: k.id === myId,
                cells: [k.place, `${k.name}${k.isBot ? " (bot)" : ""}${!k.connected ? " (caiu)" : ""}${k.finished ? " ✓" : ""}`, k.lap],
              }))}
            />
          </Panel>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, height: "18%", backgroundColor: "#000" },
  speaker: { fontFamily: F.monoBold, fontSize: 12, color: C.postit, letterSpacing: 1, textTransform: "uppercase" },
  speech: { fontFamily: F.bold, fontSize: 17, color: "#fff", marginTop: 4 },
  postit: { ...fill, backgroundColor: C.postit, alignItems: "center", justifyContent: "center" },
  postitText: { fontFamily: F.black, fontSize: 42, color: C.ink, transform: [{ rotate: "-4deg" }] },
  top: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 6 },
  place: { position: "absolute" },
  pos: { fontFamily: F.black, fontSize: 56, lineHeight: 60, color: C.postit, textShadowColor: "#000", textShadowRadius: 6 },
  posSmall: { fontSize: 26 },
  of: { fontSize: 22, color: C.hudInk },
  right: { position: "absolute", alignItems: "flex-end", gap: 8 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10 },
  pedals: { position: "absolute", flexDirection: "row", alignItems: "flex-end", gap: 14 },
  pedalCol: { alignItems: "center", gap: 12 },
  item: { width: 84, height: 84, borderRadius: 14, backgroundColor: C.hudBg, borderWidth: 2, borderColor: C.hudLine, alignItems: "center", justifyContent: "center", padding: 4 },
  itemFull: { borderColor: C.postit, backgroundColor: "rgba(255,225,77,0.22)" },
  itemIco: { fontSize: 28 },
  itemName: { fontFamily: F.bold, fontSize: 10, color: C.hudInk, marginTop: 2 },
  wrong: { fontFamily: F.black, fontSize: 30, color: "#fff", backgroundColor: C.red, paddingHorizontal: 16, paddingVertical: 6, overflow: "hidden" },
  scoreWrap: { ...fill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
});

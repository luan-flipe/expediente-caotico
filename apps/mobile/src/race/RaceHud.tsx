import { useEffect, useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ITEM_NAMES, RACE } from "@ec/shared";
import { leaveRoom, setMuted, setState, useStore } from "../store";
import { HoldButton } from "../ui/controls";
import { Feed, hud, Panel } from "../ui/hud";
import { Btn } from "../ui/kit";
import { Table } from "../ui/Table";
import { C, F, fill, hardShadow } from "../ui/theme";
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
  const { width, height } = useWindowDimensions();
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
  // Post-it quadrado central, deixando as laterais da pista visíveis como na versão web (.postit-cover)
  const postitSize = Math.round(Math.min(width * 0.52, height * 0.76, 360));

  if (introLeft > 0) {
    const first = introLeft > RACE.introMs * 0.45;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[st.bar, { top: 0 }]} />
        <View style={[st.bar, st.barBottom, { paddingHorizontal: pad.left + 20 }]}>
          <View style={st.speechWrap}>
            <Text style={st.speaker}>Comandante</Text>
            <Text style={st.speech}>
              {first
                ? "Bom dia, firma! Aqui é o Comandante, sobrevoando o Circuito Corporativo."
                : "Cintos afivelados, café na mão. Pilotos, liberados para a largada!"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {me && me.blindMs > 0 && (
        <View
          pointerEvents="none"
          style={[
            st.postit,
            {
              width: postitSize,
              height: postitSize,
              marginLeft: -postitSize / 2,
              marginTop: -postitSize / 2,
              opacity: Math.min(1, me.blindMs / 400),
            },
          ]}
        >
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

      <Feed style={{ top: pad.top + 96, left: pad.left }} />

      {me && (
        <View pointerEvents="none" style={[st.place, { top: pad.top, left: pad.left }]}>
          <Text style={st.pos}>
            {me.place}
            <Text style={st.posSmall}>º</Text>
            <Text style={st.of}>/{me.total}</Text>
          </Text>
          <Text style={[hud.bold, st.placeShadow]}>
            Volta {me.lap}/{snap.laps}
          </Text>
          <Text style={[hud.mono, st.placeShadow]}>
            Esta volta {fmtRace(me.finished ? null : me.lapMs)} · Melhor {fmtRace(me.bestLapMs)}
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
          <Chip label="Placar" onPress={() => setState({ scoreboard: true })} />
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
              <Text style={st.itemHint} numberOfLines={1}>
                {me.item ? "Toque p/ usar" : "Passe na caixa"}
              </Text>
            </View>
            <HoldButton size={64} label="Ré" onDown={() => onPedals({ reverse: true })} onUp={() => onPedals({ reverse: false })} />
          </View>
          <HoldButton
            size={104}
            label="Derrapar"
            sub="segure e solte"
            color="rgba(47,111,223,0.85)"
            onDown={() => onPedals({ drift: true })}
            onUp={() => onPedals({ drift: false })}
          />
        </View>
      )}

      {snap.phase === "countdown" && (
        <View style={hud.center} pointerEvents="none">
          <Text style={hud.count}>{Math.max(1, Math.ceil(snap.countdownMs / 1000))}</Text>
          <Panel>
            <Text style={hud.small}>
              Polegar esquerdo vira (puxe p/ baixo p/ frear) · acelera sozinha · segure Derrapar e solte para o turbo · toque no item para usar
            </Text>
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
          <View style={[st.wrongBox, hardShadow()]}>
            <Text style={st.wrongText}>Contramão! Dê meia-volta</Text>
          </View>
        </View>
      )}
      {frozen && (
        <View style={[st.frozenWrap, { top: pad.top + 84 }]} pointerEvents="none">
          <Panel>
            <Text style={hud.bold}>Voltando para a pista...</Text>
          </Panel>
        </View>
      )}
      {me?.finished && (
        <View style={hud.center} pointerEvents="none">
          <Panel style={st.finishPanel}>
            <Text style={hud.h2}>Você chegou em {me.place}º!</Text>
            <Text style={hud.bold}>
              Tempo {fmtRace(me.raceMs)} · melhor volta {fmtRace(me.bestLapMs)}
            </Text>
          </Panel>
        </View>
      )}

      {scoreboard && (
        <Pressable style={st.scoreWrap} onPress={() => setState({ scoreboard: false })}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Panel style={{ maxHeight: "90%", gap: 10 }}>
              <Table
                dark
                cols={[
                  { title: "#", width: 34, num: true },
                  { title: "Piloto", width: 220 },
                  { title: "Volta", width: 60, num: true },
                ]}
                rows={order.map((k) => ({
                  key: k.id,
                  me: k.id === myId,
                  cells: [k.place, `${k.name}${k.isBot ? " (bot)" : ""}${!k.connected ? " (caiu)" : ""}${k.finished ? " ✓" : ""}`, k.lap],
                }))}
              />
              <View style={st.scoreActions}>
                <Btn small title="Continuar" kind="primary" onPress={() => setState({ scoreboard: false })} />
                <Btn small title="Sair da corrida" onPress={leaveRoom} />
              </View>
            </Panel>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, height: "14%", backgroundColor: "#0c0b09" },
  barBottom: { bottom: 0, alignItems: "center", justifyContent: "center" },
  speechWrap: { maxWidth: 760, alignItems: "center" },
  speaker: { fontFamily: F.monoBold, fontSize: 13, color: C.postit, letterSpacing: 1.1, textTransform: "uppercase", textAlign: "center" },
  speech: { fontFamily: F.bold, fontSize: 18, color: "#fffdf7", marginTop: 2, textAlign: "center" },
  postit: {
    position: "absolute",
    left: "50%",
    top: "46%",
    backgroundColor: C.postit,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    transform: [{ rotate: "-4deg" }],
    boxShadow: "10px 12px 0px rgba(0,0,0,0.35)",
  },
  postitText: { fontFamily: F.black, fontSize: 38, color: C.ink, textAlign: "center", transform: [{ rotate: "-6deg" }] },
  top: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 6 },
  place: { position: "absolute" },
  pos: { fontFamily: F.black, fontSize: 56, lineHeight: 60, color: C.postit, textShadowColor: C.ink, textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 1 },
  posSmall: { fontSize: 26 },
  of: { fontSize: 22, color: C.hudInk },
  placeShadow: { textShadowColor: C.ink, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  right: { position: "absolute", alignItems: "flex-end", gap: 8 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10 },
  pedals: { position: "absolute", flexDirection: "row", alignItems: "flex-end", gap: 14 },
  pedalCol: { alignItems: "center", gap: 12 },
  item: { width: 92, height: 88, borderRadius: 12, backgroundColor: C.hudBg, borderWidth: 2, borderColor: C.hudLine, alignItems: "center", justifyContent: "center", padding: 4 },
  itemFull: { borderColor: C.postit, backgroundColor: "rgba(255,225,77,0.2)" },
  itemIco: { fontSize: 26 },
  itemName: { fontFamily: F.black, fontSize: 10, color: C.hudInk, marginTop: 2 },
  itemHint: { fontFamily: F.medium, fontSize: 9, color: C.hudInk, opacity: 0.7 },
  wrongBox: { backgroundColor: C.red, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 22, paddingVertical: 8, transform: [{ translateY: -64 }] },
  wrongText: { fontFamily: F.black, fontSize: 28, color: "#fff" },
  frozenWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  finishPanel: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 18, borderColor: C.red, backgroundColor: "rgba(20,18,15,0.84)" },
  scoreWrap: { ...fill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  scoreActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 4 },
});

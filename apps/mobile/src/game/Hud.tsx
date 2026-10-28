import { useMemo, type RefObject } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Canvas, Path, RadialGradient, Rect, Skia, vec } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ABILITIES, BALANCE, roomNameAt, type EvolutionOption, type PrivateState, type Snapshot } from "@ec/shared";
import { leaveRoom, setState, useStore } from "../store";
import { HoldButton, Tap, TouchDown } from "../ui/controls";
import { Feed, hud, Panel, useHudFrame } from "../ui/hud";
import { Btn } from "../ui/kit";
import { Table } from "../ui/Table";
import { C, F, fill } from "../ui/theme";
import type { Engine } from "./engine";

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const STATUS_TEXT: Record<string, string> = {
  stun: "Atordoado",
  blind: "Cego de café",
  slow: "Lento",
  haste: "Cafeinado",
  shield: "Escudo",
  invuln: "Intocável",
};
const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** Recarga circular em sentido horário (mesmo efeito do conic-gradient da web). */
function CooldownSweep({ pct, size }: { pct: number; size: number }) {
  const path = useMemo(() => {
    const r = size / 2;
    const sweep = Math.min(359.9, Math.max(0, pct * 360));
    const b = Skia.PathBuilder.Make();
    b.moveTo(r, r);
    b.arcToOval(Skia.XYWHRect(0, 0, size, size), -90, sweep, false);
    b.close();
    return b.detach();
  }, [pct, size]);

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Path path={path} color="rgba(0,0,0,0.68)" />
    </Canvas>
  );
}

/** Botão de habilidade: dispara no toque imediato e mostra a recarga circular. */
function Slot({
  label,
  level,
  readyInMs,
  cooldownMs,
  color,
  size,
  onPress,
}: {
  label: string;
  level?: number;
  readyInMs: number;
  cooldownMs: number;
  color?: string;
  size: number;
  onPress: () => void;
}) {
  const pct = cooldownMs > 0 ? Math.min(1, Math.max(0, readyInMs / cooldownMs)) : 0;
  return (
    <TouchDown
      style={[st.slot, { width: size, height: size, borderRadius: size / 2, borderColor: readyInMs <= 0 && color ? color : C.hudLine }]}
      onDown={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      <Text style={st.slotLabel} numberOfLines={2}>
        {label}
      </Text>
      {level ? <Text style={st.slotLv}>{ROMAN[level]}</Text> : null}
      {readyInMs > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, st.slotOverlay, { borderRadius: size / 2 }]}>
          <CooldownSweep pct={pct} size={size} />
          <Text style={st.slotCd}>{Math.ceil(readyInMs / 1000)}</Text>
        </View>
      )}
    </TouchDown>
  );
}

const TYPE_TEXT: Record<EvolutionOption["type"], string> = {
  unlock: "Nova habilidade",
  upgrade: "Melhoria",
  spec: "Especialização (definitiva)",
  stat: "Atributo",
};

function Evolution({
  options,
  msLeft,
  pending,
  abilities,
  onPick,
}: {
  options: EvolutionOption[];
  msLeft: number;
  pending: number;
  abilities: PrivateState["abilities"];
  onPick: (i: number) => void;
}) {
  const full = abilities.length >= BALANCE.maxAbilities;
  return (
    <View style={st.evo} pointerEvents="box-none">
      <Text style={st.evoTitle} pointerEvents="none">
        {abilities.length === 0 ? "Escolha sua primeira ferramenta de trabalho" : "Promoção! Escolha uma evolução"}
        {pending > 0 ? ` (+${pending} na fila)` : ""}
      </Text>
      <View style={st.evoCards} pointerEvents="box-none">
        {options.map((o, i) => (
          <Tap
            key={o.id}
            style={st.evoCard}
            bg={C.card}
            pressedBg={C.postit}
            onPress={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onPick(i);
            }}
          >
            <Text style={st.evoKey}>{i + 1}</Text>
            <Text style={st.evoType}>{TYPE_TEXT[o.type]}</Text>
            <Text style={st.evoT} numberOfLines={2}>
              {o.title}
            </Text>
            <Text style={st.evoD} numberOfLines={3}>
              {o.desc}
            </Text>
            {o.toLevel ? (
              <Text style={st.evoLv}>
                {o.fromLevel ? `${ROMAN[o.fromLevel]} → ` : ""}
                {ROMAN[o.toLevel]}
                {o.type === "unlock" && full ? " (espaços cheios)" : ""}
              </Text>
            ) : null}
          </Tap>
        ))}
      </View>
      <View style={st.evoTimer} pointerEvents="none">
        <View style={{ height: "100%", width: `${(msLeft / BALANCE.evolutionTimeoutMs) * 100}%`, backgroundColor: C.postit }} />
      </View>
      <Text style={[hud.small, { textAlign: "center" }]} pointerEvents="none">
        Sem escolha em {Math.ceil(msLeft / 1000)} s, vale a primeira.
      </Text>
    </View>
  );
}

function Scoreboard({ snap, myId }: { snap: Snapshot; myId: string }) {
  const rows = [...snap.players].sort((a, b) => b.score - a.score || b.kills - a.kills || b.assists - a.assists);
  return (
    <Pressable style={st.scoreWrap} onPress={() => setState({ scoreboard: false })}>
      <Pressable onPress={(e) => e.stopPropagation()}>
        <Panel style={{ maxHeight: "90%", gap: 10 }}>
          <Table
            dark
            cols={[
              { title: "Funcionário", width: 150 },
              { title: "Build", width: 230 },
              { title: "Nív.", width: 44, num: true },
              { title: "Pts", width: 52, num: true },
              { title: "Elim.", width: 52, num: true },
              { title: "Assist.", width: 60, num: true },
              { title: "Mortes", width: 60, num: true },
            ]}
            rows={rows.map((p) => ({
              key: p.id,
              me: p.id === myId,
              cells: [
                `${p.name}${p.isBot ? " (bot)" : ""}${!p.connected ? " (caiu)" : ""}`,
                p.abilities.map((a) => `${ABILITIES[a.id].name} ${a.level}${a.spec ?? ""}`).join(" · ") || "-",
                p.level,
                p.score,
                p.kills,
                p.assists,
                p.deaths,
              ],
            }))}
          />
          <View style={st.scoreActions}>
            <Btn small title="Continuar" kind="primary" onPress={() => setState({ scoreboard: false })} />
            <Btn small title="Sair da partida" onPress={leaveRoom} />
          </View>
        </Panel>
      </Pressable>
    </Pressable>
  );
}

export function Hud({ myId, engine, hitAt, hurtAt }: { myId: string; engine: RefObject<Engine | null>; hitAt: number; hurtAt: number }) {
  const { snap, me } = useHudFrame();
  const scoreboard = useStore((st) => st.scoreboard);
  const inset = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  if (!snap) {
    return (
      <View style={hud.center} pointerEvents="none">
        <Text style={hud.big}>Entrando no escritório...</Text>
      </View>
    );
  }
  const now = performance.now();
  const self = snap.players.find((p) => p.id === myId);
  const top = [...snap.players].sort((a, b) => b.score - a.score || b.kills - a.kills).slice(0, 4);
  const obj = snap.objective;
  const objOwner = obj.owner ? snap.players.find((p) => p.id === obj.owner)?.name : null;
  const flags = self?.flags.filter((f) => STATUS_TEXT[f] && f !== "invuln") ?? [];
  const pad = { top: inset.top + 10, left: inset.left + 12, right: inset.right + 12, bottom: inset.bottom + 12 };
  const hitOn = now - hitAt < 150;
  const hurtElapsed = now - hurtAt;

  let arrowRot = 0;
  let objDist = 0;
  if (self) {
    objDist = Math.hypot(obj.x - self.x, obj.z - self.z);
    arrowRot = Math.atan2(obj.x - self.x, obj.z - self.z) - self.yaw;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {me && me.blindMs > 0 && (
        <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: Math.min(1, me.blindMs / 600) }]}>
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(width / 2, height / 2)}
              r={Math.hypot(width / 2, height / 2) * 0.55}
              colors={["rgba(80,45,20,0.35)", "rgba(60,32,12,0.96)"]}
            />
          </Rect>
        </Canvas>
      )}

      {hurtElapsed < 180 && (
        <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: Math.max(0, 1 - hurtElapsed / 180) }]}>
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(width / 2, height / 2)}
              r={Math.hypot(width / 2, height / 2)}
              colors={["rgba(255,40,30,0)", "rgba(255,40,30,0.06)", "rgba(255,40,30,0.58)"]}
              positions={[0, 0.52, 1]}
            />
          </Rect>
        </Canvas>
      )}

      <View pointerEvents="none" style={st.cross}>
        <View style={[st.crossV, hitOn && { backgroundColor: C.red }]} />
        <View style={[st.crossH, hitOn && { backgroundColor: C.red }]} />
      </View>

      <View pointerEvents="none" style={[st.top, { top: pad.top }]}>
        <Panel style={{ alignSelf: "center" }}>
          <Text style={hud.timer}>{fmt(snap.remainingMs)}</Text>
        </Panel>
        {!me?.options && (
          <Panel style={st.zone}>
            <View style={[st.arrow, { transform: [{ rotate: `${-arrowRot}rad` }] }]} />
            <Text style={hud.small} numberOfLines={1}>
              Reunião Relâmpago · {roomNameAt(obj.x, obj.z)} · {Math.round(objDist)} m ·{" "}
              <Text style={{ color: obj.contested ? C.red : obj.owner === myId ? C.green : C.postit }}>
                {obj.contested ? "disputada" : objOwner ? `com ${obj.owner === myId ? "você" : objOwner}` : "livre"}
              </Text>{" "}
              <Text style={{ color: "#cfc8b8" }}>· muda em {fmt(obj.cycleMs)}</Text>
            </Text>
          </Panel>
        )}
      </View>

      <Feed style={{ top: pad.top, left: pad.left }} />

      <Tap style={[st.board, { top: pad.top, right: pad.right }]} onPress={() => setState({ scoreboard: true })}>
        <Panel>
          {top.map((p, i) => (
            <View key={p.id} style={st.boardRow}>
              <Text style={[hud.small, p.id === myId && { color: C.postit }, { flexShrink: 1 }]} numberOfLines={1}>
                {i + 1}. {p.name}
              </Text>
              <Text style={[hud.mono, p.id === myId && { color: C.postit }]}>{p.score}</Text>
            </View>
          ))}
          <Text style={[hud.small, { opacity: 0.65, marginTop: 4 }]}>Toque: placar · sair</Text>
        </Panel>
      </Tap>

      {self && me && (
        <View pointerEvents="none" style={[st.status, { bottom: pad.bottom }]}>
          <Panel>
            <View style={st.statusName}>
              <Text style={[hud.bold, { flexShrink: 1 }]} numberOfLines={1}>
                {self.name}
              </Text>
              <View style={st.lvlBadge}>
                <Text style={st.lvlText}>NÍVEL {me.level}</Text>
              </View>
            </View>
            <View style={st.hpBar}>
              <LinearGradient
                colors={["#ff4d3d", "#ff8a3d"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[st.hpFill, { width: `${(self.hp / self.maxHp) * 100}%` }]}
              />
              <View style={[st.shFill, { width: `${Math.min(1, self.shield / self.maxHp) * 100}%` }]} />
              <Text style={st.hpText}>
                {self.hp} / {self.maxHp}
                {self.shield > 0 ? ` +${self.shield}` : ""}
              </Text>
            </View>
            <View style={st.xpBar}>
              <View style={{ height: "100%", width: `${(me.xp / me.xpNext) * 100}%`, backgroundColor: C.postit }} />
            </View>
            {flags.length + me.synergies.length > 0 && (
              <View style={st.effects}>
                {flags.map((f) => (
                  <Text key={f} style={st.fx}>
                    {STATUS_TEXT[f]}
                  </Text>
                ))}
                {me.synergies.map((s) => (
                  <Text key={s} style={[st.fx, st.fxSyn]}>
                    Sinergia: {s}
                  </Text>
                ))}
              </View>
            )}
          </Panel>
        </View>
      )}

      {me && (
        <View pointerEvents="box-none" style={[st.actions, { right: pad.right, bottom: pad.bottom }]}>
          <View style={st.abilities} pointerEvents="box-none">
            {[0, 1, 2].map((i) => {
              const a = me.abilities[i];
              const def = a ? ABILITIES[a.id] : null;
              return (
                <Slot
                  key={i}
                  size={58}
                  label={def ? def.short : "vazio"}
                  level={a?.level}
                  readyInMs={a?.readyInMs ?? 0}
                  cooldownMs={a?.cooldownMs ?? 1}
                  color={def?.color}
                  onPress={() => engine.current?.useAbility(i)}
                />
              );
            })}
          </View>
          <View style={st.fireRow} pointerEvents="box-none">
            <Slot size={58} label="Esquiva" readyInMs={me.dodgeInMs} cooldownMs={BALANCE.dodgeCooldownMs} color="#fff" onPress={() => engine.current?.dodge()} />
            <HoldButton
              size={92}
              label="Atirar"
              sub="segure / mire"
              color="rgba(255,90,61,0.82)"
              onDown={() => engine.current?.setFiring(true)}
              onUp={() => engine.current?.setFiring(false)}
              onMove={(dx, dy) => engine.current?.look(dx, dy)}
            />
          </View>
        </View>
      )}

      {me?.options && (
        <Evolution options={me.options} msLeft={me.optionsInMs} pending={me.pendingLevels} abilities={me.abilities} onPick={(i) => engine.current?.chooseEvolution(i)} />
      )}

      {snap.phase === "countdown" && (
        <View style={hud.center} pointerEvents="none">
          <Text style={hud.count}>{Math.max(1, Math.ceil(snap.countdownMs / 1000))}</Text>
        </View>
      )}

      {self && !self.alive && me && (
        <View style={hud.center} pointerEvents="none">
          <Panel style={st.death}>
            <Text style={hud.h2}>Você foi demitido!</Text>
            <Text style={hud.bold}>Recontratação em {Math.ceil(me.respawnInMs / 1000)} s</Text>
          </Panel>
        </View>
      )}

      {scoreboard && <Scoreboard snap={snap} myId={myId} />}
    </View>
  );
}

const st = StyleSheet.create({
  cross: { position: "absolute", left: "50%", top: "50%", width: 24, height: 24, marginLeft: -12, marginTop: -12 },
  crossV: { position: "absolute", left: 10, top: 0, width: 4, height: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.6)" },
  crossH: { position: "absolute", top: 10, left: 0, height: 4, width: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.6)" },
  top: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 6 },
  zone: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, maxWidth: "54%" },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: C.postit,
  },
  board: { position: "absolute", width: 176 },
  boardRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  status: { position: "absolute", left: "28%", right: "38%", minWidth: 230 },
  statusName: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 },
  lvlBadge: { backgroundColor: C.postit, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 3 },
  lvlText: { fontFamily: F.monoBold, fontSize: 11, color: C.ink },
  hpBar: { height: 18, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden", justifyContent: "center" },
  hpFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  shFill: { position: "absolute", left: 0, top: 0, height: 5, backgroundColor: "rgba(123,140,255,0.85)" },
  hpText: { fontFamily: F.monoBold, fontSize: 11, color: "#fff", textAlign: "center", textShadowColor: "#000", textShadowRadius: 2 },
  xpBar: { height: 6, marginTop: 5, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" },
  effects: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  fx: { fontFamily: F.mono, fontSize: 10, color: C.hudInk, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  fxSyn: { backgroundColor: "rgba(255,225,77,0.25)", color: C.postit },
  actions: { position: "absolute", alignItems: "flex-end", gap: 10 },
  abilities: { flexDirection: "row", gap: 10, marginRight: 30 },
  fireRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  slot: { backgroundColor: C.hudBg, borderWidth: 2, alignItems: "center", justifyContent: "center", padding: 4 },
  slotLabel: { fontFamily: F.bold, fontSize: 11, color: C.hudInk, textAlign: "center" },
  slotLv: { position: "absolute", bottom: 3, right: 8, fontFamily: F.monoBold, fontSize: 10, color: C.postit },
  slotOverlay: { overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  slotCd: { position: "absolute", fontFamily: F.monoBold, fontSize: 18, color: "#fff", textShadowColor: "#000", textShadowRadius: 3 },
  evo: { position: "absolute", left: "7%", right: "7%", top: "14%", alignItems: "center", gap: 8 },
  evoTitle: { fontFamily: F.black, fontSize: 18, color: C.hudInk, textShadowColor: "#000", textShadowRadius: 4, textAlign: "center" },
  evoCards: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  evoCard: { flex: 1, backgroundColor: C.card, borderWidth: 2, borderColor: C.ink, padding: 10, borderRadius: 4, boxShadow: "4px 4px 0px rgba(0,0,0,0.6)" },
  evoKey: {
    position: "absolute",
    top: 8,
    right: 8,
    fontFamily: F.monoBold,
    fontSize: 12,
    color: C.ink,
    borderWidth: 1.5,
    borderColor: C.ink,
    paddingHorizontal: 5,
  },
  evoType: { fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8, color: C.ink2, textTransform: "uppercase", paddingRight: 24 },
  evoT: { fontFamily: F.black, fontSize: 15, color: C.ink, marginVertical: 3, paddingRight: 22 },
  evoD: { fontFamily: F.medium, fontSize: 12, color: C.ink2, lineHeight: 16 },
  evoLv: { fontFamily: F.monoBold, fontSize: 11, color: C.blue, marginTop: 5 },
  evoTimer: { height: 5, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  death: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 18, borderColor: C.red, backgroundColor: "rgba(20,18,15,0.84)" },
  scoreWrap: { ...fill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  scoreActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 4 },
});

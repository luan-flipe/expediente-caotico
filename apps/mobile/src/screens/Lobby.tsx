import { useState } from "react";
import { Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { BALANCE, BOT_LEVEL_NAMES, BOT_LEVELS, DEFAULT_ROOM_OPTIONS, DURATIONS_MS, LAPS_MAX, LAPS_MIN, RACE, TRACK_IDS, TRACKS, type GameMode } from "@ec/shared";
import { leaveRoom, net, setState, useStore } from "../store";
import { Thumb } from "../ui/Badge";
import { Brand, Btn, Card, ErrorBox, Label, Muted, Row, Screen, Seg, Stack, Tag, useWide } from "../ui/kit";
import { C, F, hardShadow } from "../ui/theme";

const MODES: GameMode[] = ["shooter", "race", "timetrial"];
const MODE_NAMES = ["Tiroteio", "Rally da Firma", "Contra o relógio"];
const LAPS = Array.from({ length: LAPS_MAX - LAPS_MIN + 1 }, (_, i) => LAPS_MIN + i);

export function Lobby() {
  const lobby = useStore((st) => st.lobby)!;
  const myId = useStore((st) => st.myId);
  const error = useStore((st) => st.error);
  const online = useStore((st) => st.online);
  const server = useStore((st) => st.server);
  const [copied, setCopied] = useState(false);
  const wide = useWide();
  const { width } = useWindowDimensions();
  const isHost = lobby.hostId === myId;
  const me = lobby.players.find((p) => p.id === myId);
  const bots = lobby.players.filter((p) => p.isBot).length;
  const full = lobby.players.length >= BALANCE.maxPlayers;
  const race = lobby.mode === "race";
  const trial = lobby.mode === "timetrial";
  const racing = race || trial;
  const opts = lobby.options ?? DEFAULT_ROOM_OPTIONS;
  const [rosterW, setRosterW] = useState(0);
  const cols = width >= 1000 ? 4 : width >= 560 ? 3 : 2;
  const slotW = Math.floor((rosterW - 14 * (cols - 1)) / cols);
  const webLink = `${server}/?sala=${lobby.code}`;

  const copy = async () => {
    await Clipboard.setStringAsync(webLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const invite = () => {
    const appLink = Linking.createURL("/", { queryParams: { sala: lobby.code } });
    void Share.share({
      message: `Bora pro Expediente Caótico! Código da sala: ${lobby.code}\nWeb: ${webLink}\nApp: ${appLink}`,
    });
  };

  return (
    <Screen>
      <View style={[st.head, wide && { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }]}>
        <Brand title="Sala de" hl="espera" />
        <View style={[st.postit, hardShadow()]}>
          <Label color={C.ink}>Código da sala</Label>
          <Text style={st.code}>{lobby.code}</Text>
          <Row>
            <Btn small title={copied ? "Link copiado" : "Copiar link de convite"} onPress={copy} />
            <Btn small title="Convidar" onPress={invite} />
          </Row>
        </View>
      </View>

      {error && <ErrorBox>{error}</ErrorBox>}
      {!online && <ErrorBox>Reconectando ao servidor...</ErrorBox>}

      <View>
        <Label>
          Participantes {lobby.players.length}/{BALANCE.maxPlayers}
        </Label>
        <View style={st.roster} onLayout={(e) => setRosterW(e.nativeEvent.layout.width)}>
          {rosterW > 0 &&
            lobby.players.map((p) => (
              <View key={p.id} style={[st.slot, hardShadow(3), { width: slotW }]}>
                <Thumb dna={p.avatar} chair={racing ? p.chair : undefined} size={slotW - 4} />
                {p.id === lobby.hostId && (
                  <View style={st.hostTag}>
                    <Tag kind="host">ANFITRIÃO</Tag>
                  </View>
                )}
                <View style={st.who}>
                  <Text style={st.whoName} numberOfLines={1}>
                    {p.name}
                    {p.id === myId ? " (você)" : ""}
                  </Text>
                  {!p.connected ? <Tag kind="off">CAIU</Tag> : p.isBot ? <Tag>BOT</Tag> : p.ready ? <Tag kind="ok">PRONTO</Tag> : <Tag>...</Tag>}
                </View>
              </View>
            ))}
          {rosterW > 0 &&
            Array.from({ length: BALANCE.maxPlayers - lobby.players.length }, (_, i) => (
              <View key={`e${i}`} style={[st.slot, st.empty, { width: slotW, height: slotW * 0.6 }]}>
                <Text style={st.emptyText}>vaga livre</Text>
              </View>
            ))}
        </View>
      </View>

      <View style={[{ gap: 18 }, wide && { flexDirection: "row", alignItems: "flex-start" }]}>
        <Card style={wide && { flex: 1 }}>
          <Stack gap={12}>
            <Label>Você</Label>
            <Row>
              {!isHost && (
                <Btn
                  kind={me?.ready ? "default" : "primary"}
                  title={me?.ready ? "Cancelar pronto" : "Estou pronto"}
                  onPress={() => net.send({ t: "ready", ready: !me?.ready })}
                />
              )}
              <Btn title={racing ? "Editar boneco e cadeira" : "Editar boneco"} onPress={() => setState({ editing: true })} />
              <Btn title="Sair da sala" onPress={leaveRoom} />
            </Row>
          </Stack>
        </Card>

        <Card style={wide && { flex: 1 }}>
          <Stack gap={12}>
            <Label>{isHost ? "Controle do anfitrião" : "Configuração da partida"}</Label>
            <Row>
              <Muted>Modo:</Muted>
              <Seg items={MODE_NAMES} value={MODES.indexOf(lobby.mode)} disabled={!isHost} onPick={(i) => net.send({ t: "mode", mode: MODES[i] })} />
            </Row>
            {racing && (
              <Row>
                <Muted>Pista:</Muted>
                <Seg items={TRACK_IDS.map((id) => TRACKS[id].name)} value={TRACK_IDS.indexOf(opts.track)} disabled={!isHost} onPick={(i) => net.send({ t: "options", track: TRACK_IDS[i] })} />
              </Row>
            )}
            {race && (
              <>
                <Row>
                  <Muted>Voltas:</Muted>
                  <Seg items={LAPS.map(String)} value={LAPS.indexOf(opts.laps)} disabled={!isHost} onPick={(i) => net.send({ t: "options", laps: LAPS[i] })} />
                </Row>
                <Row>
                  <Muted>Itens:</Muted>
                  <Seg items={["Com itens", "Sem itens"]} value={opts.items ? 0 : 1} disabled={!isHost} onPick={(i) => net.send({ t: "options", items: i === 0 })} />
                </Row>
                <Muted>
                  Corrida de cadeiras: {opts.laps} {opts.laps === 1 ? "volta" : "voltas"} no {TRACKS[opts.track].name}, até {RACE.maxPlayers} pilotos.
                </Muted>
              </>
            )}
            {trial && <Muted>Treino de volta rápida, sem itens nem bots. O anfitrião encerra quando quiser.</Muted>}
            {!trial && (
              <Row>
                <Muted>Bots:</Muted>
                <Seg items={BOT_LEVELS.map((l) => BOT_LEVEL_NAMES[l])} value={BOT_LEVELS.indexOf(opts.botLevel)} disabled={!isHost} onPick={(i) => net.send({ t: "options", botLevel: BOT_LEVELS[i] })} />
              </Row>
            )}
            {!racing && (
              <Row>
                <Muted>Duração:</Muted>
                <Seg
                  items={DURATIONS_MS.map((ms) => `${ms / 60000} min`)}
                  value={DURATIONS_MS.indexOf(lobby.durationMs as (typeof DURATIONS_MS)[number])}
                  disabled={!isHost}
                  onPick={(i) => net.send({ t: "duration", ms: DURATIONS_MS[i] })}
                />
              </Row>
            )}
            {isHost ? (
              <>
                {!trial && (
                  <Row>
                    <Btn small title="+ Bot estagiário" disabled={full} onPress={() => net.send({ t: "addBot" })} />
                    <Btn small title="- Bot" disabled={bots === 0} onPress={() => net.send({ t: "removeBot" })} />
                  </Row>
                )}
                <Btn kind="primary" title={race ? "Iniciar corrida" : trial ? "Iniciar treino" : "Iniciar expediente"} onPress={() => net.send({ t: "start" })} />
              </>
            ) : (
              <Muted>O anfitrião inicia quando todos estiverem prontos.</Muted>
            )}
          </Stack>
        </Card>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { gap: 16 },
  postit: { backgroundColor: C.postit, borderWidth: 2, borderColor: C.ink, paddingVertical: 16, paddingHorizontal: 20, transform: [{ rotate: "-1deg" }], alignSelf: "flex-start" },
  code: { fontFamily: F.monoBold, fontSize: 40, letterSpacing: 10, color: C.ink, marginBottom: 10 },
  roster: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  slot: { backgroundColor: C.card, borderWidth: 2, borderColor: C.ink, overflow: "hidden" },
  hostTag: { position: "absolute", top: 8, left: 8 },
  who: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 2, borderColor: C.ink },
  whoName: { fontFamily: F.bold, fontSize: 15, color: C.ink, flexShrink: 1 },
  empty: { borderStyle: "dashed", backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },
  emptyText: { fontFamily: F.mono, fontSize: 12, color: C.ink2 },
});

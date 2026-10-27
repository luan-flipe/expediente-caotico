import { StyleSheet, Text, View } from "react-native";
import { ITEM_NAMES } from "@ec/shared";
import { leaveRoom, net, useStore } from "../store";
import { Thumb } from "../ui/Badge";
import { Brand, Btn, Card, Muted, Row, Screen, Tag } from "../ui/kit";
import { Table } from "../ui/Table";
import { C, F, hardShadow } from "../ui/theme";
import { fmtRace, ITEM_ICON } from "./format";

const STEP_H = { 1: 110, 2: 80, 3: 56 } as Record<number, number>;

export function RaceResults() {
  const rows = useStore((st) => st.raceResults)!;
  const lobby = useStore((st) => st.lobby);
  const myId = useStore((st) => st.myId);
  const isHost = lobby?.hostId === myId;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);

  return (
    <Screen>
      <Brand title="Rally da" hl="Firma" />
      <View style={st.podium}>
        {podium.map((r) => (
          <View key={r.id} style={st.step}>
            <Thumb dna={r.avatar} chair={r.chair} size={r.place === 1 ? 124 : 98} style={{ backgroundColor: "transparent" }} />
            <Text style={st.who} numberOfLines={1}>
              {r.name}
            </Text>
            <View style={[st.block, hardShadow(), { height: STEP_H[r.place] ?? 56, backgroundColor: r.place === 1 ? C.postit : C.paper2 }]}>
              <Text style={st.place}>{r.place}º</Text>
            </View>
          </View>
        ))}
      </View>
      <Card>
        <Table
          cols={[
            { title: "#", width: 34, num: true },
            { title: "Piloto", width: 210 },
            { title: "Tempo", width: 92, num: true },
            { title: "Melhor volta", width: 104, num: true },
            { title: "Item favorito", width: 200 },
          ]}
          rows={rows.map((r) => ({
            key: r.id,
            me: r.id === myId,
            cells: [
              r.place,
              <View key="who" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Thumb dna={r.avatar} chair={r.chair} size={36} style={{ borderWidth: 1.5, borderColor: C.ink }} />
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink, flexShrink: 1 }}>{r.name}</Text>
                {r.isBot && <Tag>BOT</Tag>}
              </View>,
              r.totalMs !== null ? fmtRace(r.totalMs) : `${r.lapsDone} volta${r.lapsDone === 1 ? "" : "s"}`,
              fmtRace(r.bestLapMs),
              r.favItem ? `${ITEM_ICON[r.favItem]} ${ITEM_NAMES[r.favItem]}` : "Nenhum",
            ],
          }))}
        />
        <Row style={{ marginTop: 16, justifyContent: "space-between" }}>
          {isHost ? (
            <Btn kind="primary" title="Voltar ao lobby" onPress={() => net.send({ t: "lobby" })} />
          ) : (
            <Muted>Aguardando o anfitrião voltar ao lobby.</Muted>
          )}
          <Btn title="Sair da sala" onPress={leaveRoom} />
        </Row>
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  podium: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 12, marginVertical: 8 },
  step: { alignItems: "center", flex: 1, maxWidth: 160 },
  who: { fontFamily: F.black, fontSize: 15, color: C.ink, marginVertical: 6, maxWidth: "100%" },
  block: { width: "100%", borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center" },
  place: { fontFamily: F.black, fontSize: 32, color: C.ink },
});

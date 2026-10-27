import { Text, View } from "react-native";
import { ABILITIES } from "@ec/shared";
import { leaveRoom, net, useStore } from "../store";
import { Badge, Thumb } from "../ui/Badge";
import { Brand, Btn, Card, ChipTag, Columns, Muted, Row, Screen } from "../ui/kit";
import { Table } from "../ui/Table";
import { C, F } from "../ui/theme";

export function Results() {
  const rows = useStore((st) => st.results)!;
  const lobby = useStore((st) => st.lobby);
  const myId = useStore((st) => st.myId);
  const isHost = lobby?.hostId === myId;
  const winner = rows[0];
  const tie = winner?.tie;

  return (
    <Screen>
      <Brand title="Fim do" hl="expediente" />
      <Columns
        left={
          winner && (
            <Badge
              left={tie ? "EMPATE" : "FUNCIONÁRIO DO MÊS"}
              right={`${winner.score} PTS`}
              dna={winner.avatar}
              name={tie ? rows.filter((r) => r.rank === 1).map((r) => r.name).join(" e ") : winner.name}
            />
          )
        }
        right={
          <Card>
            <Table
              cols={[
                { title: "#", width: 34, num: true },
                { title: "Funcionário", width: 260 },
                { title: "Pts", width: 56, num: true },
                { title: "Elim.", width: 56, num: true },
                { title: "Assist.", width: 64, num: true },
                { title: "Mortes", width: 64, num: true },
              ]}
              rows={rows.map((r) => ({
                key: r.id,
                me: r.id === myId,
                cells: [
                  r.rank,
                  <View key="who" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Thumb dna={r.avatar} size={36} style={{ borderWidth: 1.5, borderColor: C.ink }} />
                    <View style={{ flexShrink: 1, gap: 3 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{r.name}</Text>
                      {r.abilities.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          {r.abilities.map((a) => (
                            <ChipTag key={a.id}>
                              {ABILITIES[a.id].name} {a.level}
                              {a.spec ? ` · ${(a.spec === "A" ? ABILITIES[a.id].specA : ABILITIES[a.id].specB).name}` : ""}
                            </ChipTag>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>,
                  r.score,
                  r.kills,
                  r.assists,
                  r.deaths,
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
        }
      />
    </Screen>
  );
}

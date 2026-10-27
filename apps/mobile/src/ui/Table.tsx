import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { C, F } from "./theme";

export interface Col {
  title: string;
  width: number;
  num?: boolean;
}

/** Tabela de resultados com colunas de largura fixa; rola de lado em tela estreita. */
export function Table({ cols, rows, dark }: { cols: Col[]; rows: { key: string; me?: boolean; cells: ReactNode[] }[]; dark?: boolean }) {
  const ink = dark ? C.hudInk : C.ink;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={[st.row, { borderBottomWidth: 2, borderColor: dark ? C.hudLine : C.ink }]}>
          {cols.map((c) => (
            <Text key={c.title} style={[st.th, { width: c.width, color: dark ? "#cfc8b8" : C.ink2 }, c.num && st.num]}>
              {c.title}
            </Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.key} style={[st.row, { borderColor: dark ? C.hudLine : C.paper2 }, r.me && { backgroundColor: dark ? "rgba(255,225,77,0.14)" : "#fff6c2" }]}>
            {r.cells.map((cell, i) => (
              <View key={cols[i].title} style={[st.td, { width: cols[i].width }, cols[i].num && { alignItems: "flex-end" }]}>
                {typeof cell === "string" || typeof cell === "number" ? <Text style={[st.text, { color: r.me && dark ? C.postit : ink }, cols[i].num && st.mono]}>{cell}</Text> : cell}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  th: { fontFamily: F.mono, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", paddingVertical: 8, paddingHorizontal: 6 },
  num: { textAlign: "right" },
  td: { paddingVertical: 8, paddingHorizontal: 6 },
  text: { fontFamily: F.medium, fontSize: 15 },
  mono: { fontFamily: F.mono },
});

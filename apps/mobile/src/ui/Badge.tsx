import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import type { AvatarDNA, ChairDNA } from "@ec/shared";
import { useThumbnail } from "../three/thumbs";
import { AvatarPreview } from "./AvatarPreview";
import { C, F, hardShadow } from "./theme";

/** Crachá: faixa azul, prévia 3D do boneco e nome. */
export function Badge({
  left,
  right,
  dna,
  chair,
  name,
  children,
  height = 280,
}: {
  left: string;
  right: string;
  dna: AvatarDNA;
  chair?: ChairDNA;
  name: string;
  children?: ReactNode;
  height?: number;
}) {
  return (
    <View style={[st.badge, hardShadow()]}>
      <View style={st.top}>
        <Text style={st.topText}>{left}</Text>
        <Text style={st.topText}>{right}</Text>
      </View>
      <AvatarPreview dna={dna} chair={chair} style={[st.preview, { height }]} />
      <Text style={st.name} numberOfLines={2}>
        {name}
      </Text>
      {children ? <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View> : null}
    </View>
  );
}

/** Miniatura renderizada do boneco (ou dele na cadeira); iniciais enquanto renderiza. */
export function Thumb({ dna, chair, size, style }: { dna: AvatarDNA; chair?: ChairDNA; size: number; style?: StyleProp<ViewStyle> }) {
  const uri = useThumbnail(dna, chair, Math.round(size * 2));
  return (
    <View style={[{ width: size, height: size, backgroundColor: C.paper2, alignItems: "center", justifyContent: "center" }, style]}>
      {uri ? (
        <Image source={{ uri }} contentFit="contain" transition={150} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontFamily: F.black, fontSize: size * 0.32, color: C.ink2 }}>{dna.name.slice(0, 2).toUpperCase()}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  badge: { backgroundColor: C.card, borderWidth: 2, borderColor: C.ink, overflow: "hidden" },
  top: { backgroundColor: C.blue, flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 14 },
  topText: { color: "#fff", fontFamily: F.mono, fontSize: 12, letterSpacing: 1.4 },
  preview: { width: "100%" },
  name: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontSize: 26,
    fontFamily: F.black,
    color: C.ink,
    letterSpacing: -0.5,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: C.ink2,
  },
});

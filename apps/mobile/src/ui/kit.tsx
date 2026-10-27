import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { C, F, hardShadow } from "./theme";

/** Telas de menu: papel de fundo, rolagem e margem das áreas seguras. */
export function Screen({ children }: { children: ReactNode }) {
  const inset = useSafeAreaInsets();
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: inset.top + 20, paddingBottom: inset.bottom + 40, paddingLeft: inset.left + 18, paddingRight: inset.right + 18 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.wrap}>{children}</View>
    </ScrollView>
  );
}

/** Duas colunas em tela larga (tablet ou celular deitado), uma coluna no celular em pé. */
export function useWide(): boolean {
  return useWindowDimensions().width >= 720;
}

export function Columns({ left, right, leftWidth = 340 }: { left: ReactNode; right: ReactNode; leftWidth?: number }) {
  const wide = useWide();
  return (
    <View style={[s.cols, wide && s.colsWide]}>
      <View style={wide ? { width: leftWidth } : undefined}>{left}</View>
      <View style={wide ? { flex: 1 } : undefined}>{right}</View>
    </View>
  );
}

/** Título com a palavra de destaque num post-it inclinado. */
export function Brand({ title, hl }: { title: string; hl: string }) {
  return (
    <View style={s.brand}>
      <Text style={s.brandText}>{title} </Text>
      <View style={s.brandHl}>
        <Text style={s.brandText}>{hl}</Text>
      </View>
    </View>
  );
}

type BtnKind = "default" | "primary" | "dark";

export function Btn({ title, onPress, kind = "default", small, disabled, style }: { title: string; onPress: () => void; kind?: BtnKind; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        kind === "primary" && { backgroundColor: C.postit },
        kind === "dark" && { backgroundColor: C.ink },
        pressed ? s.btnPressed : hardShadow(3),
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 14 }, kind === "dark" && { color: C.paper }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, hardShadow(), style]}>{children}</View>;
}

export function Label({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[s.label, color ? { color } : null]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export function Field({ code, ...props }: TextInputProps & { code?: boolean }) {
  return <TextInput placeholderTextColor="#a39c90" autoCorrect={false} {...props} style={[s.field, code && s.fieldCode]} />;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <View style={s.error}>
      <Text style={s.errorText}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function Stack({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

/** Botões de escolha única (modo, duração, opções do crachá). */
export function Seg({ items, value, onPick, disabled }: { items: readonly string[]; value: number; onPick: (i: number) => void; disabled?: boolean }) {
  return (
    <View style={s.seg}>
      {items.map((t, i) => (
        <Pressable
          key={t}
          disabled={disabled}
          onPress={() => {
            void Haptics.selectionAsync();
            onPick(i);
          }}
          style={[s.segBtn, i === value && { backgroundColor: C.ink }, disabled && i !== value && { opacity: 0.5 }]}
        >
          <Text style={[s.segText, i === value && { color: C.paper }]}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Swatches({ colors, value, onPick }: { colors: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <View style={s.seg}>
      {colors.map((c, i) => (
        <Pressable
          key={c}
          accessibilityLabel={c}
          onPress={() => {
            void Haptics.selectionAsync();
            onPick(i);
          }}
          style={[s.swatch, { backgroundColor: c }, i === value && s.swatchOn]}
        />
      ))}
    </View>
  );
}

export function Tag({ children, kind }: { children: ReactNode; kind?: "ok" | "off" | "host" }) {
  const bg = kind === "ok" ? C.green : kind === "off" ? C.red : kind === "host" ? C.postit : "#fff";
  const color = kind === "ok" || kind === "off" ? "#fff" : C.ink;
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, { color }]}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  wrap: { width: "100%", maxWidth: 1080, alignSelf: "center", gap: 18 },
  cols: { gap: 22 },
  colsWide: { flexDirection: "row", alignItems: "flex-start" },
  brand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, marginBottom: 4 },
  brandText: { fontFamily: F.black, fontSize: 44, lineHeight: 48, color: C.ink, letterSpacing: -1.5 },
  brandHl: { backgroundColor: C.postit, paddingHorizontal: 10, transform: [{ rotate: "-1.5deg" }], ...hardShadow() },
  btn: { borderWidth: 2, borderColor: C.ink, backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10 },
  btnPressed: { transform: [{ translateX: 2 }, { translateY: 2 }], boxShadow: `1px 1px 0px ${C.ink}` },
  btnText: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  card: { backgroundColor: C.card, borderWidth: 2, borderColor: C.ink, padding: 18 },
  label: { fontFamily: F.mono, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.ink2, marginBottom: 8 },
  muted: { fontFamily: F.medium, color: C.ink2, fontSize: 15, lineHeight: 21 },
  field: { borderWidth: 2, borderColor: C.ink, backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 14, fontSize: 18, fontFamily: F.medium, color: C.ink },
  fieldCode: { fontFamily: F.monoBold, letterSpacing: 6, textTransform: "uppercase" },
  error: { backgroundColor: C.red, borderWidth: 2, borderColor: C.ink, paddingVertical: 10, paddingHorizontal: 14 },
  errorText: { color: "#fff", fontFamily: F.bold, fontSize: 15 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segBtn: { borderWidth: 2, borderColor: C.ink, backgroundColor: "#fff", paddingVertical: 7, paddingHorizontal: 10 },
  segText: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  swatch: { width: 34, height: 34, borderWidth: 2, borderColor: C.ink },
  swatchOn: { outlineWidth: 3, outlineColor: C.postit, outlineOffset: 1, outlineStyle: "solid", transform: [{ scale: 1.1 }] },
  tag: { borderWidth: 1.5, borderColor: C.ink, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8 },
});

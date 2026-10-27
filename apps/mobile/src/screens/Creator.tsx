import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ACCESSORIES,
  CHAIR_BACKS,
  CHAIR_BASES,
  CHAIR_SEATS,
  CHAIR_TRINKETS,
  CHAIR_WHEELS,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEIGHTS,
  PANTS,
  PRESETS,
  SHIRTS,
  SKINS,
  randomAvatar,
  randomChair,
  type AvatarDNA,
  type ChairDNA,
} from "@ec/shared";
import { saveAvatar, saveChair, setState, useStore } from "../store";
import { Badge, Thumb } from "../ui/Badge";
import { Brand, Btn, Card, Columns, Field, Label, Muted, Row, RuledPaper, Screen, Seg, Stack, Swatches, useWide } from "../ui/kit";
import { C } from "../ui/theme";

type NumKey = "skin" | "hair" | "hairColor" | "glasses" | "shirt" | "pants" | "accessory" | "height";

function sameVisualDna(a: AvatarDNA, b: AvatarDNA): boolean {
  return (
    a.skin === b.skin &&
    a.hair === b.hair &&
    a.hairColor === b.hairColor &&
    a.glasses === b.glasses &&
    a.beard === b.beard &&
    a.shirt === b.shirt &&
    a.pants === b.pants &&
    a.accessory === b.accessory &&
    a.height === b.height
  );
}

function Opt({ label, half, children }: { label: string; half?: boolean; children: ReactNode }) {
  return (
    <View style={half ? st.optHalf : st.optFull}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

export function Creator() {
  const saved = useStore((st) => st.avatar);
  const savedChair = useStore((st) => st.chair);
  const mode = useStore((st) => st.lobby?.mode);
  const [dna, setDna] = useState<AvatarDNA>(saved);
  const [chair, setChair] = useState<ChairDNA>(savedChair);
  const [tab, setTab] = useState(mode === "race" ? 1 : 0);
  const wide = useWide();
  const { width } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const twoCol = width >= 540;
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const setC = (k: keyof ChairDNA) => (i: number) => setChair((c) => ({ ...c, [k]: i }));

  const done = () => {
    saveChair(chair);
    saveAvatar(dna);
    setState({ editing: false });
  };

  const randomize = () => {
    setDna((d) => randomAvatar(Math.random, d.name));
    setChair(randomChair(Math.random));
  };

  const optionsContent =
    tab === 1 ? (
      <Stack>
        <Card>
          <View style={st.grid}>
            <Opt label="Estofado">
              <Swatches colors={CHAIR_SEATS} value={chair.seat} onPick={setC("seat")} />
            </Opt>
            <Opt label="Base">
              <Swatches colors={CHAIR_BASES} value={chair.base} onPick={setC("base")} />
            </Opt>
            <Opt label="Rodas" half={twoCol}>
              <Seg items={CHAIR_WHEELS} value={chair.wheels} onPick={setC("wheels")} />
            </Opt>
            <Opt label="Encosto" half={twoCol}>
              <Seg items={CHAIR_BACKS} value={chair.back} onPick={setC("back")} />
            </Opt>
            <Opt label="Enfeite">
              <Seg items={CHAIR_TRINKETS} value={chair.trinket} onPick={setC("trinket")} />
            </Opt>
          </View>
        </Card>
        <Card>
          <Muted>Todas as cadeiras andam igual. Aqui é só estilo: quem ganha é quem pilota melhor.</Muted>
        </Card>
      </Stack>
    ) : (
      <Stack>
        <Card>
          <Label>Nome</Label>
          <Field value={dna.name} maxLength={16} onChangeText={(name) => setDna((d) => ({ ...d, name }))} />
        </Card>
        <Card>
          <View style={st.grid}>
            <Opt label="Pele" half={twoCol}>
              <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
            </Opt>
            <Opt label="Cor do cabelo" half={twoCol}>
              <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
            </Opt>
            <Opt label="Cabelo">
              <Seg items={HAIR_STYLES} value={dna.hair} onPick={set("hair")} />
            </Opt>
            <Opt label="Camisa" half={twoCol}>
              <Swatches colors={SHIRTS} value={dna.shirt} onPick={set("shirt")} />
            </Opt>
            <Opt label="Calça" half={twoCol}>
              <Swatches colors={PANTS} value={dna.pants} onPick={set("pants")} />
            </Opt>
            <Opt label="Óculos" half={twoCol}>
              <Seg items={GLASSES} value={dna.glasses} onPick={set("glasses")} />
            </Opt>
            <Opt label="Barba" half={twoCol}>
              <Seg items={["Sem barba", "Com barba"]} value={dna.beard ? 1 : 0} onPick={(i) => setDna((d) => ({ ...d, beard: i === 1 }))} />
            </Opt>
            <Opt label="Acessório" half={twoCol}>
              <Seg items={ACCESSORIES} value={dna.accessory} onPick={set("accessory")} />
            </Opt>
            <Opt label="Altura" half={twoCol}>
              <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
            </Opt>
          </View>
        </Card>
        <Card>
          <Label>Começar de um funcionário pronto</Label>
          <View style={st.presets}>
            {PRESETS.map((p) => {
              const active = sameVisualDna(dna, p.dna);
              return (
                <Pressable
                  key={p.id}
                  accessibilityLabel={p.id}
                  style={[st.preset, active && st.presetOn]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setDna({ ...p.dna, name: dna.name });
                  }}
                >
                  <Thumb dna={p.dna} size={68} />
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Stack>
    );

  // Tablet / paisagem: duas colunas lado a lado igual à web
  if (wide) {
    return (
      <Screen>
        <Row style={{ justifyContent: "space-between" }}>
          <Brand title="Seu" hl="crachá" />
          <Seg items={["Boneco", "Cadeira"]} value={tab} onPick={setTab} />
        </Row>
        <Columns
          left={
            <Stack>
              <Badge left="CRACHÁ" right="ARRASTE PARA GIRAR" dna={dna} chair={tab === 1 ? chair : undefined} name={dna.name} height={300} />
              <Row>
                <Btn kind="primary" title="Salvar" onPress={done} />
                <Btn title="Aleatório" onPress={randomize} />
                <Btn title="Cancelar" onPress={() => setState({ editing: false })} />
              </Row>
            </Stack>
          }
          right={optionsContent}
        />
      </Screen>
    );
  }

  // Celular em pé: crachá fixo no topo para ver cada troca ao vivo enquanto rola as opções embaixo
  return (
    <KeyboardAvoidingView style={st.portraitRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <RuledPaper />
      <View
        style={[
          st.pinned,
          {
            paddingTop: inset.top + 12,
            paddingLeft: inset.left + 16,
            paddingRight: inset.right + 16,
          },
        ]}
      >
        <Row style={{ justifyContent: "space-between" }}>
          <Brand title="Seu" hl="crachá" />
          <Seg items={["Boneco", "Cadeira"]} value={tab} onPick={setTab} />
        </Row>
        <Badge left="CRACHÁ" right="ARRASTE PARA GIRAR" dna={dna} chair={tab === 1 ? chair : undefined} name={dna.name} height={176} />
        <Row>
          <Btn small kind="primary" title="Salvar" onPress={done} />
          <Btn small title="Aleatório" onPress={randomize} />
          <Btn small title="Cancelar" onPress={() => setState({ editing: false })} />
        </Row>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: inset.bottom + 36,
          paddingLeft: inset.left + 16,
          paddingRight: inset.right + 16,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {optionsContent}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  portraitRoot: { flex: 1, backgroundColor: C.paper },
  pinned: { gap: 10, paddingBottom: 12, borderBottomWidth: 2, borderColor: C.ink, backgroundColor: C.paper },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 18, columnGap: 20 },
  optFull: { width: "100%" },
  optHalf: { flexGrow: 1, flexBasis: 210 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { borderWidth: 2, borderColor: C.ink, backgroundColor: "#fff" },
  presetOn: { outlineWidth: 3, outlineColor: C.postit, outlineOffset: 1, outlineStyle: "solid", transform: [{ scale: 1.05 }] },
});

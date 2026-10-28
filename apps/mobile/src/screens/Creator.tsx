import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ACCESSORIES,
  BEARDS,
  BOTTOMS,
  CHAIR_BACKS,
  CHAIR_BASES,
  CHAIR_SEATS,
  CHAIR_TRINKETS,
  CHAIR_WHEELS,
  DRESS,
  EYE_COLORS,
  GLASSES,
  HAIR_COLORS,
  HAIR_ORDER,
  HAIR_STYLES,
  HEIGHTS,
  MODELS,
  PANTS,
  PRESETS,
  SHIRTS,
  SHOES,
  SKINS,
  TOPS,
  randomAvatar,
  randomChair,
  type AvatarDNA,
  type ChairDNA,
} from "@ec/shared";
import { saveAvatar, saveChair, setState, useStore } from "../store";
import { Badge, Thumb } from "../ui/Badge";
import { Brand, Btn, Card, Columns, Field, Label, Muted, Row, RuledPaper, Screen, Seg, Stack, Swatches, useWide } from "../ui/kit";
import { C } from "../ui/theme";

type NumKey = Exclude<keyof AvatarDNA, "name">;

const HAIR_ITEMS = HAIR_ORDER.map((i) => HAIR_STYLES[i]);

function sameVisualDna(a: AvatarDNA, b: AvatarDNA): boolean {
  return (Object.keys(a) as (keyof AvatarDNA)[]).every((k) => k === "name" || a[k] === b[k]);
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
  const [tab, setTab] = useState(mode === "race" || mode === "timetrial" ? 1 : 0);
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
    setDna((d) => ({ ...randomAvatar(Math.random, d.name), model: 0 }));
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
            <Opt label="Boneco">
              <Seg items={MODELS} value={dna.model} onPick={set("model")} />
            </Opt>
            <Opt label="Altura" half={twoCol}>
              <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
            </Opt>
            {dna.model !== 0 && (
              <Opt label="Skin pronta" half={twoCol}>
                <Muted>Personagem completo, do jeito que veio. Para escolher cada detalhe, use Montar o meu.</Muted>
              </Opt>
            )}
          </View>
        </Card>
        {dna.model === 0 && (
          <Card>
            <View style={st.grid}>
              <Opt label="Pele" half={twoCol}>
                <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
              </Opt>
              <Opt label="Cor dos olhos" half={twoCol}>
                <Swatches colors={EYE_COLORS} value={dna.eyes} onPick={set("eyes")} />
              </Opt>
              <Opt label="Corte">
                <Seg items={HAIR_ITEMS} value={HAIR_ORDER.indexOf(dna.hair)} onPick={(i) => set("hair")(HAIR_ORDER[i])} />
              </Opt>
              <Opt label="Cor do cabelo" half={twoCol}>
                <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
              </Opt>
              <Opt label="Barba" half={twoCol}>
                <Seg items={BEARDS} value={dna.beard} onPick={set("beard")} />
              </Opt>
              {dna.beard > 0 && (
                <Opt label="Cor da barba" half={twoCol}>
                  <Swatches colors={HAIR_COLORS} value={dna.beardColor} onPick={set("beardColor")} />
                </Opt>
              )}
              <Opt label="Óculos" half={twoCol}>
                <Seg items={GLASSES} value={dna.glasses} onPick={set("glasses")} />
              </Opt>
              <Opt label="Parte de cima">
                <Seg items={TOPS} value={dna.top} onPick={set("top")} />
              </Opt>
              <Opt label={dna.top === DRESS ? "Cor do vestido" : "Cor da parte de cima"} half={twoCol}>
                <Swatches colors={SHIRTS} value={dna.shirt} onPick={set("shirt")} />
              </Opt>
              {dna.top !== DRESS && (
                <>
                  <Opt label="Parte de baixo" half={twoCol}>
                    <Seg items={BOTTOMS} value={dna.bottom} onPick={set("bottom")} />
                  </Opt>
                  <Opt label="Cor da parte de baixo" half={twoCol}>
                    <Swatches colors={PANTS} value={dna.pants} onPick={set("pants")} />
                  </Opt>
                </>
              )}
              <Opt label="Calçado">
                <Seg items={SHOES} value={dna.shoes} onPick={set("shoes")} />
              </Opt>
              <Opt label="Acessório">
                <Seg items={ACCESSORIES} value={dna.accessory} onPick={set("accessory")} />
              </Opt>
            </View>
          </Card>
        )}
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

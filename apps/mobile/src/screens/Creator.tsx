import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { Brand, Btn, Card, Columns, Field, Label, Muted, Row, Screen, Seg, Stack, Swatches } from "../ui/kit";
import { C } from "../ui/theme";

type NumKey = "skin" | "hair" | "hairColor" | "glasses" | "shirt" | "pants" | "accessory" | "height";

function Opt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
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
  const set = (k: NumKey) => (i: number) => setDna((d) => ({ ...d, [k]: i }));
  const setC = (k: keyof ChairDNA) => (i: number) => setChair((c) => ({ ...c, [k]: i }));

  const done = () => {
    saveChair(chair);
    saveAvatar(dna);
    setState({ editing: false });
  };

  return (
    <Screen>
      <Brand title="Seu" hl="crachá" />
      <Seg items={["Boneco", "Cadeira"]} value={tab} onPick={setTab} />
      <Columns
        left={
          <Stack>
            <Badge left="CRACHÁ" right="ARRASTE PARA GIRAR" dna={dna} chair={tab === 1 ? chair : undefined} name={dna.name} height={300} />
            <Row>
              <Btn kind="primary" title="Salvar" onPress={done} />
              <Btn
                title="Aleatório"
                onPress={() => {
                  setDna((d) => randomAvatar(Math.random, d.name));
                  setChair(randomChair(Math.random));
                }}
              />
              <Btn title="Cancelar" onPress={() => setState({ editing: false })} />
            </Row>
          </Stack>
        }
        right={
          tab === 1 ? (
            <Stack>
              <Card>
                <Stack gap={18}>
                  <Opt label="Estofado">
                    <Swatches colors={CHAIR_SEATS} value={chair.seat} onPick={setC("seat")} />
                  </Opt>
                  <Opt label="Base">
                    <Swatches colors={CHAIR_BASES} value={chair.base} onPick={setC("base")} />
                  </Opt>
                  <Opt label="Rodas">
                    <Seg items={CHAIR_WHEELS} value={chair.wheels} onPick={setC("wheels")} />
                  </Opt>
                  <Opt label="Encosto">
                    <Seg items={CHAIR_BACKS} value={chair.back} onPick={setC("back")} />
                  </Opt>
                  <Opt label="Enfeite">
                    <Seg items={CHAIR_TRINKETS} value={chair.trinket} onPick={setC("trinket")} />
                  </Opt>
                </Stack>
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
                <Stack gap={18}>
                  <Opt label="Pele">
                    <Swatches colors={SKINS} value={dna.skin} onPick={set("skin")} />
                  </Opt>
                  <Opt label="Cor do cabelo">
                    <Swatches colors={HAIR_COLORS} value={dna.hairColor} onPick={set("hairColor")} />
                  </Opt>
                  <Opt label="Cabelo">
                    <Seg items={HAIR_STYLES} value={dna.hair} onPick={set("hair")} />
                  </Opt>
                  <Opt label="Camisa">
                    <Swatches colors={SHIRTS} value={dna.shirt} onPick={set("shirt")} />
                  </Opt>
                  <Opt label="Calça">
                    <Swatches colors={PANTS} value={dna.pants} onPick={set("pants")} />
                  </Opt>
                  <Opt label="Óculos">
                    <Seg items={GLASSES} value={dna.glasses} onPick={set("glasses")} />
                  </Opt>
                  <Opt label="Barba">
                    <Seg items={["Sem barba", "Com barba"]} value={dna.beard ? 1 : 0} onPick={(i) => setDna((d) => ({ ...d, beard: i === 1 }))} />
                  </Opt>
                  <Opt label="Acessório">
                    <Seg items={ACCESSORIES} value={dna.accessory} onPick={set("accessory")} />
                  </Opt>
                  <Opt label="Altura">
                    <Seg items={HEIGHTS} value={dna.height} onPick={set("height")} />
                  </Opt>
                </Stack>
              </Card>
              <Card>
                <Label>Começar de um funcionário pronto</Label>
                <View style={st.presets}>
                  {PRESETS.map((p) => (
                    <Pressable key={p.id} accessibilityLabel={p.id} style={st.preset} onPress={() => setDna({ ...p.dna, name: dna.name })}>
                      <Thumb dna={p.dna} size={68} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            </Stack>
          )
        }
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { borderWidth: 2, borderColor: C.ink, backgroundColor: "#fff" },
});

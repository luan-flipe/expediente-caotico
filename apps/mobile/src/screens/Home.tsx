import { useEffect, useState } from "react";
import { Text } from "react-native";
import { net, saveAvatar, saveServer, setState, useStore } from "../store";
import { Badge } from "../ui/Badge";
import { Brand, Btn, Card, Columns, ErrorBox, Field, Label, Muted, Row, Screen, Stack, s } from "../ui/kit";

export function Home({ initialCode }: { initialCode?: string }) {
  const avatar = useStore((st) => st.avatar);
  const chair = useStore((st) => st.chair);
  const error = useStore((st) => st.error);
  const server = useStore((st) => st.server);
  const [code, setCode] = useState(initialCode?.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) ?? "");
  const [name, setName] = useState(avatar.name);
  const [editServer, setEditServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(server);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    if (error) setBusy(null);
  }, [error]);

  const commitName = () => {
    const clean = name.trim() || avatar.name;
    const next = { ...avatar, name: clean };
    if (clean !== avatar.name) saveAvatar(next);
    return next;
  };

  const create = () => {
    if (busy) return;
    const nextAvatar = commitName();
    setBusy("create");
    setState({ error: null });
    net.ensure();
    net.send({ t: "create", name: nextAvatar.name, avatar: nextAvatar, chair });
  };

  const join = () => {
    if (busy || code.trim().length !== 5) return;
    const nextAvatar = commitName();
    setBusy("join");
    setState({ error: null });
    net.ensure();
    net.send({ t: "join", code: code.trim().toUpperCase(), name: nextAvatar.name, avatar: nextAvatar, chair });
  };

  return (
    <Screen>
      <Brand title="Expediente" hl="Caótico" />
      <Muted>
        Tiroteio de bolinha de papel e rally de cadeira no escritório. Monte seu boneco, chame os colegas e dispute quem bate a meta do dia.
      </Muted>

      <Columns
        left={
          <Badge left="CRACHÁ" right="VISITANTE" dna={avatar} name={name.trim() || avatar.name}>
            <Btn title="Editar boneco" onPress={() => setState({ editing: true })} />
          </Badge>
        }
        right={
          <Stack>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Card>
              <Stack gap={12}>
                <Label>Seu nome no crachá</Label>
                <Field value={name} maxLength={16} onChangeText={setName} onBlur={commitName} returnKeyType="done" />
                <Btn kind="primary" title={busy === "create" ? "Conectando..." : "Criar sala"} onPress={create} disabled={!name.trim() || !!busy} />
              </Stack>
            </Card>
            <Card>
              <Stack gap={12}>
                <Label>Entrar com código</Label>
                <Field
                  code
                  value={code}
                  maxLength={5}
                  placeholder="ABCDE"
                  autoCapitalize="characters"
                  onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z]/g, ""))}
                  onSubmitEditing={() => code.length === 5 && join()}
                  returnKeyType="go"
                />
                <Btn kind="dark" title={busy === "join" ? "Entrando..." : "Entrar na sala"} onPress={join} disabled={code.length !== 5 || !name.trim() || !!busy} />
              </Stack>
            </Card>
            <Card>
              <Label>Servidor</Label>
              {editServer ? (
                <Stack gap={10}>
                  <Field value={serverDraft} onChangeText={setServerDraft} autoCapitalize="none" keyboardType="url" placeholder="expedientecaotico.cavel.com.br" />
                  <Row>
                    <Btn
                      small
                      kind="primary"
                      title="Salvar"
                      onPress={() => {
                        saveServer(serverDraft);
                        setBusy(null);
                        setEditServer(false);
                      }}
                    />
                    <Btn small title="Cancelar" onPress={() => setEditServer(false)} />
                  </Row>
                </Stack>
              ) : (
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={[s.muted, { flexShrink: 1 }]} numberOfLines={1}>
                    {server}
                  </Text>
                  <Btn
                    small
                    title="Alterar"
                    onPress={() => {
                      setServerDraft(server);
                      setEditServer(true);
                    }}
                  />
                </Row>
              )}
            </Card>
            <Card>
              <Label>Controles</Label>
              <Muted>
                Tiroteio: polegar esquerdo anda, arraste à direita ou sobre Atirar para mirar, toque nas habilidades e esquiva. Rally: polegar esquerdo vira (puxe para baixo para frear), segure Derrapar e solte para o turbo.
              </Muted>
            </Card>
          </Stack>
        }
      />
    </Screen>
  );
}

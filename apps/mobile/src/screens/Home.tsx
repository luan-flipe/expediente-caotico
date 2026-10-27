import { useState } from "react";
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

  const commitName = () => {
    if (name.trim() && name !== avatar.name) saveAvatar({ ...avatar, name });
  };

  const create = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "create", name: name || avatar.name, avatar, chair });
  };

  const join = () => {
    commitName();
    setState({ error: null });
    net.ensure();
    net.send({ t: "join", code: code.trim().toUpperCase(), name: name || avatar.name, avatar, chair });
  };

  return (
    <Screen>
      <Brand title="Expediente" hl="Caótico" />
      <Muted>Tiroteio de bolinha de papel e rally de cadeira no escritório. Monte seu boneco, chame os colegas e dispute quem bate a meta do dia.</Muted>

      <Columns
        left={
          <Badge left="CRACHÁ" right="VISITANTE" dna={avatar} name={avatar.name}>
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
                <Btn kind="primary" title="Criar sala" onPress={create} disabled={!name.trim()} />
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
                <Btn kind="dark" title="Entrar na sala" onPress={join} disabled={code.length !== 5 || !name.trim()} />
              </Stack>
            </Card>
            <Card>
              <Label>Servidor</Label>
              {editServer ? (
                <Stack gap={10}>
                  <Field value={serverDraft} onChangeText={setServerDraft} autoCapitalize="none" keyboardType="url" placeholder="192.168.0.10:2567" />
                  <Row>
                    <Btn
                      small
                      kind="primary"
                      title="Salvar"
                      onPress={() => {
                        saveServer(serverDraft);
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
                Tiroteio: polegar esquerdo anda, arraste à direita para mirar, segure o botão de papel para atirar. Rally: polegar esquerdo vira a cadeira, a cadeira acelera sozinha, segure Derrapar e solte para o turbo.
              </Muted>
            </Card>
          </Stack>
        }
      />
    </Screen>
  );
}

import { useEffect } from "react";
import { BackHandler } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { GameView } from "../game/GameView";
import { RaceResults } from "../race/RaceResults";
import { RaceView } from "../race/RaceView";
import { Creator } from "../screens/Creator";
import { Home } from "../screens/Home";
import { Lobby } from "../screens/Lobby";
import { Results } from "../screens/Results";
import { getState, leaveRoom, net, savedSession, setState, useStore } from "../store";

/** Tela única: quem decide o que aparece é o estado da sala vindo do servidor, igual à versão web. */
export default function Index() {
  const { sala } = useLocalSearchParams<{ sala?: string }>();
  const editing = useStore((st) => st.editing);
  const lobby = useStore((st) => st.lobby);
  const results = useStore((st) => st.results);
  const raceResults = useStore((st) => st.raceResults);
  const myId = useStore((st) => st.myId);
  const wanted = sala?.toUpperCase();

  // volta para a sala salva (app reaberto ou derrubado), a menos que o convite seja de outra sala
  useEffect(() => {
    const session = savedSession();
    if (session && (!wanted || wanted === session.code)) net.resume();
  }, [wanted]);

  // voltar do Android: fecha o editor, sai da sala de espera; no meio da partida não faz nada
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const s = getState();
      if (s.lobby?.phase === "match") return true;
      if (s.editing) {
        setState({ editing: false });
        return true;
      }
      if (s.lobby?.phase === "lobby") {
        leaveRoom();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  if (lobby?.phase === "match" && myId) return lobby.mode === "race" ? <RaceView myId={myId} /> : <GameView myId={myId} />;
  if (editing) return <Creator />;
  if (!lobby) return <Home key={wanted ?? ""} initialCode={wanted} />;
  if (lobby.phase === "results" && raceResults) return <RaceResults />;
  if (lobby.phase === "results" && results) return <Results />;
  return <Lobby />;
}

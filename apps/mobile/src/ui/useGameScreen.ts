import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";

/** Partida: tela deitada e sempre acesa; ao sair, o aparelho volta a girar livre. */
export function useGameScreen(): void {
  useKeepAwake("partida");
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);
}

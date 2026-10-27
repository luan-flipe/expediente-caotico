import { useEffect } from "react";
import { Platform } from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";

/** Partida: tela deitada, sempre acesa e sem barra de sistema; ao sair, volta ao normal. */
export function useGameScreen(): void {
  useKeepAwake("partida");
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    if (Platform.OS === "android") NavigationBar.setHidden(true);
    return () => {
      if (Platform.OS === "android") NavigationBar.setHidden(false);
      void ScreenOrientation.unlockAsync();
    };
  }, []);
}

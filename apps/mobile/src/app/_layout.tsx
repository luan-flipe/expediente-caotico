import "../polyfills";
import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { setAudioModeAsync } from "expo-audio";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BricolageGrotesque_500Medium } from "@expo-google-fonts/bricolage-grotesque/500Medium";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { setState } from "../store";
import { preloadTypefaces } from "../three/canvas";
import { preloadChair } from "../three/chairMesh";
import { preloadCharacter } from "../three/character";
import { preloadCommander } from "../three/commander";

void SplashScreen.preventAutoHideAsync();

// som do jogo toca mesmo com o iPhone no silencioso e não corta a música de quem já estiver ouvindo algo
void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
// letreiros e modelos 3D chegam antes de redesenhar miniaturas e prévias
void preloadTypefaces();
Promise.all([preloadCharacter(), preloadChair()]).then((ok) => ok.some(Boolean) && setState({ modelReady: true }));
void preloadCommander();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

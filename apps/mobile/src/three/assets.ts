/**
 * Modelos e sons são os mesmos da versão web: um único lugar para trocar.
 * O Metro empacota cada arquivo e devolve um id de módulo para o expo-asset.
 * Os GLB vêm de assets-src, não de apps/web/public: os da web são comprimidos com meshopt,
 * cujo decodificador precisa de WebAssembly, que o Hermes não tem. Os de assets/models são gerados por
 * scripts/optimize-assets.mjs (sem meshopt e simplificados).
 */
export const BONECO_GLB: number = require("../../../../assets-src/characters/boneco.glb");
export const BONECO_POLO_BARBA_GLB: number = require("../../../../assets-src/characters/boneco_polo_barba.glb");
export const CADEIRA_GLB: number = require("../../../../assets-src/chairs/cadeira_escritorio.glb");
export const COMANDANTE_GLB: number = require("../../assets/models/characters/comandante_helicoptero.glb");
export const ZOMBIE_FBX: number = require("../../../web/public/assets/characters/Zombie.fbx");
export const ZOMBIE_TEX: number = require("../../../web/public/assets/characters/zombie_texture.png");

export const HELICOPTERO_SOM: number = require("../../../web/public/assets/audio/helicoptero.m4a");
export const MUSICA_CORRIDA: number = require("../../../web/public/assets/audio/turbo_pixel_drift.mp3");
export const MUSICA_LOBBY: number = require("../../../web/public/assets/audio/lobby-music.mp3");
export const SOM_TIRO: number = require("../../../web/public/assets/audio/tiro.mp3");
export const SOM_ZUMBI: number = require("../../../web/public/assets/audio/zumbi-grunhido.mp3");

export const FONT_DISPLAY_FILE: number = require("@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf");
export const FONT_MONO_FILE: number = require("@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf");

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * Único lugar que cria um GLTFLoader. Os modelos em /assets vêm comprimidos com meshopt;
 * sem o decodificador o arquivo não abre e o jogo cai no procedural sem avisar.
 */
export function createGltfLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

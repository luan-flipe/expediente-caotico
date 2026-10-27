import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { AlphaType, ColorType, ImageFormat, Skia } from "@shopify/react-native-skia";
import type { AvatarDNA, ChairDNA } from "@ec/shared";
import { useStore } from "../store";
import { flipRows } from "./canvas";
import { chairModelReady, seatedRacer } from "./chairMesh";
import { createCharacter, modelReady } from "./character";
import { createRenderer } from "./gl";

/** Um contexto GL sem tela para todas as miniaturas (o lobby pede até 8 de uma vez). */
let ctx: Promise<{ gl: ExpoWebGLRenderingContext; renderer: THREE.WebGLRenderer } | null> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();

function context() {
  ctx ??= GLView.createContextAsync()
    .then((gl) => ({ gl, renderer: createRenderer(gl, { alpha: true }) }))
    .catch((err) => {
      console.warn("miniaturas 3D indisponíveis", err);
      return null;
    });
  return ctx;
}

interface Shot {
  build: () => { root: THREE.Object3D; dispose(): void };
  rotY: number;
  cam: [number, number, number];
  look: [number, number, number];
}

/** Renderiza num alvo fora da tela, lê os pixels e devolve um PNG em data URI. */
async function render(shot: Shot, size: number): Promise<string | null> {
  const c = await context();
  if (!c) return null;
  const { gl, renderer } = c;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const obj = shot.build();
  obj.root.rotation.y = shot.rotY;
  scene.add(obj.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(...shot.cam);
  cam.lookAt(...shot.look);
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
    renderer.setRenderTarget(null);
    gl.flushEXP();
    // o GL lê de baixo para cima
    const img = Skia.Image.MakeImage(
      { width: size, height: size, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      Skia.Data.fromBytes(flipRows(px, size, size)),
      size * 4,
    );
    const b64 = img?.encodeToBase64(ImageFormat.PNG);
    return b64 ? `data:image/png;base64,${b64}` : null;
  } finally {
    target.dispose();
    obj.dispose();
  }
}

function thumb(key: string, shot: Shot, size: number): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(() => render(shot, size)).then((uri) => {
    if (uri) cache.set(key, uri);
    return uri;
  });
  queue = job.catch(() => null);
  return job;
}

export function avatarThumbnail(dna: AvatarDNA, size = 160): Promise<string | null> {
  const key = JSON.stringify({ ...dna, name: "" }) + size + (modelReady() ? "glb" : "");
  return thumb(key, { build: () => createCharacter(dna), rotY: 0.35, cam: [0, 1.75, 3.1], look: [0, 1.45, 0] }, size);
}

export function chairThumbnail(avatar: AvatarDNA, chair: ChairDNA, size = 160): Promise<string | null> {
  const key = JSON.stringify({ ...avatar, name: "" }) + JSON.stringify(chair) + size + (modelReady() ? "glb" : "") + (chairModelReady() ? "cglb" : "");
  return thumb(key, { build: () => seatedRacer(avatar, chair), rotY: 0.6, cam: [0, 1.6, 4.4], look: [0, 0.82, 0] }, size);
}

/** Miniatura (data URI) do boneco, ou dele sentado na cadeira; null enquanto renderiza. */
export function useThumbnail(avatar: AvatarDNA, chair?: ChairDNA, size = 160): string | null {
  const ready = useStore((s) => s.modelReady);
  const key = JSON.stringify([avatar, chair ?? null, size, ready]);
  const [state, setState] = useState<{ key: string; uri: string | null }>({ key: "", uri: null });
  useEffect(() => {
    let live = true;
    const job = chair ? chairThumbnail(avatar, chair, size) : avatarThumbnail(avatar, size);
    void job.then((uri) => live && setState({ key, uri }));
    return () => {
      live = false;
    };
    // a chave já resume avatar, cadeira, tamanho e modelo carregado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.uri : null;
}

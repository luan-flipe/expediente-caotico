import { useEffect, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import * as THREE from "three";
import type { AvatarDNA, ChairDNA } from "@ec/shared";
import { useStore } from "../store";
import { seatedRacer } from "../three/chairMesh";
import { createCharacter, type Character } from "../three/character";
import { createRenderer, fitRenderer } from "../three/gl";
import { GameGL } from "./GameGL";

/** Tom base do papel atrás do boneco (usado também pelas miniaturas em thumbs.ts). */
export const PREVIEW_BG = "#f1ebde";

let studioBg: THREE.DataTexture | null = null;

/** Mesmo fundo radial de estúdio da versão web: radial-gradient(circle at 50% 40%, #fff 0%, #ebe3d3 75%). */
function previewBackdrop(): THREE.DataTexture {
  if (studioBg) return studioBg;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // DataTexture tem y=0 na base; invertemos para que 40% fique na metade superior
    const v = 1 - y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const t = Math.min(1, Math.hypot(u - 0.5, v - 0.4) / 0.75);
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 + (235 - 255) * t);
      data[i + 1] = Math.round(255 + (227 - 255) * t);
      data[i + 2] = Math.round(255 + (211 - 255) * t);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  studioBg = tex;
  return tex;
}

interface Live {
  scene: THREE.Scene;
  rig: Character | null;
}

function buildRig(dna: AvatarDNA, chair?: ChairDNA): Character {
  return chair ? { ...seatedRacer(dna, chair), update() {}, play() {}, sit() {} } : createCharacter(dna);
}

/** Prévia 3D girando. Arraste na horizontal para girar sem travar a rolagem vertical da tela. */
export function AvatarPreview({ dna, chair, style }: { dna: AvatarDNA; chair?: ChairDNA; style?: StyleProp<ViewStyle> }) {
  const ready = useStore((s) => s.modelReady);
  const live = useRef<Live | null>(null);
  const props = useRef({ dna, chair });
  const yaw = useSharedValue(0.4);
  const dragging = useSharedValue(false);
  const stop = useRef<() => void>(() => {});

  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    failOffsetY: [-18, 18],
    onBegin: () => {
      "worklet";
      dragging.value = true;
    },
    onUpdate: (e) => {
      "worklet";
      yaw.value += e.changeX * 0.012;
    },
    onFinalize: () => {
      "worklet";
      dragging.value = false;
    },
  });

  useEffect(() => {
    props.current = { dna, chair };
    const l = live.current;
    if (!l) return;
    const old = l.rig;
    const rig = buildRig(dna, chair);
    rig.root.rotation.y = yaw.value;
    if (old) {
      l.scene.remove(old.root);
      old.dispose();
    }
    l.scene.add(rig.root);
    l.rig = rig;
  }, [dna, chair, ready, yaw]);

  useEffect(() => () => stop.current(), []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // fundo opaco: a transparência do GLView varia entre plataformas
    const renderer = createRenderer(gl);
    const scene = new THREE.Scene();
    scene.background = previewBackdrop();
    scene.add(new THREE.HemisphereLight("#ffffff", "#8f8577", 2.1));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.8);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const discGeom = new THREE.CircleGeometry(0.8, 32);
    const discMat = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.12 });
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const cam = new THREE.PerspectiveCamera(32, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 30);
    cam.position.set(0, 1.5, 4.4);
    cam.lookAt(0, 1.1, 0);
    const rig = buildRig(props.current.dna, props.current.chair);
    rig.root.rotation.y = yaw.value;
    scene.add(rig.root);
    live.current = { scene, rig };

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const ms = performance.now();
      fitRenderer(gl, renderer, cam);
      if (!dragging.value) yaw.value += 0.004;
      const r = live.current?.rig;
      if (r) {
        r.root.rotation.y = yaw.value;
        r.update(Math.min(0.05, (ms - last) / 1000), 0);
      }
      renderer.render(scene, cam);
      gl.endFrameEXP();
      last = ms;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stop.current = () => {
      cancelAnimationFrame(raf);
      live.current?.rig?.dispose();
      live.current = null;
      discGeom.dispose();
      discMat.dispose();
      renderer.dispose();
    };
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={style} collapsable={false}>
        <GameGL style={{ flex: 1 }} onContextCreate={onContextCreate} />
      </View>
    </GestureDetector>
  );
}

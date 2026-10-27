import { useEffect, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";
import type { AvatarDNA, ChairDNA } from "@ec/shared";
import { useStore } from "../store";
import { seatedRacer } from "../three/chairMesh";
import { createCharacter, type Character } from "../three/character";
import { createRenderer, fitRenderer } from "../three/gl";
import { GameGL } from "./GameGL";

/** Tom do papel atrás do boneco (o C.paper2 da paleta, um pouco mais claro). */
export const PREVIEW_BG = "#f1ebde";

interface Live {
  scene: THREE.Scene;
  rig: Character | null;
}

function buildRig(dna: AvatarDNA, chair?: ChairDNA): Character {
  return chair ? { ...seatedRacer(dna, chair), update() {}, play() {}, sit() {} } : createCharacter(dna);
}

/** Prévia 3D girando. Arraste para girar. Com chair, mostra o boneco sentado na cadeira. */
export function AvatarPreview({ dna, chair, style }: { dna: AvatarDNA; chair?: ChairDNA; style?: StyleProp<ViewStyle> }) {
  const ready = useStore((s) => s.modelReady);
  const live = useRef<Live | null>(null);
  const props = useRef({ dna, chair });
  const yaw = useRef(0.4);
  const drag = useRef<{ x: number } | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    props.current = { dna, chair };
    const l = live.current;
    if (!l) return;
    const old = l.rig;
    const rig = buildRig(dna, chair);
    if (old) {
      l.scene.remove(old.root);
      old.dispose();
    }
    l.scene.add(rig.root);
    l.rig = rig;
  }, [dna, chair, ready]);

  useEffect(() => () => stop.current(), []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // fundo opaco: a transparência do GLView varia entre plataformas
    const renderer = createRenderer(gl);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PREVIEW_BG);
    scene.add(new THREE.HemisphereLight("#ffffff", "#8f8577", 2.1));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.8);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.12 }));
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const cam = new THREE.PerspectiveCamera(32, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 30);
    cam.position.set(0, 1.5, 4.4);
    cam.lookAt(0, 1.1, 0);
    const rig = buildRig(props.current.dna, props.current.chair);
    scene.add(rig.root);
    live.current = { scene, rig };

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const ms = performance.now();
      fitRenderer(gl, renderer, cam);
      if (!drag.current) yaw.current += 0.004;
      const r = live.current?.rig;
      if (r) {
        r.root.rotation.y = yaw.current;
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
      renderer.dispose();
    };
  };

  return (
    <View
      style={style}
      onTouchStart={(e) => (drag.current = { x: e.nativeEvent.pageX })}
      onTouchMove={(e) => {
        if (!drag.current) return;
        yaw.current += (e.nativeEvent.pageX - drag.current.x) * 0.012;
        drag.current.x = e.nativeEvent.pageX;
      }}
      onTouchEnd={() => (drag.current = null)}
      onTouchCancel={() => (drag.current = null)}
    >
      <GameGL style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}

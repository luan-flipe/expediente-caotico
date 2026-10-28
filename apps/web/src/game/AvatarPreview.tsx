import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { AvatarDNA } from "@ec/shared";
import { useStore } from "../store";
import { createCharacter, type Character } from "./character";

/** Prévia 3D girando. Arraste para girar. */
export function AvatarPreview({ dna, className, autoRotate = true }: { dna: AvatarDNA; className?: string; autoRotate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const autoRef = useRef(autoRotate);
  autoRef.current = autoRotate;
  const rigRef = useRef<Character | null>(null);
  const ready = useStore((s) => s.modelReady);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(new THREE.HemisphereLight("#ffffff", "#8f8577", 2.1));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.8);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.12 }));
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
    cam.position.set(0, 1.5, 4.4);
    cam.lookAt(0, 1.1, 0);

    let yaw = 0.4;
    let dragging = false;
    let lastX = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    const up = () => (dragging = false);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    let raf = 0;
    let last = performance.now();
    const loop = (ms: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      if (!dragging && autoRef.current) yaw += 0.004;
      const rig = rigRef.current;
      if (rig) {
        rig.root.rotation.y = yaw;
        rig.update(Math.min(0.05, (ms - last) / 1000), 0);
      }
      renderer.render(scene, cam);
      last = ms;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      rigRef.current?.dispose();
      rigRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const old = rigRef.current;
    const rig = createCharacter(dna);
    if (old) {
      rig.root.rotation.y = old.root.rotation.y;
      scene.remove(old.root);
      old.dispose();
    }
    scene.add(rig.root);
    rigRef.current = rig;
  }, [dna, ready]);

  return <canvas ref={ref} className={className} />;
}

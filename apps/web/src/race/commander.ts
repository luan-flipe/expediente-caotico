import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { pointAt, RACE, TRACK } from "@ec/shared";

/** Comandante: o narrador da corrida, sobrevoando a pista de helicóptero. */
const MODEL_URL = "/assets/characters/comandante_helicoptero.glb";
const SOUND_URL = "/assets/audio/helicoptero.m4a";
/** Trecho do áudio que soa contínuo, em segundos: o arquivo tem 1,25 s de silêncio no começo e o fim corta. */
const SOUND_LOOP: [number, number] = [1.3, 5.9];
/** Distâncias (m) do som: cheio até NEAR, zero a partir de FAR. */
const SOUND_NEAR = 6;
const SOUND_FAR = 55;
const ROTOR_CLIP = "Rotores_Girando";
/** Velocidade e altura do voo durante a corrida (puxa o pelotão). */
const FLY_SPEED = 13;
const FLY_HEIGHT = 9;
const HOVER_HEIGHT = 5.5;
/** Trecho da reta final que ele percorre na cena de abertura, chegando sobre a largada. */
const INTRO_DIST = 70;
const BANNER_W = 4.4;
const BANNER_H = 1.1;

let loaded: { scene: THREE.Group; rotor: THREE.AnimationClip | null } | null = null;
let loading: Promise<boolean> | null = null;
let sound: Promise<AudioBuffer | null> | null = null;

function loadSound(): Promise<AudioBuffer | null> {
  sound ??= new THREE.AudioLoader().loadAsync(SOUND_URL).catch((err) => {
    console.warn("som do helicóptero não carregou", err);
    return null;
  });
  return sound;
}

export function preloadCommander(): Promise<boolean> {
  loading ??= new GLTFLoader()
    .loadAsync(MODEL_URL)
    .then((gltf) => {
      loaded = { scene: gltf.scene, rotor: gltf.animations.find((a) => a.name === ROTOR_CLIP) ?? null };
      return true;
    })
    .catch((err) => {
      console.warn("comandante_helicoptero.glb não carregou, corrida segue sem o Comandante", err);
      return false;
    });
  return loading;
}

function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffd23f";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#1d1b17";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 118);
  g.fillStyle = "#1d1b17";
  g.font = "800 62px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("RALLY DA FIRMA", 256, 68);
  return new THREE.CanvasTexture(c);
}

function nameTag(): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText("Comandante", 128, 34);
  g.fillStyle = "#ffd23f";
  g.fillText("Comandante", 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(3, 0.56, 1);
  s.renderOrder = 5;
  return s;
}

export interface Commander {
  root: THREE.Group;
  /** introMs = tempo desde o início da cena de abertura; raceMs = tempo desde a largada (null antes dela). */
  update(dt: number, introMs: number, raceMs: number | null): void;
  dispose(): void;
}

/** null se o GLB não carregou: a corrida funciona sem o Comandante. Com listener, o helicóptero faz barulho. */
export function createCommander(listener?: THREE.AudioListener): Commander | null {
  if (!loaded) return null;
  const root = new THREE.Group();
  let disposed = false;
  const audio = listener ? new THREE.PositionalAudio(listener) : null;
  if (audio) {
    // som posicional: alto quando passa perto da câmera, some aos poucos com a distância
    audio.position.y = 2.5;
    root.add(audio);
    void loadSound().then((buffer) => {
      if (!buffer || disposed) return;
      audio.setBuffer(buffer);
      audio.setLoop(true);
      audio.setLoopStart(SOUND_LOOP[0]);
      audio.setLoopEnd(SOUND_LOOP[1]);
      audio.offset = SOUND_LOOP[0];
      // volume cheio até SOUND_NEAR, some de vez em SOUND_FAR (a queda padrão nunca zerava)
      audio.setDistanceModel("linear");
      audio.setRefDistance(SOUND_NEAR);
      audio.setMaxDistance(SOUND_FAR);
      audio.setRolloffFactor(1);
      // o áudio foi gravado alto: 60% no máximo, mesmo com o helicóptero colado na câmera
      audio.setVolume(0.6);
      audio.play();
    });
  }
  const heli = loaded.scene.clone(true);
  heli.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh === true));
  root.add(heli);
  const mixer = new THREE.AnimationMixer(heli);
  if (loaded.rotor) {
    const a = mixer.clipAction(loaded.rotor);
    a.timeScale = 2;
    a.play();
  }

  const tag = nameTag();
  tag.position.y = 4.6;
  root.add(tag);

  // faixa puxada por uma corda a partir da cauda; duas faces para o texto não aparecer espelhado
  const tex = bannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: tex });
  const banner = new THREE.Group();
  banner.position.set(0, 1.2, -8.2);
  // tecido dividido em faixas para ondular; cada face sabe qual ponta está presa na corda
  const faces = [
    { ry: Math.PI / 2, attach: -1, side: 1 },
    { ry: -Math.PI / 2, attach: 1, side: -1 },
  ].map(({ ry, attach, side }) => {
    const geo = new THREE.PlaneGeometry(BANNER_W, BANNER_H, 28, 4);
    const face = new THREE.Mesh(geo, bannerMat);
    face.frustumCulled = false;
    face.rotation.y = ry;
    face.castShadow = true;
    banner.add(face);
    return { geo, base: Float32Array.from(geo.attributes.position.array), attach, side };
  });
  root.add(banner);
  const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 3.6, 4);
  const ropeMat = new THREE.MeshStandardMaterial({ color: "#5a554c" });
  const rope = new THREE.Mesh(ropeGeo, ropeMat);
  rope.position.set(0, 1.8, -6.1);
  rope.rotation.x = Math.PI / 2 - 0.3;
  root.add(rope);

  /**
   * Onda que corre da ponta presa até a solta, crescendo no caminho, mais um leve sobe e desce.
   * As duas faces recebem o mesmo deslocamento no mundo (a de trás está girada meia volta).
   */
  const flutter = (time: number) => {
    for (const f of faces) {
      const pos = f.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3];
        const y = f.base[i * 3 + 1];
        const e = (BANNER_W / 2 - f.attach * x) / BANNER_W; // 0 na corda, 1 na ponta solta
        const amp = 0.08 + 0.42 * Math.pow(e, 1.4);
        const wave = Math.sin(e * Math.PI * 2.6 - time * 7.5) * amp;
        const ripple = Math.sin(e * Math.PI * 5 - time * 11 + y * 2) * 0.06 * e;
        pos.setZ(i, (wave + ripple) * f.side);
        pos.setY(i, y + Math.sin(e * Math.PI * 2 - time * 5) * 0.08 * e);
      }
      pos.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
  };

  let t = 0;
  let placed = false;
  return {
    root,
    update(dt, introMs, raceMs) {
      t += dt;
      mixer.update(dt);
      let s: number;
      let y: number;
      let faceGrid = false;
      if (raceMs !== null) {
        s = (raceMs / 1000) * FLY_SPEED;
        y = FLY_HEIGHT;
      } else {
        // abertura: desce pela reta final e para sobre a linha de chegada, virado para o grid
        const u = Math.min(1, introMs / RACE.introMs);
        const ease = 1 - Math.pow(1 - u, 3);
        s = -INTRO_DIST * (1 - ease);
        y = HOVER_HEIGHT + 4 * (1 - ease);
        faceGrid = u > 0.45;
      }
      const at = pointAt(TRACK, s);
      root.position.set(at.pos.x, y + Math.sin(t * 1.8) * 0.2, at.pos.z);
      const facing = faceGrid ? at.heading + Math.PI : at.heading;
      root.rotation.y = placed ? angleTo(root.rotation.y, facing, dt * 2) : facing;
      placed = true;
      // inclina para a frente em voo, como helicóptero de verdade
      heli.rotation.x = raceMs !== null || !faceGrid ? 0.12 : 0;
      heli.rotation.z = Math.sin(t * 1.1) * 0.04;
      banner.rotation.z = Math.sin(t * 2.3) * 0.04;
      flutter(t);
    },
    dispose() {
      // geometria e materiais do GLB são compartilhados entre clones; só as peças desta cena saem
      disposed = true;
      if (audio?.isPlaying) audio.stop();
      mixer.stopAllAction();
      for (const o of [...faces.map((f) => f.geo), bannerMat, tex, ropeGeo, ropeMat, tag.material, (tag.material as THREE.SpriteMaterial).map!]) o.dispose();
    },
  };
}

function angleTo(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, k);
}

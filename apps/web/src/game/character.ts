import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { EYE_COLORS, HAIR_COLORS, SKINS, type AvatarDNA } from "@ec/shared";
import { BARBAS, CABELOS, type PieceDef } from "./itens/cabelo-e-barba";
import { ROSTOS, type FacePiece } from "./itens/pele-e-olhos";

/**
 * Boneco do jogo: boneco_bebe.glb, um bebê careca de fralda com esqueleto, expressões (piscar,
 * cara brava) e as animações do jogo. O crachá tinge pele e olhos pelo shader, monta o rosto com as
 * peças de expressão do próprio bebê e põe cabelo e barba (modelos do designer). Os itens de cada aba
 * do crachá ficam registrados em ./itens/.
 */
export type CharacterAction = "throw" | "cafe" | "dash" | "tchau";

export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  play(action: CharacterAction): void;
  /**
   * Pose sentada (modo corrida): pernas para a frente e braços no apoio. Para as animações.
   * Devolve a altura da parte de baixo das coxas, para apoiá-las no assento.
   */
  sit(): number;
  dispose(): void;
}

/** Altura (no espaço do boneco) da parte mais baixa das peças, já na pose sentada. */
function bottomOf(root: THREE.Object3D, parts: THREE.Object3D[]): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  for (const p of parts) box.union(new THREE.Box3().setFromObject(p).applyMatrix4(inv));
  return box.isEmpty() ? 0 : box.min.y;
}

const MODEL_URL = "/assets/characters/boneco/boneco_bebe.glb";
/** Altura do GLB e a do boneco no jogo (colisão, câmera e balões são medidos para ela). */
const MODEL_HEIGHT = 1.9;
const TARGET_HEIGHT = 1.75;
const SCALE = TARGET_HEIGHT / MODEL_HEIGHT;
/** Duração no jogo de cada ação (os clipes são mais longos) e o clipe de cada uma. */
const ACTION_SECONDS: Record<CharacterAction, number> = { throw: 0.45, cafe: 0.7, dash: 0.3, tchau: 3.2 };
const CLIP_OF: Record<CharacterAction, string> = { throw: "jogar_bolinha", cafe: "jogar_cafe", dash: "dash", tchau: "tchau" };
/** Trecho útil de cada clipe em segundos: o resto é a volta para a pose parada. */
const CLIP_RANGE: Record<CharacterAction, [number, number]> = { throw: [0, 0.9], cafe: [0, 1.5], dash: [0, 1.1], tchau: [0, 3.2] };
const FPS = 30;
/**
 * Parado e andando, os clipes deixam os braços ~69° abaixo da horizontal, colados no corpo. Depois de
 * cada quadro o braço abre este tanto para fora (no espaço do tronco): cada braço fica ~15° abaixo da
 * horizontal, uns 150° entre os dois. Nas ações o braço segue o clipe, que já o tira do corpo.
 */
const ARM_OPEN = THREE.MathUtils.degToRad(54);

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Cabelos do designer já carregados, com a matriz do espaço do osso cabeca para o modelo. */
  modelHairs: Map<number, Piece>;
  /** Barbas do designer, ligadas ao esqueleto de cada boneco ao vestir. */
  beards: Map<number, THREE.BufferGeometry>;
  /** Pele do rosto em grade, para as peças de expressão encostarem nela e pegarem a sombra dela. */
  faceSkin: Map<string, SkinCell>;
  /** Peças de expressão giradas ou subidas, feitas uma vez por posição. */
  faceGeos: Map<string, THREE.BufferGeometry>;
}

interface Piece {
  geo: THREE.BufferGeometry;
  frame: THREE.Matrix4;
}

let loaded: Loaded | null = null;
let loading: Promise<boolean> | null = null;

export function modelReady(): boolean {
  return loaded !== null;
}

/** Tira a translação do corpo dos clipes (o dash anda 1,2 m sozinho): a posição vem do servidor. */
function cleanClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => t.name !== "figura.position" && t.name !== "root.position");
  return c;
}

/** Brilho linear (como o shader mede) de uma cor sRGB 0–255. */
function lum(r: number, g: number, b: number): number {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/** Cor média da pele e da íris na textura do bebê: a referência do tingimento. */
const SKIN_REF = lum(235, 190, 175);
const IRIS_REF = lum(117, 55, 39);
/**
 * A pele em volta dos olhos é mais clara que a média (brilho 0,651 contra 0,584 da referência) e a das
 * peças de expressão é 0,606: a referência delas é ajustada para a peça sair no mesmo tom do rosto.
 */
const OVERLAY_REF = SKIN_REF * (0.606 / 0.651);
/** Brilho da testa logo acima dos olhos, relativo à referência (a textura é mais escura no lado direito). */
const FOREHEAD_D = 0.97;
const FOREHEAD_E = 1.06;

const HSV_GLSL = /* glsl */ `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

/**
 * Pele e olhos do crachá sobre a textura do bebê. A sombra vem do brilho do pixel relativo à cor
 * média da região. Ficam como vieram a fralda e os traços do rosto (pupila, cílios, brilho do olho).
 * hideBrows cobre de pele a sobrancelha pintada, quando o rosto escolhido põe as dele em outro lugar.
 */
function tintBody(material: THREE.MeshStandardMaterial, skin: THREE.Color, iris: THREE.Color, hideBrows: boolean): void {
  const uniforms = {
    uSkin: { value: skin },
    uIris: { value: iris },
    uRef: { value: new THREE.Vector2(SKIN_REF, IRIS_REF) },
    uHideBrow: { value: hideBrows ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBindPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform vec3 uSkin; uniform vec3 uIris; uniform vec2 uRef; uniform float uHideBrow;\nvarying vec3 vBindPos;\nconst vec2 FOREHEAD = vec2(${FOREHEAD_D.toFixed(3)}, ${FOREHEAD_E.toFixed(3)});\n${HSV_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 lin = diffuseColor.rgb;
  vec3 hsv = rgb2hsv(pow(max(lin, 0.0), vec3(1.0 / 2.2)));
  vec3 srgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  vec3 p = vBindPos;
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  bool diaper = (srgb.b > srgb.r + 0.08 && srgb.b > srgb.g) || (p.y > 0.25 && p.y < 0.52 && hsv.y < 0.25 && hsv.z < 0.45);
  bool face = p.y > 1.0 && p.y < 1.36 && p.z > 0.2 && abs(p.x) < 0.34;
  bool iris = face && hsv.y > 0.45 && hsv.x * 360.0 < 35.0 && hsv.z < 0.62;
  bool feature = face && (hsv.z < 0.4 || (hsv.y < 0.15 && hsv.z > 0.7));
  // a sobrancelha pintada fica entre o alto dos cílios (y 1,25) e o topo da caixa do rosto, e o
  // traço vai de bem escuro a quase pele: o que for mais escuro que a testa vira a testa
  bool brow = uHideBrow > 0.5 && face && p.y > 1.255 && abs(p.x) > 0.06;
  float forehead = p.x < 0.0 ? FOREHEAD.x : FOREHEAD.y;
  float rel = l / uRef.x;
  if (brow) diffuseColor.rgb = uSkin * mix(forehead, rel, smoothstep(forehead * 0.8, forehead * 0.95, rel));
  else if (iris) diffuseColor.rgb = uIris * (l / uRef.y);
  else if (!diaper && !feature) diffuseColor.rgb = uSkin * (l / uRef.x);
}`,
      );
  };
  material.customProgramCacheKey = () => "bebe-corpo";
}

/** Pálpebras do piscar, da cara brava e a boca: a parte cor de pele acompanha a pele do crachá. */
function tintOverlay(material: THREE.MeshStandardMaterial, skin: THREE.Color): void {
  const uniforms = { uSkin: { value: skin }, uRef: { value: OVERLAY_REF } };
  // o corpo é fosco (textura de rugosidade); a peça brilhando mais parecia um remendo claro
  material.roughness = 1;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uSkin; uniform float uRef;\n${HSV_GLSL}`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 hsv = rgb2hsv(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)));
  if (hsv.z >= 0.4 && hsv.x * 360.0 < 40.0 && hsv.y < 0.45) diffuseColor.rgb = uSkin * (dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uRef);
}`,
      );
  };
  material.customProgramCacheKey = () => "bebe-sobreposicao";
}

/** Peças de expressão que têm pele (as outras, sobrancelha brava e veia, ficam como vieram). */
const SKIN_OVERLAYS = ["palpebra_D", "palpebra_E", "boca", "piscar_meio_D", "piscar_fechado_D", "piscar_meio_E", "piscar_fechado_E"];

const FACE_CELL = 0.01;

/** Célula da pele do rosto: o z mais à frente e a soma das normais dos vértices dela. */
type SkinCell = { z: number; n: THREE.Vector3 };

/** Pele do rosto numa grade de 1 cm, no espaço da malha. */
function faceSkinOf(mesh: THREE.SkinnedMesh): Map<string, SkinCell> {
  const pos = mesh.geometry.getAttribute("position");
  const nor = mesh.geometry.getAttribute("normal");
  const field = new Map<string, SkinCell>();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < 0.1) continue;
    const k = `${Math.round(pos.getX(i) / FACE_CELL)},${Math.round(pos.getY(i) / FACE_CELL)}`;
    let cell = field.get(k);
    if (!cell) field.set(k, (cell = { z, n: new THREE.Vector3() }));
    cell.z = Math.max(cell.z, z);
    cell.n.x += nor.getX(i);
    cell.n.y += nor.getY(i);
    cell.n.z += nor.getZ(i);
  }
  return field;
}

/**
 * Pele em (x, y): o z mais à frente das células em volta (a peça nunca fica atrás da pele) e a normal
 * média delas (a peça pega a mesma sombra do rosto, sem parecer um remendo).
 */
function skinAt(field: Map<string, SkinCell>, x: number, y: number, normal: THREE.Vector3): number | null {
  const cx = Math.round(x / FACE_CELL), cy = Math.round(y / FACE_CELL);
  let z = -Infinity;
  normal.set(0, 0, 0);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const cell = field.get(`${cx + a},${cy + b}`);
      if (!cell) continue;
      z = Math.max(z, cell.z);
      normal.add(cell.n);
    }
  if (z === -Infinity) return null;
  normal.normalize();
  return z;
}

/**
 * Peça de expressão do rosto: girada e subida em volta do próprio centro, com a mesma distância da
 * pele de antes, e com as normais da pele embaixo dela.
 */
function facePieceGeo(model: Loaded, src: THREE.Mesh, p: FacePiece): THREE.BufferGeometry {
  const key = `${p.node}|${p.turn ?? 0}|${p.up ?? 0}`;
  const hit = model.faceGeos.get(key);
  if (hit) return hit;
  const geo = src.geometry.clone();
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  const a = THREE.MathUtils.degToRad(p.turn ?? 0);
  const cos = Math.cos(a), sin = Math.sin(a);
  const moved = Boolean(p.turn || p.up);
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const n = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = c.x + cos * (x - c.x) - sin * (y - c.y);
    const ny = c.y + sin * (x - c.x) + cos * (y - c.y) + (p.up ?? 0);
    const before = skinAt(model.faceSkin, x, y, n0);
    const after = skinAt(model.faceSkin, nx, ny, n);
    // a movida guarda a distância que tinha da pele, mas nunca fica atrás da pele mais alta em volta
    // (o degrau da órbita do olho), e vai um pouco mais longe para não sumir nela
    const nz = moved && before !== null && after !== null ? Math.max(z + after - before, after + 0.003) + 0.004 : z;
    pos.setXYZ(i, nx, ny, nz);
    if (after !== null && nor) nor.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  model.faceGeos.set(key, geo);
  return geo;
}

/** Carrega o boneco e os cabelos uma vez. Resolve false se o boneco falhar (o jogo segue com o provisório). */
export function preloadCharacter(): Promise<boolean> {
  loading ??= loadAll();
  return loading;
}

/** Carrega as peças de um registro (cabelos ou barbas). A que falhar só some da lista. */
function loadPieces(loader: GLTFLoader, urls: Record<number, string>) {
  return Promise.all(
    Object.entries(urls).map(([key, url]) =>
      loader
        .loadAsync(url)
        .then((g) => [Number(key), (g.scene.getObjectByProperty("isMesh", true) as THREE.Mesh).geometry] as const)
        .catch((err) => {
          console.warn(`${url} não carregou`, err);
          return null;
        }),
    ),
  );
}
const urlsOf = (defs: Record<number, PieceDef>) => Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.url]));

/** Junta cada peça carregada à matriz que a leva do espaço do osso cabeca para o lugar dela no bebê. */
function pieceMap(list: (readonly [number, THREE.BufferGeometry] | null)[], defs: Record<number, PieceDef>, toHead: THREE.Matrix4): Map<number, Piece> {
  return new Map(
    list.flatMap((h) => {
      if (!h) return [];
      const def = defs[h[0]];
      const fit = new THREE.Matrix4().compose(new THREE.Vector3(...def.offset), new THREE.Quaternion(), new THREE.Vector3().setScalar(def.scale));
      return [[h[0], { geo: h[1], frame: toHead.clone().multiply(fit) }] as const];
    }),
  );
}

function loadAll(): Promise<boolean> {
  const loader = new GLTFLoader();
  return Promise.all([loader.loadAsync(MODEL_URL), loadPieces(loader, urlsOf(CABELOS)), loadPieces(loader, BARBAS)])
    .then(([gltf, hairs, beards]) => {
      const mesh = gltf.scene.getObjectByName("boneco") as THREE.SkinnedMesh;
      // do espaço da malha (pose de origem) para o espaço do osso cabeca
      const headIdx = mesh.skeleton.bones.findIndex((b) => b.name === "cabeca");
      const toHead = mesh.skeleton.boneInverses[headIdx].clone().multiply(mesh.bindMatrix);
      loaded = {
        scene: gltf.scene,
        clips: new Map(gltf.animations.map((a) => [a.name, cleanClip(a)])),
        modelHairs: pieceMap(hairs, CABELOS, toHead),
        beards: new Map(beards.flatMap((b) => (b ? [b] : []))),
        faceSkin: faceSkinOf(mesh),
        faceGeos: new Map(),
      };
      return true;
    })
    .catch((err) => {
      console.warn("boneco_bebe.glb não carregou, usando o boneco provisório", err);
      return false;
    });
}

/**
 * Aplica o crachá: pele e olhos no corpo e nas pálpebras, o rosto, cabelo e barba presos ao osso da
 * cabeça. Devolve o acerto do rosto a fazer depois de cada quadro das animações.
 */
function dress(inner: THREE.Object3D, model: Loaded, dna: AvatarDNA, mats: THREE.Material[]): () => void {
  const skin = new THREE.Color(SKINS[dna.skin] ?? SKINS[0]);
  const iris = new THREE.Color(EYE_COLORS[dna.eyes] ?? EYE_COLORS[0]);
  const face = ROSTOS[dna.face] ?? ROSTOS[0];
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const isBody = mesh.name === "boneco";
    if (!isBody && !SKIN_OVERLAYS.includes(mesh.name)) return;
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (isBody) tintBody(m, skin, iris, face.hideBrows ?? false);
    else tintOverlay(m, skin);
    mesh.material = m;
    mats.push(m);
  });
  const cabeca = inner.getObjectByName("cabeca");
  if (!cabeca) return () => {};
  // sem textura: o desenho dos fios vem do relevo da malha
  const wear = (piece: Piece | undefined, color: number, roughness: number) => {
    if (!piece) return;
    const mat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[color] ?? HAIR_COLORS[0], roughness, side: THREE.DoubleSide });
    mats.push(mat);
    const mesh = new THREE.Mesh(piece.geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(piece.frame);
    mesh.castShadow = true;
    cabeca.add(mesh);
  };
  wear(model.modelHairs.get(dna.hair), dna.hairColor, 0.8);
  const beardGeo = model.beards.get(dna.beard);
  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  if (beardGeo && body?.parent) {
    // mesma skin do corpo no GLB do designer: os índices de osso são os do esqueleto do boneco
    const mat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[dna.beardColor] ?? HAIR_COLORS[0], roughness: 0.9, side: THREE.DoubleSide });
    mats.push(mat);
    const beard = new THREE.SkinnedMesh(beardGeo, mat);
    beard.castShadow = true;
    body.parent.add(beard);
    beard.bind(body.skeleton, body.bindMatrix);
  }
  return wearFace(inner, cabeca, model, face.pieces);
}

/**
 * Rosto do crachá: cópias das peças de expressão, fora dos grupos que as animações ligam e desligam.
 * Quando o clipe faz a cara brava (no arremesso), ela vale; quando um olho pisca, as pálpebras do
 * rosto daquele lado saem e fica o piscar do clipe.
 */
function wearFace(inner: THREE.Object3D, cabeca: THREE.Object3D, model: Loaded, pieces: FacePiece[]): () => void {
  const parts: { mesh: THREE.Mesh; side: "D" | "E" | null }[] = [];
  for (const p of pieces) {
    const src = inner.getObjectByName(p.node) as THREE.Mesh | undefined;
    if (!src?.isMesh || !src.parent) continue;
    // o grupo de origem (cara_brava, piscar) só tem deslocamento: a cópia vai no mesmo lugar
    const holder = new THREE.Group();
    holder.position.copy(src.parent.position);
    const mesh = new THREE.Mesh(facePieceGeo(model, src, p), src.material);
    mesh.name = `rosto_${p.node}`;
    holder.add(mesh);
    cabeca.add(holder);
    const lid = p.node.startsWith("palpebra") || p.node.startsWith("piscar");
    parts.push({ mesh, side: lid ? (p.node.endsWith("_D") ? "D" : "E") : null });
  }
  if (parts.length === 0) return () => {};
  const brava = inner.getObjectByName("cara_brava");
  const blink = (side: "D" | "E") => ["piscar_meio_", "piscar_fechado_"].flatMap((n) => inner.getObjectByName(n + side) ?? []);
  const blinks = { D: blink("D"), E: blink("E") };
  return () => {
    const angry = (brava?.scale.x ?? 0) > 0.5;
    for (const { mesh, side } of parts) mesh.visible = !angry && !(side && blinks[side].some((o) => o.scale.x > 0.5));
  };
}

function glbCharacter(model: Loaded, dna: AvatarDNA): Character {
  const root = new THREE.Group();
  const inner = cloneSkinned(model.scene) as THREE.Group;
  inner.scale.setScalar(SCALE);
  root.add(inner);
  const mats: THREE.Material[] = [];
  const syncFace = dress(inner, model, dna, mats);

  // parado por baixo, andar por cima conforme a velocidade; ações tocam uma vez
  const mixer = new THREE.AnimationMixer(inner);
  const loop = (name: string) => {
    const c = model.clips.get(name);
    return c ? mixer.clipAction(c).play() : null;
  };
  const idle = loop("parado");
  const walk = loop("andar");
  const actions = new Map<CharacterAction, THREE.AnimationAction>();
  for (const k of Object.keys(CLIP_OF) as CharacterAction[]) {
    const full = model.clips.get(CLIP_OF[k]);
    if (!full) continue;
    const [from, to] = CLIP_RANGE[k];
    const clip = THREE.AnimationUtils.subclip(full, `${full.name}_jogo`, from * FPS, Math.min(to, full.duration) * FPS, FPS);
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = clip.duration / ACTION_SECONDS[k];
    actions.set(k, a);
  }
  const shoulders: [THREE.Object3D, THREE.Quaternion][] = [];
  for (const [n, side] of [["ombro_D", -1], ["ombro_E", 1]] as const) {
    const bone = inner.getObjectByName(n);
    if (bone) shoulders.push([bone, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * ARM_OPEN)]);
  }
  const openArms = () => {
    for (const [bone, open] of shoulders) bone.quaternion.premultiply(open);
  };
  const busy = () => [...actions.values()].some((a) => a.isRunning());
  const step = (dt: number) => {
    mixer.update(dt);
    if (!busy()) openArms();
    syncFace();
  };
  walk?.setEffectiveWeight(0);
  step(0);

  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  let seated = false;
  return {
    root,
    update(dt, speed01) {
      if (seated) return;
      const acting = busy();
      const w = acting ? 0 : speed01;
      walk?.setEffectiveWeight(w);
      idle?.setEffectiveWeight(acting ? 0 : 1 - w);
      if (walk) walk.timeScale = 0.6 + speed01 * 0.8;
      step(dt);
    },
    play(action) {
      const a = actions.get(action);
      if (!a || (a.isRunning() && action !== "throw")) return;
      a.reset().play();
    },
    sit() {
      // pose parada, depois pernas para a frente e braços no apoio
      seated = true;
      walk?.stop();
      for (const a of actions.values()) a.stop();
      idle?.setEffectiveWeight(1);
      mixer.setTime(0);
      openArms();
      syncFace();
      const forward = (n: string, angle: number) =>
        inner.getObjectByName(n)?.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));
      forward("perna_D", -Math.PI / 2);
      forward("perna_E", -Math.PI / 2);
      forward("ombro_D", -0.75);
      forward("ombro_E", -0.75);
      if (!body) return 0;
      // a caixa da malha com pele é calculada na pose atual dos ossos
      inner.updateMatrixWorld(true);
      body.computeBoundingBox();
      return bottomOf(root, [body]);
    },
    dispose() {
      // malhas, texturas, penteados e barbas são compartilhados; os materiais tingidos são deste boneco
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
}

/** Enquanto o GLB carrega: uma cápsula na altura do boneco, para a cena não ficar vazia. */
function placeholderCharacter(): Character {
  const root = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(0.32, TARGET_HEIGHT - 0.64, 6, 16);
  const mat = new THREE.MeshStandardMaterial({ color: "#f3c3ad", roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TARGET_HEIGHT / 2;
  mesh.castShadow = true;
  root.add(mesh);
  return {
    root,
    update() {},
    play() {},
    // a cápsula não dobra: apoia a base no assento
    sit: () => 0,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function createCharacter(dna: AvatarDNA): Character {
  return loaded ? glbCharacter(loaded, dna) : placeholderCharacter();
}

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbCache = new Map<string, string>();

/** Miniatura do boneco (dataURL) usando um único renderer compartilhado. */
export function avatarThumbnail(dna: AvatarDNA, size = 160): string {
  const key = JSON.stringify({ ...dna, name: "" }) + size + (loaded ? "glb" : "");
  const hit = thumbCache.get(key);
  if (hit) return hit;
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  }
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const char = createCharacter(dna);
  char.root.rotation.y = 0.35;
  scene.add(char.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 1.4, 3.6);
  cam.lookAt(0, 0.95, 0);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  char.dispose();
  thumbCache.set(key, url);
  return url;
}

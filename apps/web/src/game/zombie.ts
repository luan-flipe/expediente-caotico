import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { TARGET_HEIGHT, type Character } from "./character";

/** Zumbi do modo Sobrevivência: Zombie.fbx com a animação embutida de zumbi andando. */
const ZOMBIE_URL = "/assets/characters/Zombie.fbx";
const ZOMBIE_TEXTURE_URL = "/assets/characters/zombie_texture.png";

interface LoadedZombie {
  scene: THREE.Group;
  clip: THREE.AnimationClip | null;
  scale: number;
}

let loadedZombie: LoadedZombie | null = null;
let loadingZombie: Promise<boolean> | null = null;
let zombieTexture: THREE.Texture | null = null;

/**
 * Zera o deslocamento lateral/frontal (root motion X e Z) dos ossos na animação do zumbi,
 * mantendo o balanço vertical Y e todas as rotações das articulações da caminhada.
 */
function cleanZombieClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (track.name.endsWith(".position") && track instanceof THREE.VectorKeyframeTrack) {
      const vals = track.values;
      for (let i = 0; i < vals.length; i += 3) {
        vals[i] = 0; // zera deslocamento X
        vals[i + 2] = 0; // zera deslocamento Z
      }
    }
  }
  return c;
}

export function zombieReady(): boolean {
  return loadedZombie !== null;
}

/** Carrega o Zombie.fbx com sua animação embutida de zumbi em movimento. */
/** Só baixa quando aparece o primeiro zumbi: são cerca de 5 MB que quem não joga o modo não precisa. */
export function preloadZombie(): Promise<boolean> {
  if (loadingZombie) return loadingZombie;
  // a textura chega junto com o modelo, porque é aplicada quando o zumbi é criado
  const texture = new THREE.TextureLoader().loadAsync(ZOMBIE_TEXTURE_URL).then(
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      zombieTexture = tex;
    },
    (err) => console.warn("Falha ao carregar zombie_texture.png, usando fallback procedural ou de cor", err),
  );
  loadingZombie = Promise.all([new FBXLoader().loadAsync(ZOMBIE_URL), texture])
    .then(([fbx]) => {
      const bbox = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const h = size.y > 0 ? size.y : 1.0;
      const rawClip = fbx.animations && fbx.animations.length > 0 ? fbx.animations[0] : null;
      const clip = rawClip ? cleanZombieClip(rawClip) : null;
      loadedZombie = {
        scene: fbx,
        clip,
        scale: TARGET_HEIGHT / h,
      };
      return true;
    })
    .catch((err) => {
      console.warn("Zombie.fbx não carregou, usando fallback procedural", err);
      return false;
    });
  return loadingZombie;
}

/** Enquanto o FBX carrega (ou se falhar): uma cápsula verde na altura do boneco. */
function placeholderZombie(): Character {
  const root = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(0.32, TARGET_HEIGHT - 0.64, 6, 16);
  const mat = new THREE.MeshStandardMaterial({ color: "#5a7d52", roughness: 0.75 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TARGET_HEIGHT / 2;
  mesh.castShadow = true;
  root.add(mesh);
  return {
    root,
    update() {},
    play() {},
    sit: () => 0,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function createZombieCharacter(): Character {
  if (!loadedZombie) return placeholderZombie();

  const root = new THREE.Group();
  // Usa SkeletonUtils.clone para preservar as ligações dos ossos do SkinnedMesh
  const inner = SkeletonUtils.clone(loadedZombie.scene) as THREE.Group;
  inner.scale.setScalar(loadedZombie.scale);
  const mats: THREE.Material[] = [];

  inner.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const origMap = (orig as { map?: THREE.Texture })?.map ?? null;
      const map = zombieTexture ?? origMap;
      const standardMat = new THREE.MeshStandardMaterial({
        map,
        color: map ? 0xffffff : 0x5a7d52,
        roughness: 0.75,
        metalness: 0.1,
      });
      mesh.material = standardMat;
      mats.push(standardMat);
    }
  });
  root.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  if (loadedZombie.clip) {
    const action = mixer.clipAction(loadedZombie.clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }

  return {
    root,
    update(dt, speed01) {
      // Como o zumbi já está em movimento contínuo na animação, escala proporcionalmente à velocidade
      const rate = 0.6 + Math.max(0.2, speed01) * 0.8;
      mixer.update(dt * rate);
    },
    play() {},
    // zumbi nunca senta numa cadeira
    sit() {
      return 0;
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
}

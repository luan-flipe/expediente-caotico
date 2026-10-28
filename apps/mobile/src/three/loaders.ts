import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader, type GLTF, type GLTFLoaderPlugin, type GLTFParser } from "three/addons/loaders/GLTFLoader.js";
import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";

/** Bytes de um arquivo empacotado pelo Metro (baixado do servidor de dev ou lido do app). */
export async function assetBytes(mod: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const bytes = await new File(asset.localUri ?? asset.uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const WRAP: Record<number, THREE.Wrapping> = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
};
const MAG_FILTER: Record<number, THREE.MagnificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
};
const MIN_FILTER: Record<number, THREE.MinificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
};

function decodeSkiaPixels(buf: ArrayBuffer, flipY: boolean): { px: Uint8Array; w: number; h: number } {
  const skData = Skia.Data.fromBytes(new Uint8Array(buf));
  const img = Skia.Image.MakeImageFromEncoded(skData);
  skData.dispose();
  if (!img) throw new Error("textura não decodificou pelo Skia");
  const w = img.width();
  const h = img.height();
  const raw = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array;
  img.dispose();
  if (!flipY) return { px: raw, w, h };
  // FBX/OBJ esperam UV (0,0) na base; inverter as linhas aqui evita depender de UNPACK_FLIP_Y_WEBGL no expo-gl
  const flipped = new Uint8Array(raw.length);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const srcOff = y * stride;
    const dstOff = (h - 1 - y) * stride;
    flipped.set(raw.subarray(srcOff, srcOff + stride), dstOff);
  }
  return { px: flipped, w, h };
}

/**
 * No React Native não há Image, Blob de ArrayBuffer nem createImageBitmap, que o GLTFLoader usa
 * para as texturas embutidas no GLB. Este plugin decodifica a imagem com o Skia e entrega uma DataTexture.
 */
class SkiaTexturePlugin implements GLTFLoaderPlugin {
  readonly name = "EC_skia_textures";

  constructor(private readonly parser: GLTFParser) {}

  loadTexture(index: number): Promise<THREE.Texture> | null {
    const json = this.parser.json as {
      textures: { source?: number; sampler?: number }[];
      images: { bufferView?: number }[];
      samplers?: { wrapS?: number; wrapT?: number; magFilter?: number; minFilter?: number }[];
    };
    const def = json.textures[index];
    const image = def.source !== undefined ? json.images[def.source] : undefined;
    if (image?.bufferView === undefined) return null;
    return this.parser.getDependency("bufferView", image.bufferView).then((buf: ArrayBuffer) => {
      const { px, w, h } = decodeSkiaPixels(buf, false);
      const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
      const sampler = def.sampler !== undefined ? json.samplers?.[def.sampler] : undefined;
      tex.wrapS = WRAP[sampler?.wrapS ?? 10497];
      tex.wrapT = WRAP[sampler?.wrapT ?? 10497];
      tex.magFilter = MAG_FILTER[sampler?.magFilter ?? 9729];
      const min = MIN_FILTER[sampler?.minFilter ?? 9987];
      tex.minFilter = min;
      tex.generateMipmaps = min !== THREE.NearestFilter && min !== THREE.LinearFilter;
      // glTF já vem com a primeira linha no topo, igual ao readPixels
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    });
  }
}

export async function loadGLB(mod: number): Promise<GLTF> {
  const data = await assetBytes(mod);
  const loader = new GLTFLoader();
  loader.register((parser) => new SkiaTexturePlugin(parser));
  return loader.parseAsync(data, "");
}

/** Decodifica um PNG/JPG empacotado pelo Metro em DataTexture via Skia (sem depender de Image/DOM). */
export async function loadSkiaTexture(mod: number, flipY = true): Promise<THREE.DataTexture> {
  const buf = await assetBytes(mod);
  const { px, w, h } = decodeSkiaPixels(buf, flipY);
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

class PlaceholderTextureLoader extends THREE.Loader<THREE.Texture> {
  override load(): THREE.Texture {
    return new THREE.Texture();
  }
}

/** Carrega um FBX empacotado pelo Metro sem acionar TextureLoader do navegador. */
export async function loadFBX(mod: number): Promise<THREE.Group> {
  const data = await assetBytes(mod);
  const manager = new THREE.LoadingManager();
  manager.addHandler(/\.(png|jpg|jpeg|tga|webp)$/i, new PlaceholderTextureLoader(manager));
  return new FBXLoader(manager).parse(data, "");
}

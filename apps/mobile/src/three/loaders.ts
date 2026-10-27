import * as THREE from "three";
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
      const skData = Skia.Data.fromBytes(new Uint8Array(buf));
      const img = Skia.Image.MakeImageFromEncoded(skData);
      skData.dispose();
      if (!img) throw new Error(`textura ${index} do GLB não decodificou`);
      const w = img.width();
      const h = img.height();
      const px = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array;
      img.dispose();
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

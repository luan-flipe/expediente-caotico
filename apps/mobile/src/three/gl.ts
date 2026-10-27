import * as THREE from "three";
import type { ExpoWebGLRenderingContext } from "expo-gl";

/**
 * Parâmetros de pixelStorei que o expo-gl ainda não implementa (ele só avisa no console).
 * As texturas deste app já sobem na orientação certa, então ignorar não muda nada.
 */
function quietPixelStore(gl: ExpoWebGLRenderingContext): void {
  const skip = new Set<number>([gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]);
  const original = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (!skip.has(pname)) original(pname, param as number);
  };
}

/** WebGLRenderer do three desenhando no contexto do GLView (sem DOM). */
export function createRenderer(gl: ExpoWebGLRenderingContext, opts: { alpha?: boolean } = {}): THREE.WebGLRenderer {
  quietPixelStore(gl);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const canvas = {
    width: w,
    height: h,
    style: {},
    clientWidth: w,
    clientHeight: h,
    addEventListener() {},
    removeEventListener() {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  // O three (r163+) recusa contextos `instanceof WebGLRenderingContext`, mas no expo-gl a classe
  // WebGL2 herda da WebGL1. O contexto já é WebGL2; a checagem só existe no construtor.
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const webgl1 = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, alpha: opts.alpha ?? false, antialias: false });
  } finally {
    g.WebGLRenderingContext = webgl1;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  return renderer;
}

/**
 * Tamanho real da superfície em pixels. O expo-gl fixa drawingBufferWidth/Height na criação do contexto;
 * quando a tela gira (a partida trava em paisagem depois de abrir), só o onLayout do GLView sabe o novo tamanho.
 */
const viewSizes = new WeakMap<ExpoWebGLRenderingContext, { w: number; h: number }>();

export function setViewSize(gl: ExpoWebGLRenderingContext, w: number, h: number): void {
  viewSizes.set(gl, { w: Math.round(w), h: Math.round(h) });
}

/** Acompanha o tamanho da superfície (giro de tela, divisão de janela) e corrige a câmera. */
export function fitRenderer(gl: ExpoWebGLRenderingContext, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  const view = viewSizes.get(gl);
  const w = view?.w ?? gl.drawingBufferWidth;
  const h = view?.h ?? gl.drawingBufferHeight;
  if (!w || !h) return;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x === w && size.y === h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

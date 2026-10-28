import * as THREE from "three";
import { Platform } from "react-native";
import { AlphaType, ColorType, matchFont, PaintStyle, Skia, StrokeJoin, type SkFont, type SkTypeface } from "@shopify/react-native-skia";
import { assetBytes } from "./loaders";
import { FONT_DISPLAY_FILE, FONT_MONO_FILE } from "./assets";

let display: SkTypeface | null = null;
let mono: SkTypeface | null = null;
const fonts = new Map<string, SkFont>();

/** Carrega Bricolage e JetBrains Mono no Skia para os letreiros 3D ficarem iguais à web. */
export async function preloadTypefaces(): Promise<void> {
  const load = async (mod: number) => {
    try {
      const data = Skia.Data.fromBytes(new Uint8Array(await assetBytes(mod)));
      return Skia.Typeface.MakeFreeTypeFaceFromData(data);
    } catch (err) {
      console.warn("fonte dos letreiros não carregou, usando a do sistema", err);
      return null;
    }
  };
  [display, mono] = await Promise.all([load(FONT_DISPLAY_FILE), load(FONT_MONO_FILE)]);
  fonts.clear();
}

function systemFont(size: number, kind: "mono" | "emoji" | "sans"): SkFont {
  const family =
    kind === "emoji"
      ? Platform.select({ ios: "Apple Color Emoji", android: "Noto Color Emoji", default: "sans-serif" })
      : kind === "mono"
        ? Platform.select({ ios: "Menlo", default: "monospace" })
        : Platform.select({ ios: "Helvetica", default: "sans-serif" });
  try {
    return matchFont({ fontFamily: family, fontSize: size, fontWeight: kind === "emoji" ? "normal" : "bold" });
  } catch {
    return matchFont({ fontSize: size });
  }
}

/** Fonte a partir da sintaxe CSS usada no código da web ("800 30px 'Bricolage Grotesque', sans-serif" ou "56px emoji"). */
function fontFor(spec: string): SkFont {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(spec)?.[1] ?? 16);
  const isEmoji = /emoji/i.test(spec);
  const isMono = !isEmoji && /mono/i.test(spec);
  const key = `${isEmoji ? "e" : isMono ? "m" : "d"}${size}`;
  let font = fonts.get(key);
  if (!font) {
    if (isEmoji) {
      font = systemFont(size, "emoji");
    } else {
      const face = isMono ? mono : display;
      font = face ? Skia.Font(face, size) : systemFont(size, isMono ? "mono" : "sans");
    }
    fonts.set(key, font);
  }
  return font;
}

/**
 * Subconjunto do CanvasRenderingContext2D usado pelos letreiros e texturas do jogo, desenhado com Skia
 * numa superfície em memória. `texture()` devolve a imagem como DataTexture do three e libera a superfície nativa.
 */
export class Canvas2D {
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  font = "16px sans-serif";
  textAlign: "left" | "center" | "right" = "left";
  textBaseline: "alphabetic" | "middle" = "alphabetic";
  readonly width: number;
  readonly height: number;
  private surface;
  private canvas;
  private disposed = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.surface = Skia.Surface.Make(width, height)!;
    this.canvas = this.surface.getCanvas();
    this.canvas.clear(Skia.Color("transparent"));
  }

  private paint(color: string, stroke: boolean, strokeWidth = this.lineWidth) {
    const p = Skia.Paint();
    p.setColor(Skia.Color(color));
    p.setAntiAlias(true);
    if (stroke) {
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(strokeWidth);
      p.setStrokeJoin(StrokeJoin.Round);
    }
    return p;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const p = this.paint(this.fillStyle, false);
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), p);
    p.dispose();
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const p = this.paint(this.strokeStyle, true);
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), p);
    p.dispose();
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    const p = this.paint(this.fillStyle, false);
    this.canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r), p);
    p.dispose();
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    const p = this.paint(this.strokeStyle, true);
    this.canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r), p);
    p.dispose();
  }

  fillCircle(cx: number, cy: number, r: number): void {
    const p = this.paint(this.fillStyle, false);
    this.canvas.drawCircle(cx, cy, r, p);
    p.dispose();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    const p = this.paint(this.strokeStyle, true);
    this.canvas.drawLine(x1, y1, x2, y2, p);
    p.dispose();
  }

  /** Desenha um balão de fala arredondado com rabinho inferior e borda contínua sem costura interna. */
  speechBubble(x: number, y: number, w: number, h: number, r: number, tailX: number, tailTipY: number, tailHalfW: number): void {
    const rrect = Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
    const pb = Skia.PathBuilder.Make();
    pb.moveTo(tailX - tailHalfW, y + h - 4);
    pb.lineTo(tailX, tailTipY);
    pb.lineTo(tailX + tailHalfW, y + h - 4);
    pb.close();
    const tail = pb.build();
    pb.dispose();

    // Contorno primeiro com largura dobrada (a metade interna é coberta pelo preenchimento logo em seguida)
    const sp = this.paint(this.strokeStyle, true, this.lineWidth * 2);
    this.canvas.drawRRect(rrect, sp);
    this.canvas.drawPath(tail, sp);
    sp.dispose();

    const fp = this.paint(this.fillStyle, false);
    this.canvas.drawRRect(rrect, fp);
    this.canvas.drawPath(tail, fp);
    fp.dispose();
    tail.dispose();
  }

  private text(text: string, x: number, y: number, color: string, stroke: boolean, maxWidth?: number): void {
    const font = fontFor(this.font);
    const w = font.measureText(text).width;
    const scaleX = maxWidth && w > maxWidth ? maxWidth / w : 1;
    const drawW = w * scaleX;
    const ax = this.textAlign === "center" ? x - drawW / 2 : this.textAlign === "right" ? x - drawW : x;
    const m = font.getMetrics();
    const ay = this.textBaseline === "middle" ? y - (m.ascent + m.descent) / 2 : y;
    const p = this.paint(color, stroke);
    if (scaleX < 1) {
      this.canvas.save();
      this.canvas.translate(ax, ay);
      this.canvas.scale(scaleX, 1);
      this.canvas.drawText(text, 0, 0, p, font);
      this.canvas.restore();
    } else {
      this.canvas.drawText(text, ax, ay, p, font);
    }
    p.dispose();
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.text(text, x, y, this.fillStyle, false, maxWidth);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.text(text, x, y, this.strokeStyle, true, maxWidth);
  }

  /** Pixels RGBA de cima para baixo; libera a superfície nativa após a leitura. */
  pixels(): Uint8Array {
    const img = this.surface.makeImageSnapshot();
    const px = img.readPixels(0, 0, { width: this.width, height: this.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array;
    img.dispose();
    if (!this.disposed) {
      this.disposed = true;
      this.surface.dispose();
    }
    return px;
  }

  /** Mesma orientação de uma CanvasTexture (flipY): a primeira linha do desenho fica no topo da textura. */
  texture(): THREE.DataTexture {
    const t = new THREE.DataTexture(flipRows(this.pixels(), this.width, this.height), this.width, this.height, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
}

export function flipRows(src: Uint8Array, width: number, height: number): Uint8Array {
  const row = width * 4;
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) out.set(src.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}

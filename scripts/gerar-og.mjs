// Gera apps/web/public/assets/og.png (1200x630) em Node puro, sem dependências.
// Uso: node scripts/gerar-og.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import console from "node:console";

const W = 1200;
const H = 630;
const px = Buffer.alloc(W * H * 3);

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
};
const rect = (x, y, w, h, c) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c);
};
const circle = (cx, cy, r, c) => {
  for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) set(i, j, c);
};

const AMARELO = hex(0xffd84d);
const ESCURO = hex(0x1d1b17);
const PAPEL = hex(0xfffaf0);
const VERMELHO = hex(0xe5484d);
const AZUL = hex(0x3b82f6);

rect(0, 0, W, H, AMARELO);
// faixa de mesas ao fundo
rect(0, 470, W, 160, ESCURO);
rect(0, 470, W, 14, hex(0x3a362e));
// cartaz central (post-it torto como blocos) com bolinhas de papel
rect(120, 90, 520, 300, ESCURO);
rect(106, 76, 520, 300, PAPEL);
rect(106, 76, 520, 46, VERMELHO);
for (let k = 0; k < 4; k++) rect(150, 160 + k * 52, 430 - k * 60, 18, ESCURO);
// bolinhas de papel voando
for (const [x, y, r] of [[760, 160, 54], [900, 250, 38], [1030, 140, 28], [840, 360, 46], [1010, 330, 24], [720, 300, 20]]) {
  circle(x + 6, y + 8, r, ESCURO);
  circle(x, y, r, PAPEL);
  circle(x - r / 3, y - r / 3, Math.max(4, r / 4), hex(0xe9e1cf));
}
// cadeiras de escritório na faixa escura
for (const x of [180, 420, 660, 900]) {
  rect(x, 520, 90, 18, AZUL);
  rect(x + 38, 538, 14, 40, PAPEL);
  circle(x + 20, 590, 12, PAPEL);
  circle(x + 70, 590, 12, PAPEL);
}

// PNG: assinatura + IHDR + IDAT + IEND
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (tipo, dados) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(corpo));
  return Buffer.concat([len, corpo, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // 8 bits
ihdr[9] = 2; // RGB
const linhas = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) px.copy(linhas, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(linhas, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const saida = new URL("../apps/web/public/assets/og.png", import.meta.url);
writeFileSync(saida, png);
console.log(`og.png gerado: ${(png.length / 1024).toFixed(1)} KB`);

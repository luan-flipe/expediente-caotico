/**
 * O GLTFLoader do three decodifica o cabeçalho e o JSON do GLB com TextDecoder.
 * O Hermes não traz TextDecoder; este cobre UTF-8, que é tudo o que o GLB usa.
 */
class Utf8Decoder {
  readonly encoding = "utf-8";

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return "";
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let out = "";
    let chunk: number[] = [];
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      let cp: number;
      if (b < 0x80) cp = b;
      else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      if (cp > 0xffff) {
        cp -= 0x10000;
        chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        chunk.push(cp);
      }
      if (chunk.length > 8192) {
        out += String.fromCharCode(...chunk);
        chunk = [];
      }
    }
    return out + String.fromCharCode(...chunk);
  }
}

const g = globalThis as { TextDecoder?: unknown };
if (typeof g.TextDecoder === "undefined") g.TextDecoder = Utf8Decoder;

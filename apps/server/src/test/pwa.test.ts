import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../app";

process.env.NODE_ENV = "test";
const servers: RunningServer[] = [];
const dir = mkdtempSync(join(tmpdir(), "ec-dist-"));
beforeAll(() => {
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>x</title>");
  writeFileSync(join(dir, "sw.js"), "self.addEventListener('fetch',()=>{});");
  writeFileSync(join(dir, "manifest.webmanifest"), '{"name":"x"}');
  mkdirSync(join(dir, "icons"));
  writeFileSync(join(dir, "icons", "icon-192.png"), "png");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "boneco.glb"), "glb");
});
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function get(path: string) {
  const s = await startServer(0, { webDist: dir });
  servers.push(s);
  return fetch(`http://localhost:${s.port}${path}`);
}

describe("PWA no servidor", () => {
  it("manifest sai como application/manifest+json", async () => {
    const r = await get("/manifest.webmanifest");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/manifest+json");
  });

  it("sw.js sai sem cache, para a atualização chegar logo", async () => {
    const r = await get("/sw.js");
    expect(r.headers.get("content-type")).toContain("javascript");
    expect(r.headers.get("cache-control")).toBe("no-cache");
  });

  it("index.html e manifesto também revalidam", async () => {
    expect((await get("/")).headers.get("cache-control")).toBe("no-cache");
    expect((await get("/manifest.webmanifest")).headers.get("cache-control")).toBe("no-cache");
  });

  it("ícones PNG e modelos GLB têm o tipo certo", async () => {
    expect((await get("/icons/icon-192.png")).headers.get("content-type")).toBe("image/png");
    expect((await get("/assets/boneco.glb")).headers.get("content-type")).toBe("model/gltf-binary");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "@ec/shared";
import { Room, type Conn } from "../rooms";
import { Store } from "../store";

const conn = () => ({ ws: { OPEN: 1, readyState: 1, send() {} }, ip: "x", invalid: 0, lastSeen: 0 }) as unknown as Conn;
let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Partida de tiroteio com duas contas logadas, encerrada na hora. */
function play(submode: "pvp" | "zombies"): Store {
  dir = mkdtempSync(join(tmpdir(), "ec-zumbi-"));
  const store = new Store(dir);
  const room = new Room("ZUMBI", {}, store);
  room.addMember("Ana", DEFAULT_AVATAR, conn(), false, undefined, "g-ana");
  const beto = room.addMember("Beto", DEFAULT_AVATAR, conn(), false, undefined, "g-beto");
  beto.ready = true;
  room.shooterSubmode = submode;
  expect(room.start()).toBeNull();
  (room as unknown as { finish(): void }).finish();
  room.dispose();
  return store;
}

describe("ranking no modo zumbi", () => {
  it("tiroteio normal com 2 logados conta no ranking", () => {
    const store = play("pvp");
    expect(store.data.stats["g-ana"]?.shooterMatches).toBe(1);
  });

  it("sobrevivência zumbi é cooperativa e não conta no ranking do tiroteio nem no funcionário do mês", () => {
    const store = play("zombies");
    expect(store.data.stats["g-ana"]).toBeUndefined();
    expect(store.data.stats["g-beto"]).toBeUndefined();
    expect(Object.keys(store.data.months)).toEqual([]);
  });
});

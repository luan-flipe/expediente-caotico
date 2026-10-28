import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, NO_INPUT, setKartInput } from "@ec/shared";
import { Room, type Conn } from "../rooms";

const fakeConn = { ws: { send() {}, readyState: 1 } } as unknown as Conn;

describe("reconexão na corrida", () => {
  it("quem cai fica com o comando zerado e a fila vazia", () => {
    const room = new Room("TEST", { laps: 1 });
    const host = room.addMember("Ana", DEFAULT_AVATAR, fakeConn);
    room.addMember("Bot", DEFAULT_AVATAR, null, true);
    room.mode = "race";
    expect(room.start()).toBeNull();
    const race = room.race!;
    setKartInput(race, host.id, { steer: 1, throttle: 1, drift: true });
    setKartInput(race, host.id, { steer: -1, throttle: 1, drift: false }, 5);
    const racer = race.racers.get(host.id)!;
    expect(racer.input.throttle).toBe(1);
    expect(racer.inputQueue.length).toBe(1);

    host.conn = null;
    room.syncConnected(host);

    expect(racer.connected).toBe(false);
    expect(racer.input).toEqual(NO_INPUT);
    expect(racer.inputQueue).toEqual([]);
    room.dispose();
  });
});

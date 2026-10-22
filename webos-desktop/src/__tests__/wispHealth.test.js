import { describe, it, expect, beforeEach, vi } from "vitest";
import { connectFrame, dataFrame, orderByHealth, probeWisp, rankWisps, startWispRanking, currentRanking } from "../shared/wispHealth.js";

// A stand-in for a Wisp server. `behaviour[url]` decides how it acts:
//   { answer: ms }  answers the request with an HTTP response after ms
//   "silent"        accepts the connection, then says nothing (the dead-but-connected case)
//   "refuse"        closes the stream when asked to connect
//   "error"         the connection fails
const behaviour = {};
const reply = (type, stream, payload) => {
  const out = new Uint8Array(5 + payload.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, stream, true);
  out.set(payload, 5);
  return out.buffer;
};

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    const b = behaviour[url];
    if (b === "throws") throw new Error("bad url");
    queueMicrotask(() => {
      if (b === "error") this.onerror?.();
      else this.onopen?.();
    });
  }
  send(data) {
    this.sent.push(data);
    const b = behaviour[this.url];
    const type = data[0];
    if (b === "refuse" && type === 0x01) setTimeout(() => this.onmessage?.({ data: reply(0x04, 1, new Uint8Array([0x41])) }), 5);
    if (b && b.answer !== undefined && type === 0x02) {
      setTimeout(() => this.onmessage?.({ data: reply(0x02, 1, new TextEncoder().encode("HTTP/1.1 200 OK\r\n")) }), b.answer);
    }
  }
  close() { this.closed = true; }
}
const probe = (url, ms = 600) => probeWisp(url, { timeoutMs: ms, WebSocketImpl: FakeSocket });

beforeEach(() => { for (const k of Object.keys(behaviour)) delete behaviour[k]; });

describe("the probe frames", () => {
  it("asks for a TCP stream to the host and port", () => {
    const f = connectFrame(1, "example.com", 80);
    expect(f[0]).toBe(0x01);
    expect(new DataView(f.buffer).getUint32(1, true)).toBe(1);
    expect(f[5]).toBe(1); // TCP
    expect(new DataView(f.buffer).getUint16(6, true)).toBe(80);
    expect(new TextDecoder().decode(f.slice(8))).toBe("example.com");
  });
  it("sends the request as data on that stream", () => {
    const f = dataFrame(1, "GET /");
    expect(f[0]).toBe(0x02);
    expect(new TextDecoder().decode(f.slice(5))).toBe("GET /");
  });
});

describe("probeWisp", () => {
  it("counts a server that answers the request as healthy", async () => {
    behaviour["wss://good/"] = { answer: 10 };
    const r = await probe("wss://good/");
    expect(r.ok).toBe(true);
    expect(r.ms).toBeGreaterThan(0);
  });

  it("does not count a server that accepts the connection but never answers", async () => {
    behaviour["wss://silent/"] = "silent";
    const r = await probe("wss://silent/", 500);
    expect(r).toEqual({ ok: false, error: "no answer through the server" });
  });

  it("does not count a server that refuses the stream", async () => {
    behaviour["wss://refuse/"] = "refuse";
    expect((await probe("wss://refuse/")).error).toMatch(/refused the stream/);
  });

  it("does not count a server that cannot be reached", async () => {
    behaviour["wss://down/"] = "error";
    expect((await probe("wss://down/")).error).toBe("connection failed");
  });

  it("reports a bad address instead of throwing", async () => {
    behaviour["wss://bad/"] = "throws";
    expect((await probe("wss://bad/")).ok).toBe(false);
  });

  it("opens one stream and sends both the connect and the request", async () => {
    behaviour["wss://good/"] = { answer: 5 };
    let socket;
    const Spy = class extends FakeSocket { constructor(u) { super(u); socket = this; } };
    await probeWisp("wss://good/", { timeoutMs: 600, WebSocketImpl: Spy });
    expect(socket.sent.map((f) => f[0])).toEqual([0x01, 0x02]);
    expect(socket.closed).toBe(true);
  });
});

describe("rankWisps", () => {
  it("puts working servers first, fastest first, and dead ones last in their original order", async () => {
    behaviour["wss://slow/"] = { answer: 120 };
    behaviour["wss://fast/"] = { answer: 10 };
    behaviour["wss://silent/"] = "silent";
    behaviour["wss://down/"] = "error";
    const r = await rankWisps(["wss://silent/", "wss://slow/", "wss://down/", "wss://fast/"], { timeoutMs: 500, WebSocketImpl: FakeSocket });
    expect(r.map((x) => x.url)).toEqual(["wss://fast/", "wss://slow/", "wss://silent/", "wss://down/"]);
    expect(r.map((x) => x.ok)).toEqual([true, true, false, false]);
  });
});

describe("orderByHealth", () => {
  it("leaves the order alone until something has been measured", () => {
    expect(currentRanking()).toBeNull();
    expect(orderByHealth(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("then puts working servers first, untested ones next and dead ones last", async () => {
    behaviour["wss://dead/"] = "silent";
    behaviour["wss://fast/"] = { answer: 5 };
    behaviour["wss://slow/"] = { answer: 100 };
    await startWispRanking(["wss://dead/", "wss://fast/", "wss://slow/"], { timeoutMs: 500, WebSocketImpl: FakeSocket });
    expect(orderByHealth(["wss://dead/", "wss://untested/", "wss://slow/", "wss://fast/"]))
      .toEqual(["wss://fast/", "wss://slow/", "wss://untested/", "wss://dead/"]);
  });
});

describe("progressive ranking", () => {
  it("knows a working server as soon as it answers, before the slowest dead one gives up", async () => {
    // A fresh copy: earlier tests leave their ranking behind in the shared one.
    vi.resetModules();
    const { whenHealthy, startWispRanking } = await import("../shared/wispHealth.js");
    behaviour["wss://dead2/"] = "silent";
    behaviour["wss://quick/"] = { answer: 5 };
    const run = startWispRanking(["wss://dead2/", "wss://quick/"], { timeoutMs: 1500, WebSocketImpl: FakeSocket });
    const started = Date.now();
    const known = await whenHealthy(1200);
    expect(known.some((r) => r.url === "wss://quick/" && r.ok)).toBe(true);
    // The dead one is still being waited on, and we did not have to wait for it.
    expect(Date.now() - started).toBeLessThan(1200);
    await run;
  });
});

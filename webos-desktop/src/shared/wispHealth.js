// Is a Wisp server actually carrying traffic? Opening the websocket isn't
// enough: public servers often accept the connection and then return nothing.
// This opens a stream through the server to a web site, sends a request, and
// only counts the server as healthy if an HTTP answer comes back.
//
// Wisp v1 framing: [type u8][stream id u32 LE][payload]
//   CONNECT 0x01: stream type u8 (1 = TCP), port u16 LE, hostname utf8
//   DATA    0x02: bytes     CONTINUE 0x03: u32     CLOSE 0x04: reason u8

const PROBE_HOST = "example.com";
const PROBE_PORT = 80;

const frame = (type, stream, payload) => {
  const out = new Uint8Array(5 + payload.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, stream, true);
  out.set(payload, 5);
  return out;
};

export function connectFrame(stream, host, port) {
  const name = new TextEncoder().encode(host);
  const body = new Uint8Array(3 + name.length);
  body[0] = 1;
  new DataView(body.buffer).setUint16(1, port, true);
  body.set(name, 3);
  return frame(0x01, stream, body);
}

export const dataFrame = (stream, text) => frame(0x02, stream, new TextEncoder().encode(text));

// Resolves { ok, ms } or { ok: false, error }. `WebSocketImpl` is only for tests.
export function probeWisp(url, { timeoutMs = 7000, WebSocketImpl = globalThis.WebSocket } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let socket = null;
    let timer = null;
    let sent = null;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(sent);
      try { socket && socket.close(); } catch { /* already closed */ }
      resolve(result);
    };
    try {
      socket = new WebSocketImpl(url);
    } catch (err) {
      resolve({ ok: false, error: err && err.message ? err.message : String(err) });
      return;
    }
    socket.binaryType = "arraybuffer";
    timer = setTimeout(() => finish({ ok: false, error: "no answer through the server" }), timeoutMs);
    socket.onerror = () => finish({ ok: false, error: "connection failed" });
    socket.onclose = () => finish({ ok: false, error: "closed before answering" });
    socket.onopen = () => {
      // A short pause: some servers send their first packet and expect the client to wait for it.
      sent = setTimeout(() => {
        try {
          socket.send(connectFrame(1, PROBE_HOST, PROBE_PORT));
          socket.send(dataFrame(1, `GET / HTTP/1.1\r\nHost: ${PROBE_HOST}\r\nConnection: close\r\n\r\n`));
        } catch (err) {
          finish({ ok: false, error: err && err.message ? err.message : String(err) });
        }
      }, 150);
    };
    socket.onmessage = (event) => {
      const bytes = new Uint8Array(event.data);
      if (bytes[0] === 0x04) {
        finish({ ok: false, error: "the server refused the stream" });
      } else if (bytes[0] === 0x02 && bytes.length > 5) {
        const start = new TextDecoder().decode(bytes.slice(5, 24));
        if (/^HTTP\/1\.[01] \d{3}/.test(start)) finish({ ok: true, ms: Date.now() - started });
      }
    };
  });
}

const byHealth = (urls) => {
  const order = new Map(urls.map((u, i) => [u, i]));
  return (a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (a.ok) return a.ms - b.ms;
    return order.get(a.url) - order.get(b.url);
  };
};

// Probes every server at once. Returns [{ url, ok, ms }] with the working ones
// first, fastest first, and the dead ones last in their original order.
export async function rankWisps(urls, options = {}) {
  const results = await Promise.all(
    urls.map(async (url) => ({ url, ...(await probeWisp(url, options)) })),
  );
  return results.sort(byHealth(urls));
}

// What the OS currently knows, refreshed in the background. It is updated as
// each probe finishes, so a working server is known within a second or so
// instead of after the slowest dead one times out.
let ranking = null;
let rankingRun = null;
const REFRESH_MS = 10 * 60 * 1000;

export const currentRanking = () => ranking;

export function startWispRanking(urls, options = {}) {
  if (rankingRun) return rankingRun;
  const known = new Map();
  const sort = byHealth(urls);
  rankingRun = Promise.all(
    urls.map(async (url) => {
      known.set(url, { url, ...(await probeWisp(url, options)) });
      ranking = [...known.values()].sort(sort);
    }),
  ).then(() => {
    rankingRun = null;
    return ranking;
  });
  // Refreshed later; never keeps a page or a test process alive on its own.
  const refresh = setTimeout(() => startWispRanking(urls, options), REFRESH_MS);
  if (refresh && typeof refresh.unref === "function") refresh.unref();
  return rankingRun;
}

// Resolves once some server is known to work (or after `maxMs`), so a first
// request does not go to a dead server just because the check is still running.
export async function whenHealthy(maxMs = 2500) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (ranking && ranking.some((r) => r.ok)) return ranking;
    if (!rankingRun && ranking) return ranking;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ranking;
}

// Sorts a list of addresses by the latest ranking: working servers first (fastest
// first), then ones not tested yet, then the dead. Without a ranking, unchanged.
export function orderByHealth(urls) {
  if (!ranking) return urls;
  const rank = new Map(ranking.map((r, i) => [r.url, r]));
  const score = (u) => {
    const r = rank.get(u);
    if (!r) return 1; // not tested: after the working ones, before the dead
    return r.ok ? 0 : 2;
  };
  return [...urls].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff) return diff;
    const ra = rank.get(a);
    const rb = rank.get(b);
    return ra && rb && ra.ok && rb.ok ? ra.ms - rb.ms : urls.indexOf(a) - urls.indexOf(b);
  });
}

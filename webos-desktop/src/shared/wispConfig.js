import { os, StorageKeys } from "../framework.js";
import { currentRanking, orderByHealth } from "./wispHealth.js";

export const DEFAULT_WISP_URL = "wss://wisp.mercurywork.shop/";

export const WISP_SERVERS = [
  // Checked with real proxied traffic (a request out and the answer back), not
  // just a handshake. Mercury is the one most proxy sites point at.
  { name: "Mercury Wisp", url: DEFAULT_WISP_URL },
  { name: "Anura Wisp", url: "wss://anura.pro/" },
  { name: "Terbium Wisp", url: "wss://wisp.terbiumon.top/wisp/" },
  { name: "Space Wisp", url: "wss://gointospace.app/wisp/" },
  {
    name: "Reeyuki Wisp",
    url: "wss://hurt-agata-liventcord-api-7072e9a6.koyeb.app/",
  },
  { name: "Legacy Wisp (Epoxy only)", url: "wss://racialequityleadership.com/ws?reconnect=1" },
];

const RETIRED_WISP_URLS = ["wss://reeyukiwisp.onrender.com/"];

export const EPOXY_ONLY_WISP_URLS = [
  "wss://racialequityleadership.com/ws?reconnect=1",
];

export function isEpoxyOnlyWisp(url) {
  return EPOXY_ONLY_WISP_URLS.indexOf(String(url || "").trim()) !== -1;
}

export function getWispUrl() {
  let stored = os.storage.get(StorageKeys.wispServer);
  if (
    stored &&
    !stored.includes("?") &&
    !stored.includes("#") &&
    !stored.endsWith("/")
  ) {
    stored += "/";
  }
  if (!stored || RETIRED_WISP_URLS.indexOf(stored) !== -1) {
    stored = DEFAULT_WISP_URL;
    os.storage.set(StorageKeys.wispServer, stored);
  }
  return healthyOrSame(stored);
}

const isBuiltinWisp = (url) => WISP_SERVERS.some((s) => s.url === url);

// A built-in server that is not carrying traffic right now (see wispHealth.js)
// gives way to the fastest one that is. A server the member chose themselves is
// never swapped, and nothing is saved: the choice stays what it was.
function healthyOrSame(url) {
  const ranking = currentRanking();
  if (!ranking || !isBuiltinWisp(url)) return url;
  const mine = ranking.find((r) => r.url === url);
  if (!mine || mine.ok) return url;
  const best = ranking.find((r) => r.ok);
  return best ? best.url : url;
}

export function sanitizeWispUrlCandidate(url) {
  if (typeof url !== "string") {
    return "";
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "ws:" || protocol === "wss:") {
      return trimmed;
    }
  } catch {
    return "";
  }
  return "";
}

export function getWispCandidates(preferredUrl) {
  try {
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (value) => {
      const cleaned = sanitizeWispUrlCandidate(value);
      if (!cleaned) {
        return;
      }
      if (RETIRED_WISP_URLS.indexOf(cleaned) !== -1) {
        return;
      }
      if (seen.has(cleaned)) {
        return;
      }
      seen.add(cleaned);
      candidates.push(cleaned);
    };
    pushCandidate(preferredUrl);
    pushCandidate(os.storage.get(StorageKeys.wispServer));
    pushCandidate(DEFAULT_WISP_URL);
    for (const entry of WISP_SERVERS) {
      pushCandidate(entry.url);
    }
    const customList = os.storage.get(StorageKeys.browserCustomWisps);
    if (Array.isArray(customList)) {
      for (const item of customList) {
        if (typeof item === "string") {
          pushCandidate(item);
        } else if (item && typeof item.url === "string") {
          pushCandidate(item.url);
        }
      }
    }
    if (candidates.length === 0) {
      return [DEFAULT_WISP_URL];
    }
    // Servers the member added keep their place; the built-in ones go by what
    // is carrying traffic right now, fastest first.
    const custom = candidates.filter((c) => !isBuiltinWisp(c));
    const builtin = orderByHealth(candidates.filter((c) => isBuiltinWisp(c)));
    return [...custom, ...builtin];
  } catch {
    return [DEFAULT_WISP_URL];
  }
}

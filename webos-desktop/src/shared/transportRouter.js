import { probeWisp } from "./wispHealth.js";
import { os, StorageKeys } from "../framework.js";
import { getWispUrl, isEpoxyOnlyWisp } from "./wispConfig.js";
import {
  fetchViaWisp,
  fetchViaWispRaw,
  resetWispSessions,
} from "./libcurlWispClient.js";
import { fetchThroughWisp, resetWispTransport } from "./wispTransport.js";

const textPattern = /text|html|xml|json|javascript|css|svg|csv|yaml|markdown/i;
const titlePattern = /<title[^>]*>([^<]*)<\/title>/i;

export function getActiveTransport() {
  try {
    if (isEpoxyOnlyWisp(getWispUrl())) {
      return "epoxy";
    }
  } catch (wispErr) {
    void wispErr;
  }
  try {
    const stored = os.storage.get(StorageKeys.browserTransport);
    if (stored === "epoxy" || stored === "libcurl") {
      return stored;
    }
  } catch (err) {
    void err;
  }
  return "libcurl";
}

function extractTitle(html, fallback) {
  try {
    const match = titlePattern.exec(String(html || ""));
    if (match && match[1]) {
      const title = match[1].trim().slice(0, 200);
      if (title) {
        return title;
      }
    }
  } catch (err) {
    void err;
  }
  return fallback;
}

function readMime(response) {
  try {
    const rawType = response.headers.get("content-type") || "";
    return String(rawType).split(";")[0].trim().toLowerCase();
  } catch (err) {
    void err;
  }
  return "";
}

function buildForwarded(options) {
  return {
    method: options.method,
    headers: options.headers,
    range: options.range,
    wispUrl: options.wispUrl,
  };
}

function buildEpoxyOptions(options) {
  const headers = Object.assign({}, options.headers);
  if (options.range && !headers.Range && !headers.range) {
    headers.Range = options.range;
  }
  return {
    method: options.method || "GET",
    headers,
    wispUrl: options.wispUrl,
  };
}

async function fetchPageWithLibcurl(target, options) {
  const result = await fetchViaWisp(target, buildForwarded(options));
  const usedWispUrl = result.usedWispUrl || options.wispUrl || "";
  return {
    status: result.status,
    contentType: result.contentType,
    text: result.text,
    blobUrl: result.blobUrl,
    title: result.title,
    usedWispUrl,
    fallbackUsed:
      result.fallbackUsed === true ||
      (usedWispUrl !== "" &&
        String(options.wispUrl || "") !== "" &&
        usedWispUrl !== options.wispUrl),
  };
}

async function fetchPageWithEpoxy(target, options) {
  const response = await fetchThroughWisp(target, buildEpoxyOptions(options));
  const status = response.status || 0;
  const mime = readMime(response);
  const usedWispUrl = options.wispUrl || "";
  if (!mime || textPattern.test(mime)) {
    const text = await response.text();
    return {
      status,
      contentType: mime,
      text,
      blobUrl: null,
      title: extractTitle(text, target),
      usedWispUrl,
      fallbackUsed: false,
    };
  }
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: mime || "application/octet-stream" });
  return {
    status,
    contentType: mime,
    text: null,
    blobUrl: URL.createObjectURL(blob),
    title: target,
    usedWispUrl,
    fallbackUsed: false,
  };
}

export async function fetchPage(target, opts = {}) {
  const options = opts || {};
  const primary = getActiveTransport() !== "epoxy" ? "libcurl" : "epoxy";
  try {
    if (primary !== "epoxy") {
      return await fetchPageWithLibcurl(target, options);
    }
    return await fetchPageWithEpoxy(target, options);
  } catch (primaryErr) {
    void primaryErr;
    let secondaryResult = null;
    if (primary !== "epoxy") {
      secondaryResult = await fetchPageWithEpoxy(target, options);
    } else {
      secondaryResult = await fetchPageWithLibcurl(target, options);
    }
    secondaryResult.fallbackUsed = true;
    return secondaryResult;
  }
}

async function fetchRawWithLibcurl(target, options) {
  const result = await fetchViaWispRaw(target, buildForwarded(options));
  const usedWispUrl = result.usedWispUrl || options.wispUrl || "";
  return {
    status: result.status,
    contentType: result.contentType,
    headers: result.headers,
    buffer: result.buffer,
    usedWispUrl,
    fallbackUsed:
      result.fallbackUsed === true ||
      (usedWispUrl !== "" &&
        String(options.wispUrl || "") !== "" &&
        usedWispUrl !== options.wispUrl),
  };
}

async function fetchRawWithEpoxy(target, options) {
  const response = await fetchThroughWisp(target, buildEpoxyOptions(options));
  const buffer = await response.arrayBuffer();
  const bag = {};
  try {
    response.headers.forEach((value, key) => {
      bag[String(key).toLowerCase()] = value;
    });
  } catch (err) {
    void err;
  }
  return {
    status: response.status || 0,
    contentType: readMime(response),
    headers: bag,
    buffer,
    usedWispUrl: options.wispUrl || "",
    fallbackUsed: false,
  };
}

export async function fetchRaw(target, opts = {}) {
  const options = opts || {};
  const primary = getActiveTransport() !== "epoxy" ? "libcurl" : "epoxy";
  try {
    if (primary !== "epoxy") {
      return await fetchRawWithLibcurl(target, options);
    }
    return await fetchRawWithEpoxy(target, options);
  } catch (primaryErr) {
    void primaryErr;
    let secondaryResult = null;
    if (primary !== "epoxy") {
      secondaryResult = await fetchRawWithEpoxy(target, options);
    } else {
      secondaryResult = await fetchRawWithLibcurl(target, options);
    }
    secondaryResult.fallbackUsed = true;
    return secondaryResult;
  }
}

export function resetTransports() {
  try {
    resetWispSessions();
  } catch (sessionErr) {
    void sessionErr;
  }
  try {
    resetWispTransport();
  } catch (transportErr) {
    void transportErr;
  }
}

// Whether a server is actually carrying traffic, not just accepting connections.
export function checkWispHealth(url, timeoutMs = 8000) {
  return probeWisp(url, { timeoutMs });
}

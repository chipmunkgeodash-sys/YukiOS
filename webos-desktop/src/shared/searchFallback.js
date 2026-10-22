const BLOCKING_ENGINE_HOSTS = [
  "duckduckgo.com",
  "html.duckduckgo.com",
  "lite.duckduckgo.com",
  "search.brave.com",
];

const CHALLENGE_PATTERNS = [
  /bots use DuckDuckGo too/i,
  /flagged as being suspicious/i,
  /schedule a captcha/i,
];

const FALLBACK_SEARCH_BASE = "https://www.bing.com/search?q=";
const FALLBACK_NAME = "Bing";

export function isEngineChallenge(url, html) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!BLOCKING_ENGINE_HOSTS.includes(host)) return false;
  const text = String(html || "");
  return CHALLENGE_PATTERNS.some((pattern) => pattern.test(text));
}

export function fallbackSearch(url) {
  try {
    const query = new URL(url).searchParams.get("q");
    if (!query) return null;
    return {
      name: FALLBACK_NAME,
      url: FALLBACK_SEARCH_BASE + encodeURIComponent(query),
    };
  } catch {
    return null;
  }
}

export const SOCIAL_BASE = "https://analytics.liventcord-a60.workers.dev";
export const SOCIAL_ACTIVITY_ENDPOINT = `${SOCIAL_BASE}/live/activity`;
export const SOCIAL_NOW_PLAYING_ENDPOINT = `${SOCIAL_BASE}/live/now-playing`;
// Embedded builds (Astral OS) send nothing to the upstream analytics worker.
export const ANALYTICS_NETWORK_DISABLED =
  import.meta.env?.VITE_DEV_BUILD === "true" ||
  import.meta.env?.VITE_EMBED === "true";

function disabledResponse() {
  try {
    return new Response(JSON.stringify({}), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return { ok: false, json: () => Promise.resolve({}) };
  }
}

export function analyticsFetch(input, init) {
  if (ANALYTICS_NETWORK_DISABLED) return Promise.resolve(disabledResponse());
  return fetch(input, init);
}

export function analyticsBeaconAvailable() {
  try {
    return !ANALYTICS_NETWORK_DISABLED && !!navigator.sendBeacon;
  } catch {
    return false;
  }
}

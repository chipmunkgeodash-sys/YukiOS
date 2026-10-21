import { ADSTERRA_KEYS, ADS_BLOCKED } from "../../ads.js";

const closeTimers = new WeakMap();
const showTimers = new WeakMap();
const DISMISS_KEY = "yukiBrowserAdDismissedAt";
const INITIAL_DELAY_MS = 12000;
const RESHOW_COOLDOWN_MS = 8 * 60 * 1000;
const CLOSE_LOCK_MS = 2000;

function getDismissedAt() {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (dismissErr) {
    void dismissErr;
    return 0;
  }
}

function getCooldownRemaining() {
  const dismissedAt = getDismissedAt();
  if (!dismissedAt) return 0;
  return Math.max(0, dismissedAt + RESHOW_COOLDOWN_MS - Date.now());
}

function isCoolingDown() {
  return getCooldownRemaining() > 0;
}

function markDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (markErr) {
    void markErr;
  }
}

function clearShowTimer(adBar) {
  const pending = showTimers.get(adBar);
  if (pending) {
    clearTimeout(pending);
    showTimers.delete(adBar);
  }
}

function injectAdScripts(adSlot) {
  if (ADS_BLOCKED) return;
  adSlot.setAttribute("data-ads-loaded", "1");
  const cfg = document.createElement("script");
  cfg.text =
    "atOptions = { 'key': '" +
    ADSTERRA_KEYS.leaderboard +
    "', 'format': 'iframe', 'height': 90, 'width': 728, 'params': {} };";
  adSlot.appendChild(cfg);
  const invoke = document.createElement("script");
  invoke.async = true;
  invoke.src =
    "https://www.highperformanceformat.com/" +
    ADSTERRA_KEYS.leaderboard +
    "/invoke.js";
  adSlot.appendChild(invoke);
}

function renderAd(adBar, adClose, adSlot) {
  if (!adBar || !adSlot || !adBar.isConnected) return;
  if (isCoolingDown()) {
    scheduleReshow(adBar, adClose, adSlot);
    return;
  }
  if (adSlot.getAttribute("data-ads-loaded") === "1") {
    adBar.style.display = "flex";
  } else {
    injectAdScripts(adSlot);
    adBar.style.display = "flex";
  }
  bindBrowserAdClose(adBar, adClose, adSlot);
}

function scheduleReshow(adBar, adClose, adSlot) {
  if (!adBar) return;
  clearShowTimer(adBar);
  const wait = Math.max(getCooldownRemaining(), 1000);
  showTimers.set(
    adBar,
    setTimeout(() => {
      showTimers.delete(adBar);
      renderAd(adBar, adClose, adSlot);
    }, wait),
  );
}

export function bindBrowserAdClose(adBar, adClose, adSlot) {
  if (!adBar || !adClose) return;
  if (adClose.dataset.bound !== "1") {
    adClose.dataset.bound = "1";
    adClose.addEventListener("click", () => {
      if (adClose.disabled) return;
      adBar.style.display = "none";
      if (adSlot) {
        adSlot.removeAttribute("data-ads-loaded");
        adSlot.replaceChildren();
      }
      markDismissed();
      const pending = closeTimers.get(adClose);
      if (pending) {
        clearTimeout(pending);
        closeTimers.delete(adClose);
      }
      scheduleReshow(adBar, adClose, adSlot);
    });
  }
  adClose.disabled = true;
  const pending = closeTimers.get(adClose);
  if (pending) clearTimeout(pending);
  closeTimers.set(
    adClose,
    setTimeout(() => {
      adClose.disabled = false;
      closeTimers.delete(adClose);
    }, CLOSE_LOCK_MS),
  );
}

export function enableBrowserAds(adBar, adClose, adSlot) {
  if (!adBar || !adSlot) return;
  adBar.style.display = "none";
  clearShowTimer(adBar);
  if (adSlot.getAttribute("data-ads-loaded") === "1") {
    renderAd(adBar, adClose, adSlot);
    return;
  }
  if (isCoolingDown()) {
    scheduleReshow(adBar, adClose, adSlot);
    return;
  }
  showTimers.set(
    adBar,
    setTimeout(() => {
      showTimers.delete(adBar);
      renderAd(adBar, adClose, adSlot);
    }, INITIAL_DELAY_MS),
  );
}

export function disableBrowserAds(adBar, adSlot) {
  if (adBar) {
    clearShowTimer(adBar);
    adBar.style.display = "none";
  }
  if (adSlot) {
    adSlot.removeAttribute("data-ads-loaded");
    adSlot.replaceChildren();
  }
}

import "../styles/infaredYoutube.css";
import { BaseApp, os } from "../framework.js";
import { $, bindEvent, setText } from "../shared/domUtils.js";
import { getWispUrl } from "../shared/wispConfig.js";
import { siteUrl } from "../shared/siteBase.js";

const SOURCE = "https://youtube-liard-ten.vercel.app/";

export class InfaredYoutubeApp extends BaseApp {
  constructor(services) {
    super(services);
    this.openWindows = new Set();
    this.activeMode = new Map();
  }

  getSource() {
    return SOURCE;
  }

  getScramjetUrl() {
    const wispUrl = getWispUrl();
    return (
      siteUrl("sapps/set-template.html") +
      "?wisp=" +
      encodeURIComponent(wispUrl) +
      "&target=" +
      encodeURIComponent(SOURCE)
    );
  }

  buildShell() {
    return (
      '<div class="infared-root">' +
      '<div class="infared-loading"><div class="infared-spinner"></div>' +
      '<div class="infared-loading-text">Loading Infared...</div>' +
      '<div class="infared-status"></div></div>' +
      '<iframe class="infared-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"></iframe>' +
      '<div class="infared-fallback-bar"><span class="infared-fallback-text"></span>' +
      '<button class="infared-retry-btn">Try direct</button></div></div>'
    );
  }

  showIframe(refs) {
    if (refs.loading) refs.loading.style.display = "none";
    if (refs.iframe) refs.iframe.classList.add("is-visible");
  }

  loadDirect(refs, winId) {
    this.activeMode.set(winId, "direct");
    setText(refs.status, "Loading Infared...");
    if (refs.fallbackBar) refs.fallbackBar.classList.remove("is-visible");
    if (refs.loading) refs.loading.style.display = "flex";
    if (refs.iframe) refs.iframe.classList.remove("is-visible");
    refs.iframe.src = SOURCE;
  }

  loadViaScramjet(refs, winId, reason) {
    if (this.activeMode.get(winId) === "scramjet") return;
    this.activeMode.set(winId, "scramjet");
    setText(refs.status, reason);
    setText(refs.fallbackText, reason);
    if (refs.fallbackBar) refs.fallbackBar.classList.add("is-visible");
    if (refs.loading) refs.loading.style.display = "none";
    refs.iframe.src = this.getScramjetUrl();
    refs.iframe.classList.add("is-visible");
    try {
      os.notify.send("Infared Youtube", reason, {
        type: "info",
        duration: 3000,
      });
    } catch {}
  }

  async open() {
    const winId = "infared-youtube-win";
    if (await this.isSingletonOpen(winId)) return;
    if (this.openWindows.has(winId)) return;

    const win = os.window.create(winId, "Infared Youtube", "90vw", "85vh", {
      icon: "static/icons/youtube.webp",
      appId: "infaredYoutubeApp",
    });
    win.innerHTML = this.buildShell();

    const refs = {
      iframe: $(".infared-iframe", win),
      loading: $(".infared-loading", win),
      status: $(".infared-status", win),
      fallbackBar: $(".infared-fallback-bar", win),
      fallbackText: $(".infared-fallback-text", win),
      retryBtn: $(".infared-retry-btn", win),
    };

    this.openWindows.add(winId);
    bindEvent(win, "remove", () => {
      this.openWindows.delete(winId);
      this.activeMode.delete(winId);
    });

    bindEvent(refs.iframe, "load", () => this.showIframe(refs));
    bindEvent(refs.iframe, "error", () =>
      this.loadViaScramjet(
        refs,
        winId,
        "Direct load failed, switched to proxy",
      ),
    );
    bindEvent(refs.retryBtn, "click", () => this.loadDirect(refs, winId));

    this.loadDirect(refs, winId);

    setTimeout(() => {
      if (this.activeMode.get(winId) !== "direct") return;
      this.showIframe(refs);
    }, 8000);
  }

  onClose(winId) {
    this.openWindows.delete(winId);
    this.activeMode.delete(winId);
  }
}

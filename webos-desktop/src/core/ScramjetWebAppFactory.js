import { ScramjetBaseApp } from "./ScramjetBaseApp.js";
import {
  handlePopupMessage,
  handlePopupTitleMessage,
} from "./ScramjetPopupManager.js";
import { os, StorageKeys } from "../framework.js";
import { $, bindEvent, createElement } from "../shared/domUtils.js";

export function createScramjetWebApp(config) {
  const {
    appId,
    appName,
    targetUrl,
    appIcon,
    windowSize = ["1280px", "800px"],
    trayOptions = null,
    musicUrl = null,
    startMaximized = false,
    directLoad = false,
  } = config;

  class ScramjetWebApp extends ScramjetBaseApp {
    constructor(services) {
      super(services);
      this.winId = null;
      this.trayOptions = trayOptions;
      this.appMusic = null;
      this.appMusicTimer = null;
      this.musicBtn = null;
      this.musicMuted =
        os.storage.get(StorageKeys.webAppMusicMuted) !== "false";
    }

    getTargetURL() {
      return targetUrl;
    }

    getAppId() {
      return appId;
    }

    getAppName() {
      return appName;
    }

    getAppIcon() {
      return appIcon;
    }

    getWindowSize() {
      return windowSize;
    }

    isDirectLoad() {
      return directLoad;
    }

    startAppMusic() {
      if (!musicUrl || this.appMusic || this.appMusicTimer) return;
      this.appMusicTimer = setTimeout(() => {
        this.appMusicTimer = null;
        if (this.appMusic) return;
        this.appMusic = new Audio(musicUrl);
        this.appMusic.loop = true;
        if (!this.musicMuted) this.appMusic.play().catch(() => {});
      }, 3000);
    }

    toggleAppMusic() {
      this.musicMuted = !this.musicMuted;
      os.storage.set(StorageKeys.webAppMusicMuted, String(this.musicMuted));
      if (this.musicMuted) {
        if (this.appMusic) this.appMusic.pause();
      } else if (this.appMusic) {
        this.appMusic.play().catch(() => {});
      } else if (musicUrl) {
        this.appMusic = new Audio(musicUrl);
        this.appMusic.loop = true;
        this.appMusic.play().catch(() => {});
      }
      this.refreshMusicButton();
    }

    refreshMusicButton() {
      if (!this.musicBtn) return;
      this.musicBtn.innerHTML = `<i class="fas ${this.musicMuted ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
      this.musicBtn.setAttribute(
        "title",
        this.musicMuted ? "Unmute music" : "Mute music",
      );
    }

    buildMusicButton(win) {
      if (!musicUrl || win.querySelector(".webapp-music-btn")) return;
      const btn = createElement("button", {
        className: "webapp-music-btn",
        attributes: { type: "button", title: "Mute music" },
      });
      bindEvent(btn, "click", () => this.toggleAppMusic());
      win.appendChild(btn);
      this.musicBtn = btn;
      this.refreshMusicButton();
    }

    stopAppMusic() {
      if (this.appMusicTimer) {
        clearTimeout(this.appMusicTimer);
        this.appMusicTimer = null;
      }
      if (!this.appMusic) return;
      this.appMusic.pause();
      this.appMusic.src = "";
      this.appMusic = null;
    }

    async open(opts = {}) {
      const win = await super.open(opts);
      if (win && startMaximized) os.window.applySnap(win, "maximize");
      if (!musicUrl) return win;
      if (!this.musicMuted) this.startAppMusic();
      if (win) {
        this.buildMusicButton(win);
        win.addEventListener("remove", () => {
          this.musicBtn = null;
          this.stopAppMusic();
        });
      }
      return win;
    }

    async initScramjet(payload, vt, element, state) {
      this.winId = `${this.getAppId()}-window`;
      await super.initScramjet(payload, vt, element, state);

      const popupIframe = element.querySelector("iframe");
      if (popupIframe && !element.dataset.popupBridgeBound) {
        element.dataset.popupBridgeBound = "true";
        const popupHandler = (event) => {
          try {
            const meta = {
              parentAppId: this.getAppId(),
              parentName: this.getAppName(),
              parentIcon: this.getAppIcon(),
            };
            if (handlePopupTitleMessage(event)) {
              return;
            }
            handlePopupMessage(event, popupIframe, meta);
          } catch {}
        };
        this.popupMessageHandler = popupHandler;
        window.addEventListener("message", popupHandler);
        element.addEventListener("remove", () => {
          try {
            window.removeEventListener("message", popupHandler);
          } catch {}
        });
      }

      if (this.trayOptions) {
        os.tray.register(this.winId, this.getAppIcon(), this.getAppName(), {
          showInTray: true,
          priority: 50,
          ...this.trayOptions,
          onClick: () => {
            if (this.trayOptions.onClick) {
              this.trayOptions.onClick();
            } else {
              os.tray.restoreFromTray(this.winId);
            }
          },
          onQuit: () => {
            if (this.trayOptions.onQuit) {
              this.trayOptions.onQuit();
            } else {
              os.window.close(this.winId);
            }
          },
        });
      }
    }

    cleanupScramjet() {
      this.stopAppMusic();
      if (this.winId) {
        os.tray.unregister(this.winId);
      }
      super.cleanupScramjet();
    }
  }

  ScramjetWebApp.appId = appId;
  ScramjetWebApp.appName = appName;

  return ScramjetWebApp;
}

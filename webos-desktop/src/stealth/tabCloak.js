import { os } from "../framework.js";
import { StorageKeys } from "../StorageKeys.js";

export const CLOAK_PRESETS = {
  none: null,
  google: {
    label: "Google",
    title: "Google",
    icon: "https://www.google.com/favicon.ico",
  },
  classroom: {
    label: "Google Classroom",
    title: "Home - Google Classroom",
    icon: "https://classroom.google.com/favicon.ico",
  },
  docs: {
    label: "Google Docs",
    title: "Untitled document - Google Docs",
    icon: "https://docs.google.com/favicon.ico",
  },
  drive: {
    label: "Google Drive",
    title: "My Drive - Google Drive",
    icon: "https://drive.google.com/favicon.ico",
  },
  slides: {
    label: "Google Slides",
    title: "Untitled presentation - Google Slides",
    icon: "https://slides.google.com/favicon.ico",
  },
  sheets: {
    label: "Google Sheets",
    title: "Untitled spreadsheet - Google Sheets",
    icon: "https://sheets.google.com/favicon.ico",
  },
  gmail: {
    label: "Gmail",
    title: "Gmail",
    icon: "https://mail.google.com/favicon.ico",
  },
  meet: {
    label: "Google Meet",
    title: "Google Meet",
    icon: "https://meet.google.com/favicon.ico",
  },
  canvas: {
    label: "Canvas",
    title: "Dashboard - Canvas",
    icon: "https://www.instructure.com/favicon.ico",
  },
  schoology: {
    label: "Schoology",
    title: "Home | Schoology",
    icon: "https://www.schoology.com/favicon.ico",
  },
  khan: {
    label: "Khan Academy",
    title: "Khan Academy",
    icon: "https://www.khanacademy.org/favicon.ico",
  },
  quizlet: {
    label: "Quizlet",
    title: "Quizlet",
    icon: "https://quizlet.com/favicon.ico",
  },
  edpuzzle: {
    label: "Edpuzzle",
    title: "Edpuzzle",
    icon: "https://edpuzzle.com/favicon.ico",
  },
  clever: {
    label: "Clever",
    title: "Clever | Log in",
    icon: "https://www.clever.com/favicon.ico",
  },
  ixl: {
    label: "IXL",
    title: "IXL | Dashboard",
    icon: "https://www.ixl.com/favicon.ico",
  },
  wikipedia: {
    label: "Wikipedia",
    title: "Wikipedia, the free encyclopedia",
    icon: "https://www.wikipedia.org/favicon.ico",
  },
};

export const PANIC_PRESETS = {
  classroom: { label: "Google Classroom", url: "https://classroom.google.com" },
  google: { label: "Google", url: "https://www.google.com" },
  khan: { label: "Khan Academy", url: "https://www.khanacademy.org" },
  wikipedia: { label: "Wikipedia", url: "https://www.wikipedia.org" },
  quizlet: { label: "Quizlet", url: "https://quizlet.com" },
  canvas: { label: "Canvas", url: "https://www.instructure.com" },
  schoology: { label: "Schoology", url: "https://www.schoology.com" },
  custom: { label: "Custom…", url: "" },
};

export const DEFAULT_DECOY = "https://classroom.google.com";
const ABOUT_BLANK_DONE_KEY = "yukiOS_about_blank_done";

function getFaviconLink() {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

class TabCloak {
  constructor() {
    this.panicHandler = null;
    this.beforeunloadHandler = null;
  }

  getCloakKey() {
    try {
      return os.storage.get(StorageKeys.tabCloak) || "none";
    } catch {
      return "none";
    }
  }

  applyCloak(key) {
    const preset = CLOAK_PRESETS[key];
    if (!key || key === "none" || !preset) {
      this.resetCloak();
      return;
    }
    try {
      os.storage.set(StorageKeys.tabCloak, key);
    } catch {
      /* ignore */
    }
    document.title = preset.title;
    try {
      getFaviconLink().href = preset.icon;
    } catch {
      /* ignore */
    }
    window.__yukiCloakActive = true;
  }

  resetCloak() {
    try {
      os.storage.set(StorageKeys.tabCloak, "none");
    } catch {
      /* ignore */
    }
    window.__yukiCloakActive = false;
    try {
      const wm = os.windowManager || os.window;
      if (wm && typeof wm.resetToDefaultState === "function") {
        wm.resetToDefaultState();
        return;
      }
      if (wm && wm.manager && typeof wm.manager.initialTitle === "string") {
        document.title = wm.manager.initialTitle;
        getFaviconLink().href = wm.manager.initialFavicon || "";
        return;
      }
    } catch {
      /* ignore */
    }
    document.title = "Astral OS";
  }

  isCloakActive() {
    return window.__yukiCloakActive === true;
  }

  setBeforeunloadProtect(enabled) {
    try {
      os.storage.set(
        StorageKeys.beforeunloadProtect,
        enabled ? "true" : "false",
      );
    } catch {
      /* ignore */
    }
    this.applyBeforeunloadProtect();
  }

  isBeforeunloadProtectEnabled() {
    try {
      return os.storage.get(StorageKeys.beforeunloadProtect) === "true";
    } catch {
      return false;
    }
  }

  applyBeforeunloadProtect() {
    if (this.beforeunloadHandler) {
      window.removeEventListener("beforeunload", this.beforeunloadHandler);
      this.beforeunloadHandler = null;
    }
    if (this.isBeforeunloadProtectEnabled()) {
      this.beforeunloadHandler = (e) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", this.beforeunloadHandler);
    }
  }

  getPanicKey() {
    try {
      return os.storage.get(StorageKeys.panicKey) || "";
    } catch {
      return "";
    }
  }

  setPanicKey(code) {
    try {
      os.storage.set(StorageKeys.panicKey, code || "");
    } catch {
      /* ignore */
    }
  }

  getPanicUrl() {
    try {
      return (
        os.storage.get(StorageKeys.panicUrl) || PANIC_PRESETS.classroom.url
      );
    } catch {
      return PANIC_PRESETS.classroom.url;
    }
  }

  setPanicUrl(url) {
    try {
      os.storage.set(StorageKeys.panicUrl, url || "");
    } catch {
      /* ignore */
    }
  }

  panicNow() {
    const url = this.getPanicUrl();
    if (!url) return;
    try {
      window.location.replace(url);
    } catch {
      /* ignore */
    }
  }

  enablePanicListener() {
    if (this.panicHandler) return;
    this.panicHandler = (e) => {
      const code = this.getPanicKey();
      if (!code) return;
      if (e.code !== code) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      this.panicNow();
    };
    document.addEventListener("keydown", this.panicHandler, true);
  }

  openAboutBlank(decoyUrl) {
    const decoy = decoyUrl || DEFAULT_DECOY;
    try {
      os.storage.set(StorageKeys.tabCloakDecoy, decoy);
    } catch {
      /* ignore */
    }
    const pageUrl = window.location.href;
    const popup = window.open("about:blank", "_blank");
    if (!popup) return false;
    try {
      popup.document.write(
        "<!DOCTYPE html><html><head><title>Loading…</title>" +
          "<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}" +
          "iframe{border:0;width:100%;height:100%}</style></head><body>" +
          `<iframe src="${pageUrl.replace(/"/g, "&quot;")}" allowfullscreen></iframe>` +
          "</body></html>",
      );
      popup.document.close();
    } catch {
      /* ignore cross-origin write failure */
    }
    try {
      sessionStorage.setItem(ABOUT_BLANK_DONE_KEY, "1");
    } catch {
      /* ignore */
    }
    try {
      window.location.replace(decoy);
    } catch {
      /* ignore */
    }
    return true;
  }

  init() {
    const key = this.getCloakKey();
    if (key && key !== "none" && CLOAK_PRESETS[key]) {
      // Re-apply stored cloak on boot (title/icon only, key already stored).
      const preset = CLOAK_PRESETS[key];
      document.title = preset.title;
      try {
        getFaviconLink().href = preset.icon;
      } catch {
        /* ignore */
      }
      window.__yukiCloakActive = true;
    }
    this.applyBeforeunloadProtect();
    this.enablePanicListener();
    this.checkAutoCloakOnBoot();
  }

  isAutoCloakOnBootEnabled() {
    try {
      return (
        os.storage.get(StorageKeys.autoCloakOnBoot) === "true" ||
        os.storage.get(StorageKeys.autoCloakOnBoot) === "1"
      );
    } catch {
      return false;
    }
  }

  setAutoCloakOnBoot(enabled) {
    try {
      os.storage.set(StorageKeys.autoCloakOnBoot, enabled ? "true" : "false");
    } catch {}
  }

  checkAutoCloakOnBoot() {
    if (!this.isAutoCloakOnBootEnabled()) return;
    if (window.top !== window.self) return;
    try {
      if (sessionStorage.getItem(ABOUT_BLANK_DONE_KEY) === "1") return;
    } catch {}
    const decoy = this.getPanicUrl() || DEFAULT_DECOY;
    this.openAboutBlank(decoy);
  }
}

let instance = null;
export function tabCloak() {
  if (!instance) instance = new TabCloak();
  return instance;
}

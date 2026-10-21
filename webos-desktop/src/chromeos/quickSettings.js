import { createElement, os, StorageKeys, ServiceKeys } from "../framework.js";
import { $ } from "../shared/domUtils.js";
import { subscribeTimeTick } from "../services/timeWorker.js";
import {
  createCalendarPopup,
  closeCalendarPopup,
  isCalendarPinned,
} from "../apps/calendar.js";
import { getTrayPosition } from "../tray/tray.js";
import { audioMixer } from "../audioMixer.js";
import { launchSettingsPane } from "../settings/settingsNav.js";
import {
  renderRangeSlider,
  bindRangeSlider,
  getRangeSliderValue,
  setRangeSliderValue,
} from "../shared/rangeSlider.js";
import { BusEvents } from "../core/EventBus.js";
import { trayManager } from "../tray/tray.js";
import { callIfFunction } from "../shared/functionUtils.js";
import { createTrayPinButton, setTrayPinState } from "../shared/trayPin.js";
import { downloadPage } from "../utils/utils.js";
import { toggleStylusMenu } from "./stylusMenu.js";
import { batteryService } from "../services/batteryService.js";

const HIDDEN_TRAY_IDS = [
  "audio-mixer",
  "network-tray-window",
  "display-performance-window",
];

export class ChromeOsQuickSettings {
  constructor(shelf) {
    this.shelf = shelf;
    this.el = null;
    this.clockEl = null;
    this.dateEl = null;
    this.iconsEl = null;
    this.panelVisible = false;
    this.pinned = false;
    this.clock24h = false;
    this.batteryInfo = { level: 1, charging: true, percent: 100 };
    this.unsubscribeBattery = null;
    this.unsubscribeClock = null;

    this.boundBatteryUpdate = this.onBatteryUpdate.bind(this);
    this.boundOutside = this.onOutsideClick.bind(this);
    this.boundCalendarClose = this.onCalendarClose.bind(this);
    this.boundSettings = this.onSettingsChanged.bind(this);
  }

  init() {
    if (this.el) return;
    this.loadPrefs();
    this.buildPill();
    this.startClock();
    this.unsubscribeBattery = batteryService.subscribe((snap) =>
      this.onBatteryUpdate(snap),
    );
    os.events.on(BusEvents.SETTINGS_CHANGED, this.boundSettings);
  }

  destroy() {
    if (!this.el) return;
    this.closePanel();
    this.stopClock();
    if (this.unsubscribeBattery) {
      this.unsubscribeBattery();
      this.unsubscribeBattery = null;
    }
    os.events.off(BusEvents.SETTINGS_CHANGED, this.boundSettings);
    document.removeEventListener("click", this.boundCalendarClose);
    document.removeEventListener("click", this.boundOutside);
    this.el.remove();
    this.el = null;
  }

  loadPrefs() {
    this.clock24h = os.storage.get(StorageKeys.chromeOsClock24h) === "true";
  }

  buildPill() {
    const rightSection = $(".shelf-right", this.shelf.el);
    if (!rightSection) return;

    this.el = createElement("div", { className: "shelf-status" });
    this.clockEl = createElement("div", { className: "shelf-status-clock" });
    this.dateEl = createElement("div", { className: "shelf-status-date" });
    this.iconsEl = createElement("div", { className: "shelf-status-icons" });
    this.el.appendChild(this.clockEl);
    this.el.appendChild(this.iconsEl);
    this.shelfBatteryBtn = createElement("button", {
      className: "tray-icon-btn shelf-battery-btn",
    });
    this.shelfBatteryBtn.title = "Display & Performance";
    this.shelfBatteryBtn.dataset.winId = "display-performance-window";
    this.shelfBatteryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.shelfBatteryBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      trayManager.showContextMenu(
        e,
        "display-performance-window",
        "Display & Performance",
      );
    });

    this.el.appendChild(this.shelfBatteryBtn);

    this.dateEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCalendar();
    });

    this.clockEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCalendar();
    });
    this.iconsEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const downloadBall = createElement("div", {
      className: "shelf-status-ball",
    });
    downloadBall.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    downloadBall.title = "Download Astral OS";
    downloadBall.addEventListener("click", () => {
      downloadPage((msg) => os.notify.send("Download Page", msg));
    });
    rightSection.appendChild(downloadBall);
    const usBall = createElement("div", { className: "shelf-status-ball" });
    usBall.innerHTML = `<span class="shelf-ball-text">US</span>`;
    rightSection.appendChild(usBall);
    const penBall = createElement("div", { className: "shelf-status-ball" });
    penBall.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
    penBall.title = "Stylus Menu";
    penBall.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleStylusMenu();
    });
    rightSection.appendChild(penBall);
    rightSection.appendChild(this.dateEl);
    rightSection.appendChild(this.el);
    this.updateClock();
    this.updateStatusIcons();
  }

  startClock() {
    this.stopClock();
    this.updateClock();
    this.unsubscribeClock = subscribeTimeTick(() => this.updateClock());
  }

  stopClock() {
    if (this.unsubscribeClock) {
      this.unsubscribeClock();
      this.unsubscribeClock = null;
    }
  }

  updateClock() {
    if (!this.clockEl) return;
    const now = new Date();
    const opts = this.clock24h
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour: "numeric", minute: "2-digit" };
    this.clockEl.innerHTML = `
      <span class="shelf-clock-time">${now.toLocaleTimeString([], opts)}</span>
    `;
    this.clockEl.title = now.toLocaleString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (this.dateEl) {
      this.dateEl.textContent = now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      this.dateEl.title = now.toLocaleDateString([], {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  onBatteryUpdate(snap) {
    this.batteryInfo = { level: snap.level, charging: snap.charging };
    this.updateStatusIcons();
  }

  shelfBatteryIconHtml() {
    return `<i class="${batteryService.getFaIconClass()}"></i>`;
  }

  updateStatusIcons() {
    if (!this.iconsEl) return;
    this.iconsEl.innerHTML = `
      <i class="fas fa-wifi"></i>
    `;
    if (this.shelfBatteryBtn) {
      this.shelfBatteryBtn.innerHTML = this.shelfBatteryIconHtml();
    }
  }

  toggleCalendar() {
    createCalendarPopup();
    document.addEventListener("click", this.boundCalendarClose);
  }

  onCalendarClose(e) {
    if (isCalendarPinned()) return;
    const popup = $("#calendar-popup");
    if (
      popup &&
      !popup.contains(e.target) &&
      !e.target.closest(".shelf-status-clock") &&
      !e.target.closest(".shelf-status-date")
    ) {
      closeCalendarPopup();
      document.removeEventListener("click", this.boundCalendarClose);
    }
  }

  toggle() {
    this.panelVisible ? this.closePanel() : this.openPanel();
  }

  async openPanel() {
    if (this.panelVisible) return;
    this.closeCalendarPopup();

    const existing = $("#chromeos-quick-settings");
    if (existing) existing.remove();

    const panel = createElement("div", { id: "chromeos-quick-settings" });
    panel.innerHTML = await this.buildPanelHTML();
    document.body.appendChild(panel);
    const pinBtn = createTrayPinButton();
    pinBtn.classList.add("tray-pin-btn--corner");
    pinBtn.addEventListener("click", () => {
      this.pinned = !this.pinned;
      setTrayPinState(panel, pinBtn, this.pinned);
    });
    panel.appendChild(pinBtn);
    setTrayPinState(panel, pinBtn, this.pinned);

    const pos = getTrayPosition();
    if (pos) {
      panel.style.left = pos.left;
      if (pos.right) panel.style.right = pos.right;
      if (pos.top) panel.style.top = pos.top;
      if (pos.bottom) panel.style.bottom = pos.bottom;
    }
    panel.style.display = "block";

    this.panelVisible = true;
    if (this.dateEl) this.dateEl.classList.add("selected");
    this.bindPanel(panel);
    document.addEventListener("click", this.boundOutside);
  }

  closePanel() {
    const panel = $("#chromeos-quick-settings");
    if (panel) {
      panel.classList.add("closing");
      panel.addEventListener("animationend", () => panel.remove(), {
        once: true,
      });
    }
    this.panelVisible = false;
    if (this.dateEl) this.dateEl.classList.remove("selected");
    document.removeEventListener("click", this.boundOutside);
  }

  closeCalendarPopup() {
    closeCalendarPopup();
    document.removeEventListener("click", this.boundCalendarClose);
  }

  onOutsideClick(e) {
    if (this.pinned) return;
    const panel = $("#chromeos-quick-settings");
    if (
      panel &&
      !e.target.closest("#chromeos-quick-settings") &&
      !e.target.closest(".shelf-status-icons") &&
      !e.target.closest(".shelf-status-clock") &&
      !e.target.closest(".shelf-status-date")
    ) {
      this.closePanel();
    }
  }

  async buildPanelHTML() {
    const mixer = audioMixer();
    const volume = Math.round((mixer.masterVolume || 1) * 100);
    const brightness =
      parseInt(os.storage.get(StorageKeys.brightness), 10) || 100;
    const dnd = os.notify.getDoNotDisturb();
    const footerText = batteryService.getFooterText();
    const trayItems = this.getTrayItems();
    let chaosActive = false;
    try {
      const physics = await import("../shared/desktopPhysics.js");
      chaosActive = physics.isPhysicsChaosActive();
    } catch {}

    return `
      <div class="chromeos-qs">
        <div class="chromeos-qs-main">
          <button class="chromeos-qs-wide" style="color:white;" data-tile="network"><span class="chromeos-qs-wide-icon"><i class="fas fa-wifi"></i></span><span class="chromeos-qs-wide-texts"><span class="chromeos-qs-wide-title">Wi-Fi</span><span class="chromeos-qs-wide-sub">Connected</span></span><span class="chromeos-qs-chevron"><i class="fas fa-chevron-right"></i></span></button>
          <div class="chromeos-qs-squares">
            <button class="chromeos-qs-square" style="color:white;" data-action="screenshot" title="Screen capture"><i class="fas fa-camera"></i><span>Screen capture</span></button>
            <button class="chromeos-qs-square${dnd ? " on" : ""}" style="color:white;" data-tile="dnd" title="Do Not Disturb"><i style="transform:rotate(-45deg);"class="fas fa-ban"></i><span>Do Not Disturb</span></button>
            <button class="chromeos-qs-square${chaosActive ? " on" : ""}" style="color:white;" data-tile="chaos" title="Chaos"><i class="fas fa-burst"></i><span>Chaos</span></button>
          </div>
          <button class="chromeos-qs-wide" data-tile="bluetooth"><span class="chromeos-qs-wide-icon"><i class="fa-brands fa-bluetooth"></i></span><span class="chromeos-qs-wide-texts"><span class="chromeos-qs-wide-title">Bluetooth</span><span class="chromeos-qs-wide-sub" data-sub="bluetooth">Off</span></span><span class="chromeos-qs-chevron"><i class="fas fa-chevron-right"></i></span></button>
          <button class="chromeos-qs-wide" data-tile="cast"><span class="chromeos-qs-wide-icon"><i class="fas fa-tv"></i></span><span class="chromeos-qs-wide-texts"><span class="chromeos-qs-wide-title">Cast screen</span><span class="chromeos-qs-wide-sub">Devices available</span></span><span class="chromeos-qs-chevron"><i class="fas fa-chevron-right"></i></span></button>
          <button class="chromeos-qs-focus" data-tile="focus"><i class="fas fa-bullseye"></i><span>Focus</span><span class="chromeos-qs-chevron"><i class="fas fa-chevron-right"></i></span></button>
          <div class="chromeos-qs-trayflow">
            ${trayItems
              .map((item) => {
                if (item.winId === "notification") {
                  const notifCount = os.notify.getCount();
                  const notifLabel =
                    notifCount > 0
                      ? `${notifCount} Notification${notifCount === 1 ? "" : "s"}`
                      : "Notifications";
                  return `
            <button class="chromeos-qs-tray${notifCount > 0 ? " has-notifications" : ""}" data-tray="notification" title="${notifLabel}">
              <span class="chromeos-qs-tray-icon"><i class="fas fa-bell"></i></span>
              <span class="chromeos-qs-tray-label">${notifLabel}</span>
            </button>
            `;
                }
                return `
            <button class="chromeos-qs-tray" data-tray="${item.winId}" title="${item.label || item.winId}">
              <span class="chromeos-qs-tray-icon">${this.trayIconHtml(item.icon, item.label)}</span>
              <span class="chromeos-qs-tray-label">${item.label || item.winId}</span>
            </button>
            `;
              })
              .join("")}
          </div>
          <div class="chromeos-qs-slider is-active"><span class="chromeos-qs-slider-icon" data-mute-toggle="volume" title="Mute"><i class="fas fa-volume-up"></i></span>${renderRangeSlider("qsVolume", 1, 100, 5, Math.max(1, volume))}<button class="chromeos-qs-slider-chevron" data-settings="sound" title="Sound settings"><i class="fas fa-chevron-down"></i></button></div>
          <div class="chromeos-qs-slider"><span class="chromeos-qs-slider-icon"><i class="fas fa-sun"></i></span>${renderRangeSlider("qsBrightness", 0, 100, 5, brightness)}<button class="chromeos-qs-slider-chevron" data-settings="display" title="Display settings"><i class="fas fa-chevron-down"></i></button></div>
        </div>
        <div class="chromeos-qs-footer">
          <div class="chromeos-qs-footer-left">
            <button class="chromeos-qs-boot-btn" data-power="shutdown" title="Shut down"><i class="fas fa-power-off"></i><span class="chromeos-qs-chevron"><i class="fas fa-chevron-right"></i></span></button>
            <button style="width:70px; border-radius:20px;"class="chromeos-qs-boot-btn" data-power="signout" title="Sign out"><span class="shelf-ball-text">Sign out</span></button>
          </div>
          <div class="chromeos-qs-footer-right">
            <span class="chromeos-qs-battery-text">${footerText}</span>
            <button class="chromeos-qs-boot-btn" data-power="settings" title="Settings"><i class="fas fa-cog"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  getTrayItems() {
    return trayManager
      .getAllItems()
      .filter((item) => !HIDDEN_TRAY_IDS.includes(item.winId));
  }

  papirusToFa(ref) {
    const s = String(ref || "").toLowerCase();
    if (s.includes("battery")) return batteryService.getFaIconClass();
    if (s.includes("wireless") || s.includes("wifi")) return "fas fa-wifi";
    if (s.includes("network")) return "fas fa-network-wired";
    if (s.includes("bluetooth")) return "fas fa-bluetooth-b";
    if (s.includes("volume") || s.includes("audio")) return "fas fa-volume-up";
    if (s.includes("camera") || s.includes("video")) return "fas fa-video";
    if (s.includes("configure") || s.includes("settings")) return "fas fa-cog";
    if (s.includes("lock")) return "fas fa-lock";
    if (s.includes("log-out") || s.includes("logout"))
      return "fas fa-sign-out-alt";
    if (
      s.includes("shutdown") ||
      s.includes("power") ||
      s.includes("system-shut")
    )
      return "fas fa-power-off";
    if (s.includes("night") || s.includes("moon")) return "fas fa-moon";
    if (s.includes("weather-clear") || s.includes("sun")) return "fas fa-sun";
    if (s.includes("notification") || s.includes("bell") || s.includes("dnd"))
      return "fas fa-ban";
    if (s.includes("monitor") || s.includes("display")) return "fas fa-desktop";
    return "fas fa-th-large";
  }

  trayIconHtml(icon, label) {
    if (!icon)
      return `<span class="chromeos-qs-tray-glyph">${(label || "?").charAt(0)}</span>`;
    const s = String(icon);
    if (s.startsWith("papirus:")) {
      return `<i class="${this.papirusToFa(s)}"></i>`;
    }
    const isUrl =
      s.startsWith("http") ||
      s.startsWith("data:") ||
      s.startsWith("/") ||
      /\.(webp|png|jpg|jpeg|gif|svg)$/.test(s);
    if (isUrl) {
      return `<img src="${s}" alt="${label || ""}" />`;
    }
    return `<i class="${s}"></i>`;
  }

  bindPanel(panel) {
    bindRangeSlider(panel);

    panel.querySelectorAll(".chromeos-qs-slider").forEach((row) => {
      row.addEventListener("pointerdown", () => {
        panel
          .querySelectorAll(".chromeos-qs-slider.is-active")
          .forEach((other) => {
            if (other !== row) other.classList.remove("is-active");
          });
        row.classList.add("is-active");
      });
    });

    const brightnessSlider = $("#qsBrightness", panel);
    const volumeSlider = $("#qsVolume", panel);

    if (brightnessSlider) {
      brightnessSlider.addEventListener("input", () => {
        const value = getRangeSliderValue("qsBrightness", panel);
        this.applyBrightness(value);
      });
      brightnessSlider.addEventListener("change", () => {
        os.storage.set(
          StorageKeys.brightness,
          String(getRangeSliderValue("qsBrightness", panel)),
        );
      });
    }

    if (volumeSlider) {
      const volumeRow = volumeSlider.closest(".chromeos-qs-slider");
      const syncMuteIcon = () => {
        if (!volumeRow) return;
        const value = Math.max(1, getRangeSliderValue("qsVolume", panel));
        const mixer = audioMixer();
        const muted = mixer.muted || value <= 5;
        volumeRow.classList.toggle("is-muted", muted);
      };
      volumeSlider.addEventListener("input", () => {
        const mixer = audioMixer();
        let value = Math.max(1, getRangeSliderValue("qsVolume", panel));
        if (getRangeSliderValue("qsVolume", panel) !== value) {
          setRangeSliderValue("qsVolume", value, panel);
        }
        if (mixer.muted && value > 5) {
          mixer.muted = false;
        }
        mixer.setMaster(value / 100);
        syncMuteIcon();
      });
      const muteIcon = volumeRow
        ? volumeRow.querySelector('[data-mute-toggle="volume"]')
        : null;
      if (muteIcon) {
        muteIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          const mixer = audioMixer();
          mixer.muted = !mixer.muted;
          mixer.applyMasterToAll();
          mixer.save();
          syncMuteIcon();
        });
      }
      syncMuteIcon();
    }

    panel.querySelectorAll("[data-tile]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleTile(btn));
    });

    panel.querySelectorAll("[data-tray]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleTrayTile(btn));
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleTrayContextMenu(e, btn);
      });
    });

    panel.querySelectorAll('[data-action="screenshot"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closePanel();
        os.app.launch("screenshotApp");
      });
    });

    panel.querySelectorAll("[data-settings]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closePanel();
        if (btn.dataset.settings === "sound") launchSettingsPane("pane-audio");
        else if (btn.dataset.settings === "display")
          launchSettingsPane("pane-appearance", "sc-display");
        else os.app.launch("settingsApp");
      });
    });

    panel.querySelectorAll("button .chromeos-qs-chevron").forEach((chev) => {
      chev.addEventListener("click", (e) => {
        e.stopPropagation();
        const dest = this.settingsDestForButton(chev.closest("button"));
        if (!dest) return;
        this.closePanel();
        launchSettingsPane(dest.pane, dest.target);
      });
    });

    panel.querySelectorAll(".chromeos-qs-boot-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handlePowerAction(btn.dataset.power);
      });
    });
  }

  settingsDestForButton(btn) {
    if (!btn) return null;
    if (btn.dataset.tile === "network") return { pane: "pane-network" };
    if (btn.dataset.tile === "bluetooth") return { pane: "pane-network" };
    if (btn.dataset.tile === "cast")
      return { pane: "pane-appearance", target: "sc-display" };
    if (btn.dataset.tile === "focus") return { pane: "pane-notifications" };
    if (btn.dataset.power === "shutdown") return { pane: "pane-system" };
    return null;
  }

  async handleTile(btn) {
    const id = btn.dataset.tile;
    if (id === "network") {
      this.closePanel();
      launchSettingsPane("pane-network");
      return;
    }
    if (id === "dnd") {
      btn.classList.toggle("on");
      os.notify.setDoNotDisturb(btn.classList.contains("on"));
      return;
    }
    if (id === "bluetooth") {
      btn.classList.toggle("on");
      const enabled = btn.classList.contains("on");
      const sub = btn.querySelector('[data-sub="bluetooth"]');
      if (sub) sub.textContent = enabled ? "On" : "Off";
      return;
    }
    if (id === "chaos") {
      const physics = await import("../shared/desktopPhysics.js");
      physics.togglePhysicsChaos();
      btn.classList.toggle("on", physics.isPhysicsChaosActive());
      return;
    }
    if (id === "cast" || id === "focus") {
      btn.classList.toggle("on");
      return;
    }
  }

  handleTrayTile(btn) {
    const winId = btn.dataset.tray;
    const item = trayManager.items.get(winId);
    if (!item) {
      this.closePanel();
      return;
    }
    this.closePanel();
    if (item.onClick) {
      callIfFunction(item.onClick);
    } else {
      trayManager.restoreFromTray(winId);
    }
  }

  handleTrayContextMenu(e, btn) {
    const winId = btn.dataset.tray;
    const item = trayManager.items.get(winId);
    if (!item) return;
    trayManager.showContextMenu(e, winId, item.label || winId);
  }

  applyBrightness(value) {
    document.documentElement.style.filter = `brightness(${value / 100}) contrast(1) saturate(1) sepia(0)`;
  }

  handlePowerAction(action) {
    this.closePanel();
    const sessionManager = os.app.getInstance(ServiceKeys.SESSION_MANAGER);
    switch (action) {
      case "lock":
        sessionManager?.lockSession?.();
        break;
      case "settings":
        os.app.launch("settingsApp");
        break;
      case "signout":
        os.account.signOut?.();
        os.app.lockToLoginScreen();
        break;
      case "restart":
        sessionManager?.restart?.();
        break;
      case "shutdown":
        location.reload();
        break;
    }
  }

  onSettingsChanged() {
    this.loadPrefs();
    this.updateClock();
    this.updateStatusIcons();
  }
}

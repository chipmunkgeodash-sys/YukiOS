import "../styles/appStore.css";
import { BaseApp, os, StorageKeys } from "../framework.js";
import { getAppRegistry } from "../appRegistry.js";
import { resolveIconHtml } from "../shared/iconUtils.js";
import { addAppToDesktop, appsOnDesktop, removeAppFromDesktop } from "../shared/desktopShortcuts.js";
import { CATALOG, CATEGORIES, filterApps, iconFor, parseRepo, siteKey } from "./appStoreCatalog.js";

// Astral App Store. Two kinds of app live here:
//
//  - Websites that run as apps in their own window (through the proxy): browse,
//    install to the desktop, add repos for more. Installing is the App Creator's
//    own install, so a store app behaves like one you made yourself.
//  - Every app built into the OS ("All apps"): put its icon on the desktop with
//    one click, take it off again, or restore one that was uninstalled.

const WIN_ID = "app-store-win";
const BUILTIN = "__builtin";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class AppStoreApp extends BaseApp {
  singletonWindowIds = [WIN_ID];

  constructor(services) {
    super(services);
    this.state = {
      category: "", term: "", installed: new Map(), repos: [], busy: new Set(), message: "", repoError: "",
      builtin: [], onDesktop: new Set()
    };
  }

  get creator() {
    return os.app.getInstance("appCreatorApp");
  }

  repos() {
    const saved = os.storage.get(StorageKeys.appStoreRepos);
    return Array.isArray(saved) ? saved : [];
  }

  saveRepos(list) {
    os.storage.set(StorageKeys.appStoreRepos, list);
  }

  // The built-in catalog first, then each repo's apps, one entry per website.
  allApps() {
    const seen = new Set();
    const out = [];
    for (const a of [...CATALOG, ...this.state.repos.flatMap((r) => r.apps.map((x) => ({ ...x, repo: r.title || r.url })))]) {
      const key = siteKey(a.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }

  async refreshInstalled() {
    const list = await this.creator.loadAllCustomApps().catch(() => []);
    this.state.installed = new Map(list.map((a) => [siteKey(a.url), a.appId]));
  }

  // Every app that ships with the OS, and which of them have a desktop icon.
  async refreshBuiltin() {
    const registry = getAppRegistry();
    registry.refresh();
    const map = os.app.getAllApps() || {};
    this.state.builtin = Object.entries(map)
      .filter(([, d]) => d && d.type === "system" && d.icon && d.title)
      .map(([id, d]) => ({
        id,
        name: d.title,
        icon: d.icon,
        description: d.description || "",
        category: d.targetUrl ? "Web app" : "App",
        uninstalled: registry.isAppUninstalled(id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.state.onDesktop = await appsOnDesktop();
  }

  async open() {
    const existing = document.getElementById(WIN_ID);
    if (existing) {
      if (existing.style.display === "none") os.tray.restoreFromTray(WIN_ID);
      else os.window.focus(existing);
      return;
    }
    const win = os.window.create(WIN_ID, "Astral App Store", "980px", "660px", { icon: "fas fa-store" });
    win.innerHTML = `<div class="window-content as-root"></div>`;
    this.root = win.querySelector(".as-root");
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("input", (e) => {
      if (e.target.matches(".as-search")) {
        this.state.term = e.target.value;
        this.paintGrid();
      }
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches(".as-repo-input")) this.addRepo();
    });
    // Repos load in the background; the store is usable straight away.
    this.state.repos = this.repos().map((r) => ({ ...r, apps: r.apps || [] }));
    await Promise.all([this.refreshInstalled(), this.refreshBuiltin()]);
    this.paint();
    this.refreshRepos();
  }

  // Repos are re-read so their lists stay fresh; a repo that fails keeps its last copy.
  async refreshRepos() {
    const next = [];
    for (const repo of this.repos()) {
      try {
        const res = await fetch(repo.url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseRepo(await res.json());
        next.push({ url: repo.url, title: parsed.title || repo.title || "", apps: parsed.apps });
      } catch {
        next.push({ ...repo, apps: repo.apps || [] });
      }
    }
    this.state.repos = next;
    if (document.getElementById(WIN_ID)) this.paint();
  }

  async addRepo() {
    const input = this.root.querySelector(".as-repo-input");
    const url = (input?.value || "").trim();
    this.state.repoError = "";
    if (!/^https:\/\//i.test(url)) { this.state.repoError = "A repo address starts with https://"; this.paintSide(); return; }
    if (this.repos().some((r) => r.url === url)) { this.state.repoError = "That repo is already added."; this.paintSide(); return; }
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const parsed = parseRepo(await res.json());
      const saved = [...this.repos(), { url, title: parsed.title, apps: parsed.apps }];
      this.saveRepos(saved);
      this.state.repos = saved;
      this.state.message = `Added ${parsed.title || "the repo"}: ${parsed.apps.length} app${parsed.apps.length === 1 ? "" : "s"}.`;
    } catch (err) {
      this.state.repoError = /Failed to fetch|NetworkError/i.test(err.message)
        ? "Couldn't load that repo. Its host has to allow other sites to read it."
        : err.message;
    }
    this.paint();
  }

  removeRepo(url) {
    const saved = this.repos().filter((r) => r.url !== url);
    this.saveRepos(saved);
    this.state.repos = saved;
    this.paint();
  }

  async install(key) {
    const app = this.allApps().find((a) => siteKey(a.url) === key);
    if (!app || this.state.busy.has(key)) return;
    this.state.busy.add(key);
    this.paintGrid();
    try {
      // Through the proxy, in its own window, like any web app in the OS.
      await this.creator.installCore(app.name, app.url, iconFor(app), false, 0, true, false);
      await this.refreshInstalled();
      os.notify.send("App Store", `${app.name} is installed. It's on your desktop.`, { type: "success", duration: 3500 });
    } catch (err) {
      os.notify.send("App Store", `Couldn't install ${app.name}: ${err.message}`, { type: "error", duration: 5000 });
    }
    this.state.busy.delete(key);
    this.paint();
  }

  async uninstall(key) {
    const appId = this.state.installed.get(key);
    if (!appId) return;
    const app = this.allApps().find((a) => siteKey(a.url) === key);
    if (!(await os.dialog.confirm("Remove app", `Remove ${app?.name || "this app"}? Its desktop icon goes too.`))) return;
    await this.creator.removeCore(appId);
    await this.refreshInstalled();
    this.paint();
  }

  /* ---------------------------------------------------- built-in apps */

  builtinApp(id) {
    return this.state.builtin.find((a) => a.id === id);
  }

  async addToDesktop(id) {
    const app = this.builtinApp(id);
    if (!app || this.state.busy.has(id)) return;
    this.state.busy.add(id);
    this.paintGrid();
    try {
      await addAppToDesktop(id, { title: app.name, icon: app.icon });
      this.state.onDesktop.add(id);
    } catch (err) {
      os.notify.send("App Store", `Couldn't add ${app.name} to the desktop: ${err.message}`, { type: "error", duration: 5000 });
    }
    this.state.busy.delete(id);
    this.paintGrid();
  }

  async removeFromDesktop(id) {
    await removeAppFromDesktop(id);
    this.state.onDesktop.delete(id);
    this.paintGrid();
  }

  // Everything shown that isn't on the desktop yet, one after another.
  async addAllToDesktop() {
    const todo = filterApps(this.state.builtin, { term: this.state.term })
      .filter((a) => !a.uninstalled && !this.state.onDesktop.has(a.id));
    if (!todo.length) { this.state.message = "Everything shown is already on your desktop."; this.paintGrid(); return; }
    if (todo.length > 15 && !(await os.dialog.confirm("Add to desktop", `Put ${todo.length} icons on your desktop?`))) return;
    let added = 0;
    for (const app of todo) {
      try {
        await addAppToDesktop(app.id, { title: app.name, icon: app.icon });
        this.state.onDesktop.add(app.id);
        added += 1;
      } catch { /* skip one that fails */ }
    }
    this.state.message = `Added ${added} app${added === 1 ? "" : "s"} to your desktop.`;
    this.paint();
  }

  restore(id) {
    getAppRegistry().restoreApp(id);
    this.refreshBuiltin().then(() => this.paint());
  }

  onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const { act } = t.dataset;
    if (act === "cat") { this.state.category = t.dataset.cat; this.state.message = ""; this.paint(); }
    else if (act === "install") this.install(t.dataset.key);
    else if (act === "open") { const id = this.state.installed.get(t.dataset.key); if (id) os.app.launch(id); }
    else if (act === "remove") this.uninstall(t.dataset.key);
    else if (act === "add-repo") this.addRepo();
    else if (act === "remove-repo") this.removeRepo(t.dataset.url);
    else if (act === "launch") os.app.launch(t.dataset.id);
    else if (act === "desk-add") this.addToDesktop(t.dataset.id);
    else if (act === "desk-remove") this.removeFromDesktop(t.dataset.id);
    else if (act === "desk-all") this.addAllToDesktop();
    else if (act === "restore") this.restore(t.dataset.id);
  }

  paint() {
    if (!this.root) return;
    const keepTerm = this.root.querySelector(".as-search")?.value ?? this.state.term;
    this.root.innerHTML = `
      <aside class="as-side"></aside>
      <main class="as-main">
        <div class="as-top">
          <label class="as-searchbox"><i class="fas fa-search"></i>
            <input class="as-search" type="search" placeholder="Search apps" value="${esc(keepTerm)}" aria-label="Search apps" /></label>
        </div>
        <p class="as-msg"></p>
        <div class="as-grid"></div>
      </main>`;
    this.paintSide();
    this.paintGrid();
  }

  paintSide() {
    const side = this.root.querySelector(".as-side");
    if (!side) return;
    const { category, installed, repos, repoError, builtin } = this.state;
    const btn = (cat, label, icon) => `<button type="button" class="as-nav${category === cat ? " on" : ""}" data-act="cat" data-cat="${esc(cat)}"><i class="${icon}"></i> ${esc(label)}</button>`;
    const cats = [...new Set([...CATEGORIES, ...this.allApps().map((a) => a.category)])];
    side.innerHTML = `
      <div class="as-brand"><i class="fas fa-store"></i> App Store</div>
      ${btn("", "Discover", "fas fa-compass")}
      ${btn(BUILTIN, `All apps (${builtin.length})`, "fas fa-table-cells-large")}
      ${btn("__installed", `Installed (${installed.size})`, "fas fa-circle-check")}
      <div class="as-label">Categories</div>
      ${cats.map((c) => btn(c, c, "fas fa-tag")).join("")}
      <div class="as-label">Repos</div>
      ${repos.map((r) => `<div class="as-repo"><span title="${esc(r.url)}">${esc(r.title || new URL(r.url).hostname)}</span><button type="button" data-act="remove-repo" data-url="${esc(r.url)}" aria-label="Remove repo"><i class="fas fa-xmark"></i></button></div>`).join("")}
      <div class="as-addrepo">
        <input class="as-repo-input" type="url" placeholder="https://…/repo.json" aria-label="Repo address" />
        <button type="button" data-act="add-repo">Add</button>
      </div>
      ${repoError ? `<p class="as-error">${esc(repoError)}</p>` : ""}`;
  }

  paintGrid() {
    const grid = this.root.querySelector(".as-grid");
    const msg = this.root.querySelector(".as-msg");
    if (!grid) return;
    const { category, term, installed, busy, message } = this.state;
    if (msg) msg.textContent = message;
    if (category === BUILTIN) { this.paintBuiltin(grid); return; }
    const apps = filterApps(this.allApps(), { category, term, installed: new Set(installed.keys()) });
    if (!apps.length) {
      grid.innerHTML = `<p class="as-empty">${category === "__installed" ? "Nothing installed yet. Pick an app from Discover." : "No apps match."}</p>`;
      return;
    }
    grid.innerHTML = apps.map((a) => {
      const key = siteKey(a.url);
      const have = installed.has(key);
      const working = busy.has(key);
      const action = have
        ? `<button type="button" class="as-btn primary" data-act="open" data-key="${esc(key)}">Open</button><button type="button" class="as-btn" data-act="remove" data-key="${esc(key)}" aria-label="Remove ${esc(a.name)}">Remove</button>`
        : `<button type="button" class="as-btn primary" data-act="install" data-key="${esc(key)}" ${working ? "disabled" : ""}>${working ? "Installing…" : "Install"}</button>`;
      return `<article class="as-card">
        <div class="as-icon"><img src="${esc(iconFor(a))}" alt="" referrerpolicy="no-referrer" /><span>${esc(a.name.slice(0, 1).toUpperCase())}</span></div>
        <div class="as-info"><strong>${esc(a.name)}</strong><small>${esc(a.category)}${a.repo ? ` · ${esc(a.repo)}` : ""}</small><p>${esc(a.description)}</p></div>
        <div class="as-actions">${action}</div>
      </article>`;
    }).join("");
    // A site without a favicon shows its first letter instead of a broken image.
    grid.querySelectorAll(".as-icon img").forEach((img) => {
      img.addEventListener("error", () => img.remove(), { once: true });
    });
  }

  // Every app the OS ships with, each with a way to put it on the desktop.
  paintBuiltin(grid) {
    const { term, busy, onDesktop } = this.state;
    const apps = filterApps(this.state.builtin, { term });
    if (!apps.length) { grid.innerHTML = `<p class="as-empty">No apps match.</p>`; return; }
    const missing = apps.filter((a) => !a.uninstalled && !onDesktop.has(a.id)).length;
    const bar = `<div class="as-bar"><span>${apps.length} app${apps.length === 1 ? "" : "s"}${missing ? ` · ${missing} not on your desktop` : " · all on your desktop"}</span>
      <button type="button" class="as-btn primary" data-act="desk-all" ${missing ? "" : "disabled"}>Add all to desktop</button></div>`;
    grid.innerHTML = bar + apps.map((a) => {
      const on = onDesktop.has(a.id);
      const working = busy.has(a.id);
      let action;
      if (a.uninstalled) {
        action = `<button type="button" class="as-btn primary" data-act="restore" data-id="${esc(a.id)}">Install</button>`;
      } else if (on) {
        action = `<button type="button" class="as-btn primary" data-act="launch" data-id="${esc(a.id)}">Open</button><button type="button" class="as-btn" data-act="desk-remove" data-id="${esc(a.id)}">Off desktop</button>`;
      } else {
        action = `<button type="button" class="as-btn primary" data-act="desk-add" data-id="${esc(a.id)}" ${working ? "disabled" : ""}>${working ? "Adding…" : "Add to desktop"}</button><button type="button" class="as-btn" data-act="launch" data-id="${esc(a.id)}">Open</button>`;
      }
      return `<article class="as-card${a.uninstalled ? " dim" : ""}">
        <div class="as-icon as-icon-sys">${resolveIconHtml(a.icon, { size: 48, alt: "" })}</div>
        <div class="as-info"><strong>${esc(a.name)}</strong><small>${esc(a.category)}${a.uninstalled ? " · uninstalled" : on ? " · on your desktop" : ""}</small><p>${esc(a.description)}</p></div>
        <div class="as-actions">${action}</div>
      </article>`;
    }).join("");
  }
}

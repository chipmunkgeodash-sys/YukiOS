import {
  os,
  StorageKeys,
  $,
  $$,
  bindEvent,
  createElement,
  setText,
} from "../../framework.js";
import { getEffectiveIcon } from "../../shared/iconPack.js";
import { resolveIconUrl } from "../../shared/assetResolver.js";
import { isImageFile } from "../../shared/fileKindDetector.js";
import { appMap } from "../../games/gamesList.js";
import { getAppRegistry } from "../../appRegistry.js";

const DEFAULT_PINNED = [
  "explorerApp",
  "browserApp",
  "terminalApp",
  "settingsApp",
  "calculatorApp",
  "notepadApp",
  "cameraApp",
  "weatherApp",
  "storeApp",
];
const QUICK_SEARCHES = [
  ["fas fa-sun", "Weather", "weather"],
  ["fas fa-newspaper", "Top news", "top news"],
  ["fas fa-calendar-day", "Today in history", "today in history"],
  ["fas fa-clapperboard", "New movies", "new movies"],
  ["fas fa-utensils", "Recipes", "recipes"],
];

let observer = null;
let builtForSig = "";
let showingAll = false;
let showSearch = false;

export function setupWin11StartMenu() {
  if (observer) return;
  observer = new MutationObserver(() => {
    const menuEl = $("#start-menu");
    if (menuEl && menuEl.style.display === "flex") renderWin11Menu(false);
  });
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  renderWin11Menu(false);
}

export function teardownWin11StartMenu() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  const root = $("#win11-start-root");
  if (root) root.remove();
  const menuEl = $("#start-menu");
  if (menuEl) {
    const content = $(".start-content", menuEl);
    if (content) content.style.display = "";
    $$(".start-page", menuEl).forEach((el) => {
      el.style.display = "";
    });
    $$(".search-input-wrapper", menuEl).forEach((el) => {
      el.style.display = "";
    });
  }
  builtForSig = "";
  showingAll = false;
  showSearch = false;
}

export function refreshWin11StartMenu() {
  if (!isWin11StartMenuActive()) return;
  const menuEl = $("#start-menu");
  if (!menuEl || menuEl.style.display !== "flex") return;
  renderWin11Menu(true);
}

export function isWin11StartMenuActive() {
  return document.documentElement.classList.contains("win11-mode");
}

export function openWin11SearchMode() {
  showSearch = true;
  const menuEl = $("#start-menu");
  if (!menuEl || menuEl.style.display !== "flex") {
    const startBtn = $("#start-button");
    if (startBtn) startBtn.click();
  }
  renderWin11Menu(true);
}

function readStore(key, fallback) {
  try {
    const val = os.storage.get(key);
    return val === null || val === undefined ? fallback : val;
  } catch {
    return fallback;
  }
}

function rowFrom(id, data, registry) {
  return {
    id,
    title: registry.getAppDisplayName(id, data.title || id),
    icon: data.icon || "fas fa-cube",
    category: data.category || data.type || "",
  };
}

function getMergedApps() {
  const registry = getAppRegistry();
  const table = {};
  Object.entries(appMap || {}).forEach(([id, data]) => {
    if (!data || typeof data !== "object") return;
    table[id] = {
      id,
      title: data.title || id,
      icon: data.icon || "fas fa-cube",
      category: data.type || "",
    };
  });
  let extra = {};
  try {
    extra = os.app.getAllApps() || {};
  } catch {
    extra = {};
  }
  Object.entries(extra).forEach(([id, data]) => {
    if (!data || typeof data !== "object" || table[id]) return;
    table[id] = {
      id,
      title: data.title || id,
      icon: data.icon || "fas fa-cube",
      category: data.category || data.type || "",
    };
  });
  const rows = [];
  Object.values(table).forEach((entry) => {
    if (registry.isAppUninstalled(entry.id) || registry.isAppDisabled(entry.id))
      return;
    rows.push(rowFrom(entry.id, entry, registry));
  });
  return rows;
}

function collectPinnedIds(merged, ids, picked, seen, byId) {
  ids.forEach((id) => {
    if (picked.length >= 18 || typeof id !== "string" || seen.has(id)) return;
    const row = byId.get(id);
    if (!row) return;
    seen.add(id);
    picked.push(row);
  });
}

function getPinnedApps(merged) {
  const byId = new Map(merged.map((row) => [row.id, row]));
  const picked = [];
  const seen = new Set();
  const favs = readStore(StorageKeys.favoritesKey, []);
  collectPinnedIds(merged, Array.isArray(favs) ? favs : [], picked, seen, byId);
  collectPinnedIds(merged, DEFAULT_PINNED, picked, seen, byId);
  merged.forEach((row) => {
    if (picked.length >= 18 || seen.has(row.id)) return;
    seen.add(row.id);
    picked.push(row);
  });
  if (picked.length === 0) return merged.slice(0, 12);
  return picked;
}

function padSix(rows) {
  const out = rows.slice();
  const missing = (6 - (out.length % 6)) % 6;
  for (let i = 0; i < missing; i++) out.push({ empty: true });
  return out;
}

function getRecentAppRows(merged) {
  const byId = new Map(merged.map((row) => [row.id, row]));
  const stored = readStore(StorageKeys.recentlyUsedApps, []);
  const list = Array.isArray(stored) ? stored : [];
  const rows = [];
  list.forEach((id) => {
    if (rows.length >= 6 || typeof id !== "string") return;
    const row = byId.get(id);
    if (!row) return;
    rows.push(row);
  });
  return rows;
}

function getRecentFileRows() {
  const stored = readStore(StorageKeys.recentFiles, []);
  const list = Array.isArray(stored) ? stored : [];
  const rows = [];
  list.forEach((item) => {
    if (rows.length >= 6 || !item || typeof item !== "object" || !item.name)
      return;
    rows.push({ name: item.name, path: item.path || [] });
  });
  return rows;
}

function getLaunchMinutes(appId) {
  try {
    const stamp = Number(os.storage.get(StorageKeys.launchTimePrefix + appId));
    if (!stamp) return null;
    return (Date.now() - stamp) / 60000;
  } catch {
    return null;
  }
}

function formatTimeLabel(mins) {
  if (mins === null || mins === undefined || mins < 0) return "Recently Added";
  if (mins < 10) return "Just Now";
  if (mins < 60) return Math.floor(mins) + "m ago";
  return Math.floor(mins / 60) + "h ago";
}

function getRecommended(merged) {
  const entries = [];
  getRecentAppRows(merged).forEach((row, index) => {
    if (entries.length >= 6) return;
    const mins = getLaunchMinutes(row.id);
    entries.push({
      type: "app",
      row,
      label: formatTimeLabel(
        mins === null || mins === undefined ? index - 1 : mins,
      ),
    });
  });
  getRecentFileRows().forEach((file) => {
    if (entries.length >= 6) return;
    entries.push({ type: "file", file, label: "Recently Added" });
  });
  if (entries.length < 6) {
    const byId = new Map(merged.map((row) => [row.id, row]));
    const present = new Set();
    entries.forEach((entry) => {
      if (entry.type === "app" && entry.row) present.add(entry.row.id);
    });
    [
      "terminalApp",
      "explorerApp",
      "browserApp",
      "settingsApp",
      "notepadApp",
      "calculatorApp",
    ].forEach((id) => {
      if (entries.length >= 6 || present.has(id)) return;
      const row = byId.get(id);
      if (!row) return;
      present.add(id);
      entries.push({ type: "app", row, label: "Recently added" });
    });
    if (entries.length < 6) {
      merged.forEach((row) => {
        if (!row || entries.length >= 6 || present.has(row.id)) return;
        present.add(row.id);
        entries.push({ type: "app", row, label: "Recently added" });
      });
    }
  }
  return entries;
}

function bucketApps(sorted) {
  const groups = [];
  for (let i = 0; i < 27; i++) groups.push([]);
  sorted.forEach((row) => {
    const code = String(row.title || "")
      .trim()
      .toUpperCase()
      .charCodeAt(0);
    if (code > 64 && code < 91) groups[code - 64].push(row);
    else groups[0].push(row);
  });
  return groups;
}

function letterFor(index) {
  return index === 0 ? "#" : String.fromCharCode(index + 64);
}

function isIconImage(effective) {
  return (
    typeof effective === "string" &&
    (isImageFile(effective) ||
      effective.startsWith("http") ||
      effective.startsWith("data:") ||
      effective.startsWith("blob:") ||
      effective.startsWith("/"))
  );
}

function buildWinIcon(iconVal, size) {
  const px = size || 32;
  const effective = getEffectiveIcon(iconVal);
  if (
    typeof effective === "string" &&
    (effective.startsWith("papirus:") || isIconImage(effective))
  ) {
    const iconEl = createElement("img");
    iconEl.className = "pnIcon";
    iconEl.src = resolveIconUrl(effective);
    iconEl.alt = "";
    iconEl.width = px;
    iconEl.height = px;
    return iconEl;
  }
  const iconEl = createElement("i");
  iconEl.className =
    (typeof effective === "string" && effective.startsWith("fa")
      ? effective
      : "fas fa-cube") + " pnIcon";
  iconEl.style.fontSize = px + "px";
  iconEl.style.width = px + "px";
  iconEl.style.height = px + "px";
  iconEl.style.textAlign = "center";
  return iconEl;
}

function setShowingAll(value) {
  showingAll = value;
  const root = $("#win11-start-root");
  if (!root) return;
  const flag = showingAll ? "true" : "false";
  const stmenu = $(".stmenu", root);
  if (stmenu) stmenu.setAttribute("data-allapps", flag);
  const allCont = $(".allCont", root);
  if (allCont) allCont.setAttribute("data-allapps", flag);
}

function hideWinMenu(menuEl) {
  if (!menuEl) return;
  if (menuEl.style.display === "none") return;
  if (menuEl.classList.contains("closing")) return;
  menuEl.classList.add("closing");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    menuEl.classList.remove("closing");
    menuEl.style.display = "none";
  };
  bindEvent(menuEl, "animationend", finish, { once: true });
  setTimeout(finish, 250);
}

function recordRecent(appId) {
  try {
    const stored = readStore(StorageKeys.recentlyUsedApps, []);
    const list = Array.isArray(stored)
      ? stored.filter((id) => id !== appId)
      : [];
    list.unshift(appId);
    os.storage.set(StorageKeys.recentlyUsedApps, list.slice(0, 8));
    os.storage.set(StorageKeys.launchTimePrefix + appId, Date.now());
  } catch {
    return;
  }
}

function launchWinApp(appId, menuEl) {
  try {
    const result = os.app.launch(appId);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    return;
  }
  hideWinMenu(menuEl);
  recordRecent(appId);
}

function launchBrowserSearch(menuEl) {
  try {
    const result = os.app.launch("browserApp");
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    return;
  }
  hideWinMenu(menuEl);
}

function openWinFile(file, menuEl) {
  hideWinMenu(menuEl);
  try {
    if (os.app.openFileInApp) {
      const raw = file.path;
      const parts = Array.isArray(raw)
        ? raw
        : String(raw || "")
            .split("/")
            .filter(Boolean);
      const result = os.app.openFileInApp(file.name, parts);
      if (result && typeof result.catch === "function") result.catch(() => {});
      return;
    }
  } catch {
    return;
  }
  try {
    const result = os.app.launch("explorerApp");
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    return;
  }
}

function buildMatchRow(icon, title, sub, size, onClick) {
  const row = createElement("div", { className: "rnApp" });
  row.appendChild(buildWinIcon(icon, size || 32));
  const info = createElement("div", { className: "acInfo" });
  info.appendChild(createElement("div", { className: "appName", text: title }));
  info.appendChild(createElement("div", { className: "timeUsed", text: sub }));
  row.appendChild(info);
  bindEvent(row, "click", onClick);
  return row;
}

function buildPinnedCell(item, menuEl) {
  if (item.empty) return createElement("div", { className: "pnApp pnEmpty" });
  const cell = createElement("div", { className: "pnApp" });
  cell.appendChild(buildWinIcon(item.icon, 32));
  cell.appendChild(
    createElement("div", { className: "appName", text: item.title }),
  );
  bindEvent(cell, "click", () => launchWinApp(item.id, menuEl));
  return cell;
}

function fillPinned(grid, rows, menuEl) {
  grid.innerHTML = "";
  rows.forEach((row) => grid.appendChild(buildPinnedCell(row, menuEl)));
}

function buildRecRow(entry, menuEl) {
  if (entry.type === "app")
    return buildMatchRow(entry.row.icon, entry.row.title, entry.label, 32, () =>
      launchWinApp(entry.row.id, menuEl),
    );
  return buildMatchRow("fas fa-file", entry.file.name, entry.label, 32, () =>
    openWinFile(entry.file, menuEl),
  );
}

function showAlpha(scope, open) {
  const list = $(".allApps", scope);
  const box = $(".alphaBox", scope);
  if (list) list.setAttribute("data-alpha", open ? "true" : "false");
  if (box) box.setAttribute("data-alpha", open ? "true" : "false");
}

function buildBarButton(label, chevClass, onClick) {
  const btn = createElement("div", { className: "gpbtn" });
  if (chevClass === "left") {
    const wrap = createElement("span", { className: "chevLeft" });
    wrap.appendChild(createElement("i", { className: "fas fa-chevron-left" }));
    btn.appendChild(wrap);
  }
  btn.appendChild(createElement("div", { text: label }));
  if (chevClass === "right")
    btn.appendChild(createElement("i", { className: "fas fa-chevron-right" }));
  bindEvent(btn, "click", onClick);
  return btn;
}

function buildMainMenu(menuEl, padded, recommended) {
  const stmenu = createElement("div", {
    className: "stmenu",
    attributes: { "data-allapps": showingAll ? "true" : "false" },
  });
  const menuUp = createElement("div", { className: "menuUp" });
  const pinnedApps = createElement("div", { className: "pinnedApps" });
  const pinBar = createElement("div", { className: "stAcbar" });
  pinBar.appendChild(
    createElement("div", { className: "gpname", text: "Pinned" }),
  );
  pinBar.appendChild(
    buildBarButton("All apps", "right", () => {
      setShowingAll(true);
    }),
  );
  const pnApps = createElement("div", { className: "pnApps" });
  fillPinned(pnApps, padded, menuEl);
  pinnedApps.appendChild(pinBar);
  pinnedApps.appendChild(pnApps);
  const recApps = createElement("div", { className: "recApps" });
  const recBar = createElement("div", { className: "stAcbar" });
  recBar.appendChild(
    createElement("div", { className: "gpname", text: "Recommended" }),
  );
  const reApps = createElement("div", { className: "reApps" });
  recommended.forEach((entry) =>
    reApps.appendChild(buildRecRow(entry, menuEl)),
  );
  recApps.appendChild(recBar);
  recApps.appendChild(reApps);
  menuUp.appendChild(pinnedApps);
  menuUp.appendChild(recApps);
  stmenu.appendChild(menuUp);
  return { stmenu, pnApps };
}

function buildAllRows(allApps, groups, menuEl, allCont) {
  groups.forEach((list, index) => {
    if (list.length === 0) return;
    const letter = letterFor(index);
    const head = createElement("div", {
      className: "allApp",
      id: "char" + letter,
      attributes: { "data-letter": letter },
    });
    head.appendChild(
      createElement("div", { className: "ltName", text: letter }),
    );
    bindEvent(head, "click", () => showAlpha(allCont, true));
    allApps.appendChild(head);
    list.forEach((row) => {
      const item = createElement("div", { className: "allApp" });
      item.appendChild(buildWinIcon(row.icon, 24));
      item.appendChild(
        createElement("div", { className: "appName", text: row.title }),
      );
      bindEvent(item, "click", () => launchWinApp(row.id, menuEl));
      allApps.appendChild(item);
    });
  });
}

function buildAlphaGrid(alphaCont, allApps, groups, allCont) {
  const dull = createElement("div", { className: "dullApp allApp" });
  dull.appendChild(createElement("div", { className: "ltName", text: "&" }));
  alphaCont.appendChild(dull);
  groups.forEach((list, index) => {
    const letter = letterFor(index);
    const cell = createElement("div", {
      className: list.length === 0 ? "dullApp allApp" : "allApp",
      attributes: { "data-letter": letter },
    });
    cell.appendChild(
      createElement("div", { className: "ltName", text: letter }),
    );
    if (list.length === 0) {
      alphaCont.appendChild(cell);
      return;
    }
    bindEvent(cell, "click", () => {
      const target = $('[data-letter="' + letter + '"]', allApps);
      if (target) {
        try {
          target.scrollIntoView();
        } catch {
          allApps.scrollTop = target.offsetTop;
        }
      }
      showAlpha(allCont, false);
    });
    alphaCont.appendChild(cell);
  });
}

function buildAllCont(menuEl, groups) {
  const allCont = createElement("div", {
    className: "allCont",
    attributes: { "data-allapps": showingAll ? "true" : "false" },
  });
  const appCont = createElement("div", { className: "appCont" });
  const bar = createElement("div", { className: "stAcbar" });
  bar.appendChild(
    createElement("div", { className: "gpname", text: "All apps" }),
  );
  bar.appendChild(
    buildBarButton("Back", "left", () => {
      setShowingAll(false);
    }),
  );
  const allApps = createElement("div", {
    className: "allApps",
    attributes: { "data-alpha": "false" },
  });
  const alphaBox = createElement("div", {
    className: "alphaBox",
    attributes: { "data-alpha": "false" },
  });
  const alphaCont = createElement("div", { className: "alphaCont" });
  buildAllRows(allApps, groups, menuEl, allCont);
  buildAlphaGrid(alphaCont, allApps, groups, allCont);
  alphaBox.appendChild(alphaCont);
  appCont.appendChild(bar);
  appCont.appendChild(allApps);
  appCont.appendChild(alphaBox);
  allCont.appendChild(appCont);
  return allCont;
}

function fillSearchDefault(leftSide, rightSide, input, menuEl, merged) {
  leftSide.innerHTML = "";
  rightSide.innerHTML = "";
  rightSide.style.display = "none";
  leftSide.appendChild(createElement("div", { text: "Top apps" }));
  const topApps = createElement("div", { className: "topApps" });
  const recent = getRecentAppRows(merged);
  (recent.length > 0
    ? recent.slice(0, 6)
    : getPinnedApps(merged).slice(0, 6)
  ).forEach((row) => {
    const tile = createElement("div", { className: "topApp" });
    tile.appendChild(buildWinIcon(row.icon, 30));
    tile.appendChild(createElement("div", { text: row.title }));
    bindEvent(tile, "click", () => launchWinApp(row.id, menuEl));
    topApps.appendChild(tile);
  });
  leftSide.appendChild(topApps);
  leftSide.appendChild(createElement("div", { text: "Quick Searches" }));
  const quick = createElement("div", { className: "quickSearches" });
  QUICK_SEARCHES.forEach((entry) => {
    const item = createElement("div", { className: "qksrch" });
    item.appendChild(createElement("i", { className: entry[0] }));
    item.appendChild(createElement("div", { text: entry[1] }));
    bindEvent(item, "click", () => {
      input.value = entry[2];
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    quick.appendChild(item);
  });
  leftSide.appendChild(quick);
}

function fillSearchResult(refs, menuEl, best, query) {
  const leftSide = refs.leftSide;
  const rightSide = refs.rightSide;
  leftSide.innerHTML = "";
  rightSide.innerHTML = "";
  leftSide.appendChild(createElement("div", { text: "Best match" }));
  if (best)
    leftSide.appendChild(
      buildMatchRow(best.icon, best.title, "App", 24, () =>
        launchWinApp(best.id, menuEl),
      ),
    );
  const online = buildMatchRow(
    "fas fa-magnifying-glass",
    query ? "Search online" : "Search",
    "Web",
    20,
    () => launchBrowserSearch(menuEl),
  );
  leftSide.appendChild(online);
  if (!best) {
    rightSide.style.display = "none";
    return;
  }
  rightSide.style.display = "";
  rightSide.appendChild(buildWinIcon(best.icon, 64));
  rightSide.appendChild(createElement("div", { text: best.title }));
  rightSide.appendChild(createElement("div", { text: "App" }));
  rightSide.appendChild(
    buildMatchRow("fas fa-arrow-up-right-from-square", "Open", "App", 16, () =>
      launchWinApp(best.id, menuEl),
    ),
  );
}

function updateSearch(query, refs, menuEl, merged, padded, pnApps) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) {
    if (pnApps) fillPinned(pnApps, padded, menuEl);
    fillSearchDefault(
      refs.leftSide,
      refs.rightSide,
      refs.input,
      menuEl,
      merged,
    );
    return;
  }
  const matches = merged
    .filter((row) =>
      String(row.title || "")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, 18);
  if (pnApps) fillPinned(pnApps, padSix(matches), menuEl);
  fillSearchResult(refs, menuEl, matches[0], q);
}

function buildSearchBlock(menuEl, merged) {
  const searchMenu = createElement("div", { className: "searchMenu" });
  const backRow = createElement("div", { className: "backRow" });
  const backBtn = createElement("button", {
    className: "backBtn",
    text: "Back",
  });
  bindEvent(backBtn, "click", () => {
    showSearch = false;
    renderWin11Menu(true);
  });
  backRow.appendChild(backBtn);
  const searchBar = createElement("div", { className: "searchBar" });
  const iconWrap = createElement("span", { className: "searchIcon" });
  iconWrap.appendChild(
    createElement("i", { className: "fas fa-magnifying-glass" }),
  );
  const input = createElement("input", {
    attributes: {
      type: "text",
      placeholder: "Type here to search",
      autocomplete: "off",
    },
  });
  searchBar.appendChild(iconWrap);
  searchBar.appendChild(input);
  const shResult = createElement("div", { className: "shResult" });
  const leftSide = createElement("div", { className: "leftSide" });
  const rightSide = createElement("div", {
    className: "rightSide",
    styles: { display: "none" },
  });
  shResult.appendChild(leftSide);
  shResult.appendChild(rightSide);
  searchMenu.appendChild(backRow);
  searchMenu.appendChild(searchBar);
  searchMenu.appendChild(shResult);
  const refs = { searchMenu, input, leftSide, rightSide };
  fillSearchDefault(leftSide, rightSide, input, menuEl, merged);
  return refs;
}

function setPowerVisible(powerCont, open) {
  powerCont.setAttribute("data-vis", open ? "true" : "false");
  powerCont.style.display = open ? "" : "none";
}

function buildPowerRow(icon, label, onClick) {
  const row = createElement("div", {});
  row.appendChild(createElement("i", { className: icon }));
  row.appendChild(createElement("span", { text: label }));
  bindEvent(row, "click", onClick);
  return row;
}

function buildMenuBar(menuEl) {
  const menuBar = createElement("div", { className: "menuBar" });
  const profile = createElement("div", { className: "profile" });
  const avatar = createElement("img", { attributes: { alt: "" } });
  avatar.width = 26;
  avatar.height = 26;
  avatar.style.borderRadius = "50%";
  const avatarRaw = readStore(
    StorageKeys.profilePicture,
    "static/icons/guest.webp",
  );
  avatar.src = resolveIconUrl(
    typeof avatarRaw === "string" && avatarRaw
      ? avatarRaw
      : "static/icons/guest.webp",
  );
  const userRaw = readStore(StorageKeys.username, "User");
  profile.appendChild(avatar);
  profile.appendChild(
    createElement("div", {
      className: "usName",
      text: typeof userRaw === "string" && userRaw ? userRaw : "User",
    }),
  );
  const powerMenu = createElement("div", { className: "powerMenu" });
  const powerCont = createElement("div", {
    className: "powerCont",
    attributes: { "data-vis": "false" },
    styles: { display: "none" },
  });
  powerCont.appendChild(
    buildPowerRow("fas fa-lock", "Lock", () => {
      setPowerVisible(powerCont, false);
      hideWinMenu(menuEl);
    }),
  );
  powerCont.appendChild(
    buildPowerRow("fas fa-power-off", "Shut down", async () => {
      setPowerVisible(powerCont, false);
      let ok = false;
      try {
        ok = await os.dialog.confirm("Shut down", "Shut down Astral OS?");
      } catch {
        ok = false;
      }
      if (ok) window.location.reload();
    }),
  );
  powerCont.appendChild(
    buildPowerRow("fas fa-rotate-right", "Restart", () => {
      window.location.reload();
    }),
  );
  const powerBtn = createElement("i", { className: "fas fa-power-off" });
  bindEvent(powerBtn, "click", () => {
    setPowerVisible(powerCont, powerCont.getAttribute("data-vis") !== "true");
  });
  powerMenu.appendChild(powerCont);
  powerMenu.appendChild(powerBtn);
  menuBar.appendChild(profile);
  menuBar.appendChild(powerMenu);
  return menuBar;
}

function appendWin11CreditPanel() {
  if ($("#win11-credit-overlay")) return;
  const overlay = createElement("div", {
    id: "win11-credit-overlay",
    className: "win11-credit-panel",
  });
  const card = createElement("div", { className: "aboutApp floatTab dpShad" });
  const aboutContent = createElement("div", { className: "content p-6" });
  const aboutTitle = createElement("div", {
    className: "text-xl font-semibold",
  });
  setText(aboutTitle, "About Astral OS");
  aboutContent.appendChild(aboutTitle);
  const aboutIntro = createElement("p");
  setText(
    aboutIntro,
    "Astral OS is an open source project that replicates the desktop experience on the web using standard web technologies like HTML, CSS, and JavaScript.",
  );
  aboutContent.appendChild(aboutIntro);
  const licensePara = createElement("p");
  setText(
    licensePara,
    "Start menu layout and taskbar styling are adapted from the ",
  );
  const licenseAnchor = createElement("a", {
    attributes: {
      href: "https://github.com/blueedgetechno/win11React",
      target: "_blank",
      rel: "noreferrer",
    },
  });
  setText(licenseAnchor, "Win11React project by BlueEdge");
  licensePara.appendChild(licenseAnchor);
  const licenseSuffix = createElement("span");
  setText(licenseSuffix, ".");
  licensePara.appendChild(licenseSuffix);
  aboutContent.appendChild(licensePara);

  const independentPara = createElement("p");
  setText(
    independentPara,
    "Astral OS is not in anyway affiliated with Microsoft and should not be confused with Microsoft's Operating System or Products.",
  );
  aboutContent.appendChild(independentPara);
  const trademarkPara = createElement("p");
  setText(
    trademarkPara,
    "Microsoft, Windows and Other demonstrated Products in this project are trademarks of the Microsoft group of companies.",
  );
  aboutContent.appendChild(trademarkPara);
  card.appendChild(aboutContent);
  const okRow = createElement("div", { className: "okbtn px-6 py-4" });
  const okBtn = createElement("div", {
    attributes: { "data-allow": "true" },
  });
  setText(okBtn, "Ok, I understand");
  bindEvent(okBtn, "click", (event) => {
    if (event) event.stopPropagation();
    overlay.remove();
  });
  okRow.appendChild(okBtn);
  card.appendChild(okRow);
  overlay.appendChild(card);
  bindEvent(overlay, "click", (event) => {
    if (event && event.target === overlay) {
      overlay.remove();
    }
  });
  const body = $("body");
  if (body) body.appendChild(overlay);
}

function appendWin11Credit(root) {
  if (!root) return;
  if ($(".win11-credit", root)) return;
  const badge = createElement("button", {
    className: "win11-credit",
    text: "?",
    attributes: {
      title: "Start menu inspired by Win11React (CC0). Open project page.",
      type: "button",
      "aria-label":
        "Start menu inspired by Win11React (CC0). Open project page.",
    },
  });
  bindEvent(badge, "click", () => {
    appendWin11CreditPanel(root);
  });
  root.appendChild(badge);
}

function hideNativeStart(menuEl) {
  const content = $(".start-content", menuEl);
  if (content) content.style.display = "none";
  $$(".start-page", menuEl).forEach((el) => {
    el.style.display = "none";
  });
  $$(".search-input-wrapper", menuEl).forEach((el) => {
    el.style.display = "none";
  });
}

function renderWin11Menu(force) {
  if (!isWin11StartMenuActive()) return;
  const menuEl = $("#start-menu");
  if (!menuEl || menuEl.style.display !== "flex") return;
  const existing = $("#win11-start-root");
  if (!existing) {
    showingAll = false;
    showSearch = false;
  }
  const merged = getMergedApps();
  const pinnedReal = getPinnedApps(merged);
  const alignRaw = readStore(StorageKeys.win11TaskbarAlign, "center");
  const align = alignRaw === "left" ? "left" : "center";
  const sig =
    showingAll +
    "|" +
    showSearch +
    "|" +
    align +
    "|" +
    pinnedReal.map((row) => row.id).join(",");
  if (!force && existing && sig === builtForSig) return;
  builtForSig = sig;
  hideNativeStart(menuEl);
  if (existing) existing.remove();
  const padded = padSix(pinnedReal);
  const groups = bucketApps(
    merged.slice().sort((a, b) => a.title.localeCompare(b.title)),
  );
  const root = createElement("div", {
    id: "win11-start-root",
    className: "startMenu",
    attributes: { "data-align": align, "data-hide": "false" },
  });
  if (showSearch) {
    const searchRefs = buildSearchBlock(menuEl, merged);
    root.appendChild(searchRefs.searchMenu);
    menuEl.appendChild(root);
    bindEvent(searchRefs.input, "input", () => {
      updateSearch(
        searchRefs.input.value,
        searchRefs,
        menuEl,
        merged,
        padded,
        null,
      );
    });
    return;
  }
  const mainRefs = buildMainMenu(menuEl, padded, getRecommended(merged));
  root.appendChild(mainRefs.stmenu);
  root.appendChild(buildAllCont(menuEl, groups));
  root.appendChild(buildMenuBar(menuEl));
  appendWin11Credit(root);
  menuEl.appendChild(root);
}

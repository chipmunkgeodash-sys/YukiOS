import {
  os,
  ServiceKeys,
  $,
  bindEvent,
  createElement,
  setText,
} from "../../framework.js";
import { getWeatherInfo } from "../../shared/weatherCodes.js";
import { detectUserLocation } from "../../apps/weather.js";
import yukiUpdates from "../../news.json";

let boardRoot = null;
let clockNode = null;
let weatherCard = null;
let cityLabelNode = null;
let condIconNode = null;
let tempDegNode = null;
let condLabelNode = null;
let precipLabelNode = null;
let windLabelNode = null;
let weekWrapNode = null;
let historyCardNode = null;
let historyTitleNode = null;
let historyInfoNode = null;
let historyLinkNode = null;
let topNewsListNode = null;
let allNewsListNode = null;
let clockTimer = null;
let loadToken = 0;
let outsideHandler = null;

const BOARD_ID = "win11-widgets-board";

function formatClockText() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function refreshClock() {
  if (clockNode) setText(clockNode, formatClockText());
}

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function startClock() {
  stopClock();
  refreshClock();
  clockTimer = setInterval(refreshClock, 30000);
}

function conditionIcon(code) {
  const num = Number(code);
  if (num === 0) return "fas fa-sun";
  if (num === 1) return "fas fa-cloud-sun";
  if (num === 45 || num === 48) return "fas fa-smog";
  if (
    num === 71 ||
    num === 73 ||
    num === 75 ||
    num === 77 ||
    num === 85 ||
    num === 86
  )
    return "fas fa-snowflake";
  if (num === 95 || num === 96 || num === 99) return "fas fa-bolt";
  if (
    num === 51 ||
    num === 53 ||
    num === 55 ||
    num === 61 ||
    num === 63 ||
    num === 65 ||
    num === 80 ||
    num === 81 ||
    num === 82
  )
    return "fas fa-cloud-rain";
  return "fas fa-cloud";
}

function hideWeatherCard() {
  if (weatherCard) weatherCard.style.display = "none";
}

function weekdayLabel(dateText, index) {
  if (index === 0) return "Today";
  try {
    const parsed = new Date(dateText + "T12:00:00");
    return parsed.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return dateText;
  }
}

async function loadWeather() {
  if (!weatherCard) return;
  const token = loadToken;
  try {
    let payload = null;
    let locCity = "";
    let locCountry = "";
    let instance = null;
    try {
      instance = os.app.getInstance("weatherApp");
    } catch {
      instance = null;
    }
    if (instance && typeof instance.fetchWeatherByCoords === "function") {
      const loc = await detectUserLocation();
      if (token !== loadToken) return;
      locCity = loc.city;
      locCountry = loc.country;
      payload = await instance.fetchWeatherByCoords(
        loc.latitude,
        loc.longitude,
        loc.city,
        loc.country,
      );
      if (payload && payload.cityName) locCity = payload.cityName;
      if (payload && payload.country) locCountry = payload.country;
    } else {
      const loc = await detectUserLocation();
      if (token !== loadToken) return;
      locCity = loc.city;
      locCountry = loc.country;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,precipitation,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,time&timezone=auto&forecast_days=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather request failed");
      payload = await res.json();
    }
    if (token !== loadToken) return;
    if (!payload || !payload.current) throw new Error("Empty weather payload");
    const current = payload.current;
    const info = getWeatherInfo(current.weather_code);
    setText(cityLabelNode, locCity + (locCountry ? ", " + locCountry : ""));
    setText(tempDegNode, String(Math.round(current.temperature_2m)));
    setText(condLabelNode, info.label || "Unknown");
    if (condIconNode)
      condIconNode.className = conditionIcon(current.weather_code);
    const precipValue =
      current.precipitation !== undefined && current.precipitation !== null
        ? Number(current.precipitation)
        : 0;
    const windValue =
      current.wind_speed_10m !== undefined && current.wind_speed_10m !== null
        ? Number(current.wind_speed_10m)
        : 0;
    setText(precipLabelNode, precipValue + " mm");
    setText(windLabelNode, windValue + " km/h");
    while (weekWrapNode.firstChild) weekWrapNode.firstChild.remove();
    const daily = payload.daily;
    if (daily && Array.isArray(daily.time)) {
      const count = daily.time.length;
      const limit = count > 5 ? 5 : count;
      for (let i = 0; i < limit; i++) {
        const dayCode =
          daily.weather_code && Array.isArray(daily.weather_code)
            ? daily.weather_code[i]
            : current.weather_code;
        const maxVal =
          daily.temperature_2m_max && Array.isArray(daily.temperature_2m_max)
            ? daily.temperature_2m_max[i]
            : null;
        const minVal =
          daily.temperature_2m_min && Array.isArray(daily.temperature_2m_min)
            ? daily.temperature_2m_min[i]
            : null;
        const dayBox = createElement("div", { className: "weekDay" });
        const nameNode = createElement("div", {
          text: weekdayLabel(daily.time[i], i),
        });
        dayBox.appendChild(nameNode);
        const dayIcon = createElement("i", {
          className: conditionIcon(dayCode),
          styles: { fontSize: "24px" },
        });
        dayBox.appendChild(dayIcon);
        const maxNode = createElement("div", {
          className: "tempCont",
          text: maxVal !== null ? String(Math.round(maxVal)) : "",
        });
        dayBox.appendChild(maxNode);
        const minNode = createElement("div", {
          className: "tempCont",
          text: minVal !== null ? String(Math.round(minVal)) : "",
        });
        dayBox.appendChild(minNode);
        weekWrapNode.appendChild(dayBox);
      }
    }
    weatherCard.style.display = "";
  } catch {
    hideWeatherCard();
  }
}

import win11News from "./win11News.json";

function trimNewsTitle(title) {
  const parts = String(title || "")
    .split("-")
    .reverse();
  parts.splice(0, 1);
  return parts.reverse().join("-").trim();
}

function normalizeArticle(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw.source && raw.source.name ? raw.source.name : "News";
  const title = trimNewsTitle(raw.title);
  if (!title) return null;
  return {
    source: source,
    title: title,
    url: raw.url || null,
    image: raw.urlToImage || null,
    desc: raw.content || raw.description || "",
  };
}

function flattenYukiNews(limit) {
  const out = [];
  const list = Array.isArray(yukiUpdates) ? yukiUpdates : [];
  for (let i = 0; i < list.length; i++) {
    if (out.length >= limit) break;
    const update = list[i];
    if (!update || !Array.isArray(update.sections)) continue;
    for (let s = 0; s < update.sections.length; s++) {
      if (out.length >= limit) break;
      const section = update.sections[s];
      if (!section || !Array.isArray(section.items)) continue;
      for (let k = 0; k < section.items.length; k++) {
        if (out.length >= limit) break;
        const item = section.items[k];
        if (!Array.isArray(item)) continue;
        out.push({ section: section.title, title: item[1], desc: item[2] });
      }
    }
  }
  return out;
}

function buildYukiRow(entry) {
  const row = createElement("div", { className: "yukiNewsRow" });
  const source = createElement("div", { className: "tpSource" });
  setText(source, entry.section || "Astral OS");
  row.appendChild(source);
  const article = createElement("div", { className: "tpArticle" });
  setText(article, entry.title || "Update");
  row.appendChild(article);
  if (entry.desc) {
    const descNode = createElement("div", { className: "yukiNewsDesc" });
    setText(descNode, entry.desc);
    row.appendChild(descNode);
  }
  bindEvent(row, "click", () => {
    try {
      if (os.app.hasApp("newsApp")) os.app.launch("newsApp");
    } catch {
      return;
    }
  });
  return row;
}

function fetchLiveNews(limit) {
  const articles =
    win11News && Array.isArray(win11News.articles) ? win11News.articles : [];
  const out = [];
  for (let i = 0; i < articles.length; i++) {
    if (out.length >= limit) break;
    const story = normalizeArticle(articles[i]);
    if (story) out.push(story);
  }
  return out;
}

function openStory(story) {
  const url =
    story && (story.url || story.link) ? story.url || story.link : null;
  try {
    if (url && os.app.hasApp(ServiceKeys.BROWSER)) {
      const launched = os.app.launch(ServiceKeys.BROWSER, { openUrl: url });
      if (launched && typeof launched.catch === "function")
        launched.catch(() => window.open(url, "_blank"));
      return;
    }
    if (os.app.hasApp(ServiceKeys.BROWSER)) {
      const launched = os.app.launch(ServiceKeys.BROWSER);
      if (launched && typeof launched.catch === "function") {
        launched.catch(() => {
          try {
            if (url) window.open(url, "_blank");
            else os.app.launch("newsApp");
          } catch {
            return;
          }
        });
      }
      return;
    }
  } catch {
    try {
      if (url) window.open(url, "_blank");
    } catch {
      return;
    }
    return;
  }
  try {
    if (url) window.open(url, "_blank");
    else os.app.launch("newsApp");
  } catch {
    return;
  }
}

function buildTopStory(story) {
  const item = createElement("div", { className: "tpNews" });
  const source = createElement("div", { className: "tpSource" });
  setText(source, story.source || story.section || story.date || "News");
  item.appendChild(source);
  const article = createElement("div", { className: "tpArticle" });
  setText(article, story.title || "Untitled update");
  item.appendChild(article);
  return item;
}

function buildArticle(story) {
  const href = story.url || story.link || "#";
  const anchor = createElement("a", {
    className: "articleCont ltShad",
    attributes: { href: href, target: "_blank" },
  });
  if (story.image) anchor.style.backgroundImage = `url("${story.image}")`;
  anchor.style.setProperty(
    "--backgrad",
    `hsl(${Math.floor(Math.random() * 360)}deg 36% 16%)`,
  );
  const inner = createElement("div", { className: "tpNews" });
  const source = createElement("div", { className: "tpSource" });
  setText(source, story.source || story.section || story.date || "News");
  inner.appendChild(source);
  const article = createElement("div", { className: "tpArticle" });
  setText(article, story.title || "Untitled update");
  inner.appendChild(article);
  anchor.appendChild(inner);
  if (story.desc && story.showDesc) {
    const descNode = createElement("div", { className: "tpdesc" });
    setText(descNode, story.desc);
    anchor.appendChild(descNode);
  }
  bindEvent(anchor, "click", (evt) => {
    evt.preventDefault();
    openStory(story);
  });
  return anchor;
}

function renderNewsStories(stories) {
  if (!topNewsListNode || !allNewsListNode) return;
  while (topNewsListNode.firstChild) topNewsListNode.firstChild.remove();
  while (allNewsListNode.firstChild) allNewsListNode.firstChild.remove();
  stories
    .slice(0, 4)
    .forEach((story) => topNewsListNode.appendChild(buildTopStory(story)));
  const rest = stories.slice(4);
  const mid = Math.ceil(rest.length / 2);
  rest.slice(0, mid).forEach((story, index) => {
    story.showDesc = index % 5 === 4;
    allNewsListNode.appendChild(buildArticle(story));
  });
  const head = createElement("div", { className: "yukiNewsHead" });
  setText(head, "Astral OS");
  allNewsListNode.appendChild(head);
  flattenYukiNews(10).forEach((entry) =>
    allNewsListNode.appendChild(buildYukiRow(entry)),
  );
  rest.slice(mid).forEach((story, offset) => {
    story.showDesc = (mid + offset) % 5 === 4;
    allNewsListNode.appendChild(buildArticle(story));
  });
}

function loadExternalNews() {
  if (!topNewsListNode || !allNewsListNode) return;
  try {
    renderNewsStories(fetchLiveNews(40));
  } catch {
    return;
  }
}

async function loadHistory() {
  if (!historyCardNode) return;
  const token = loadToken;
  try {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const res = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${month}/${day}`,
    );
    if (!res.ok) throw new Error("History request failed");
    const data = await res.json();
    if (token !== loadToken) return;
    const list = data && Array.isArray(data.selected) ? data.selected : [];
    if (list.length === 0) throw new Error("Empty history");
    const entry = list[0];
    const pages = Array.isArray(entry.pages) ? entry.pages : [];
    const firstPage = pages.length > 0 ? pages[0] : null;
    let pageUrl = null;
    let thumb = null;
    if (firstPage) {
      if (
        firstPage.content_urls &&
        firstPage.content_urls.desktop &&
        firstPage.content_urls.desktop.page
      )
        pageUrl = firstPage.content_urls.desktop.page;
      if (firstPage.thumbnail && firstPage.thumbnail.source)
        thumb = firstPage.thumbnail.source;
    }
    const yearText = entry.year ? String(entry.year) : "";
    const entryText = entry.text || "";
    setText(historyTitleNode, "ON THIS DAY " + month + "/" + day);
    setText(historyInfoNode, yearText ? yearText + " " + entryText : entryText);
    if (thumb) historyCardNode.style.backgroundImage = `url("${thumb}")`;
    else historyCardNode.style.backgroundImage = "";
    if (pageUrl && historyLinkNode)
      historyLinkNode.setAttribute("href", pageUrl);
    historyCardNode.style.display = "";
  } catch {
    if (historyCardNode) historyCardNode.style.display = "none";
  }
}

function buildBoard() {
  const board = createElement("div", {
    id: BOARD_ID,
    className: "win11-widboard widPaneCont",
    attributes: { "data-hide": "true" },
  });
  const pane = createElement("div", { className: "WidPane win11Scroll" });
  board.appendChild(pane);
  const topBar = createElement("div", {
    className: "widtop",
    html: '<i class="fas fa-ellipsis-h"></i>',
  });
  pane.appendChild(topBar);
  clockNode = createElement("div", {
    className: "widTime",
    text: formatClockText(),
  });
  pane.appendChild(clockNode);
  const widgetCont = createElement("div", { className: "widgetCont" });
  pane.appendChild(widgetCont);
  const topWidgets = createElement("div", { className: "topWidgets" });
  widgetCont.appendChild(topWidgets);
  weatherCard = createElement("div", { className: "weatherCont ltShad" });
  weatherCard.style.display = "none";
  const wthtop = createElement("div", { className: "wthtop" });
  const wthtopIcon = createElement("i", {
    className: "fas fa-cloud-sun",
    styles: { fontSize: "18px" },
  });
  wthtop.appendChild(wthtopIcon);
  const wthtopLabel = createElement("span", { text: "Weather" });
  wthtop.appendChild(wthtopLabel);
  weatherCard.appendChild(wthtop);
  const wthcity = createElement("div", { className: "wthcity" });
  const cityIcon = createElement("i", {
    className: "fas fa-location-dot",
    styles: { fontSize: "8px" },
  });
  wthcity.appendChild(cityIcon);
  cityLabelNode = createElement("span", { text: "Loading" });
  wthcity.appendChild(cityLabelNode);
  weatherCard.appendChild(wthcity);
  const wthInfo = createElement("div", { className: "wthInfo" });
  weatherCard.appendChild(wthInfo);
  const wthTemp = createElement("div", { className: "wthTemp" });
  wthInfo.appendChild(wthTemp);
  condIconNode = createElement("i", {
    className: "fas fa-cloud-sun",
    styles: { fontSize: "32px" },
  });
  wthTemp.appendChild(condIconNode);
  tempDegNode = createElement("div", { className: "wthdeg" });
  wthTemp.appendChild(tempDegNode);
  const wthunit = createElement("div", { className: "wthunit", text: "C" });
  wthTemp.appendChild(wthunit);
  const moreWinfo = createElement("div", { className: "moreWinfo" });
  wthInfo.appendChild(moreWinfo);
  condLabelNode = createElement("div", { className: "wcontext" });
  moreWinfo.appendChild(condLabelNode);
  const rainProb = createElement("div", { className: "rainProb" });
  moreWinfo.appendChild(rainProb);
  const rainRow = createElement("div", { className: "chanceOfRain" });
  rainProb.appendChild(rainRow);
  const dropIcon = createElement("i", { className: "fas fa-droplet" });
  rainRow.appendChild(dropIcon);
  precipLabelNode = createElement("span", { text: "" });
  rainRow.appendChild(precipLabelNode);
  const windRow = createElement("div", { className: "chanceOfRain" });
  rainProb.appendChild(windRow);
  const windIcon = createElement("i", { className: "fas fa-wind" });
  windRow.appendChild(windIcon);
  windLabelNode = createElement("span", { text: "" });
  windRow.appendChild(windLabelNode);
  weekWrapNode = createElement("div", { className: "weekWthCont" });
  weatherCard.appendChild(weekWrapNode);
  topWidgets.appendChild(weatherCard);
  const shortCont = createElement("div", { className: "shortCont" });
  topWidgets.appendChild(shortCont);
  historyCardNode = createElement("div", { className: "short1 ltShad" });
  shortCont.appendChild(historyCardNode);
  const historyNameRow = createElement("div", { className: "shName" });
  historyCardNode.appendChild(historyNameRow);
  const landmarkIcon = createElement("i", { className: "fas fa-landmark" });
  historyNameRow.appendChild(landmarkIcon);
  historyTitleNode = createElement("span", { text: "ON THIS DAY" });
  historyNameRow.appendChild(historyTitleNode);
  const infoWrap = createElement("div", { className: "infotextCont" });
  historyCardNode.appendChild(infoWrap);
  historyInfoNode = createElement("div", {
    className: "dayInfo",
    text: "Loading",
  });
  infoWrap.appendChild(historyInfoNode);
  historyLinkNode = createElement("a", {
    className: "wikiref",
    attributes: { href: "#", target: "_blank" },
    text: "more on wiki",
  });
  bindEvent(historyLinkNode, "click", (evt) => {
    evt.preventDefault();
    const href = historyLinkNode.getAttribute("href");
    if (href && href !== "#") openStory({ url: href });
  });
  infoWrap.appendChild(historyLinkNode);
  const newsCont = createElement("div", { className: "newsCont" });
  widgetCont.appendChild(newsCont);
  const topStoriesCard = createElement("div", {
    className: "topStories ltShad",
  });
  newsCont.appendChild(topStoriesCard);
  const topNewsText = createElement("div", {
    className: "topNewsText",
    text: "TOP STORIES",
  });
  topStoriesCard.appendChild(topNewsText);
  topNewsListNode = createElement("div", { className: "topNewsCont" });
  topStoriesCard.appendChild(topNewsListNode);
  allNewsListNode = createElement("div", { className: "allNewsCont" });
  newsCont.appendChild(allNewsListNode);
  const bodyNode = $("body");
  if (bodyNode) bodyNode.appendChild(board);
  boardRoot = board;
  refreshClock();
}

function handleOutsidePress(evt) {
  const board = boardRoot || $("#" + BOARD_ID);
  if (!board) return;
  if (board.getAttribute("data-hide") === "true") return;
  const target = evt ? evt.target : null;
  if (!target || !target.closest) return;
  if (target.closest("#" + BOARD_ID)) return;
  if (target.closest(".tsIcon.widget")) return;
  board.setAttribute("data-hide", "true");
  loadToken += 1;
  stopClock();
}

export function setupWin11Widgets() {
  if (boardRoot || $("#" + BOARD_ID)) return;
  loadToken = 0;
  buildBoard();
  outsideHandler = handleOutsidePress;
  bindEvent(document, "pointerdown", outsideHandler);
}

export function teardownWin11Widgets() {
  loadToken += 1;
  stopClock();
  try {
    if (outsideHandler)
      document.removeEventListener("pointerdown", outsideHandler);
  } catch {
    outsideHandler = null;
  }
  outsideHandler = null;
  if (boardRoot) {
    boardRoot.remove();
    boardRoot = null;
  } else {
    const existing = $("#" + BOARD_ID);
    if (existing) existing.remove();
  }
  clockNode = null;
  weatherCard = null;
  cityLabelNode = null;
  condIconNode = null;
  tempDegNode = null;
  condLabelNode = null;
  precipLabelNode = null;
  windLabelNode = null;
  weekWrapNode = null;
  historyCardNode = null;
  historyTitleNode = null;
  historyInfoNode = null;
  historyLinkNode = null;
  topNewsListNode = null;
  allNewsListNode = null;
}

export function toggleWin11Widgets() {
  const board = boardRoot || $("#" + BOARD_ID);
  if (!board) return;
  const hidden = board.getAttribute("data-hide") !== "false";
  if (hidden) {
    board.setAttribute("data-hide", "false");
    loadToken += 1;
    refreshClock();
    startClock();
    loadWeather();
    loadHistory();
    loadExternalNews();
  } else {
    board.setAttribute("data-hide", "true");
    loadToken += 1;
    stopClock();
  }
}

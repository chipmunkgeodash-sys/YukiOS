// What the Astral App Store offers, and the rules for reading a repo someone
// adds. No DOM here, so all of it can be checked with plain objects.
//
// An app in the store is a website that opens in its own window through the
// proxy (like an app made in App Creator). A repo is a JSON file listing more
// of them:
//
//   { "title": "My repo", "apps": [ { "name": "Site", "url": "https://site.example",
//                                      "category": "Tools", "description": "...", "icon": "https://..." } ] }
//
// or just the array of apps.

export const CATEGORIES = ["AI", "Social", "Video & Music", "Games", "Tools", "Productivity", "Dev", "News & Reference"];

export const CATALOG = [
  // AI
  { name: "ChatGPT", url: "https://chatgpt.com", category: "AI", description: "OpenAI's assistant." },
  { name: "Claude", url: "https://claude.ai", category: "AI", description: "Anthropic's assistant." },
  { name: "Gemini", url: "https://gemini.google.com", category: "AI", description: "Google's assistant." },
  { name: "Perplexity", url: "https://www.perplexity.ai", category: "AI", description: "Search that answers with sources." },
  { name: "DeepSeek", url: "https://chat.deepseek.com", category: "AI", description: "Chat and reasoning." },
  { name: "Grok", url: "https://grok.com", category: "AI", description: "xAI's assistant." },
  // Social
  { name: "Reddit", url: "https://www.reddit.com", category: "Social", description: "Communities for everything." },
  { name: "X (Twitter)", url: "https://x.com", category: "Social", description: "What's happening." },
  { name: "Instagram", url: "https://www.instagram.com", category: "Social", description: "Photos and reels." },
  { name: "TikTok", url: "https://www.tiktok.com", category: "Social", description: "Short videos." },
  { name: "Pinterest", url: "https://www.pinterest.com", category: "Social", description: "Ideas and inspiration." },
  { name: "Bluesky", url: "https://bsky.app", category: "Social", description: "An open social network." },
  { name: "Tumblr", url: "https://www.tumblr.com", category: "Social", description: "Blogs and fandoms." },
  { name: "Slack", url: "https://app.slack.com", category: "Social", description: "Team chat." },
  // Video & music
  { name: "YouTube", url: "https://www.youtube.com", category: "Video & Music", description: "Videos from everyone." },
  { name: "Twitch", url: "https://www.twitch.tv", category: "Video & Music", description: "Live streams." },
  { name: "Spotify", url: "https://open.spotify.com", category: "Video & Music", description: "Music and podcasts." },
  { name: "SoundCloud", url: "https://soundcloud.com", category: "Video & Music", description: "Tracks from independent artists." },
  { name: "Deezer", url: "https://www.deezer.com", category: "Video & Music", description: "Music streaming." },
  { name: "Vimeo", url: "https://vimeo.com", category: "Video & Music", description: "Videos by creators." },
  { name: "Dailymotion", url: "https://www.dailymotion.com", category: "Video & Music", description: "Videos and trends." },
  // Games
  { name: "Chess.com", url: "https://www.chess.com", category: "Games", description: "Play chess online." },
  { name: "Lichess", url: "https://lichess.org", category: "Games", description: "Free, open-source chess." },
  { name: "CrazyGames", url: "https://www.crazygames.com", category: "Games", description: "Hundreds of browser games." },
  { name: "Poki", url: "https://poki.com", category: "Games", description: "Free online games." },
  { name: "Itch.io", url: "https://itch.io", category: "Games", description: "Indie games, many playable in the browser." },
  { name: "Newgrounds", url: "https://www.newgrounds.com", category: "Games", description: "Games and animations." },
  { name: "GeoGuessr", url: "https://www.geoguessr.com", category: "Games", description: "Guess where in the world you are." },
  { name: "Skribbl.io", url: "https://skribbl.io", category: "Games", description: "Draw and guess with friends." },
  { name: "Wordle", url: "https://www.nytimes.com/games/wordle/index.html", category: "Games", description: "Five-letter daily word game." },
  { name: "2048", url: "https://play2048.co", category: "Games", description: "Slide tiles, reach 2048." },
  { name: "Agar.io", url: "https://agar.io", category: "Games", description: "Eat or be eaten." },
  { name: "Slither.io", url: "https://slither.io", category: "Games", description: "Grow your snake." },
  // Tools
  { name: "Photopea", url: "https://www.photopea.com", category: "Tools", description: "A Photoshop-style image editor." },
  { name: "Pixlr", url: "https://pixlr.com/editor/", category: "Tools", description: "Photo editing in the browser." },
  { name: "Canva", url: "https://www.canva.com", category: "Tools", description: "Design anything." },
  { name: "Figma", url: "https://www.figma.com", category: "Tools", description: "Interface design." },
  { name: "Excalidraw", url: "https://excalidraw.com", category: "Tools", description: "A whiteboard that looks hand-drawn." },
  { name: "Desmos", url: "https://www.desmos.com/calculator", category: "Tools", description: "A graphing calculator." },
  { name: "Google Translate", url: "https://translate.google.com", category: "Tools", description: "Translate text and pages." },
  { name: "WolframAlpha", url: "https://www.wolframalpha.com", category: "Tools", description: "Computational answers." },
  // Productivity
  { name: "Google Docs", url: "https://docs.google.com", category: "Productivity", description: "Documents." },
  { name: "Google Sheets", url: "https://sheets.google.com", category: "Productivity", description: "Spreadsheets." },
  { name: "Google Slides", url: "https://slides.google.com", category: "Productivity", description: "Presentations." },
  { name: "Gmail", url: "https://mail.google.com", category: "Productivity", description: "Email." },
  { name: "Outlook", url: "https://outlook.live.com", category: "Productivity", description: "Email and calendar." },
  { name: "ProtonMail", url: "https://mail.proton.me", category: "Productivity", description: "Private email." },
  { name: "Notion", url: "https://www.notion.so", category: "Productivity", description: "Notes, docs and projects." },
  { name: "Google Drive", url: "https://drive.google.com", category: "Productivity", description: "Files in the cloud." },
  // Dev
  { name: "GitHub", url: "https://github.com", category: "Dev", description: "Code hosting." },
  { name: "GitLab", url: "https://gitlab.com", category: "Dev", description: "Code and CI." },
  { name: "CodePen", url: "https://codepen.io", category: "Dev", description: "Front-end playground." },
  { name: "StackBlitz", url: "https://stackblitz.com", category: "Dev", description: "Instant dev environments." },
  { name: "VS Code for the Web", url: "https://vscode.dev", category: "Dev", description: "The editor in a tab." },
  { name: "Stack Overflow", url: "https://stackoverflow.com", category: "Dev", description: "Programming Q&A." },
  // News & reference
  { name: "Wikipedia", url: "https://www.wikipedia.org", category: "News & Reference", description: "The free encyclopedia." },
  { name: "Hacker News", url: "https://news.ycombinator.com", category: "News & Reference", description: "Tech news and discussion." },
  { name: "BBC News", url: "https://www.bbc.com/news", category: "News & Reference", description: "World news." },
  { name: "NPR", url: "https://www.npr.org", category: "News & Reference", description: "News and radio." },
  { name: "Weather.com", url: "https://weather.com", category: "News & Reference", description: "Forecasts." }
];

const clip = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const isHttps = (u) => /^https:\/\/[^\s"'<>`\\]+$/i.test(String(u || ""));

// The same website, however it was typed: host and path, no www, no trailing slash.
export function siteKey(url) {
  try {
    const u = new URL(String(url));
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

// An icon address for an app: the one the repo gave, else its site's favicon.
export function iconFor(app) {
  if (isHttps(app.icon)) return app.icon;
  try {
    const host = new URL(app.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return "";
  }
}

// Reads a repo's JSON. Anything that isn't a plain https website is dropped, and
// text is trimmed to a sensible length: a repo is someone else's file.
export function parseRepo(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.apps) ? json.apps : null;
  if (!list) throw new Error("That doesn't look like an app repo. It needs an \"apps\" list.");
  const seen = new Set();
  const apps = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = clip(raw.name || raw.title, 60);
    if (!name || !isHttps(raw.url)) continue;
    const key = siteKey(raw.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    apps.push({
      name,
      url: String(raw.url).slice(0, 500),
      category: clip(raw.category, 30) || "Other",
      description: clip(raw.description, 160),
      ...(isHttps(raw.icon) ? { icon: String(raw.icon).slice(0, 500) } : {})
    });
  }
  if (!apps.length) throw new Error("That repo has no apps the store can install.");
  return { title: clip(json?.title, 60), apps };
}

// What to show: by category (or "Installed"), and by what was typed.
export function filterApps(apps, { category = "", term = "", installed = new Set() } = {}) {
  const t = term.trim().toLowerCase();
  return apps.filter((a) => {
    if (category === "__installed") { if (!installed.has(siteKey(a.url))) return false; }
    else if (category && a.category !== category) return false;
    if (!t) return true;
    return `${a.name} ${a.category} ${a.description || ""}`.toLowerCase().includes(t);
  });
}

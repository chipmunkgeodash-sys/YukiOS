// Where this desktop is served from. Normally the site root, but Astral OS
// serves it at /astral-os/ (VITE_BASE), and files such as the Scramjet proxy
// pages (sapps/, s/) and wasm/ live under that base, not at the root.
//
//   sitePath("sapps/set-template.html")  ->  "/astral-os/sapps/set-template.html"
//   siteUrl("s/index.html")              ->  "https://host/astral-os/s/index.html"
//
// Builds with a relative base (single-file, Electron) have no usable path, so
// they keep using the root, as before.

const BASE = import.meta.env?.BASE_URL || "/";
export const SITE_BASE = BASE.startsWith("/") ? BASE : "/";

export const sitePath = (path) => SITE_BASE + String(path).replace(/^\/+/, "");
export const siteUrl = (path) => window.location.origin + sitePath(path);

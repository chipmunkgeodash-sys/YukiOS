import { describe, it, expect } from "vitest";
import { CATALOG, CATEGORIES, filterApps, iconFor, parseRepo, siteKey } from "../apps/appStoreCatalog.js";

describe("the built-in catalog", () => {
  it("has only well-formed https apps", () => {
    for (const a of CATALOG) {
      expect(a.name.length, a.name).toBeGreaterThan(0);
      expect(a.url, a.name).toMatch(/^https:\/\/[^\s]+$/);
      expect(a.description.length, a.name).toBeGreaterThan(0);
    }
  });

  it("lists each website once, with a unique name", () => {
    const keys = CATALOG.map((a) => siteKey(a.url));
    expect(new Set(keys).size).toBe(keys.length);
    const names = CATALOG.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts every app in a known category", () => {
    for (const a of CATALOG) expect(CATEGORIES, a.name).toContain(a.category);
  });

  it("does not offer apps the OS removed", () => {
    expect(CATALOG.some((a) => /discord/i.test(a.name + a.url))).toBe(false);
  });
});

describe("siteKey", () => {
  it("treats the same site typed differently as one site", () => {
    expect(siteKey("https://www.Reddit.com/")).toBe(siteKey("https://reddit.com"));
    expect(siteKey("https://chatgpt.com/")).toBe("chatgpt.com");
  });
  it("keeps the path, so different apps on one host stay apart", () => {
    expect(siteKey("https://pixlr.com/editor/")).not.toBe(siteKey("https://pixlr.com/express/"));
  });
  it("gives an empty key for something that is not a URL", () => {
    expect(siteKey("not a url")).toBe("");
  });
});

describe("iconFor", () => {
  it("uses the repo's own https icon", () => {
    expect(iconFor({ url: "https://a.example", icon: "https://a.example/i.png" })).toBe("https://a.example/i.png");
  });
  it("falls back to the site's favicon, and never to an unsafe icon", () => {
    expect(iconFor({ url: "https://a.example", icon: "javascript:alert(1)" })).toContain("s2/favicons?domain=a.example");
    expect(iconFor({ url: "https://a.example" })).toContain("a.example");
  });
});

describe("parseRepo", () => {
  const app = (over = {}) => ({ name: "Site", url: "https://site.example", category: "Tools", description: "A site.", ...over });

  it("reads an object with a title and an apps list", () => {
    const r = parseRepo({ title: "Mine", apps: [app()] });
    expect(r.title).toBe("Mine");
    expect(r.apps).toEqual([app()]);
  });

  it("reads a bare array of apps", () => {
    expect(parseRepo([app()]).apps).toHaveLength(1);
  });

  it("drops anything that is not a plain https website", () => {
    const r = parseRepo([
      app({ name: "ok" }),
      app({ name: "http", url: "http://insecure.example" }),
      app({ name: "js", url: "javascript:alert(1)" }),
      app({ name: "data", url: "data:text/html,hi" }),
      app({ name: "", url: "https://noname.example" }),
      null,
      "string"
    ]);
    expect(r.apps.map((a) => a.name)).toEqual(["ok"]);
  });

  it("keeps one entry per website", () => {
    const r = parseRepo([app({ name: "a" }), app({ name: "b", url: "https://www.site.example/" })]);
    expect(r.apps).toHaveLength(1);
  });

  it("trims long text and defaults the category", () => {
    const r = parseRepo([app({ name: "x".repeat(200), category: undefined, description: "d".repeat(500) })]);
    expect(r.apps[0].name.length).toBe(60);
    expect(r.apps[0].description.length).toBe(160);
    expect(r.apps[0].category).toBe("Other");
  });

  it("only keeps an https icon", () => {
    const r = parseRepo([app({ icon: "javascript:1" }), app({ url: "https://b.example", icon: "https://b.example/i.png" })]);
    expect(r.apps[0].icon).toBeUndefined();
    expect(r.apps[1].icon).toBe("https://b.example/i.png");
  });

  it("explains a file that is not a repo, or has nothing installable", () => {
    expect(() => parseRepo({ nope: 1 })).toThrow(/apps/);
    expect(() => parseRepo("text")).toThrow(/apps/);
    expect(() => parseRepo([{ name: "x", url: "http://bad.example" }])).toThrow(/no apps/);
  });
});

describe("filterApps", () => {
  const apps = CATALOG.slice(0, 40);
  it("filters by category", () => {
    const r = filterApps(apps, { category: "AI" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.category === "AI")).toBe(true);
  });
  it("searches name, category and description, ignoring case", () => {
    expect(filterApps(CATALOG, { term: "CRAXGPT" }).map((a) => a.name)).toContain("CraxGPT");
    expect(filterApps(CATALOG, { term: "encyclopedia" }).map((a) => a.name)).toContain("Wikipedia");
  });
  it("shows only what is installed in the Installed view", () => {
    const installed = new Set([siteKey("https://gpt.crax.lol")]);
    expect(filterApps(CATALOG, { category: "__installed", installed }).map((a) => a.name)).toEqual(["CraxGPT"]);
  });
  it("shows everything with no filter", () => {
    expect(filterApps(CATALOG, {})).toHaveLength(CATALOG.length);
  });
});

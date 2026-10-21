import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The Evil Spotify screen inside Astral OS, with the Astral bridge faked.
const bridge = vi.hoisted(() => ({
  identity: null,
  requests: [],
  replies: {},
  identityListeners: new Set(),
}));

vi.mock("../shared/astralBridge.js", () => ({
  getAstralIdentity: () => bridge.identity,
  getMusicState: () => null,
  onAstralIdentity: (fn) => {
    bridge.identityListeners.add(fn);
    return () => bridge.identityListeners.delete(fn);
  },
  onMusicState: () => () => {},
  astralRequest: vi.fn(async (op, payload) => {
    bridge.requests.push({ op, payload });
    const r = bridge.replies[op];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(payload) : r;
  }),
}));

import { mountAstralMusic } from "../apps/astralMusic.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const SONG = { id: "dz1", title: "Song <b>One</b>", artist: "Artist & Co", art: "" };

describe("Astral OS Evil Spotify", () => {
  let root;
  let app;

  beforeEach(() => {
    bridge.requests = [];
    bridge.identity = { signedIn: true, uid: "u1", displayName: "Mira" };
    bridge.replies = {
      "music.featured": [{ ...SONG, id: "f1", title: "Featured One" }],
      "music.shared": [{ ...SONG, by: "u1", byName: "Mira" }],
      "music.playlists": [],
      "music.state": null,
      "music.addShared": "dz1",
      "music.removeShared": null,
      "music.search": [SONG],
    };
    root = document.createElement("div");
    document.body.appendChild(root);
    app = mountAstralMusic(root);
  });

  afterEach(() => {
    app.destroy();
    root.remove();
  });

  it("shows who is signed in and the featured songs first", async () => {
    await flush();
    expect(root.textContent).toContain("Signed in as Mira");
    expect(root.textContent).toContain("Featured One");
  });

  it("escapes song text instead of rendering it as HTML", async () => {
    await flush();
    click(root.querySelector('[data-tab="shared"]'));
    await flush();
    expect(root.querySelector(".evs-meta b").innerHTML).toBe("Song &lt;b&gt;One&lt;/b&gt;");
    expect(root.querySelector(".evs-meta b b")).toBeNull();
  });

  it("shows songs other members added, with who added them", async () => {
    click(root.querySelector('[data-tab="shared"]'));
    await flush();
    expect(root.textContent).toContain("Added by Mira");
  });

  it("adds a searched song to the shared playlist and refreshes it", async () => {
    click(root.querySelector('[data-tab="search"]'));
    root.querySelector(".evs-search input").value = "one";
    click(root.querySelector('[data-act="search"]'));
    await flush();
    click(root.querySelector('[data-act="share"]'));
    await flush();
    const add = bridge.requests.find((r) => r.op === "music.addShared");
    expect(add.payload.song.id).toBe("dz1");
    expect(root.textContent).toContain("Everyone can see it now");
    expect(bridge.requests.filter((r) => r.op === "music.shared").length).toBeGreaterThan(1);
  });

  it("only offers Remove on songs you added", async () => {
    bridge.replies["music.shared"] = [
      { ...SONG, id: "a", by: "u1" },
      { ...SONG, id: "b", by: "someone-else" },
    ];
    click(root.querySelector('[data-tab="shared"]'));
    await flush();
    const rows = [...root.querySelectorAll(".evs-row")];
    expect(rows[0].querySelector('[data-act="remove"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-act="remove"]')).toBeNull();
  });

  it("tells a guest to sign in instead of trying to add a song", async () => {
    app.destroy();
    bridge.identity = { signedIn: false };
    root.innerHTML = "";
    app = mountAstralMusic(root);
    click(root.querySelector('[data-tab="search"]'));
    root.querySelector(".evs-search input").value = "one";
    click(root.querySelector('[data-act="search"]'));
    await flush();
    click(root.querySelector('[data-act="share"]'));
    await flush();
    expect(root.textContent).toContain("Sign in to Astral to add songs");
    expect(bridge.requests.some((r) => r.op === "music.addShared")).toBe(false);
  });

  it("explains a failed list load instead of hanging on Loading", async () => {
    app.destroy();
    bridge.identity = { signedIn: false };
    bridge.replies["music.featured"] = new Error("Sign in first.");
    root.innerHTML = "";
    app = mountAstralMusic(root);
    await flush();
    expect(root.textContent).toContain("Sign in to Astral to see this.");
    expect(root.textContent).not.toContain("Loading…");
  });

  it("follows a sign-in on Astral without reopening", async () => {
    app.destroy();
    bridge.identity = { signedIn: false };
    root.innerHTML = "";
    app = mountAstralMusic(root);
    await flush();
    expect(root.textContent).toContain("Guest");
    bridge.identityListeners.forEach((fn) => fn({ signedIn: true, uid: "u9", displayName: "Kit" }));
    await flush();
    expect(root.textContent).toContain("Signed in as Kit");
  });
});

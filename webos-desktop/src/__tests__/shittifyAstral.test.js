import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { astralFeatures, ASTRAL_PAGE_SCRIPT } from "../apps/shittifyAstral.js";

// A stand-in for the Evil Spotify page: its home markup and the few globals the
// Astral additions use. In jsdom the window is its own parent, so messages the
// script sends to "the desktop" arrive on the same window, where the test
// answers them.

const flush = () => new Promise((r) => setTimeout(r, 0));
const send = (data) => window.dispatchEvent(new MessageEvent("message", { data, source: window }));

function installPage() {
  document.body.innerHTML = `<main><div class="songs-stuff" id="songs-stuff"><div class="cat-row"><div class="cards" id="cards-new"></div></div></div></main>`;
  window.makeCard = vi.fn((song, onClick) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = song.id;
    card.innerHTML = `<p class="song-name"></p><p class="artist-name"></p>`;
    card.querySelector(".song-name").textContent = song.title;
    card.querySelector(".artist-name").textContent = song.artist;
    card.addEventListener("click", onClick);
    return card;
  });
  window.playAnySong = vi.fn();
  window.showAddToPlaylistModal = vi.fn();
  window.showModal = vi.fn((html, onMount) => {
    const o = document.createElement("div");
    o.className = "modal-overlay";
    o.innerHTML = `<div class="modal-box">${html}</div>`;
    document.body.appendChild(o);
    if (onMount) onMount(o);
    return o;
  });
}

describe("Evil Spotify Astral additions", () => {
  let requests;
  let replies;
  let original;
  let dispose;

  const onMessage = (e) => {
    const d = e.data;
    if (!d || d.__astral_page !== true || d.type !== "request") return;
    requests.push(d);
    const reply = replies[d.op];
    Promise.resolve()
      .then(() => {
        if (reply instanceof Error) throw reply;
        return typeof reply === "function" ? reply(d.payload) : reply;
      })
      .then(
        (result) => send({ __astral_page: true, type: "reply", id: d.id, ok: true, result }),
        (err) => send({ __astral_page: true, type: "reply", id: d.id, ok: false, error: err.message })
      );
  };

  beforeEach(() => {
    requests = [];
    replies = {
      "music.featured": [{ id: "f1", title: "Pinned Song", artist: "Owner Pick", art: "https://img.example/f1.jpg" }],
      "music.shared": [
        { id: "s1", title: "Mine", artist: "Me", by: "u1", byName: "Mira" },
        { id: "s2", title: "Theirs", artist: "Other", by: "u2", byName: "Kit" },
      ],
      "music.search": [{ id: "dz9", title: "Found", artist: "Band" }],
      "music.addShared": "dz9",
      "music.removeShared": null,
      "music.resolve": { url: "https://audio.example/s1.mp3", full: true },
      "music.stop": null,
    };
    installPage();
    original = window.playAnySong;
    window.addEventListener("message", onMessage);
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    dispose = astralFeatures(window);
  });

  afterEach(() => {
    dispose();
    window.removeEventListener("message", onMessage);
    delete document.readyState;
    vi.restoreAllMocks();
  });

  const signIn = async (user = { signedIn: true, uid: "u1", displayName: "Mira" }) => {
    send({ __astral_page: true, type: "identity", user });
    await flush();
    await flush();
  };

  it("adds the featured and shared rows to the home view, in the page's own markup", async () => {
    await signIn();
    expect(document.querySelector("#astral-row-featured h1").textContent).toBe("Astral Featured");
    expect(document.querySelector("#astral-row-shared h1").textContent).toBe("Astral Shared");
    expect(document.querySelectorAll("#astral-row-shared .cat-top, #astral-row-shared .cards-wrapper")).toHaveLength(2);
    expect(document.querySelectorAll("#cards-astral-shared .card")).toHaveLength(2);
    expect(document.querySelector("#cards-astral-featured .card .song-name").textContent).toBe("Pinned Song");
  });

  it("tells a guest to sign in instead of showing a broken row", async () => {
    replies["music.featured"] = new Error("Sign in first.");
    replies["music.shared"] = new Error("Sign in first.");
    await signIn({ signedIn: false });
    expect(document.querySelector("#cards-astral-shared").textContent).toContain("Sign in to Astral to see this.");
    expect(document.querySelector("#cards-astral-shared").textContent).not.toContain("Loading");
  });

  it("only shows Remove on songs you added", async () => {
    await signIn();
    const cards = [...document.querySelectorAll("#cards-astral-shared .card")];
    expect(cards[0].querySelector("button[title='Remove from Astral Shared']")).not.toBeNull();
    expect(cards[1].querySelector("button[title='Remove from Astral Shared']")).toBeNull();
  });

  it("removes your own song and refreshes the row", async () => {
    await signIn();
    document.querySelector("#cards-astral-shared .card button[title='Remove from Astral Shared']").click();
    await flush();
    await flush();
    expect(requests.some((r) => r.op === "music.removeShared" && r.payload.song.id === "s1")).toBe(true);
    expect(requests.filter((r) => r.op === "music.shared").length).toBeGreaterThan(1);
  });

  it("strips markup from other members' song text before the page uses it", async () => {
    replies["music.shared"] = [{ id: "x", title: '<img src=x onerror=alert(1)>Evil"', artist: "A<b>B</b>", art: "javascript:alert(1)", by: "u2" }];
    await signIn();
    const song = window.makeCard.mock.calls.map((c) => c[0]).find((s) => s.id === "astral-x");
    expect(song.title).not.toMatch(/[<>"]/);
    expect(song.artist).not.toMatch(/[<>]/);
    expect(song.cover).toBe("");
  });

  it("plays a song through the page's own player once Astral resolves a URL", async () => {
    await signIn();
    document.querySelector("#cards-astral-shared .card").click();
    await flush();
    await flush();
    await flush();
    expect(requests.some((r) => r.op === "music.resolve" && r.payload.song.id === "s1")).toBe(true);
    // The original playAnySong got the song with its audio address attached.
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][0].uploadedBlob).toBe("https://audio.example/s1.mp3");
  });

  it("leaves every other song to the page's original player", async () => {
    await signIn();
    await window.playAnySong({ id: "library-1", title: "Library", parts: 1 });
    expect(original).toHaveBeenCalledWith({ id: "library-1", title: "Library", parts: 1 });
    expect(requests.some((r) => r.op === "music.resolve")).toBe(false);
  });

  it("falls back to Astral's own player when no plain audio address exists", async () => {
    replies["music.resolve"] = null;
    await signIn();
    document.querySelector("#cards-astral-shared .card").click();
    await flush();
    await flush();
    await flush();
    await flush();
    expect(requests.some((r) => r.op === "music.play")).toBe(true);
    expect(original).not.toHaveBeenCalled();
  });

  it("ignores a slow earlier play when a newer one has started", async () => {
    let failFirst;
    let calls = 0;
    replies["music.resolve"] = () => {
      calls += 1;
      if (calls === 1) return new Promise((_, reject) => { failFirst = () => reject(new Error("timed out")); });
      return { url: "https://audio.example/second.mp3", full: true };
    };
    await signIn();
    const cards = document.querySelectorAll("#cards-astral-shared .card");
    cards[0].click();
    await flush();
    cards[1].click();
    await flush();
    await flush();
    failFirst(); // the first attempt fails only now, after the second has started
    await flush();
    await flush();
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][0].uploadedBlob).toBe("https://audio.example/second.mp3");
    expect(requests.some((r) => r.op === "music.play")).toBe(false);
  });

  it("adds a searched song to the shared playlist from the dialog", async () => {
    await signIn();
    document.querySelector("#astral-add-song").click();
    document.querySelector("#astral-q").value = "band";
    document.querySelector("#astral-go").click();
    await flush();
    await flush();
    document.querySelector("#astral-results .modal-confirm").click();
    await flush();
    await flush();
    expect(requests.find((r) => r.op === "music.addShared").payload.song.id).toBe("dz9");
    expect(document.getElementById("astral-toast").textContent).toContain("Everyone can see it now");
  });

  it("adds a song to a playlist with the + on its card, through the page's own dialog", async () => {
    await signIn();
    document.querySelector("#cards-astral-shared .card button[title='Add to a playlist']").click();
    expect(window.showAddToPlaylistModal).toHaveBeenCalledTimes(1);
    const song = window.showAddToPlaylistModal.mock.calls[0][0];
    expect(song.id).toBe("astral-s1");
    // It carries what is needed to play it later, from the saved playlist.
    expect(song.__astral).toBe(true);
    expect(song.astral.id).toBe("s1");
    // Pressing + does not also start playing the song.
    expect(original).not.toHaveBeenCalled();
  });

  it("lets a guest put songs in a playlist: those live in the browser", async () => {
    replies["music.featured"] = [{ id: "f1", title: "Pinned", artist: "Owner" }];
    await signIn({ signedIn: false });
    const plus = document.querySelector("#cards-astral-featured .card button[title='Add to a playlist']");
    expect(plus).not.toBeNull();
    plus.click();
    expect(window.showAddToPlaylistModal).toHaveBeenCalledTimes(1);
  });

  it("a song saved to a playlist plays again from the saved copy", async () => {
    await signIn();
    document.querySelector("#cards-astral-shared .card button[title='Add to a playlist']").click();
    // What the page keeps in localStorage and later hands back to playAnySong.
    const saved = JSON.parse(JSON.stringify(window.showAddToPlaylistModal.mock.calls[0][0]));
    await window.playAnySong(saved);
    expect(requests.some((r) => r.op === "music.resolve" && r.payload.song.id === "s1")).toBe(true);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][0].uploadedBlob).toBe("https://audio.example/s1.mp3");
  });

  it("the find-a-song dialog can save a result to a playlist without sharing it", async () => {
    await signIn();
    document.querySelector("#astral-add-song").click();
    document.querySelector("#astral-q").value = "band";
    document.querySelector("#astral-go").click();
    await flush();
    await flush();
    const playlistBtn = [...document.querySelectorAll("#astral-results button")].find((b) => b.textContent === "Playlist");
    playlistBtn.click();
    expect(window.showAddToPlaylistModal.mock.calls.at(-1)[0].id).toBe("astral-dz9");
    expect(requests.some((r) => r.op === "music.addShared")).toBe(false);
  });

  it("a guest can search, but sharing asks them to sign in", async () => {
    await signIn({ signedIn: false });
    document.querySelector("#astral-add-song").click();
    expect(window.showModal).toHaveBeenCalled();
    document.querySelector("#astral-q").value = "band";
    document.querySelector("#astral-go").click();
    await flush();
    await flush();
    const share = [...document.querySelectorAll("#astral-results button")].find((b) => b.textContent === "Share");
    share.click();
    await flush();
    expect(document.getElementById("astral-toast").textContent).toContain("Sign in to Astral to share");
    expect(requests.some((r) => r.op === "music.addShared")).toBe(false);
  });

  it("puts the rows back when the page rebuilds its home view", async () => {
    await signIn();
    document.getElementById("songs-stuff").outerHTML = `<div class="songs-stuff" id="songs-stuff"><div class="cat-row"><div class="cards" id="cards-new"></div></div></div>`;
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("#cards-astral-shared .card")).not.toBeNull();
  });

  it("injects as one self-contained script", () => {
    expect(ASTRAL_PAGE_SCRIPT.startsWith("<script>(")).toBe(true);
    expect(ASTRAL_PAGE_SCRIPT.endsWith(")(window);</script>")).toBe(true);
    // Only the closing tag at the very end: an early one would cut the script off.
    expect(ASTRAL_PAGE_SCRIPT.slice(0, -9)).not.toContain("</script");
  });
});

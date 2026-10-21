import {
  astralRequest,
  getAstralIdentity,
  getMusicState,
  onAstralIdentity,
  onMusicState,
} from "../shared/astralBridge.js";

// Evil Spotify inside Astral OS: Astral's music, in this window. Featured songs
// (pinned by Owners), the shared playlist (a song anyone adds shows up for
// everyone), your own playlists, and search. Songs are found, played and saved
// by Astral itself (see src/lib/osBridge.js there); this is only the screen.

const SHARED_REFRESH_MS = 20000;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
.evs{display:flex;flex-direction:column;height:100%;background:#121214;color:#eee;font:13px system-ui,Segoe UI,Roboto,sans-serif}
.evs *{box-sizing:border-box}
.evs button{font:inherit;color:inherit;background:#26262b;border:1px solid #34343b;border-radius:8px;padding:5px 10px;cursor:pointer}
.evs button:hover{background:#30303a}
.evs-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px 4px}
.evs-top strong{font-size:15px}
.evs-who{opacity:.7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.evs-tabs{display:flex;gap:6px;padding:6px 14px}
.evs-tabs button.on{background:#7c5cff;border-color:#7c5cff;color:#fff}
.evs-search{display:flex;gap:8px;padding:4px 14px 8px}
.evs-search input{flex:1;background:#1c1c21;color:#eee;border:1px solid #34343b;border-radius:8px;padding:7px 10px;font:inherit}
.evs-list{flex:1;overflow:auto;padding:4px 8px}
.evs-row{display:flex;align-items:center;gap:10px;padding:6px;border-radius:8px}
.evs-row:hover{background:#1c1c21}
.evs-row.now{background:#241f3d}
.evs-art{width:40px;height:40px;border-radius:6px;background:#2a2a31 center/cover;flex:none}
.evs-meta{flex:1;min-width:0;display:flex;flex-direction:column}
.evs-meta b,.evs-meta span,.evs-meta small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.evs-meta span{opacity:.75}
.evs-meta small{opacity:.5;font-size:11px}
.evs-acts{display:flex;gap:4px;flex:none}
.evs-note,.evs-empty{padding:18px 14px;opacity:.65;text-align:center}
.evs-h{padding:10px 8px 2px;opacity:.7;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.evs-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid #26262b;background:#17171b}
.evs-bar .evs-meta{max-width:45%}
.evs-ctl{display:flex;gap:4px}
.evs-prog{flex:1;height:4px;background:#2a2a31;border-radius:3px;overflow:hidden}
.evs-prog i{display:block;height:100%;background:#7c5cff;width:0}
.evs-msg{padding:0 14px;min-height:18px;font-size:12px;color:#b9a8ff}
.evs-pop{position:absolute;z-index:5;background:#1c1c21;border:1px solid #34343b;border-radius:10px;padding:6px;min-width:190px;box-shadow:0 8px 24px #0008}
.evs-pop button{display:block;width:100%;text-align:left;margin:2px 0}
`;

export function mountAstralMusic(root) {
  const st = {
    tab: "featured",
    lists: { featured: null, shared: null, playlists: null, results: null },
    err: {},
    msg: "",
    searching: false,
    term: "",
    identity: getAstralIdentity(),
    now: getMusicState(),
  };
  let alive = true;
  let msgTimer = null;
  let pop = null;

  root.innerHTML = `<style>${CSS}</style><div class="evs"></div>`;
  const view = root.querySelector(".evs");

  const toast = (text) => {
    st.msg = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { st.msg = ""; paint(); }, 4500);
    paint();
  };
  const signedIn = () => !!st.identity?.signedIn;
  const ask = (op, payload) => astralRequest(op, payload);

  // What the current tab lists, as one flat list of songs (playing it queues them all).
  const songsFor = (tab) => {
    if (tab === "playlists") return (st.lists.playlists || []).flatMap((p) => p.songs);
    return st.lists[tab === "search" ? "results" : tab] || [];
  };

  async function load(tab, { quiet = false } = {}) {
    const op = { featured: "music.featured", shared: "music.shared", playlists: "music.playlists" }[tab];
    if (!op) return;
    try {
      st.lists[tab] = await ask(op);
      st.err[tab] = "";
    } catch (e) {
      if (!st.lists[tab]) st.lists[tab] = [];
      st.err[tab] = signedIn() ? e.message : "Sign in to Astral to see this.";
    }
    if (alive && !quiet) paint(); else if (alive && st.tab === tab) paint();
  }

  async function search() {
    st.term = (view.querySelector(".evs-search input")?.value || "").trim();
    if (!st.term) return;
    st.searching = true;
    st.err.search = "";
    paint();
    try {
      st.lists.results = await ask("music.search", { term: st.term });
    } catch (e) {
      st.lists.results = [];
      st.err.search = e.message;
    }
    st.searching = false;
    paint();
  }

  const rowHtml = (s, i, tab) => {
    const mine = signedIn() && s.by && s.by === st.identity.uid;
    const playing = st.now?.id && String(st.now.id) === String(s.id);
    return `<div class="evs-row${playing ? " now" : ""}" data-i="${i}">
      <div class="evs-art"${s.art ? ` style="background-image:url('${esc(s.art)}')"` : ""}></div>
      <div class="evs-meta"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span>${s.byName ? `<small>Added by ${esc(s.byName)}</small>` : ""}</div>
      <div class="evs-acts">
        <button data-act="play" title="Play">▶</button>
        ${tab !== "shared" ? `<button data-act="share" title="Add to the shared playlist">+ Shared</button>` : ""}
        <button data-act="pl" title="Add to one of your playlists">♪</button>
        ${tab === "shared" ? `<button data-act="feature" title="Ask for this to be featured">☆</button>` : ""}
        ${tab === "shared" && mine ? `<button data-act="remove" title="Remove from the shared playlist">✕</button>` : ""}
      </div>
    </div>`;
  };

  function body() {
    const t = st.tab;
    if (t === "search") {
      const rows = st.lists.results;
      return `<div class="evs-search"><input placeholder="Search songs or artists" value="${esc(st.term)}" /><button data-act="search">${st.searching ? "…" : "Search"}</button></div>
        <div class="evs-list">${st.err.search ? `<div class="evs-note">${esc(st.err.search)}</div>` : rows === null ? `<div class="evs-empty">Search for a song, then play it or add it to the shared playlist.</div>` : rows.length ? rows.map((s, i) => rowHtml(s, i, t)).join("") : `<div class="evs-empty">Nothing found.</div>`}</div>`;
    }
    if (t === "playlists") {
      const lists = st.lists.playlists;
      if (lists === null) return `<div class="evs-list"><div class="evs-empty">Loading…</div></div>`;
      let i = 0;
      const html = lists.map((p) => `<div class="evs-h">${esc(p.name)} · ${p.songs.length}</div>${p.songs.map((s) => rowHtml(s, i++, t)).join("") || `<div class="evs-empty">Empty. Add songs with ♪.</div>`}`).join("");
      return `<div class="evs-list">${st.err.playlists ? `<div class="evs-note">${esc(st.err.playlists)}</div>` : html || `<div class="evs-empty">No playlists yet.</div>`}<div style="padding:8px"><button data-act="newlist">+ New playlist</button></div></div>`;
    }
    const rows = st.lists[t];
    const empty = t === "featured" ? "Nothing featured yet." : "No songs yet. Search for one and press + Shared to be the first.";
    return `<div class="evs-list">${st.err[t] ? `<div class="evs-note">${esc(st.err[t])}</div>` : rows === null ? `<div class="evs-empty">Loading…</div>` : rows.length ? rows.map((s, i) => rowHtml(s, i, t)).join("") : `<div class="evs-empty">${empty}</div>`}</div>`;
  }

  function bar() {
    const n = st.now;
    if (!n?.track) return `<div class="evs-bar"><span style="opacity:.6">Nothing playing</span></div>`;
    return `<div class="evs-bar">
      <div class="evs-art"${n.art ? ` style="background-image:url('${esc(n.art)}')"` : ""}></div>
      <div class="evs-meta"><b>${esc(n.track)}</b><span>${esc(n.loading ? "Loading…" : n.artist)}</span></div>
      <div class="evs-ctl"><button data-act="prev" ${n.hasPrevious ? "" : "disabled"}>⏮</button><button data-act="toggle">${n.playing ? "⏸" : "▶"}</button><button data-act="next" ${n.hasNext ? "" : "disabled"}>⏭</button></div>
      <div class="evs-prog"><i style="width:${Math.round((n.progress || 0) * 100)}%"></i></div>
    </div>`;
  }

  function paint() {
    if (!alive) return;
    const keepFocus = document.activeElement === view.querySelector(".evs-search input");
    const typed = view.querySelector(".evs-search input")?.value;
    const scroll = view.querySelector(".evs-list")?.scrollTop || 0;
    const who = signedIn() ? `Signed in as ${esc(st.identity.displayName)}` : "Guest · sign in to Astral to add songs";
    const tabs = [["featured", "Featured"], ["shared", "Shared"], ["playlists", "My playlists"], ["search", "Search"]];
    view.innerHTML = `<div class="evs-top"><strong>Evil Spotify</strong><span class="evs-who">${who}</span></div>
      <div class="evs-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${st.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="evs-msg">${esc(st.msg)}</div>${body()}${bar()}`;
    const list = view.querySelector(".evs-list");
    if (list) list.scrollTop = scroll;
    const input = view.querySelector(".evs-search input");
    if (input && typed != null && keepFocus) { input.value = typed; input.focus(); }
  }

  const closePop = () => { pop?.remove(); pop = null; };

  async function onClick(e) {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) {
      closePop();
      st.tab = tabBtn.dataset.tab;
      paint();
      if (st.tab !== "search") load(st.tab);
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) { closePop(); return; }
    const act = btn.dataset.act;
    const row = btn.closest(".evs-row");
    const list = songsFor(st.tab);
    const song = row ? list[Number(row.dataset.i)] : null;
    try {
      if (act === "search") await search();
      else if (act === "toggle") await ask("music.toggle");
      else if (act === "next") await ask("music.next");
      else if (act === "prev") await ask("music.previous");
      else if (act === "play" && song) await ask("music.play", { queue: list, index: Number(row.dataset.i) });
      else if (act === "share" && song) {
        if (!signedIn()) { toast("Sign in to Astral to add songs."); return; }
        await ask("music.addShared", { song });
        toast("Added to the shared playlist. Everyone can see it now.");
        load("shared", { quiet: true });
      } else if (act === "remove" && song) {
        await ask("music.removeShared", { song });
        toast("Removed from the shared playlist.");
        load("shared", { quiet: true });
      } else if (act === "feature" && song) {
        if (!signedIn()) { toast("Sign in to Astral to ask for a feature."); return; }
        await ask("music.requestFeature", { song });
        toast("Asked for this to be featured.");
      } else if (act === "newlist") {
        if (!signedIn()) { toast("Sign in to Astral to make playlists."); return; }
        const name = window.prompt("Name your playlist");
        if (name && name.trim()) { await ask("music.createPlaylist", { name }); toast("Playlist created."); load("playlists"); }
      } else if (act === "pl" && song) {
        if (!signedIn()) { toast("Sign in to Astral to use playlists."); return; }
        closePop();
        if (!st.lists.playlists) await load("playlists", { quiet: true });
        const lists = st.lists.playlists || [];
        pop = document.createElement("div");
        pop.className = "evs-pop";
        const r = btn.getBoundingClientRect();
        const host = root.getBoundingClientRect();
        pop.style.left = `${Math.max(4, r.right - host.left - 190)}px`;
        pop.style.top = `${r.bottom - host.top + 4}px`;
        pop.innerHTML = (lists.length ? lists.map((p) => `<button data-pick="${esc(p.id)}">${esc(p.name)}</button>`).join("") : `<div style="padding:6px;opacity:.7">No playlists yet</div>`) + `<button data-pick="__new">+ New playlist</button>`;
        pop.addEventListener("click", async (ev) => {
          const pick = ev.target.closest("[data-pick]")?.dataset.pick;
          if (!pick) return;
          ev.stopPropagation();
          closePop();
          try {
            let id = pick;
            if (pick === "__new") {
              const name = window.prompt("Name your playlist");
              if (!name || !name.trim()) return;
              id = await ask("music.createPlaylist", { name });
            }
            await ask("music.addToPlaylist", { playlistId: id, song });
            toast("Added to your playlist.");
            load("playlists", { quiet: true });
          } catch (err) { toast(err.message); }
        });
        root.style.position = "relative";
        root.appendChild(pop);
      }
    } catch (err) {
      toast(err.message);
    }
  }

  view.addEventListener("click", onClick);
  view.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".evs-search input")) search();
  });

  const offIdentity = onAstralIdentity((u) => {
    st.identity = u;
    st.lists.featured = st.lists.shared = st.lists.playlists = null;
    paint();
    load(st.tab === "search" ? "featured" : st.tab);
  });
  const offMusic = onMusicState((s) => { st.now = s; paint(); });

  // Shared and featured songs added by other people appear without a reload.
  const refresh = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (st.tab === "shared" || st.tab === "featured") load(st.tab, { quiet: true });
  }, SHARED_REFRESH_MS);

  paint();
  load("featured");
  load("shared", { quiet: true });
  // Pick up what is already playing if the window is opened mid-song.
  astralRequest("music.state").then((s) => { st.now = s; paint(); }).catch(() => {});

  return {
    destroy() {
      alive = false;
      clearInterval(refresh);
      clearTimeout(msgTimer);
      offIdentity();
      offMusic();
      closePop();
    },
  };
}

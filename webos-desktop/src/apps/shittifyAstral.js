// What Astral OS adds to Evil Spotify. The original page is left exactly as it
// is; this runs inside it (injected by shittify.js) and adds two rows to the
// home view, Astral Featured and Astral Shared, in the page's own card style,
// plus an "Add a song" dialog. Songs play in the page's own player bar.
//
// Songs are found, resolved and saved by Astral itself. This script only asks
// its parent (the desktop window, which relays to Astral) with messages
// ({ __astral_page: true, ... }); see relayAstralPage in shittify.js.
//
// It is injected as source text (`astralFeatures.toString()`), so it must stay
// self-contained: no imports and nothing from outside the function.

export function astralFeatures(win) {
  var doc = win.document;
  var REFRESH_MS = 20000;
  var seq = 0;
  var pending = {};
  var identity = null;
  var data = { featured: null, shared: null };
  var errors = { featured: "", shared: "" };
  var origPlay = null;
  var toastTimer = null;
  var raf = 0;

  // Song text goes into the page's own HTML templates, so strip anything that
  // could break out of them. Other members' songs end up here.
  function clean(s, max) {
    return String(s == null ? "" : s).replace(/[<>"'`&\\]/g, "").slice(0, max || 200);
  }
  function safeUrl(u) {
    return /^https:\/\/[^\s"'<>`\\]+$/.test(String(u || "")) ? String(u) : "";
  }
  function toPageSong(s) {
    return {
      id: "astral-" + clean(s.id, 60),
      title: clean(s.title, 200),
      artist: clean(s.artist, 120),
      cover: safeUrl(s.art),
      by: typeof s.by === "string" ? s.by : "",
      byName: clean(s.byName, 60),
      __astral: true,
      astral: s,
    };
  }

  function request(op, payload) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error("Astral didn't answer. Try again."));
      }, 25000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      win.parent.postMessage({ __astral_page: true, type: "request", id: id, op: op, payload: payload || {} }, "*");
    });
  }

  function toast(text) {
    var el = doc.getElementById("astral-toast");
    if (!el) {
      el = doc.createElement("div");
      el.id = "astral-toast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:99999;background:#1f1f1f;color:#fff;border:1px solid #3a3a3a;border-radius:8px;padding:10px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.6);max-width:80%;text-align:center";
      doc.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = "none"; }, 4000);
  }

  var ARROW_LEFT = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
  var ARROW_RIGHT = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

  function rowMarkup(id, title, extra) {
    return (
      '<div class="cat-top"><h1 class="cat-title">' + title + "</h1>" + (extra || "") + "</div>" +
      '<div class="cards-wrapper">' +
      '<button class="arrow-btn arrow-left" data-astral-target="' + id + '" disabled>' + ARROW_LEFT + "</button>" +
      '<div class="cards" id="' + id + '"></div>' +
      '<button class="arrow-btn arrow-right" data-astral-target="' + id + '">' + ARROW_RIGHT + "</button>" +
      "</div>"
    );
  }

  function updateArrows(cards) {
    var wrap = cards.closest(".cards-wrapper");
    if (!wrap) return;
    var left = wrap.querySelector(".arrow-left");
    var right = wrap.querySelector(".arrow-right");
    if (left) left.disabled = cards.scrollLeft <= 2;
    if (right) right.disabled = cards.scrollLeft + cards.clientWidth >= cards.scrollWidth - 2;
  }

  function wireArrows(row) {
    var cards = row.querySelector(".cards");
    row.querySelectorAll(".arrow-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        cards.scrollLeft += (btn.classList.contains("arrow-left") ? -1 : 1) * 191.5 * 3;
        setTimeout(function () { updateArrows(cards); }, 320);
      });
    });
    cards.addEventListener("scroll", function () { updateArrows(cards); });
  }

  function note(container, text) {
    var p = doc.createElement("p");
    p.textContent = text;
    p.style.cssText = "color:#a7a7a7;font-size:14px;padding:8px 4px;margin:0";
    container.appendChild(p);
  }

  function signedIn() {
    return !!(identity && identity.signedIn);
  }

  function paint(kind) {
    var container = doc.getElementById("cards-astral-" + kind);
    if (!container) return;
    container.innerHTML = "";
    var list = data[kind];
    if (errors[kind]) { note(container, errors[kind]); return; }
    if (list === null) { note(container, "Loading…"); return; }
    if (!list.length) {
      note(container, kind === "featured" ? "Nothing is featured yet." : "No songs yet. Press + Add a song to be the first.");
      return;
    }
    list.forEach(function (song) {
      var card = win.makeCard(song, function () { playFrom(song, list); });
      // Into one of the member's own playlists, using the page's own dialog and
      // storage, so it plays from there like any other song. No sign-in needed:
      // playlists live in this browser.
      var plus = doc.createElement("button");
      plus.textContent = "+";
      plus.title = "Add to a playlist";
      plus.setAttribute("aria-label", "Add to a playlist");
      plus.style.cssText =
        "position:absolute;top:8px;left:8px;width:26px;height:26px;border:0;border-radius:50%;background:rgba(0,0,0,.75);color:#fff;cursor:pointer;font-size:16px;line-height:1";
      card.style.position = "relative";
      plus.addEventListener("click", function (e) {
        e.stopPropagation();
        addToPlaylist(song);
      });
      card.appendChild(plus);
      if (kind === "shared" && signedIn() && song.by && song.by === identity.uid) {
        var x = doc.createElement("button");
        x.textContent = "✕";
        x.title = "Remove from Astral Shared";
        x.style.cssText =
          "position:absolute;top:8px;right:8px;width:26px;height:26px;border:0;border-radius:50%;background:rgba(0,0,0,.75);color:#fff;cursor:pointer;font-size:12px";
        card.style.position = "relative";
        x.addEventListener("click", function (e) {
          e.stopPropagation();
          request("music.removeShared", { song: song.astral })
            .then(function () { toast("Removed from Astral Shared."); load("shared"); })
            .catch(function (err) { toast(err.message); });
        });
        card.appendChild(x);
      }
      container.appendChild(card);
    });
    updateArrows(container);
  }

  function load(kind) {
    return request(kind === "featured" ? "music.featured" : "music.shared")
      .then(function (list) {
        data[kind] = (Array.isArray(list) ? list : []).map(toPageSong);
        errors[kind] = "";
      })
      .catch(function (err) {
        if (data[kind] === null) data[kind] = [];
        errors[kind] = signedIn() ? err.message : "Sign in to Astral to see this.";
      })
      .then(function () { paint(kind); });
  }

  function reloadAll() {
    data.featured = null;
    data.shared = null;
    errors.featured = errors.shared = "";
    paint("featured");
    paint("shared");
    load("featured");
    load("shared");
  }

  // The row markup is the page's own, so it looks and scrolls like the others.
  // It lives on the home view only, and comes back when the page rebuilds it.
  function ensureRows() {
    var stuff = doc.getElementById("songs-stuff");
    if (!stuff || !doc.getElementById("cards-new")) return false;
    if (doc.getElementById("cards-astral-shared")) return true;
    var featured = doc.createElement("div");
    featured.className = "cat-row";
    featured.id = "astral-row-featured";
    featured.innerHTML = rowMarkup("cards-astral-featured", "Astral Featured");
    var shared = doc.createElement("div");
    shared.className = "cat-row";
    shared.id = "astral-row-shared";
    shared.innerHTML = rowMarkup("cards-astral-shared", "Astral Shared", '<p class="show-all-btn" id="astral-add-song">+ Add a song</p>');
    stuff.insertBefore(shared, stuff.firstChild);
    stuff.insertBefore(featured, shared);
    wireArrows(featured);
    wireArrows(shared);
    doc.getElementById("astral-add-song").addEventListener("click", openAddDialog);
    paint("featured");
    paint("shared");
    return true;
  }

  // ---- playing ---------------------------------------------------------------

  function addToPlaylist(song) {
    if (typeof win.showAddToPlaylistModal === "function") win.showAddToPlaylistModal(song);
    else toast("Playlists aren't available here.");
  }

  function playFrom(song, list) {
    try { allSongsRN = list; } catch (e) { /* the page's queue is not reachable here */ }
    win.playAnySong(song);
  }

  function fallbackToAstral(song) {
    try { if (typeof currentAudio !== "undefined" && currentAudio) currentAudio.pause(); } catch (e) { /* nothing playing */ }
    request("music.play", { queue: [song.astral], index: 0 }).catch(function () {
      toast("Couldn't play that song.");
    });
  }

  // Only the newest play request may act: a slow or failed earlier one must not
  // pause or replace the song that is playing now.
  var playToken = 0;

  async function playAstral(song) {
    var token = ++playToken;
    request("music.stop").catch(function () { /* Astral's own player was idle */ });
    try {
      var found = await request("music.resolve", { song: song.astral });
      if (token !== playToken) return;
      var url = found && safeUrl(found.url);
      if (!url) throw new Error("no audio");
      // The page's own path for a song with an address, so its player bar, queue
      // and media keys all work as they do for every other song.
      await origPlay(Object.assign({}, song, { uploadedBlob: url }));
      var audio = typeof currentAudio !== "undefined" ? currentAudio : null;
      if (audio) {
        audio.addEventListener("error", function () {
          if (token === playToken) fallbackToAstral(song);
        }, { once: true });
      }
      if (!found.full) toast("Only a 30-second preview is available for this song.");
    } catch (e) {
      if (token === playToken) fallbackToAstral(song);
    }
  }

  // ---- adding songs ----------------------------------------------------------

  // Anyone can search and add a song to a playlist (those live in this browser);
  // sharing it with everyone needs an Astral account.
  function openAddDialog() {
    win.showModal(
      '<h2>Find a song to share or save</h2>' +
      '<input class="modal-input" id="astral-q" placeholder="Search songs or artists" maxlength="100" />' +
      '<div id="astral-results" style="max-height:300px;overflow:auto;margin-top:10px"></div>' +
      '<div class="modal-actions"><button class="modal-cancel" id="astral-close">Close</button>' +
      '<button class="modal-confirm" id="astral-go">Search</button></div>',
      function (o) {
        var input = o.querySelector("#astral-q");
        var results = o.querySelector("#astral-results");
        input.focus();
        o.querySelector("#astral-close").addEventListener("click", function () { o.remove(); });

        function search() {
          var term = input.value.trim();
          if (!term) return;
          results.innerHTML = "";
          note(results, "Searching…");
          request("music.search", { term: term })
            .then(function (songs) {
              results.innerHTML = "";
              if (!songs || !songs.length) { note(results, "Nothing found."); return; }
              songs.slice(0, 30).forEach(function (s) {
                var row = doc.createElement("div");
                row.style.cssText = "display:flex;align-items:center;gap:10px;padding:6px 0";
                var art = safeUrl(s.art);
                if (art) {
                  var img = doc.createElement("img");
                  img.src = art;
                  img.style.cssText = "width:40px;height:40px;border-radius:4px;object-fit:cover";
                  row.appendChild(img);
                }
                var text = doc.createElement("div");
                text.style.cssText = "flex:1;min-width:0";
                var t = doc.createElement("div");
                t.textContent = clean(s.title, 200);
                t.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
                var a = doc.createElement("div");
                a.textContent = clean(s.artist, 120);
                a.style.cssText = "color:#a7a7a7;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
                text.appendChild(t);
                text.appendChild(a);
                row.appendChild(text);
                var listBtn = doc.createElement("button");
                listBtn.className = "modal-cancel";
                listBtn.textContent = "Playlist";
                listBtn.title = "Add to one of your playlists";
                listBtn.addEventListener("click", function () { addToPlaylist(toPageSong(s)); });
                row.appendChild(listBtn);
                var add = doc.createElement("button");
                add.className = "modal-confirm";
                add.textContent = "Share";
                add.title = "Add to Astral Shared so everyone can listen";
                add.addEventListener("click", function () {
                  if (!signedIn()) { toast("Sign in to Astral to share songs. You can still add it to a playlist."); return; }
                  add.disabled = true;
                  request("music.addShared", { song: s })
                    .then(function () { add.textContent = "Added ✓"; toast("Added to Astral Shared. Everyone can see it now."); load("shared"); })
                    .catch(function (err) { add.disabled = false; toast(err.message); });
                });
                row.appendChild(add);
                results.appendChild(row);
              });
            })
            .catch(function (err) { results.innerHTML = ""; note(results, err.message); });
        }
        o.querySelector("#astral-go").addEventListener("click", search);
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") search(); });
      }
    );
  }

  // ---- wiring ----------------------------------------------------------------

  var observer = null;
  var refreshTimer = null;

  function onMessage(e) {
    if (e.source !== win.parent) return;
    var d = e.data;
    if (!d || d.__astral_page !== true) return;
    if (d.type === "identity") {
      identity = d.user || null;
      reloadAll();
    } else if (d.type === "reply") {
      var p = pending[d.id];
      if (!p) return;
      delete pending[d.id];
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.result);
      else p.reject(new Error(d.error || "Something went wrong."));
    }
  }
  win.addEventListener("message", onMessage);

  function start() {
    // Songs from Astral play through the page's own playAnySong, so its queue
    // (next and back) works across them too.
    if (typeof win.playAnySong === "function" && !origPlay) {
      origPlay = win.playAnySong;
      win.playAnySong = function (song) {
        if (song && song.__astral) return playAstral(song);
        return origPlay.apply(this, arguments);
      };
    }
    observer = new win.MutationObserver(function () {
      if (raf) return;
      var later = win.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      raf = later(function () { raf = 0; ensureRows(); });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    ensureRows();
    refreshTimer = setInterval(function () {
      if (doc.visibilityState === "visible" && doc.getElementById("cards-astral-shared")) {
        load("featured");
        load("shared");
      }
    }, REFRESH_MS);
    win.parent.postMessage({ __astral_page: true, type: "hello" }, "*");
  }

  if (doc.readyState === "complete") start();
  else win.addEventListener("load", start);

  // Undoes the listeners and timers (the page never calls this; tests do).
  return function dispose() {
    win.removeEventListener("message", onMessage);
    win.removeEventListener("load", start);
    if (observer) observer.disconnect();
    clearInterval(refreshTimer);
    clearTimeout(toastTimer);
  };
}

export const ASTRAL_PAGE_SCRIPT = "<script>(" + astralFeatures.toString() + ")(window);</script>";

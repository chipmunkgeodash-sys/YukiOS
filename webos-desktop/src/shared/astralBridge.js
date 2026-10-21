import { os, StorageKeys } from "../framework.js";

// The link to the Astral page that embeds this desktop (Astral OS). Astral
// holds the member's sign-in; the desktop asks it who is signed in and for
// music actions, over messages ({ __astral: true, ... }). Only the embedded
// build talks to a parent; everywhere else every function here does nothing.

const EMBEDDED =
  import.meta.env?.VITE_EMBED === "true" &&
  typeof window !== "undefined" &&
  window.parent !== window;

let parentOrigin = null;
let identity = null;
let musicState = null;
let seq = 0;
const pending = new Map();
const identityListeners = new Set();
const musicListeners = new Set();

export const inAstral = () => EMBEDDED;
export const getAstralIdentity = () => identity;
export const getMusicState = () => musicState;

export function onAstralIdentity(fn) {
  identityListeners.add(fn);
  return () => identityListeners.delete(fn);
}
export function onMusicState(fn) {
  musicListeners.add(fn);
  return () => musicListeners.delete(fn);
}

function send(msg) {
  if (!EMBEDDED) return;
  window.parent.postMessage({ __astral: true, ...msg }, parentOrigin || "*");
}

// Ask Astral to do something (see src/lib/osBridge.js there). Resolves with the
// result, or rejects with a message that is fit to show.
export function astralRequest(op, payload = {}, timeoutMs = 20000) {
  if (!EMBEDDED) return Promise.reject(new Error("Not running inside Astral."));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Astral didn't answer. Try again."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    send({ type: "request", id, op, payload });
  });
}

// The Astral account becomes this desktop's profile: its name and picture show
// in the start menu, the terminal and the setup screens. Signing out of Astral
// puts back whatever was there before, but only if the bridge set it.
function applyIdentity(user) {
  identity = user && typeof user === "object" ? user : null;
  const linked = os.storage.get(StorageKeys.astralLinkedName);
  if (identity?.signedIn && identity.displayName) {
    os.storage.set(StorageKeys.username, identity.displayName);
    os.storage.set(StorageKeys.astralLinkedName, identity.displayName);
    if (identity.picture) os.storage.set(StorageKeys.profilePicture, identity.picture);
  } else if (linked && os.storage.get(StorageKeys.username) === linked) {
    os.storage.remove(StorageKeys.username);
    os.storage.remove(StorageKeys.profilePicture);
    os.storage.remove(StorageKeys.astralLinkedName);
  }
  import("../desktopui/startMenu.js")
    .then((m) => m.updateStartUserDisplay())
    .catch(() => {});
  identityListeners.forEach((fn) => fn(identity));
}

export function initAstralBridge() {
  if (!EMBEDDED) return;
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.__astral !== true) return;
    if (!parentOrigin && e.origin && e.origin !== "null") parentOrigin = e.origin;
    if (d.type === "identity") applyIdentity(d.user);
    else if (d.type === "music-state") {
      musicState = d.state || null;
      musicListeners.forEach((fn) => fn(musicState));
    } else if (d.type === "reply") {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.result);
      else p.reject(new Error(d.error || "Something went wrong."));
    }
  });
  send({ type: "hello" });
}

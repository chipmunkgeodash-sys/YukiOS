import { StorageKeys, os } from "./framework.js";
import logoImg from "./assets/logo.png";
import versionStr from "../version.txt?raw";
import "./styles/bootScreen.css";
import { pickAnimation } from "./bootAnimations.js";
import gsap from "gsap";
import { KeybindManager } from "./keybindManager.js";
import {
  $,
  $$,
  bindEvent,
  createElement,
  setStyle,
  addClass,
} from "./shared/domUtils.js";
import { parseBool } from "./utils/utils.js";
import { isFunction } from "./shared/functionUtils.js";

const BRAND = "Astral OS";
const MIN_DURATION = 2500;

export function showBootScreen() {
  const raw = os.storage.get(StorageKeys.disableBootScreen);
  if (parseBool(raw)) {
    return { hide: () => Promise.resolve() };
  }

  const launchRaw = os.storage.get(StorageKeys.lastLaunchTime);
  if (launchRaw) {
    try {
      const lastLaunch = Number(launchRaw);
      if (!isNaN(lastLaunch) && Date.now() - lastLaunch < 5 * 60 * 1000) {
        return { hide: () => Promise.resolve() };
      }
    } catch {}
  }

  const savedId = os.storage.get(StorageKeys.selectedBootAnimation);
  const animation = pickAnimation(savedId);

  const lettersHTML = BRAND.split("")
    .map(
      (ch) => `<span class="boot-letter">${ch === " " ? "\u00A0" : ch}</span>`,
    )
    .join("");

  const div = createElement("div", { className: "boot-overlay" });
  div.innerHTML = `
    <div class="boot-container">
      <div class="boot-logo-wrap">
        <img class="boot-logo" src="${logoImg}" alt="${BRAND}" fetchpriority="high" />
        <div class="boot-brand">${lettersHTML}</div>
        <div class="boot-version">${versionStr}</div>
      </div>
    </div>
    <div class="boot-skip-hint">Click · Esc · Enter · Space to skip</div>
  `;
  document.body.appendChild(div);

  const extEls = animation.createExtra ? animation.createExtra(div) || {} : {};

  const container = $(".boot-container", div);
  const logo = $(".boot-logo", div);
  const letters = $$(".boot-letter", div);
  const version = $(".boot-version", div);

  const startTime = performance.now();

  const els = { overlay: div, container, logo, letters, version, extEls };

  let hidden = false;
  let showTl = null;

  if (gsap && isFunction(gsap.to)) {
    animation.setup(els);

    showTl = gsap.timeline();
    animation.show(showTl, els);
  } else {
    requestAnimationFrame(() => {
      addClass(div, "boot-visible");
    });

    requestAnimationFrame(() => {
      addClass(logo, "boot-visible");
    });

    requestAnimationFrame(() => {
      letters.forEach((l, i) => {
        setStyle(l, { transitionDelay: `${0.06 * i}s` });
        addClass(l, "boot-visible");
      });
    });

    requestAnimationFrame(() => {
      addClass(version, "boot-visible");
    });
  }

  const isSkipKey = (e) =>
    e.key === "Escape" ||
    e.key === "Enter" ||
    e.key === " " ||
    e.key === "Spacebar";

  const doSkip = () => {
    if (hidden) return;
    hidden = true;
    document.removeEventListener("keydown", skipHandler, true);
    div.removeEventListener("click", clickHandler);
    if (showTl && showTl.kill) showTl.kill();
    div.remove();
  };

  const skipHandler = (e) => {
    if (!isSkipKey(e) && !KeybindManager.matches(e, "boot.skip")) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    doSkip();
  };
  document.addEventListener("keydown", skipHandler, true);

  const clickHandler = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    doSkip();
  };
  bindEvent(div, "click", clickHandler);

  return {
    hide: () => {
      const elapsed = performance.now() - startTime;
      const delay = Math.max(0, MIN_DURATION - elapsed);

      return new Promise((resolve) => {
        const doHide = () => {
          document.removeEventListener("keydown", skipHandler, true);
          div.removeEventListener("click", clickHandler);
          if (hidden) {
            resolve();
            return;
          }
          hidden = true;
          if (gsap && isFunction(gsap.to)) {
            const hideTl = gsap.timeline({
              onComplete: () => {
                div.remove();
                resolve();
              },
            });
            animation.hide(hideTl, els);
          } else {
            setStyle(div, {
              transition: "opacity 0.35s ease, transform 0.35s ease",
              opacity: "0",
              transform: "scale(1.04)",
            });
            setTimeout(() => {
              div.remove();
              resolve();
            }, 400);
          }
        };

        if (delay > 0) setTimeout(doHide, delay);
        else doHide();
      });
    },
  };
}

export function runLoopingBootPreview(anim) {
  const lettersHTML = BRAND.split("")
    .map(
      (ch) => `<span class="boot-letter">${ch === " " ? "\u00A0" : ch}</span>`,
    )
    .join("");

  const div = createElement("div", { className: "boot-overlay" });
  div.innerHTML = `
    <div class="boot-container">
      <div class="boot-logo-wrap">
        <img class="boot-logo" src="${logoImg}" alt="${BRAND}" fetchpriority="high" />
        <div class="boot-brand">${lettersHTML}</div>
      </div>
    </div>
    <div class="boot-skip-hint">Click or Esc to close preview</div>
  `;
  div.style.opacity = "1";
  document.body.appendChild(div);

  const extEls = anim.createExtra ? anim.createExtra(div) || {} : {};
  const container = $(".boot-container", div);
  const logo = $(".boot-logo", div);
  const letters = $$(".boot-letter", div);
  const version = createElement("div", { styles: { display: "none" } });
  div.appendChild(version);
  const els = { overlay: div, container, logo, letters, version, extEls };

  let stopped = false;
  let currentTl = null;
  let timer = 0;

  const play = () => {
    if (stopped) return;
    if (gsap && isFunction(gsap.to)) {
      anim.setup(els);
      currentTl = gsap.timeline({
        onComplete: () => {
          timer = setTimeout(play, 900);
        },
      });
      anim.show(currentTl, els);
    } else {
      addClass(div, "boot-visible");
    }
  };
  play();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (currentTl && currentTl.kill) currentTl.kill();
    document.removeEventListener("keydown", onKey, true);
    div.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      stop();
    }
  };
  document.addEventListener("keydown", onKey, true);
  bindEvent(div, "click", stop);
  return stop;
}

export function runBootPreview(anim, onDone) {
  const lettersHTML = BRAND.split("")
    .map(
      (ch) => `<span class="boot-letter">${ch === " " ? "\u00A0" : ch}</span>`,
    )
    .join("");

  const div = createElement("div", { className: "boot-overlay" });
  div.innerHTML = `
    <div class="boot-container">
      <div class="boot-logo-wrap">
        <img class="boot-logo" src="${logoImg}" alt="${BRAND}" fetchpriority="high" />
        <div class="boot-brand">${lettersHTML}</div>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  const extEls = anim.createExtra ? anim.createExtra(div) || {} : {};
  const container = $(".boot-container", div);
  const logo = $(".boot-logo", div);
  const letters = $$(".boot-letter", div);
  const version = createElement("div", { styles: { display: "none" } });
  div.appendChild(version);
  const els = { overlay: div, container, logo, letters, version, extEls };

  if (gsap && isFunction(gsap.to)) {
    anim.setup(els);
    const showTl = gsap.timeline();
    anim.show(showTl, els);

    setTimeout(() => {
      const hideTl = gsap.timeline({
        onComplete: () => {
          div.remove();
          if (onDone) onDone();
        },
      });
      anim.hide(hideTl, els);
    }, 2000);
  } else {
    setStyle(div, { transition: "opacity 0.3s ease", opacity: "1" });
    setTimeout(() => {
      setStyle(div, { opacity: "0" });
      setTimeout(() => {
        div.remove();
        if (onDone) onDone();
      }, 400);
    }, 1000);
  }
}

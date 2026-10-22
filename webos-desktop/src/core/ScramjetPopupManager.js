import { os, StorageKeys } from "../framework.js";
import { getWispUrl } from "../shared/wispConfig.js";
import { siteUrl } from "../shared/siteBase.js";

let popupCounter = 0;
const popupMinIntervalMs = 1500;
const popupWindowMs = 10000;
const popupMaxPerWindow = 4;
const popupSameUrlMs = 3000;
let popupLastAt = 0;
let popupOpenTimes = [];
let popupLastUrl = "";
let popupLastUrlAt = 0;
let popupLastWinId = "";

export function claimPopupSlot(url) {
  const now = Date.now();
  const target = typeof url === "string" ? url : "";
  if (
    target &&
    target === popupLastUrl &&
    now - popupLastUrlAt < popupSameUrlMs &&
    popupLastWinId
  ) {
    try {
      if (document.getElementById(popupLastWinId)) {
        os.window.focus(popupLastWinId);
        return popupLastWinId;
      }
    } catch (err) {}
  }
  if (now - popupLastAt < popupMinIntervalMs) return null;
  popupOpenTimes = popupOpenTimes.filter((at) => now - at < popupWindowMs);
  if (popupOpenTimes.length >= popupMaxPerWindow) return null;
  popupOpenTimes.push(now);
  popupLastAt = now;
  return "";
}

export function getPopupCooldownState() {
  return {
    lastAt: popupLastAt,
    recentCount: popupOpenTimes.length,
    lastUrl: popupLastUrl,
    lastWinId: popupLastWinId,
  };
}

export function isPopupInterceptEnabled() {
  const raw = os.storage.get(StorageKeys.browserWindowOpenInNewTab);
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string") return raw !== "false";
  return Boolean(raw);
}

export function sanitizePopupUrl(raw, baseHint) {
  if (baseHint !== undefined) {
    const converted = toPlainUrl(raw, baseHint);
    if (converted === null) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(converted)) return converted;
    try {
      return new URL(converted, location.href).href;
    } catch (err) {
      return converted;
    }
  }
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("mailto:"))
    return null;
  if (
    lower.startsWith("about:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  )
    return text;
  try {
    return new URL(text, location.href).href;
  } catch (err) {
    return text;
  }
}

export function toPlainUrl(raw, baseHint) {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("mailto:"))
    return null;
  if (
    lower.startsWith("about:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  )
    return text;
  const marker = "/s/scramjet/";
  if (text.indexOf(marker) !== -1) {
    const lastIdx = text.lastIndexOf(marker);
    let tail = text.slice(lastIdx + marker.length);
    let slashSeen = 0;
    let cutAt = -1;
    for (let i = 0; i < tail.length; i++) {
      if (tail[i] === "/") {
        slashSeen += 1;
        if (slashSeen === 3) {
          cutAt = i;
          break;
        }
      }
    }
    if (cutAt !== -1) tail = tail.slice(cutAt + 1);
    let decoded = tail;
    for (let i = 0; i < 3; i++) {
      const dLower = decoded.toLowerCase();
      if (
        decoded.indexOf(marker) === -1 &&
        dLower.indexOf("%3a") === -1 &&
        dLower.indexOf("%2f") === -1
      )
        break;
      try {
        decoded = decodeURIComponent(decoded);
      } catch (err) {
        break;
      }
    }
    if (decoded.trim() !== "") text = decoded;
  }
  let baseChoice = location.href;
  if (typeof baseHint === "string") {
    const trimmedBase = baseHint.trim();
    const trimmedLower = trimmedBase.toLowerCase();
    if (
      (trimmedLower.startsWith("http://") ||
        trimmedLower.startsWith("https://")) &&
      trimmedBase.indexOf(marker) === -1
    ) {
      baseChoice = trimmedBase;
    }
  }
  try {
    return new URL(text, baseChoice).href;
  } catch (err) {
    return text;
  }
}

export function parsePopupFeatures(specs) {
  const result = { width: null, height: null };
  if (!specs || typeof specs !== "string") return result;
  const widthMatch = specs.match(/width\s*=\s*(\d+)/i);
  const heightMatch = specs.match(/height\s*=\s*(\d+)/i);
  if (widthMatch) {
    const parsedWidth = Math.min(
      1600,
      Math.max(400, parseInt(widthMatch[1], 10)),
    );
    if (Number.isFinite(parsedWidth)) result.width = parsedWidth + "px";
  }
  if (heightMatch) {
    const parsedHeight = Math.min(
      1000,
      Math.max(300, parseInt(heightMatch[1], 10)),
    );
    if (Number.isFinite(parsedHeight)) result.height = parsedHeight + "px";
  }
  return result;
}

export function buildPopupTitle(parentName, pageTitleOrUrl) {
  const base = parentName || "App";
  if (!pageTitleOrUrl) return base + " - New Window";
  const value = String(pageTitleOrUrl).trim();
  if (!value) return base + " - New Window";
  let extra = value.slice(0, 40);
  const lower = value.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    value.indexOf("://") !== -1
  ) {
    try {
      const host = new URL(value).hostname;
      if (host) extra = host;
    } catch (err) {
      extra = value.slice(0, 40);
    }
  } else if (value.indexOf(":") !== -1 && value.indexOf(" ") === -1) {
    try {
      const parsed = new URL(value);
      if (parsed.hostname) extra = parsed.hostname;
    } catch (err) {
      extra = value.slice(0, 40);
    }
  }
  return (base + " - " + extra).replace(/[\r\n]+/g, " ");
}

export function createPopupWindow(options) {
  try {
    const opts = options || {};
    const parentAppId = opts.parentAppId || "browser";
    const parentName = opts.parentName || "Browser";
    const parentIcon = opts.parentIcon || "fas fa-globe";
    const sanitized = sanitizePopupUrl(opts.url);
    if (sanitized === null) return null;
    const url = sanitized || "about:blank";
    const slot = claimPopupSlot(url);
    if (slot === null) return null;
    if (slot) return slot;
    popupCounter += 1;
    const winId = parentAppId + "-popup-" + Date.now() + "-" + popupCounter;
    const title = buildPopupTitle(parentName, opts.pageTitle || url);
    const parsed = parsePopupFeatures(opts.features);
    const w = parsed.width || "90vw";
    const h = parsed.height || "85vh";
    const win = os.window.create(winId, title, w, h, {
      icon: parentIcon,
      appId: parentAppId,
    });
    const src =
      siteUrl("sapps/set-template.html") +
      "?wisp=" +
      encodeURIComponent(getWispUrl()) +
      "&target=" +
      encodeURIComponent(url) +
      "&popupId=" +
      encodeURIComponent(winId) +
      "&parentName=" +
      encodeURIComponent(parentName);
    win.innerHTML =
      '<div class="scramjet-popup-container"><iframe class="scramjet-popup-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation" src="' +
      src +
      '"></iframe></div>';
    popupLastUrl = url;
    popupLastUrlAt = Date.now();
    popupLastWinId = winId;
    return winId;
  } catch (err) {
    return null;
  }
}

export function handlePopupMessage(event, sourceIframe, meta) {
  if (!isPopupInterceptEnabled()) return false;
  if (!event || !event.data) return false;
  const expected = sourceIframe ? sourceIframe.contentWindow : null;
  if (!expected || event.source !== expected) return false;
  const data = event.data;
  if (data.type !== "scramjet:popup-open") return false;
  const raw = data.url;
  if (typeof raw === "string") {
    const lower = raw.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("mailto:"))
      return true;
  }
  const baseHint =
    (event.data && (event.data.baseUrl || event.data.pageUrl)) ||
    (meta && meta.baseUrl) ||
    undefined;
  const sanitized = sanitizePopupUrl(raw, baseHint);
  if (sanitized === null) return true;
  const info = meta || {};
  const winId = createPopupWindow({
    parentAppId: info.parentAppId,
    parentName: info.parentName,
    parentIcon: info.parentIcon,
    url: sanitized,
    pageTitle: data.pageTitle,
    features: data.features || data.specs || data.windowFeatures,
  });
  return Boolean(winId);
}

export function handlePopupTitleMessage(event) {
  const data = event ? event.data : null;
  if (!data || data.type !== "scramjet:popup-title") return false;
  const popupId = data.popupId;
  if (
    !popupId ||
    typeof popupId !== "string" ||
    popupId.indexOf("-popup-") === -1
  )
    return false;
  try {
    os.window.setTitle(
      popupId,
      buildPopupTitle(data.parentName || "App", data.title),
    );
    return true;
  } catch (err) {
    return false;
  }
}

export function buildPopupInterceptorScript() {
  return `(function(){
var FLAG_KEY="scramjet_windowopen_newtab";
function isEnabled(){
try{var v=localStorage.getItem(FLAG_KEY);if(v===null||v===undefined) return true;return v!=="false";}catch(err){return true;}
}
function sendOpen(url,target,pageTitle){
try{window.parent.postMessage({type:"scramjet:popup-open",url:url,target:target||"",pageTitle:pageTitle||""},"*");}catch(err){}
}
function sendTitle(){
try{
var href=window.location.href;var idx=href.indexOf("popupId=");if(idx===-1) return;
var rest=href.slice(idx+8);var end=rest.search(/[&#]/);var pid=end===-1?rest:rest.slice(0,end);pid=decodeURIComponent(pid);
var pname="App";var nidx=href.indexOf("parentName=");
if(nidx!==-1){var nr=href.slice(nidx+11);var nend=nr.search(/[&#]/);pname=decodeURIComponent(nend===-1?nr:nr.slice(0,nend));}
var t="";try{t=window.document.title||"";}catch(err){}
window.parent.postMessage({type:"scramjet:popup-title",popupId:pid,title:t,parentName:pname},"*");
}catch(err){}
}
function makeFake(url){return {closed:false,focus:function(){},close:function(){},location:{href:url}};}
function patchInner(innerWin){
if(!innerWin) return;
try{
if(innerWin.open&&innerWin.open.yukiPopupPatched) return;
var orig=null;try{orig=innerWin.open;}catch(err){}
var handler=function(raw,target,specs){
try{
if(!isEnabled()){if(orig) return orig.apply(this,arguments);return null;}
var url=raw==null?"":String(raw);var name=target==null?"":String(target);
if(name==="_self"||name==="_parent"||name==="_top"){if(url){try{innerWin.location.href=url;}catch(err){}}return innerWin;}
var trimmed=url.trim();var lower=trimmed.toLowerCase();
if(lower.indexOf("javascript:")===0||lower.indexOf("mailto:")===0) return null;
var resolved=trimmed;try{resolved=new URL(trimmed,innerWin.location.href).href;}catch(err){resolved=trimmed;}
var pageTitle="";try{pageTitle=innerWin.document.title||"";}catch(err){}
sendOpen(resolved,name,pageTitle);return makeFake(resolved);
}catch(err){try{if(orig) return orig.apply(this,arguments);}catch(err2){}return null;}
};
handler.yukiPopupPatched=true;
try{innerWin.open=handler;}catch(err){}
try{if(innerWin.Window&&innerWin.Window.prototype){if(!innerWin.Window.prototype.open||!innerWin.Window.prototype.open.yukiPopupPatched){try{innerWin.Window.prototype.open=handler;}catch(err){}}}}catch(err){}
try{for(var i=0;i<innerWin.frames.length;i++){try{patchInner(innerWin.frames[i]);}catch(err){}}}catch(err){}
}catch(err){}
}
function bindClicks(innerDoc){
if(!innerDoc||innerDoc.yukiPopupClicksBound) return;
try{innerDoc.yukiPopupClicksBound=true;}catch(err){}
try{
innerDoc.addEventListener("click",function(ev){
try{
if(!isEnabled()) return;
var node=ev.target;
while(node&&node!==innerDoc){
if(node.tagName==="A"&&node.target==="_blank"){
var href=node.getAttribute("href")||node.href||"";if(!href) return;
var base="";try{base=innerDoc.baseURI||innerDoc.location.href;}catch(err){}
var resolved=href;try{resolved=new URL(href,base).href;}catch(err){}
var lower=String(resolved).trim().toLowerCase();if(lower.indexOf("javascript:")===0||lower.indexOf("mailto:")===0) return;
ev.preventDefault();ev.stopPropagation();
var pageTitle="";try{pageTitle=innerDoc.title||"";}catch(err){}
sendOpen(resolved,"_blank",pageTitle);return;
}
node=node.parentNode;
}
}catch(err){}
},true);
}catch(err){}
try{
innerDoc.addEventListener("submit",function(ev){
try{
if(!isEnabled()) return;
var form=ev.target;
if(form&&form.target==="_blank"){
ev.preventDefault();
var action=form.getAttribute("action")||"";var base="";try{base=innerDoc.baseURI||innerDoc.location.href;}catch(err){}
var resolved=base;try{resolved=new URL(action||".",base).href;}catch(err){}
var pageTitle="";try{pageTitle=innerDoc.title||"";}catch(err){}
sendOpen(resolved,"_blank",pageTitle);
}
}catch(err){}
},true);
}catch(err){}
}
function tryPatch(){
var frame=window.yukiScramjetFrame;var cw=null;try{cw=frame?frame.element.contentWindow:null;}catch(err){}
if(!cw) return;
try{patchInner(cw);}catch(err){}
try{
var subs=cw.document.querySelectorAll("iframe");
for(var i=0;i<subs.length;i++){try{var w=subs[i].contentWindow;if(w) patchInner(w);}catch(err){}}
}catch(err){}
try{var doc=null;try{doc=cw.document;}catch(err){}if(doc) bindClicks(doc);}catch(err){}
}
tryPatch();sendTitle();
setInterval(function(){tryPatch();},1000);
try{var obs=new MutationObserver(function(){tryPatch();});obs.observe(window.document,{childList:true,subtree:true});}catch(err){}
})();`;
}

// Satu Koneksi Hotel - the light part of the shared code: no Firebase library needed.
// Contact details, WhatsApp numbers, where the visitor came from, the pop-up and the toast, and public database reads
// over plain web requests (settings, price rules, pictures). Every page can fill in its contact details at once, without
// waiting for the big Firebase library (sk-core.js imports all of this and re-exports it, so other scripts are unchanged).
import { $ } from "./sk-text.js";

export const WA_DEFAULT = "6289530998988";
export const waDigits = (s) => String(s || "").replace(/\D/g, "").replace(/^0/, "62");
export const waLink = (number, text) => `https://wa.me/${waDigits(number) || WA_DEFAULT}?text=${encodeURIComponent(text || "")}`;
// ---------------------------------------------------------------- several WhatsApp numbers (Admin -> Settings)
// settings/site.waNumbers = [{ num, label_en, label_id, use: "all" | "corporate" | "hotels" | "tours", on }]. Older settings: one "whatsapp" number.
export const WA_USES = { all: ["Whole website", "Seluruh website"], corporate: ["Corporate page", "Halaman korporat"], hotels: ["Hotel pages", "Halaman hotel"], tours: ["Tour packages", "Paket tur"] };
export const waShow = (d) => { d = waDigits(d); return d.startsWith("62") && d.length >= 10 ? `+62 ${d.slice(2, 5)}-${d.slice(5, 9)}-${d.slice(9)}` : d ? "+" + d : ""; };
export function waList(S = {}) {
  const list = Array.isArray(S.waNumbers) && S.waNumbers.length ? S.waNumbers : [{ num: S.whatsapp || WA_DEFAULT, use: "all", on: true }];
  return list.map((x) => ({ ...x, num: waDigits(x.num), use: WA_USES[x.use] ? x.use : "all" })).filter((x) => x.on !== false && x.num.length >= 8);
}
export function pageSection(path = location.pathname) {
  const p = path.replace(/^\/id(?=\/|$)/, "");
  return /^\/corporate/.test(p) ? "corporate" : /^\/(hotel-directory|hotels)(\/|$|\.)/.test(p) ? "hotels" : /^\/tour-packages/.test(p) ? "tours" : "";
}
// the numbers for this page: the ones set for its section, else the whole-website ones (never empty)
export function waFor(S = {}, path) {
  const all = waList(S), sec = pageSection(path), own = sec ? all.filter((x) => x.use === sec) : [];
  const out = own.length ? own : all.filter((x) => x.use === "all");
  return out.length ? out : [{ num: WA_DEFAULT, use: "all" }];
}

export function toast(msg, kind = "ok") {
  let box = $("#skToasts"); if (!box) { box = document.createElement("div"); box.id = "skToasts"; document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = "sk-toast " + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 3800); setTimeout(() => t.remove(), 4400);
}
export function modal(html, { wide = false, onClose } = {}) {
  const ov = document.createElement("div"); ov.className = "sk-modal-ov";
  ov.innerHTML = `<div class="sk-modal${wide ? " wide" : ""}" role="dialog" aria-modal="true"><button class="sk-x" aria-label="Close">×</button>${html}</div>`;
  // onClose(by): by = "visitor" when the visitor closed it (X, the shade, Esc); nothing when the page closed it itself
  let gone = false;
  const close = (by) => { if (gone) return; gone = true; ov.remove(); document.body.classList.remove("sk-lock"); onClose?.(typeof by === "string" ? by : undefined); };
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close("visitor"); });
  $(".sk-x", ov).onclick = () => close("visitor");
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { document.removeEventListener("keydown", k); close("visitor"); } });
  document.body.appendChild(ov); document.body.classList.add("sk-lock");
  return { el: ov, close, q: (s) => $(s, ov) };
}

// ---------------------------------------------------------------- cached public reads (protects the free daily read quota)
export async function cached(key, fn, ttl = 300000) {
  try { const c = JSON.parse(sessionStorage.getItem("skc_" + key)); if (c && Date.now() - c.t < ttl) return c.v; } catch { /* ignore */ }
  const v = await fn();
  try { sessionStorage.setItem("skc_" + key, JSON.stringify({ t: Date.now(), v })); } catch { /* too big: skip cache */ }
  return v;
}
// One public document over a plain web request (the database rules allow anyone to read it) -> plain values, or null.
const FS = "https://firestore.googleapis.com/v1/projects/satu-koneksi-hotel/databases/(default)/documents/";
const val = (v) => (v == null ? null : "stringValue" in v ? v.stringValue : "booleanValue" in v ? v.booleanValue : "integerValue" in v ? Number(v.integerValue)
  : "doubleValue" in v ? v.doubleValue : "timestampValue" in v ? v.timestampValue : "arrayValue" in v ? (v.arrayValue.values || []).map(val)
  : "mapValue" in v ? fields(v.mapValue.fields) : null);
const fields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));
export async function getPublicDoc(path) {
  const r = await fetch(FS + path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("read " + r.status);
  return fields((await r.json()).fields);
}
export async function loadPriceRules() {
  try { return await cached("prices", async () => { const { updatedAt, ...r } = (await getPublicDoc("settings/prices")) || {}; return r; }); } catch { return {}; }
}
// The owner's own figures (26 Oct 2026), shown until Admin -> Settings saves the times (then exactly what Admin says; empty = not shown)
export const TIME_DEFAULTS = { replyTime_en: "We reply within 30 minutes.", replyTime_id: "Kami membalas dalam 30 menit.",
  payCheck_en: "We check payments within 1 hour.", payCheck_id: "Kami mengecek pembayaran dalam 1 jam." };
export async function loadSettings() {
  let s = {};
  try { s = await cached("settings", async () => (await getPublicDoc("settings/site")) || {}); } catch { s = {}; }
  return s.timesSet ? s : { ...s, ...Object.fromEntries(Object.entries(TIME_DEFAULTS).filter(([k]) => !String(s[k] || "").trim())) };
}
export async function loadImage(id) {
  if (!id) return "";
  try { return await cached("img_" + id, async () => ((await getPublicDoc("images/" + encodeURIComponent(id))) || {}).data || "", 3600000); } catch { return ""; }
}

// ---------------------------------------------------------------- where the visitor came from (lead source)
// ?utm_source= / ?src= in the link (e.g. the Instagram bio link ...?src=ig), otherwise the website they came from.
// A real channel replaces an older one; "direct" never does. Kept 90 days in this browser only. Staff see it on each request,
// and WhatsApp messages get a short "(via Instagram)" so WhatsApp-only leads can be counted too.
export const SOURCES = { instagram: "Instagram", facebook: "Facebook", xiaohongshu: "Xiaohongshu", google: "Google", search: "Other search engine",
  linkedin: "LinkedIn", tiktok: "TikTok", whatsapp: "WhatsApp", email: "E-mail", partner: "Partner / referral", other: "Other website", direct: "Direct" };
export function sourceOf(param, referrer, host) {
  const p = String(param || "").toLowerCase().trim();
  if (p) {
    const hit = [["instagram", /^(ig|insta)|instagram/], ["facebook", /^(fb|meta)$|facebook/], ["xiaohongshu", /^(xhs|red|rednote)$|xiaohongshu|小红书/],
      ["google", /google|gmb|gbp/], ["linkedin", /^li$|linkedin/], ["tiktok", /tiktok/], ["whatsapp", /^wa$|whatsapp/], ["email", /mail|newsletter/],
      ["partner", /partner|agent|referr?al/]].find(([, re]) => re.test(p));
    return hit ? hit[0] : "other";
  }
  let h = ""; try { h = referrer ? new URL(referrer).hostname.toLowerCase() : ""; } catch { h = ""; }
  if (!h || (host && h === host) || /satukoneksihotel\.com$|web\.app$|firebaseapp\.com$|^localhost$|^127\./.test(h)) return "direct";
  const map = [["instagram", /instagram\.com$/], ["facebook", /(facebook\.com|fb\.me|fb\.com)$/], ["xiaohongshu", /(xiaohongshu\.com|xhslink\.com)$/],
    ["google", /(^|\.)google\./], ["search", /(bing\.com|duckduckgo\.com|yahoo\.|yandex\.|baidu\.com|ecosia\.org|naver\.com|daum\.net|coccoc\.com|sogou\.com)/], ["linkedin", /(linkedin\.com|lnkd\.in)$/],
    ["tiktok", /tiktok\.com$/], ["whatsapp", /(whatsapp\.com|wa\.me)$/], ["email", /mail\./]];
  const hit = map.find(([, re]) => re.test(h));
  return hit ? hit[0] : "other";
}
export function rememberSource() {
  try {
    const q = new URLSearchParams(location.search);
    const s = sourceOf(q.get("utm_source") || q.get("src") || q.get("ref"), document.referrer, location.hostname);
    const old = JSON.parse(localStorage.getItem("skSrc") || "null");
    const fresh = old && Date.now() - (old.at || 0) < 90 * 864e5;
    if (s !== "direct" || !fresh) localStorage.setItem("skSrc", JSON.stringify({ s, c: String(q.get("utm_campaign") || "").slice(0, 60), at: Date.now() }));
  } catch { /* private window: no source */ }
}
// ---------------------------------------------------------------- visit record (visits_engine, shown in Admin -> Visitors)
// No name: random numbers for the browser and the visit, the page, the website they came from, the time on screen and the screen size. The server adds the
// country, city, connection company and internet address (shortened in Europe); the privacy policy says so.
// No record for a browser that asks for none, robots driving a browser, other copies of the site, or staff who ticked "don't count my own visits".
// A clock set to Europe gets no lasting number: European privacy law asks for consent first.
export const VISITS_URL = "https://v.satukoneksihotel.com";
export const NO_TRACK_KEY = "skNoTrack";
export function trackVisit() {
  try {
    if (navigator.globalPrivacyControl || navigator.webdriver || !/(^|\.)satukoneksihotel\.com$/.test(location.hostname) || localStorage.getItem(NO_TRACK_KEY)) return;
    const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const europe = /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ""), first = !europe && !localStorage.getItem("skVid");
    if (first) localStorage.setItem("skVid", rid());
    if (!sessionStorage.getItem("skSid")) sessionStorage.setItem("skSid", rid());
    const vid = europe ? "" : localStorage.getItem("skVid"), sid = sessionStorage.getItem("skSid"), pv = rid();
    // plain text = no extra question to the server before each record
    const send = (what, body) => navigator.sendBeacon(`${VISITS_URL}/api/v/${what}`, new Blob([JSON.stringify(body)], { type: "text/plain" }));
    send("hit", { pv, sid, vid, first, path: location.pathname, ref: document.referrer ? new URL(document.referrer).hostname : "",
      lang: (navigator.language || "").slice(0, 2).toLowerCase(), utm: new URLSearchParams(location.search).get("utm_source") || "",
      sw: screen.width || 0, sh: screen.height || 0 });
    // time counts only while the page is on screen
    let total = 0, since = document.hidden ? 0 : Date.now(), sent = 0;
    const leave = () => {
      if (since) { total += Date.now() - since; since = 0; }
      const secs = Math.round(total / 1000);
      if (secs !== sent) { sent = secs; send("end", { pv, secs }); }
    };
    document.addEventListener("visibilitychange", () => { if (document.hidden) leave(); else since = Date.now(); });
    addEventListener("pagehide", leave);
  } catch { /* storage blocked: no record, and the page carries on */ }
}
export function leadSource() {
  try { const o = JSON.parse(localStorage.getItem("skSrc") || "null"); return o && SOURCES[o.s] && Date.now() - (o.at || 0) < 90 * 864e5 ? o : null; } catch { return null; }
}

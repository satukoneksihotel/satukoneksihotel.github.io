// "Before you go" (owner, 7-8 Nov 2026): one small window that suggests where to go next on the site.
//  1. Leaving a page: hotel, city, kind-of-stay and city-guide pages carry their own window (written by the page builder,
//     Python: sk_engines/hotelpages.exit_offer, make_firebase for the guides); pages without a place of their own (home,
//     offers ...) get the next suggestion from the list. Shown once per page, after the first 2 seconds:
//       computer: the mouse leaves through the top of the window (towards the tabs, address bar or close button)
//       phone:    a quick scroll back up after reading down the page, or coming back after switching to another app or tab
//  2. Closing a hotel or tour window (X, a click outside, Esc) anywhere on the site: shown at once, EVERY time, with ANOTHER
//     suggestion each time - the place's city guide and hotels, then its country, then other cities there (most hotels first).
//     The windows come from data/exit-places.json (made by hotelpages) - see watchPlace().
// Never over another open "Before you go". The Back button is NOT caught on purpose: Google treats that as
// "back button hijacking" (spam). Closing the browser tab itself cannot be caught by any website.
const KEY = "skExitOffer";
const WAIT_MS = 2000;           // the visitor has looked at the page for a moment first (owner, 8 Nov: quick leavers too)

function seen() { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } }
function mark() { try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode: once per page instead */ } }
const box = () => document.getElementById("exitOffer");

function wire(b) {              // the shade or the X closes it
  const close = () => { if (b.close) b.close(); else b.removeAttribute("open"); b.hidden = true; };
  b.addEventListener("click", (e) => { if (e.target === b || e.target.closest("[data-xo-close]")) close(); });
}
function open(b) {
  if (b.dataset.n) remember([...shown(), +b.dataset.n]);           // a suggestion from the list: count it as shown
  b.hidden = false;
  if (b.showModal) b.showModal(); else b.setAttribute("open", "");
}

let started = false, done = false, stop = () => {};
function show(t0 = 0) {         // leaving the page: once per page (owner, 8 Nov 2026), after the first seconds
  const b = box();
  if (!b || b.open || done || performance.now() < WAIT_MS) return;
  done = true; mark(); stop();
  open(b);
}
export function init(first) {
  if (started) return;
  started = true;
  if (first) wire(first);
  const t0 = Date.now();
  const late = () => show(t0);
  stop = () => {
    document.removeEventListener("mouseout", onOut);
    removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVis);
  };

  // computer: the pointer leaves the page near the top edge (a fast move can be last seen a few pixels below it)
  const onOut = (e) => { if (!e.relatedTarget && e.clientY < 10) late(); };
  document.addEventListener("mouseout", onOut);

  // phone: up by over half a screen within 0.6 s (a flick back towards the top) after reading down the page
  const phone = matchMedia("(pointer:coarse)").matches;
  let deepest = 0, recent = [];
  const onScroll = () => {
    const y = scrollY, t = Date.now();
    deepest = Math.max(deepest, y);
    recent = recent.filter((p) => t - p.t < 600); recent.push({ y, t });
    const highest = Math.max(...recent.map((p) => p.y));
    if (phone && deepest > innerHeight && highest - y > innerHeight * 0.6 && y < deepest * 0.7) late();
  };
  addEventListener("scroll", onScroll, { passive: true });

  // phone: the visitor went to another app or tab (often to compare prices) and has come back
  const onVis = () => { if (phone && document.visibilityState === "visible") late(); };
  document.addEventListener("visibilitychange", onVis);
}

// ---------------------------------------------------------------- hotel and tour windows: the place the visitor opened
let PLACES = null;
// "no-cache": ask the site each time whether the list changed (a tiny "not changed" answer when not) - /data/ files are
// otherwise kept for a day, and an old list hid the "other cities" suggestions on 8 Nov 2026
const places = () => (PLACES ||= fetch("/data/exit-places.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const slug = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function cityIdx(d, city) {     // "South Jakarta" / "Jakarta Selatan" -> jakarta: the whole name first, then each word of it
  const full = slug(city), words = full.split("-").filter((w) => w.length > 2);
  for (const k of [full, ...words]) if (k && k in d.city) return d.city[k];
  return null;
}
function countryOf(d, city, country, ci) {
  const c = slug(country);
  if (c && c in d.country) return c;
  if (ci != null && d.ck?.[ci]) return d.ck[ci];
  return slug(city).split("-").find((w) => w in d.country) || "indonesia";      // a tour "Bangkok - Pattaya, Thailand"; else home
}
// the suggestions for a place, in order: its city, its country, then the other cities of that country (most hotels first)
export function choices(d, city, country) {
  if (!d) return [];
  const ci = cityIdx(d, city), k = countryOf(d, city, country, ci);
  return [...new Set([ci, d.country[k], ...(d.cc?.[k] || [])].filter((n) => n != null))];
}
export function boxFor(d, city, country) { const c = choices(d, city, country); return c.length ? d.boxes[c[0]] : ""; }

// what was suggested this visit: each close shows the first one not yet shown (when all were shown, round again)
const SHOWN_KEY = "skExitOfferShown";
function shown() { try { return JSON.parse(sessionStorage.getItem(SHOWN_KEY)) || []; } catch { return []; } }
function remember(list) { try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify(list.slice(-200))); } catch { /* ignore */ } }
export function nextChoice(list, had) {
  const fresh = list.find((n) => !had.includes(n));
  if (fresh != null) return fresh;
  const last = had[had.length - 1];                                              // all shown: start again, never the same twice
  return list.find((n) => n !== last) ?? list[0];
}

function put(html) {
  box()?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  const b = box();
  if (document.documentElement.getAttribute("data-page-lang") === "id") {        // Indonesian page: Indonesian links and texts
    b.querySelectorAll("a.go, a.more").forEach((a) => { const h = a.getAttribute("href"); if (h.startsWith("/") && !h.startsWith("/id/")) a.setAttribute("href", "/id" + h); });
  }
  window.SK_applyLang?.(b);
  const wa = b.querySelector("[data-wa-en]"), lang = document.documentElement.lang === "id" ? "id" : "en";
  if (wa && window.SK_WA) wa.href = `https://wa.me/${window.SK_WA}?text=${encodeURIComponent(lang === "id" ? wa.dataset.waId || wa.dataset.waEn : wa.dataset.waEn)}`;
  wire(b);
  return b;
}

// no "leaving" window on: sign-in / staff pages, the privacy policy, the error page, and the pages in other languages
// (the windows are written in English and Indonesian only)
const NO_LEAVE_OFFER = /^\/(account|admin|privacy-policy|404|zh-hk|zh|ja|ko|ms|th|vi)(\/|\.html|$)/;

export function watchPlace() {
  let place = null;
  const opened = async (p) => {                  // a hotel or tour window opened: get its place ready (also for leaving the page)
    if (!p) return;
    place = p;
    const d = await places(), html = boxFor(d, p.city, p.country);
    if (!html || box()?.open) return;
    put(html);
    init();
  };
  const closed = async () => {                   // the visitor closed it: at once, every time, another suggestion
    const d = await places();
    if (!d || !place || box()?.open) return;
    const list = choices(d, place.city, place.country);
    if (!list.length) return;
    const had = shown(), n = nextChoice(list, had);
    remember([...had, n]);
    open(put(d.boxes[n]));
  };
  if (window.SK_place) opened(window.SK_place);
  addEventListener("sk-place", (e) => opened(e.detail));
  // pages without a place of their own (home, offers, destinations ...): leaving shows a suggestion too (owner, 8 Nov 2026) -
  // the next one not yet shown this visit: Indonesia, then its cities (most hotels first). Fetched after the page has loaded.
  if (!NO_LEAVE_OFFER.test(location.pathname)) setTimeout(async () => {
    if (place || box()) return;
    const d = await places();
    if (!d || place || box()) return;
    const list = choices(d, "", "Indonesia");
    if (!list.length) return;
    const n = nextChoice(list, shown());
    put(d.boxes[n]).dataset.n = n;
    init();
  }, 400);
  addEventListener("sk-hotel-closed", closed);   // fired by public.js when the visitor (not the page) closed a hotel or tour window
}

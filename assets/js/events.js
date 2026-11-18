// "Events & Alerts" (main menu, /events): cards for festivals and events of the next 12 months (embedded #ev-data, built from
// travel_info/festivals_data.py) + the live ad hoc news (database travelAlerts: GDACS disasters, Reuters headlines, sudden holidays,
// staff notices). The visitor sorts them: All · By country · Festivals · Events · Ad hoc news, picks a country or searches.
// Link examples: /events?v=news   /events?v=country&c=thailand   /events?q=formula
import { db, F, esc, lang, todayStr, loadAlertBundle } from "./sk-core.js";

const DATA = JSON.parse(document.getElementById("ev-data").textContent);
const NAMES = JSON.parse(document.getElementById("fa-names")?.textContent || "{}");
const T = (en, id) => (lang() === "id" ? id : en);
const L = (pair) => (Array.isArray(pair) ? (lang() === "id" ? pair[1] || pair[0] : pair[0]) : pair || "");
const cname = (s) => (NAMES[s] ? L(NAMES[s]) : s === "all" ? T("All countries", "Semua negara") : s);
const cicon = (s) => (NAMES[s] ? NAMES[s][2] : "🌏");
const RANK = { red: 0, orange: 1, info: 2 };
const LV = { red: ["Danger", "Bahaya", "🔴"], orange: ["Warning", "Waspada", "🟠"], info: ["News", "Berita", "🔵"] };
const TYPE_ICON = { EQ: "🌍", TC: "🌀", FL: "🌊", VO: "🌋", WF: "🔥" };
const VIEWS = [["all", "All", "Semua"], ["country", "By country", "Per negara"], ["festival", "Festivals", "Festival"], ["event", "Events", "Acara"], ["news", "Ad hoc news", "Berita mendadak"]];
const PAGE = 24;

const qs = new URLSearchParams(location.search);
const st = { v: VIEWS.some((x) => x[0] === qs.get("v")) ? qs.get("v") : "all", c: qs.get("c") || "", q: qs.get("q") || "", more: 1 };
const today = todayStr();
// soonest first; a long "around ..." season that started weeks ago (safari, whale season) goes behind the coming events
const later = (() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + 45); return d.toISOString().slice(0, 10); })();
const sortKey = (e) => (e.a >= today ? e.a : e.ap ? later : today);
const events = DATA.events.filter((e) => e.b >= today).sort((x, y) => sortKey(x).localeCompare(sortKey(y)) || x.a.localeCompare(y.a));
let news = [], newsState = "loading";

// ---------------------------------------------------------------- live ad hoc news (same cache as the alert strip)
async function loadNews() {
  const KEY = "skAlerts1";
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.t < 10 * 60 * 1000) return c.items;
  } catch { /* ignore */ }
  const bun = await loadAlertBundle();      // one document (1 read) instead of every alert
  if (bun) {
    const items = bun.items.filter((a) => (a.until || "9999") >= today && (!a.from || a.from <= today));
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items, checked: bun.checked })); } catch { /* ignore */ }
    return items;
  }
  const snap = await F.getDocs(F.query(F.collection(db, "travelAlerts"), F.where("until", ">=", today)));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const status = all.find((a) => a.kind === "status") || {};
  const items = all.filter((a) => a.kind !== "status" && !a.hidden && (!a.from || a.from <= today))
    .map((a) => ({ ...a, checkedAt: undefined, createdAt: undefined, updatedAt: undefined }));
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items, checked: status.checkedAt?.toDate ? status.checkedAt.toDate().toISOString() : "" })); } catch { /* ignore */ }
  return items;
}
const nTitle = (a) => a["title_" + lang()] || a.title_en || a.title_id || "";
const nText = (a) => a["text_" + lang()] || "";
const newsSort = (a, b) => (RANK[a.level] ?? 3) - (RANK[b.level] ?? 3) || String(b.from || "").localeCompare(String(a.from || ""));

// ---------------------------------------------------------------- cards
function eventCard(e) {
  const cat = DATA.cats[e.cat] || DATA.cats.festival;
  const d = new Date(e.a + "T12:00:00");
  const big = e.ap ? `<small>${T("around", "sekitar")}</small><b>${esc(d.toLocaleString(lang() === "id" ? "id-ID" : "en-GB", { month: "short" }))}</b>`
    : `<b>${d.getDate()}</b><small>${esc(d.toLocaleString(lang() === "id" ? "id-ID" : "en-GB", { month: "short" }))}</small>`;
  return `<article class="ev-card ev-${esc(e.cat)}">
    <div class="ev-head"><span class="ev-badge">${cat[2]} ${esc(L([cat[0], cat[1]]))}</span><span class="ev-day${e.ap ? " ap" : ""}">${big}</span></div>
    <div class="ev-body"><p class="ev-c">${cicon(e.s)} ${esc(cname(e.s))} · ${esc(e.city)}</p><h3>${esc(L(e.t))}</h3>
      <p class="ev-w">📅 ${esc(L(e.w))}</p><p class="ev-d">${esc(L(e.d))}</p></div>
    <div class="ev-foot"><a class="sk-btn gold sm" href="${esc(e.q)}">${T("Ask for a quotation", "Minta penawaran")}</a>
      ${e.h ? `<a class="sk-btn sm line" href="${lang() === "id" ? "/id" : ""}/hotels/${esc(e.h[0])}">${esc(T("Hotels in ", "Hotel di ") + e.h[1])}</a>` : ""}
      ${e.u ? `<a class="ev-link" href="${esc(e.u)}" target="_blank" rel="noopener">${T("Official site", "Situs resmi")} ↗</a>` : ""}</div></article>`;
}

function newsCard(a) {
  const lv = a.kind === "holiday" ? ["Sudden holiday", "Libur mendadak", "📅"] : LV[a.level] || LV.info;
  const ic = (a.kind === "disaster" && TYPE_ICON[a.type]) || (a.kind === "news" ? "📰" : a.kind === "holiday" ? "📅" : "📢");
  const cs = (a.countries || []).filter((s) => s !== "all");
  const txt = nText(a);
  return `<article class="ev-card ev-news lv-${esc(a.kind === "holiday" ? "hol" : a.level || "info")}">
    <div class="ev-head"><span class="ev-badge">${lv[2]} ${esc(T(lv[0], lv[1]))}</span><span class="ev-from">${esc(a.from || "")}</span></div>
    <div class="ev-body"><p class="ev-c">${cs.map((s) => `${cicon(s)} ${esc(cname(s))}`).join(" · ") || "🌏"}</p><h3>${ic} ${esc(nTitle(a))}</h3>
      ${txt ? `<p class="ev-d">${esc(txt)}</p>` : ""}<p class="ev-src">${esc(a.source || "")}</p></div>
    <div class="ev-foot">${a.url ? `<a class="sk-btn sm line" href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${T("Read more", "Selengkapnya")} ↗</a>` : ""}
      ${cs[0] && NAMES[cs[0]] ? `<a class="ev-link" href="/travel-info/festivals-events/${esc(cs[0])}">${T("Events in", "Acara di")} ${esc(cname(cs[0]))} →</a>` : ""}</div></article>`;
}

// ---------------------------------------------------------------- filtering
const words = () => st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const hitE = (e) => (!st.c || e.s === st.c) && words().every((w) => [L(e.t), e.t[0], e.city, cname(e.s), L(e.d), e.cat].join(" ").toLowerCase().includes(w));
const hitN = (a) => (!st.c || (a.countries || []).includes(st.c) || (a.countries || []).includes("all")) && words().every((w) => [nTitle(a), nText(a), (a.countries || []).map(cname).join(" "), a.source].join(" ").toLowerCase().includes(w));
const grid = (html) => `<div class="ev-grid">${html}</div>`;
const newsNote = () => (newsState === "loading" ? `<p class="fa-none">${T("Loading the live news…", "Memuat berita terkini…")}</p>`
  : newsState === "error" ? `<p class="fa-none">${T("Live news could not be loaded - please refresh the page.", "Berita tidak dapat dimuat - silakan muat ulang halaman.")}</p>` : "");
function more(list, render) {
  const n = PAGE * st.more;
  return grid(list.slice(0, n).map(render).join("")) + (list.length > n ? `<p class="ev-more"><button type="button" class="sk-btn line" data-more>${T("Show more", "Tampilkan lagi")} (${list.length - n})</button></p>` : "");
}
const head = (h, sub = "") => `<div class="ev-h"><h2>${h}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;
const empty = () => `<p class="fa-none">${T("Nothing matches - try another country or word.", "Tidak ada yang cocok - coba negara atau kata lain.")}</p>`;

function render() {
  const app = document.getElementById("evApp");
  const E = events.filter(hitE), N = news.filter(hitN).sort(newsSort);
  const fest = E.filter((e) => e.g === "festival"), evs = E.filter((e) => e.g === "event");
  const counts = { all: E.length + N.length, country: new Set([...E.map((e) => e.s), ...N.flatMap((a) => a.countries || [])]).size, festival: fest.length, event: evs.length, news: N.length };
  const used = [...new Set([...events.map((e) => e.s), ...news.flatMap((a) => a.countries || [])])].filter((s) => NAMES[s]).sort((x, y) => (x !== "indonesia") - (y !== "indonesia") || cname(x).localeCompare(cname(y)));
  document.getElementById("evBar").innerHTML = `
    <div class="ev-tabs" role="tablist">${VIEWS.map(([k, en, id]) => `<button type="button" role="tab" aria-selected="${st.v === k}" class="ev-tab${st.v === k ? " on" : ""}" data-v="${k}">${esc(T(en, id))} <i>${counts[k]}</i></button>`).join("")}</div>
    <div class="ev-tools"><select aria-label="${T("Country", "Negara")}"><option value="">🌏 ${T("All countries", "Semua negara")}</option>${used.map((s) => `<option value="${esc(s)}"${s === st.c ? " selected" : ""}>${cicon(s)} ${esc(cname(s))}</option>`).join("")}</select>
      <input type="search" placeholder="${T("Search: F1, Songkran, Canton, flood…", "Cari: F1, Songkran, Canton, banjir…")}" value="${esc(st.q)}"></div>`;
  let html = "";
  if (st.v === "all") {
    const top = N.slice(0, 6);
    html = (N.length || newsState !== "done" ? head(`⚠️ ${T("Ad hoc news now", "Berita mendadak saat ini")}`, `<a href="?v=news" data-go="news">${T("See all", "Lihat semua")} (${N.length}) →</a>`) + (newsNote() || grid(top.map(newsCard).join(""))) : "")
      + head(`🗓️ ${T("Coming up", "Akan datang")}`, T("Festivals and events, soonest first", "Festival dan acara, yang terdekat dulu")) + (E.length ? more(E, eventCard) : empty());
  } else if (st.v === "news") {
    html = head(`⚠️ ${T("Ad hoc news", "Berita mendadak")}`, T("Disasters (GDACS), Reuters headlines, sudden holidays and our notices - most serious first", "Bencana (GDACS), berita Reuters, libur mendadak dan pengumuman kami - yang paling serius dulu"))
      + (newsNote() || (N.length ? more(N, newsCard) : `<p class="fa-none">✅ ${T("No ad hoc news for this choice right now.", "Tidak ada berita mendadak untuk pilihan ini saat ini.")}</p>`));
  } else if (st.v === "festival" || st.v === "event") {
    const list = st.v === "festival" ? fest : evs;
    html = head(st.v === "festival" ? `🎉 ${T("Festivals, culture & religious events", "Festival, budaya & acara keagamaan")}` : `🏆 ${T("Sport, trade fairs & nature seasons", "Olahraga, pameran dagang & musim alam")}`, T("Soonest first", "Yang terdekat dulu"))
      + (list.length ? more(list, eventCard) : empty());
  } else {
    const by = {};
    E.forEach((e) => (by[e.s] ||= { e: [], n: [] }).e.push(e));
    N.forEach((a) => (a.countries || []).forEach((s) => { if (NAMES[s] && (!st.c || s === st.c)) (by[s] ||= { e: [], n: [] }).n.push(a); }));
    const order = Object.keys(by).sort((x, y) => (x !== "indonesia") - (y !== "indonesia") || cname(x).localeCompare(cname(y)));
    html = order.length ? order.map((s) => `<section class="ev-country"><div class="ev-ch"><span>${cicon(s)}</span><h2>${esc(cname(s))}</h2>
        <i>${by[s].e.length} ${T("events", "acara")}${by[s].n.length ? ` · ${by[s].n.length} ${T("news", "berita")}` : ""}</i>
        <a href="/travel-info/festivals-events/${esc(s)}">${T("Calendar & public holidays", "Kalender & hari libur")} →</a></div>
        ${grid(by[s].n.map(newsCard).join("") + by[s].e.map(eventCard).join(""))}</section>`).join("") : empty();
  }
  app.innerHTML = html;
  bind();
}

function setUrl() {
  const p = new URLSearchParams();
  if (st.v !== "all") p.set("v", st.v);
  if (st.c) p.set("c", st.c);
  if (st.q) p.set("q", st.q);
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
}
function bind() {
  const bar = document.getElementById("evBar");
  bar.querySelectorAll(".ev-tab").forEach((b) => (b.onclick = () => { st.v = b.dataset.v; st.more = 1; setUrl(); render(); }));
  bar.querySelector("select").onchange = (e) => { st.c = e.target.value; st.more = 1; setUrl(); render(); };
  const inp = bar.querySelector("input");
  let t;
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = inp.value; st.more = 1; setUrl(); render(); const i = document.querySelector("#evBar input"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  document.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => { st.more++; render(); }));
  document.querySelectorAll("[data-go]").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); st.v = a.dataset.go; st.more = 1; setUrl(); render(); scrollTo({ top: document.getElementById("evBar").offsetTop - 80, behavior: "smooth" }); }));
}

render();
addEventListener("sk-lang", render);
loadNews().then((items) => { news = items; newsState = "done"; render(); }).catch(() => { newsState = "error"; render(); });

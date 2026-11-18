// Live travel alerts (database travelAlerts): earthquakes / floods / storms (GDACS), Reuters headlines, one-off public holidays
// (added by the "festivals" engine every few hours) and notices typed by staff in Admin -> Travel alerts.
// Three looks, chosen by data-mode on the box:
//   bar  - one slim strip: "N live travel alerts" + the most serious one (rotating) -> the Live travel alerts page
//   list - slim rows for one country (Festivals & events country page)
//   page - the Live travel alerts page: summary tiles, filters (type, country), alerts grouped per country
// Also hides events and holidays on the page that are already over (rows with data-end before today).
import { db, F, esc, lang, todayStr, loadAlertBundle } from "./sk-core.js";

const KEY = "skAlerts1", MAX_AGE = 10 * 60 * 1000;
const RANK = { red: 0, orange: 1, info: 2 };
const ICON = { disaster: "🌋", news: "📰", holiday: "📅", notice: "📢", event: "🎉" };
const TYPE_ICON = { EQ: "🌍", TC: "🌀", FL: "🌊", VO: "🌋", WF: "🔥" };
const LEVEL = { red: ["Danger", "Bahaya"], orange: ["Warning", "Waspada"], info: ["Info", "Info"] };
const KINDS = [["all", "All", "Semua"], ["disaster", "Disasters", "Bencana"], ["news", "News", "Berita"], ["holiday", "Holidays", "Hari libur"], ["notice", "Notices", "Pengumuman"]];
const T = (en, id) => (lang() === "id" ? id : en);
const pick = (a, k) => a[k + "_" + lang()] || (k === "title" ? a.title_en || a.title_id : "") || "";
const icon = (a) => (a.kind === "disaster" && TYPE_ICON[a.type]) || ICON[a.kind] || "⚠️";
const sorter = (a, b) => (RANK[a.level] ?? 3) - (RANK[b.level] ?? 3) || String(b.from || "").localeCompare(String(a.from || ""));
const kindOf = (a) => (a.kind === "event" ? "notice" : a.kind);
let NAMES = {};
try { NAMES = JSON.parse(document.getElementById("fa-names")?.textContent || "{}"); } catch { /* ignore */ }
const cname = (s) => (NAMES[s] ? (lang() === "id" ? NAMES[s][1] : NAMES[s][0]) : s === "all" ? T("All countries", "Semua negara") : s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
const cicon = (s) => (NAMES[s] ? NAMES[s][2] : "🌏");

function hidePast() {
  const t = todayStr();
  document.querySelectorAll("[data-end]").forEach((el) => { if (el.dataset.end < t) el.hidden = true; });
}

async function load() {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.t < MAX_AGE) return c;
  } catch { /* ignore */ }
  const t = todayStr();
  const bun = await loadAlertBundle();      // one document (1 read) instead of every alert; fall back to the old query if it is missing
  if (bun) {
    const items = bun.items.filter((a) => (a.until || "9999") >= t && (!a.from || a.from <= t));
    const out = { t: Date.now(), items, checked: bun.checked };
    try { sessionStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
    return out;
  }
  const snap = await F.getDocs(F.query(F.collection(db, "travelAlerts"), F.where("until", ">=", t)));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const status = all.find((a) => a.kind === "status") || {};
  const items = all.filter((a) => a.kind !== "status" && !a.hidden && (!a.from || a.from <= t))
    .map((a) => ({ ...a, checkedAt: undefined, createdAt: undefined, updatedAt: undefined }));
  const checked = status.checkedAt?.toDate ? status.checkedAt.toDate().toISOString() : "";
  const out = { t: Date.now(), items, checked };
  try { sessionStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

const forSlug = (items, slug) => items.filter((a) => slug === "all" || (a.countries || []).includes(slug) || (a.countries || []).includes("all")).sort(sorter);
const when = (iso) => (iso ? new Date(iso).toLocaleString(lang() === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

// ---------------------------------------------------------------- one slim row
function row(a, withCountry) {
  const lv = LEVEL[a.level] || LEVEL.info;
  const txt = pick(a, "text");
  const more = a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${T("Read more", "Selengkapnya")} ↗</a>` : "";
  const where = withCountry ? (a.countries || []).map(cname).join(", ") + " · " : "";
  return `<div class="fr fr-${esc(a.level || "info")}"><span class="fr-ic">${icon(a)}</span><div class="fr-b">
    <p class="fr-h"><span class="fr-lv">${esc(T(lv[0], lv[1]))}</span><b>${esc(pick(a, "title"))}</b></p>
    ${txt ? `<p class="fr-t">${esc(txt)}</p>` : ""}
    <p class="fr-m">${esc(where)}${esc(a.source || "")}${a.from ? " · " + esc(a.from) : ""}${more ? " · " + more : ""}</p></div></div>`;
}

// ---------------------------------------------------------------- bar
const timers = new WeakMap();
function bar(box, data) {
  const list = forSlug(data.items, box.dataset.alerts);
  const n = list.length, worst = list[0]?.level || "ok";
  box.classList.remove("fa-red", "fa-orange", "fa-info", "fa-ok");
  box.classList.add("fa-" + (n ? worst : "ok"));
  box.querySelector(".fa-n").textContent = n ? `${n}` : "✓";
  const top = box.querySelector(".fa-bar-top");
  clearInterval(timers.get(box));
  if (!n) { top.textContent = T("No alerts right now", "Tidak ada peringatan saat ini"); return; }
  const shown = list.slice(0, 6);
  let i = 0;
  const show = () => { const a = shown[i % shown.length]; top.classList.remove("in"); void top.offsetWidth; top.textContent = `${icon(a)} ${pick(a, "title")}`; top.classList.add("in"); i++; };
  show();
  if (shown.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) timers.set(box, setInterval(show, 5000));
}

// ---------------------------------------------------------------- list (one country)
function listBox(box, data) {
  const list = forSlug(data.items, box.dataset.alerts);
  box.innerHTML = (list.length ? list.slice(0, 20).map((a) => row(a, false)).join("")
    : `<p class="fa-none">✅ ${T("No current alerts for this country.", "Tidak ada peringatan untuk negara ini saat ini.")}</p>`)
    + `<p class="fa-chk">${T("Checked automatically several times a day", "Diperiksa otomatis beberapa kali sehari")}${data.checked ? ` (${T("last check", "terakhir")}: ${esc(when(data.checked))})` : ""}.</p>`;
}

// ---------------------------------------------------------------- page (all countries)
const pageState = { kind: "all", country: (location.hash || "").slice(1) };
function page(box, data) {
  const items = data.items;
  const count = (k) => items.filter((a) => k === "all" || kindOf(a) === k).length;
  const serious = items.filter((a) => a.level === "red" || a.level === "orange").length;
  const countries = [...new Set(items.flatMap((a) => a.countries || []))].filter((s) => s !== "all");
  const st = pageState;
  if (st.country && !countries.includes(st.country)) st.country = st.country && NAMES[st.country] ? st.country : "";
  const shown = items.filter((a) => (st.kind === "all" || kindOf(a) === st.kind) && (!st.country || (a.countries || []).includes(st.country) || (a.countries || []).includes("all")));
  const groups = {};
  shown.forEach((a) => (a.countries || ["all"]).forEach((s) => { if (!st.country || s === st.country || s === "all") (groups[s] ||= []).push(a); }));
  const order = Object.keys(groups).sort((x, y) => (RANK[groups[x].sort(sorter)[0].level] ?? 3) - (RANK[groups[y].sort(sorter)[0].level] ?? 3) || groups[y].length - groups[x].length || cname(x).localeCompare(cname(y)));
  const opts = countries.sort((x, y) => cname(x).localeCompare(cname(y))).map((s) => `<option value="${esc(s)}"${s === st.country ? " selected" : ""}>${esc(cname(s))}</option>`).join("");
  box.innerHTML = `
    <div class="fa-tiles">
      <div class="fa-tile t-warn"><b>${serious}</b><span>${T("serious warnings", "peringatan serius")}</span></div>
      <div class="fa-tile"><b>${count("disaster")}</b><span>${T("natural disasters", "bencana alam")}</span></div>
      <div class="fa-tile"><b>${count("news")}</b><span>${T("news headlines", "berita utama")}</span></div>
      <div class="fa-tile"><b>${countries.length}</b><span>${T("countries affected", "negara terdampak")}</span></div>
    </div>
    <div class="fa-tools">
      <div class="fa-chips" role="group" aria-label="${T("Type", "Jenis")}">${KINDS.map(([k, en, id]) => `<button type="button" class="fa-chip${st.kind === k ? " on" : ""}" data-k="${k}">${esc(T(en, id))} <i>${count(k)}</i></button>`).join("")}</div>
      <label class="fa-sel"><span>${T("Country", "Negara")}</span><select><option value="">${T("All countries", "Semua negara")}</option>${opts}</select></label>
    </div>
    ${order.length ? order.map((s) => `<section class="fa-grp"><div class="fa-grp-h"><span>${cicon(s)}</span><h3>${esc(cname(s))}</h3><i>${groups[s].length}</i>
        ${NAMES[s] ? `<a href="/travel-info/festivals-events/${esc(s)}">${T("Festivals & events", "Festival & acara")} →</a>` : ""}</div>
        ${groups[s].sort(sorter).map((a) => row(a, false)).join("")}</section>`).join("")
      : `<p class="fa-none">✅ ${T("No alerts for this choice right now.", "Tidak ada peringatan untuk pilihan ini saat ini.")}</p>`}
    <p class="fa-chk">${T("Checked automatically several times a day", "Diperiksa otomatis beberapa kali sehari")}${data.checked ? ` (${T("last check", "terakhir")}: ${esc(when(data.checked))})` : ""}.</p>`;
  box.querySelectorAll(".fa-chip").forEach((b) => (b.onclick = () => { st.kind = b.dataset.k; page(box, data); }));
  box.querySelector(".fa-sel select").onchange = (e) => { st.country = e.target.value; history.replaceState(null, "", st.country ? "#" + st.country : location.pathname); page(box, data); };
}

async function main() {
  hidePast();
  const boxes = [...document.querySelectorAll("[data-alerts]")];
  if (!boxes.length) return;
  let data;
  try { data = await load(); } catch (e) {
    boxes.forEach((b) => {
      if (b.dataset.mode === "bar") { b.querySelector(".fa-bar-top").textContent = ""; return; }
      b.innerHTML = `<p class="fa-none">${T("Live alerts could not be loaded - please refresh the page.", "Peringatan tidak dapat dimuat - silakan muat ulang halaman.")}</p>`;
    });
    return;
  }
  const draw = () => boxes.forEach((b) => (b.dataset.mode === "bar" ? bar : b.dataset.mode === "page" ? page : listBox)(b, data));
  draw();
  addEventListener("sk-lang", draw);
}
main();

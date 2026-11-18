// Fast list: the hotel list as small files made by the cloud (sitelist engine) - /data/list/index.json (first cards, featured,
// regions, types), slim.json (one short row per hotel) and cards-K.json (full cards, 500 per file). No Firebase in this file,
// so the Hotels page and the home page draw their cards BEFORE the Firebase scripts have loaded (firstDraw); public.js then
// takes over the same cards (same HTML, so nothing jumps) and adds the buttons' behaviour. When the files are not there
// (the engine has never run), everything returns null and public.js reads the database as before.
import { $, esc, L, T } from "./sk-text.js";

const mem = {};
async function file(name, v) {
  const key = name + "|" + (v || "");
  if (!mem[key]) mem[key] = (async () => {
    try { const r = await fetch(`/data/list/${name}${v ? "?v=" + encodeURIComponent(v) : ""}`); return r.ok ? await r.json() : null; } catch { return null; }
  })();
  return mem[key];
}
export const loadHotelIndex = () => file("index.json");                                            // 5-minute cache header: always fresh enough
export const loadHotelSlim = async (gen) => file("slim.json", gen ?? (await loadHotelIndex())?.gen);
export const loadHotelCards = async (part, gen) => file(`cards-${part}.json`, gen ?? (await loadHotelIndex())?.gen);
// a slim row = [id, name, city, country, region, type, stars, part, lat, lon, osmId]
export const slimRow = (r) => ({ id: r[0], name: r[1], city: r[2], country: r[3], region: r[4], type: r[5], stars: r[6], part: r[7],
  ...(r[8] ? { lat: r[8], lon: r[9] } : {}), ...(r[10] ? { osmId: r[10] } : {}) });

// ---------------------------------------------------------------- card markup (one place: public.js uses the same)
export const STARS = (n) => (n ? "★".repeat(n) : "");
export const cover = (x) => x.cover || x.photo || "";
export const bg = (u) => (u ? ` style="background-image:url('${u}')"` : "");
export const thumb = (u) => String(u || "").replace(/(static-images\.webbeds\.com\/[^?]*\?size=)\d+/, "$1480");   // card photos small (35 KB instead of 134 KB)
// the Admin hotel list's thumbnails: pics.json = {id: "hash" or "hash|key"} (a small file, read once)
export const loadPicIndex = async (gen) => file("pics.json", gen ?? (await loadHotelIndex())?.gen);
export const picFromIndex = (id, entry) => { if (!entry) return ""; const [v, k] = String(entry).split("|"); return picOf({ id, pic: v, pk: k || "" }); };
export const picOf = (h) => (h.pic ? `/assets/hotels/${encodeURIComponent(h.id)}${h.pk ? "-" + h.pk : ""}.webp?v=${encodeURIComponent(h.pic)}` : thumb(cover(h)));   // the card picture file (pk = which of the hotel's photos is showing now), else the hotel's own link

// One button per card (owner, 25 Oct 2026: four buttons were too messy). With the live price helper on: "Check my dates" opens the
// hotel at its dates box (live rate, then "ask for our curated rate"). Without it: "Ask for a quotation". The picture and the name open the details.
export function hotelActionsHTML(x, mode, priceOn, signedIn) {   // eslint-disable-line no-unused-vars
  const q = encodeURIComponent;
  if (priceOn) return mode === "home" ? `<a class="sk-btn gold sm" href="/hotel-directory?h=${x.id}&p=1">📅 ${T("Check my dates", "Cek tanggal saya")}</a>`
    : `<button class="sk-btn gold sm" type="button" data-pp="${x.id}">📅 ${T("Check my dates", "Cek tanggal saya")}</button>`;
  return mode === "home" ? `<a class="sk-btn gold sm" href="/book-now?kind=hotel&id=${x.id}&ref=${q(x.name)}&city=${q(x.city || "")}">${T("Ask for a quotation", "Minta penawaran")}</a>`
    : `<button class="sk-btn gold sm" type="button" data-q="${x.id}">${T("Ask for a quotation", "Minta penawaran")}</button>`;
}
export function cardHTML(h, actions) {
  const city = [h.city, h.country].filter(Boolean).join(", "), short = L(h, "short"), pic = picOf(h), open = `/hotel-directory?h=${encodeURIComponent(h.id || "")}`;
  const am = (h.amenities || []).slice(0, 4).map((a) => `<span>${esc(a)}</span>`).join("");
  return `<article class="card"><a class="ph" href="${open}" data-open="${esc(h.id || "")}" aria-label="${esc(h.name)}"${bg(pic)}${pic || !h.id ? "" : ` data-lz="${esc(h.id)}"`}>${pic ? "" : "🏨"}${h.type ? `<span class="tag">${esc(h.type)}</span>` : ""}${h.stars ? `<span class="star">${STARS(h.stars)}</span>` : ""}</a>
  <div class="bd"><h3><a href="${open}" data-open="${esc(h.id || "")}">${esc(h.name)}</a></h3><div class="meta">📍 ${esc(city)}</div>${short ? `<div class="meta">${esc(short)}</div>` : ""}
  <div class="cur">✦ ${T("Curated by Satu Koneksi · we check the rate for you", "Dipilih Satu Koneksi · kami cek tarifnya untuk Anda")}</div>${am ? `<div class="am">${am}</div>` : ""}<div class="act">${actions}</div></div></article>`;
}
// The Hotels page: search bar, filters, the cards shown so far, "Show more". `empty` = what to show when nothing matches.
export function hotelsPageHTML({ list, total, regions, types, st, priceOn, signedIn, empty }) {
  return `<div class="bar"><input id="fq" type="search" value="${esc(st.q)}" placeholder="${T("Search hotel or city…", "Cari hotel atau kota…")}">
      ${regions.length > 1 ? `<select id="fr"><option value="">${T("All regions", "Semua wilayah")}</option>${regions.map((r) => `<option${st.region === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}
      ${types.length > 1 ? `<select id="ft"><option value="">${T("All types", "Semua jenis")}</option>${types.map((r) => `<option${st.type === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}</div>
      ${list.length ? `<div class="grid hgrid">${list.map((h) => cardHTML(h, hotelActionsHTML(h, "page", priceOn, signedIn))).join("")}</div>${total > list.length ? `<div class="ctr mt"><p class="meta">${T("Showing", "Menampilkan")} ${list.length} ${T("of", "dari")} ${total}</p><button class="sk-btn" type="button" id="hmore">${T("Show more hotels", "Tampilkan lebih banyak hotel")}</button></div>` : ""}` : empty}`;
}

// The first draw, before Firebase: the Hotels page (first 24 cards) or the home page (featured hotels). -> the index, or null.
export async function firstDraw(page) {
  const idx = await loadHotelIndex();
  if (!idx) return null;
  const st = { q: new URLSearchParams(location.search).get("q") || "", region: "", type: "", shown: 24 };
  if (page === "hotels") {
    const app = $("#app");
    if (!app || app.dataset.live || st.q) return idx;                           // public.js was faster, or a search (needs the slim rows): leave it
    app.innerHTML = hotelsPageHTML({ list: idx.first.slice(0, st.shown), total: idx.count, regions: idx.regions || [], types: idx.types || [], st,
      priceOn: !!idx.priceOn, signedIn: false, empty: `<div class="empty"><h3>${T("Our hotel list is being prepared", "Daftar hotel kami sedang disiapkan")}</h3></div>` });
    app.dataset.fast = "1";
  } else if (page === "home") {
    const a = $("#featHotels"), g = $("#featHotelsGrid"), fh = (idx.featured || []).slice(0, 6);
    if (a && g && !a.dataset.live && fh.length) { g.innerHTML = fh.map((h) => cardHTML(h, hotelActionsHTML(h, "home", !!idx.priceOn, false))).join(""); a.hidden = false; a.dataset.fast = "1"; }
  }
  return idx;
}

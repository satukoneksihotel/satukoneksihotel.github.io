// Public pages: home data, hotels, tour packages, offers, book now, customer account.
import * as C from "./sk-core.js";
import { pricesFrom, specialFor } from "./prices.js";
import { loadHotelIndex, loadHotelSlim, slimRow, loadHotelCards, cardHTML, hotelActionsHTML, hotelsPageHTML } from "./fastlist.js";
const { $, $$, esc, F, db, auth, L, T, lang, toast, modal, loadPublished, loadHotelList, loadHotelFull, loadSettings, loadPriceRules, loadImage, offerActive, openAuth, onUser, ensureProfile, createRequest, myRequests,
  qs, renderStatus, waLink, WA_DEFAULT, fmtDate, signOut, isStaffUser, resendVerification, refreshUser, plain, slipFromFile, guestSignIn } = C;

let S = {};
const waNum = () => String(S.whatsapp || "").replace(/\D/g, "") || WA_DEFAULT;
const wa = (text) => waLink(waNum(), text);
const cover = (x) => x.cover || x.photo || "";
const bg = (u) => (u ? ` style="background-image:url('${u}')"` : "");
const thumb = (u) => String(u || "").replace(/(static-images\.webbeds\.com\/[^?]*\?size=)\d+/, "$1480");   // card photos small (35 KB instead of 134 KB)
const STARS = (n) => (n ? "★".repeat(n) : "");
const arr = (o, k) => (o?.[k + "_" + lang()]?.length ? o[k + "_" + lang()] : o?.[k + "_en"] || []);
const q = encodeURIComponent;
const redraw = (fn) => addEventListener("sk-lang", () => fn());
// EN | ID switch on pages drawn by this code: remember what the visitor typed, redraw in the new language, put it back
const fieldKey = (el) => `${el.form?.id || ""}|${el.name || el.id}${el.type === "checkbox" || el.type === "radio" ? "|" + el.value : ""}`;
function keepForms(root) {
  const saved = {};
  root.querySelectorAll("input,select,textarea").forEach((el) => { if (el.type !== "file" && (el.name || el.id)) saved[fieldKey(el)] = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value; });
  return () => {
    root.querySelectorAll("input,select,textarea").forEach((el) => {
      const k = fieldKey(el); if (el.type === "file" || !(k in saved)) return;
      if (el.type === "checkbox" || el.type === "radio") el.checked = saved[k]; else el.value = saved[k];
    });
    root.querySelectorAll("[name=kind],[name=hotelMode],[name=checkIn]").forEach((el) => el.dispatchEvent(new Event("change")));
  };
}

// ================================================================ cards
// "See price" and "Member price" on every hotel card - shown only when the live price helper is set up (Admin -> Price rules)
let priceOn = false;
let HOTELS = null;          // the compact hotel list the page already loaded - used for 'hotels nearby'
async function checkPriceOn() { try { priceOn = !!(await loadPriceRules()).helperUrl; } catch { priceOn = false; } }
// The hotel list as files made by the cloud (fastlist.js): index = first cards + featured; slim rows = search / filters / order / nearby;
// card files = full cards, read only when needed. LIST.idx === null means the files are not there: the database is read as before.
const LIST = { idx: undefined, slim: null, have: {} };
async function listIndex() { if (LIST.idx === undefined) { LIST.idx = await loadHotelIndex(); for (const c of [...(LIST.idx?.first || []), ...(LIST.idx?.featured || [])]) LIST.have[c.id] = c; } return LIST.idx; }
async function listSlim() { if (!LIST.slim && LIST.idx) LIST.slim = ((await loadHotelSlim(LIST.idx.gen)) || []).map(slimRow); return LIST.slim || []; }
async function listCards(ids) {                       // the full cards for these hotels, reading the card files they are in
  if (ids.some((id) => !LIST.have[id]) && !LIST.slim) await listSlim();            // the slim rows say which file holds a hotel
  const partOf = {}; for (const r of LIST.slim || []) partOf[r.id] = r.part;
  const need = new Set(ids.filter((id) => !LIST.have[id] && partOf[id] != null).map((id) => partOf[id]));
  await Promise.all([...need].map(async (p) => { for (const c of (await loadHotelCards(p, LIST.idx.gen)) || []) LIST.have[c.id] = c; }));
  return ids.map((id) => LIST.have[id]).filter(Boolean);
}
// Member price: signed-in customers go straight to the price; others sign in first, then the price opens
function memberPrice(id) {
  if (auth.currentUser) return openHotel(id, "price");
  openAuth({ reason: T("Sign in to ask for our curated rate - we reply with our best price.", "Masuk untuk minta tarif pilihan kami - kami balas dengan harga terbaik kami."), onDone: () => openHotel(id, "price") });
}
function actions(kind, x, mode) {
  const page = kind === "hotel" ? "/hotel-directory" : "/tour-packages", key = kind === "hotel" ? "h" : "t";
  const name = kind === "hotel" ? x.name : L(x, "title");
  const city = kind === "hotel" ? x.city || "" : x.destination || "";
  if (kind === "hotel") return hotelActionsHTML(x, mode, priceOn, !!auth.currentUser);
  const pb = "";
  if (mode === "home") return pb + `<a class="sk-btn sm" href="${page}?${key}=${x.id}">${T("Details", "Detail")}</a><a class="sk-btn gold sm" href="/book-now?kind=${kind}&id=${x.id}&ref=${q(name)}&city=${q(city)}">${T("Ask for a quotation", "Minta penawaran")}</a>`;
  return pb + `<button class="sk-btn sm" type="button" data-d="${x.id}">${T("Details", "Detail")}</button><button class="sk-btn gold sm" type="button" data-q="${x.id}">${T("Ask for a quotation", "Minta penawaran")}</button>`;
}
const hotelCard = (h, mode) => cardHTML(h, actions("hotel", h, mode));     // same markup as the fast first draw (fastlist.js)
// The compact list carries no pictures (they are too big). A card's picture is read, one hotel at a time, only when the card is on screen.
let lazyCoverObs = null;
function lazyCovers(root = document) {
  if (!("IntersectionObserver" in window)) return;
  lazyCoverObs = lazyCoverObs || new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target; lazyCoverObs.unobserve(el);
    setTimeout(async () => {                                   // a short wait: a card scrolled past or redrawn while typing is not read
      if (!el.isConnected || !el.dataset.lz) return;
      const d = await loadHotelFull(el.dataset.lz), u = d && thumb(cover(d)); delete el.dataset.lz;
      if (u && el.isConnected) { el.style.backgroundImage = `url('${u}')`; if (el.firstChild?.nodeType === 3) el.firstChild.textContent = ""; }
    }, 400);
  }), { rootMargin: "200px" });
  $$("[data-lz]", root).forEach((el) => lazyCoverObs.observe(el));
}
function tourCard(t, mode) {
  const short = L(t, "summary"), price = L(t, "priceNote");
  return `<article class="card"><div class="ph"${bg(cover(t))}>${cover(t) ? "" : "🧭"}${t.days ? `<span class="tag">${t.days} ${T(t.days === 1 ? "day" : "days", "hari")}</span>` : ""}</div>
  <div class="bd"><h3>${esc(L(t, "title"))}</h3><div class="meta">📍 ${esc(t.destination || "")}</div>${short ? `<div class="meta">${esc(short.length > 130 ? short.slice(0, 127) + "…" : short)}</div>` : ""}${price ? `<div class="price">${esc(price)}</div>` : ""}<div class="act">${actions("tour", t, mode)}</div></div></article>`;
}
function gallery(host, item) {
  const ids = item.photos || []; if (!ids.length && !cover(item)) { host.innerHTML = ""; return; }
  let urls = [cover(item)].filter(Boolean);
  const draw = (cur = 0) => {
    host.innerHTML = `<div class="gmain"${bg(urls[cur])}></div>${urls.length > 1 ? `<div class="gth">${urls.map((u, i) => `<button type="button" data-i="${i}" class="${i === cur ? "on" : ""}"${bg(u)} aria-label="Photo ${i + 1}"></button>`).join("")}</div>` : ""}`;
    $$("[data-i]", host).forEach((b) => b.onclick = () => draw(+b.dataset.i));
  };
  draw();
  if (ids.length) Promise.all(ids.map(loadImage)).then((list) => { const u = list.filter(Boolean); if (u.length) { urls = u; draw(); } });
}
const closeUrl = () => { try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ } };
const shareBtn = (m, key, id) => { const b = m.q("[data-share]"); if (b) b.onclick = async () => { const u = `${location.origin}${location.pathname}?${key}=${id}`; try { await navigator.clipboard.writeText(u); toast(T("Link copied.", "Tautan disalin.")); } catch { prompt(T("Copy this link:", "Salin tautan ini:"), u); } }; };

async function openHotel(id, focus = "", pre = null) {          // the list has card fields only: read the full hotel when it is opened
  const h = await loadHotelFull(id);
  if (h) hotelDetail(h, focus, pre); else toast(T("This hotel is not available any more.", "Hotel ini sudah tidak tersedia."));
}
function hotelDetail(h, focus = "", pre = null) {
  try { history.replaceState(null, "", `?h=${h.id}`); } catch { /* ignore */ }
  window.SK_place = { city: h.city || "", country: h.country || "" };              // "Before you go" (exit-offer.js): this hotel's place
  dispatchEvent(new CustomEvent("sk-place", { detail: window.SK_place }));
  const city = [h.city, h.country].filter(Boolean).join(", "), desc = L(h, "desc") || L(h, "short"), price = L(h, "priceNote");
  const m = modal(`<h3>${esc(h.name)}</h3><p class="sk-sub">📍 ${esc(city)}${h.stars ? " · " + STARS(h.stars) : ""}${h.type ? " · " + esc(h.type) : ""}</p><div id="gal"></div>
    ${desc ? `<p style="white-space:pre-line;margin:14px 0">${esc(desc)}</p>` : ""}
    ${price ? `<div class="dl"><div><b>${T("Price", "Harga")}</b>${esc(price)}</div></div>` : ""}
    ${(h.amenities || []).length ? `<b style="font:800 11px 'Plus Jakarta Sans';letter-spacing:.14em;text-transform:uppercase;color:var(--gold)">${T("Facilities", "Fasilitas")}</b><div class="tagrow">${h.amenities.map((a) => `<span>${esc(a)}</span>`).join("")}</div>` : ""}
    <div id="pbox"></div>
    <p class="sk-sub" style="font-size:13px">${T("Rates change with dates and availability - we confirm the current price before you decide.", "Tarif berubah sesuai tanggal dan ketersediaan - kami konfirmasi harga terbaru sebelum Anda memutuskan.")}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="sk-btn gold" type="button" data-q>${T("Ask for a quotation", "Minta penawaran")}</button>
    <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T(`Hello Satu Koneksi Hotel, I'd like a quotation for ${h.name}${h.city ? " (" + h.city + ")" : ""}.`, `Halo Satu Koneksi Hotel, saya ingin minta penawaran untuk ${h.name}${h.city ? " (" + h.city + ")" : ""}.`))}">💬 WhatsApp</a>
    <button class="sk-btn" type="button" data-share>🔗 ${T("Copy link", "Salin tautan")}</button></div>`, { wide: true, onClose: (by) => {
      closeUrl();
      if (by === "visitor") dispatchEvent(new CustomEvent("sk-hotel-closed"));      // "Before you go" shows at once (owner, 8 Nov 2026)
    } });
  gallery(m.q("#gal"), h); shareBtn(m, "h", h.id);
  m.q("[data-q]").onclick = () => { m.close(); requestModal({ kind: "hotel", refId: h.id, refName: h.name, refCity: h.city || "" }); };
  loadPriceRules().then((rules) => {
    const box = m.q("#pbox"); if (!box) return;
    priceBox(box, h, rules, () => m.close(), pre);
    if (focus === "price" && box.querySelector("#pq")) {                       // from "See price" / "Member price": go straight to the dates
      const go = () => { box.scrollIntoView({ block: "center" }); box.querySelector("[name=in]")?.focus({ preventScroll: true }); };
      setTimeout(go, 400); setTimeout(go, 1600);                               // again after the photos above have loaded and pushed it down
    }
  });
}

// ---------------------------------------------------------------- live price for the customer's dates (Admin -> Price rules)
// The live RollingGo price comes from the price helper (Google Apps Script, keeps the key secret); our prices are worked out here:
// Normal = RollingGo + markup %, Member = Normal - member % (signed-in customers), plus the hotel's special price while it is valid.
const rp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Up to 4 other hotels near this one: by map position when both have one (within 15 km), otherwise the same city; similar stars first.
const kmBetween = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
async function nearbyHotels(h, n = 4) {
  const list = HOTELS && HOTELS.length ? HOTELS : (await listIndex()) ? await listSlim() : await loadHotelList();
  const here = h.lat != null && h.lon != null ? { lat: +h.lat, lon: +h.lon } : null;
  const city = String(h.city || "").toLowerCase(), st = +h.stars || 0;
  return list.filter((x) => x.id !== h.id).map((x) => {
    const km = here && x.lat != null && x.lon != null ? kmBetween(here, { lat: +x.lat, lon: +x.lon }) : null;
    const same = String(x.city || "").toLowerCase() === city;
    return { x, km, ok: km != null ? km <= 15 : same, score: (km != null ? km : same ? 8 : 99) + Math.abs((+x.stars || 0) - st) * 1.5 };
  }).filter((c) => c.ok).sort((a, b) => a.score - b.score).slice(0, n);
}
function priceBox(host, h, rules, closeHotel, pre = null) {
  const today = isoDay(new Date()), sp = specialFor(h, today);
  const special = sp ? `<div class="dl"><div><b>${T("Special price", "Harga spesial")}</b>${rp(sp)} / ${T("night", "malam")}${h.specialUntil ? ` · ${T("until", "sampai")} ${esc(h.specialUntil)}` : ""}</div></div>` : "";
  if (!rules.helperUrl) { host.innerHTML = special; return; }
  const opt = (n, a, b) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${i + 1 === a ? " selected" : ""}>${i + 1} ${i ? b[1] : b[0]}</option>`).join("");
  host.innerHTML = `${special}<div class="boxcard" style="margin:14px 0;padding:14px 16px">
    <b style="font:800 11px 'Plus Jakarta Sans';letter-spacing:.14em;text-transform:uppercase;color:var(--gold)">${T("Price for your dates", "Harga untuk tanggal Anda")}</b>
    <form id="pq" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:8px">
      <label>${T("Check-in", "Check-in")}<input name="in" type="date" min="${today}" required></label>
      <label>${T("Check-out", "Check-out")}<input name="out" type="date" min="${today}" required></label>
      <label>${T("Adults", "Dewasa")}<select name="adults">${opt(6, 2, [T("adult", "dewasa"), T("adults", "dewasa")])}</select></label>
      <label>${T("Rooms", "Kamar")}<select name="rooms">${opt(3, 1, [T("room", "kamar"), T("rooms", "kamar")])}</select></label>
      <div style="align-self:end"><button class="sk-btn gold sm" type="submit">${T("Check price", "Cek harga")}</button></div></form>
    <div id="pres" style="margin-top:10px"></div></div>`;
  const f = $("#pq", host), out = $("#pres", host);
  f.in.onchange = () => { if (f.in.value) { const d = new Date(f.in.value + "T12:00:00"); d.setDate(d.getDate() + 1); f.out.min = isoDay(d); if (!f.out.value || f.out.value <= f.in.value) f.out.value = isoDay(d); } };
  if (pre && pre.in >= today && pre.out > pre.in) {                             // came from "hotels nearby": same dates and guests, checked at once
    f.in.value = pre.in; f.in.onchange(); f.out.value = pre.out; f.adults.value = String(pre.adults || 2); f.rooms.value = String(pre.rooms || 1);
    setTimeout(() => f.requestSubmit(), 50);
  }
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const din = f.in.value, dout = f.out.value, adults = +f.adults.value || 2, rooms = +f.rooms.value || 1;
    if (!din || !dout || dout <= din) { out.innerHTML = `<p class="sk-err">${T("Please choose check-in and check-out.", "Pilih tanggal check-in dan check-out.")}</p>`; return; }
    out.innerHTML = `<p class="sk-sub">${T("Checking the live price… this can take up to 20 seconds.", "Mengecek harga langsung… bisa sampai 20 detik.")}</p>`;
    let res = null;
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
      const q = new URLSearchParams({ hotel: h.name, city: h.city || "", in: din, out: dout, adults, rooms });
      res = await (await fetch(`${rules.helperUrl}?${q}`, { signal: ctl.signal })).json();
      clearTimeout(timer);
    } catch { res = null; }
    const ask = (txt) => `<button class="sk-btn sm" type="button" data-pq>${txt}</button>`;
    if (!res || !res.ok || !(res.rooms || []).length) {
      const why = res?.reason === "busy" ? T("Many people are checking prices right now - please try again in a minute.", "Banyak yang sedang cek harga - coba lagi sebentar lagi.")
        : res?.reason === "dates" ? T("Please check the dates.", "Periksa kembali tanggalnya.")
        : res?.reason === "none" ? T("No rooms are available online for these dates - the hotel may be fully booked. Try other dates, or ask us: we can often still find a room.",
            "Tidak ada kamar tersedia online untuk tanggal ini - hotel mungkin sudah penuh. Coba tanggal lain, atau tanyakan kepada kami: kami sering masih bisa mendapatkan kamar.")
        : T("We could not check the live price just now. Ask us - we check it for you.", "Harga langsung belum bisa dicek saat ini. Tanyakan kepada kami - kami cekkan untuk Anda.");
      out.innerHTML = `<p class="sk-sub">${why}</p>${ask(T("Ask for a quotation for these dates", "Minta penawaran untuk tanggal ini"))}<div data-near></div>`;
      if (res?.reason === "none") nearbyHotels(h).then((near) => {
        const box = $("[data-near]", out); if (!box || !near.length) return;
        box.innerHTML = `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
          <b style="font:800 11px 'Plus Jakarta Sans';letter-spacing:.14em;text-transform:uppercase;color:var(--gold)">${T("Hotels nearby - check the same dates", "Hotel terdekat - cek tanggal yang sama")}</b>
          <div style="display:grid;gap:8px;margin-top:8px">${near.map(({ x, km }) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px solid var(--line);border-radius:12px;padding:9px 12px;flex-wrap:wrap">
            <div style="min-width:0"><b style="display:block">${esc(x.name)}</b><small class="sk-sub">${x.stars ? STARS(+x.stars) + " · " : ""}${km != null ? (km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km") + T(" away", " dari sini") : esc(x.city || "")}</small></div>
            <button class="sk-btn sm line" type="button" data-alt="${esc(x.id)}">${T("Check these dates", "Cek tanggal ini")}</button></div>`).join("")}</div></div>`;
        $$("[data-alt]", box).forEach((b) => { b.onclick = () => { closeHotel(); openHotel(b.dataset.alt, "price", { in: din, out: dout, adults, rooms }); }; });
      });
    } else {
      // See price = the live RollingGo price (owner, 18 Oct 2026: no markup). The member price is NOT shown: signed-in customers ask for it and staff decide.
      const member = !!auth.currentUser, nights = res.nights || 1;
      const rows = res.rooms.map((r) => ({ ...r, p: pricesFrom(r.perNightIDR, { markup: 0, member: 0 }) })).filter((r) => r.p);
      const sp2 = specialFor(h, din);
      out.innerHTML = `<div style="overflow:auto"><table class="tbl" style="width:100%;font-size:14px"><thead><tr><th style="text-align:left">${T("Room", "Kamar")}</th>
        <th style="text-align:right">${T("Price / night", "Harga / malam")}</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.room)}${r.meal ? `<br><small class="sk-sub">${esc(r.meal)}</small>` : ""}</td><td style="text-align:right">${rp(r.p.normal)}</td></tr>`).join("")}</tbody></table></div>
        <div style="margin:12px 0;padding:12px 14px;border-radius:12px;background:#fbf3df;border:1.5px solid #e3cf9c">
          <b>✦ ${T("Want our curated rate? Ask us", "Ingin menikmati tarif eksklusif kami? Mohon hubungi kami")}</b><br><span class="sk-sub" style="font-size:13px">${T("This is the public online price. Tell us these dates and we check all our partners for a better rate, reply with our best offer and confirm it before you pay.", "Ini harga online umum. Beri tahu tanggal ini dan kami cek semua mitra kami untuk tarif lebih baik, balas dengan penawaran terbaik, dan konfirmasi sebelum Anda membayar.")}</span>
          <div style="margin-top:8px"><button class="sk-btn gold sm" type="button" data-mem>${member ? T("Ask for our curated rate", "Minta tarif pilihan kami") : "🔒 " + T("Sign in to ask for our curated rate", "Masuk untuk minta tarif pilihan kami")}</button></div></div>
        ${sp2 ? `<p><b>${T("Special price", "Harga spesial")}: ${rp(sp2)} / ${T("night", "malam")}</b></p>` : ""}
        <p class="sk-sub" style="font-size:13px">${rooms > 1 ? T(`Prices are for ${rooms} rooms per night.`, `Harga untuk ${rooms} kamar per malam.`) + " " : ""}${T(`From ${rp(rows[0].p.normal * nights)} for ${nights} night(s).`, `Mulai ${rp(rows[0].p.normal * nights)} untuk ${nights} malam.`)}
        ${T("Live price, checked just now - we confirm it before you book.", "Harga langsung, baru saja dicek - kami konfirmasi sebelum Anda memesan.")}</p>
        ${ask(T("Ask for a quotation for these dates", "Minta penawaran untuk tanggal ini"))}`;
      const memberAsk = () => { closeHotel(); requestModal({ kind: "hotel", refId: h.id, refName: h.name, refCity: h.city || "", checkIn: din, checkOut: dout, adults, rooms,
        message: `⭐ MEMBER PRICE REQUEST - live price seen on the website: ${rp(rows[0].p.normal)} per night (${rows[0].room}${rows[0].meal ? ", " + rows[0].meal : ""}), ${din} to ${dout}, ${rooms} room(s), ${adults} adult(s).` }); };
      $("[data-mem]", out).onclick = () => (auth.currentUser ? memberAsk() : openAuth({ reason: T("Sign in to ask for your member price - we reply with our best price.", "Masuk untuk meminta harga member - kami balas dengan harga terbaik kami."), onDone: memberAsk }));
    }
    $("[data-pq]", out).onclick = () => { closeHotel(); requestModal({ kind: "hotel", refId: h.id, refName: h.name, refCity: h.city || "", checkIn: din, checkOut: dout, adults, rooms }); };
  };
}
function tourDetail(t) {
  try { history.replaceState(null, "", `?t=${t.id}`); } catch { /* ignore */ }
  window.SK_place = { city: t.destination || "", country: t.country || "" };          // "Before you go" (exit-offer.js): the tour's place
  dispatchEvent(new CustomEvent("sk-place", { detail: window.SK_place }));
  const title = L(t, "title"), sum = L(t, "summary"), price = L(t, "priceNote"), inc = arr(t, "includes"), exc = arr(t, "excludes");
  const m = modal(`<h3>${esc(title)}</h3><p class="sk-sub">📍 ${esc(t.destination || "")}${t.days ? " · " + t.days + " " + T(t.days === 1 ? "day" : "days", "hari") : ""}</p><div id="gal"></div>
    ${sum ? `<p style="white-space:pre-line;margin:14px 0">${esc(sum)}</p>` : ""}${price ? `<div class="dl"><div><b>${T("Price", "Harga")}</b>${esc(price)}</div></div>` : ""}
    ${(t.itinerary || []).length ? `<h4 style="margin:14px 0 4px">${T("Day by day", "Hari demi hari")}</h4>${t.itinerary.map((d, i) => `<div class="day"><b>${T("Day", "Hari")} ${i + 1}${L(d, "title") ? " – " + esc(L(d, "title")) : ""}</b><p>${esc(L(d, "text"))}</p></div>`).join("")}` : ""}
    <div class="row2">${inc.length ? `<div><h4 style="margin:10px 0 4px">${T("Included", "Termasuk")}</h4><ul class="tick">${inc.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${exc.length ? `<div><h4 style="margin:10px 0 4px">${T("Not included", "Tidak termasuk")}</h4><ul class="tick nope">${exc.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>
    <p class="sk-sub" style="font-size:13px">${T("Prices depend on dates and group size - we confirm the current price before you decide.", "Harga tergantung tanggal dan jumlah peserta - kami konfirmasi harga terbaru sebelum Anda memutuskan.")}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="sk-btn gold" type="button" data-q>${T("Ask for a quotation", "Minta penawaran")}</button>
    <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T(`Hello Satu Koneksi Hotel, I'd like a quotation for the tour package "${title}".`, `Halo Satu Koneksi Hotel, saya ingin minta penawaran untuk paket tur "${title}".`))}">💬 WhatsApp</a>
    <button class="sk-btn" type="button" data-share>🔗 ${T("Copy link", "Salin tautan")}</button></div>`, { wide: true, onClose: (by) => {
      closeUrl();
      if (by === "visitor") dispatchEvent(new CustomEvent("sk-hotel-closed"));      // "Before you go" shows at once (owner, 8 Nov 2026)
    } });
  gallery(m.q("#gal"), t); shareBtn(m, "t", t.id);
  m.q("[data-q]").onclick = () => { m.close(); requestModal({ kind: "tour", refId: t.id, refName: title, refCity: t.destination || "" }); };
}

// ================================================================ the request form (needs a verified sign-in)
const PRICE_RANGES = [["-", "Any budget", "Anggaran berapa saja"], ["0-500000", "Under Rp 500,000", "Di bawah Rp 500.000"], ["500000-1000000", "Rp 500,000 - 1 million", "Rp 500.000 - 1 juta"],
  ["1000000-2000000", "Rp 1 - 2 million", "Rp 1 - 2 juta"], ["2000000-4000000", "Rp 2 - 4 million", "Rp 2 - 4 juta"], ["4000000-", "Above Rp 4 million", "Di atas Rp 4 juta"]];
const COUNTRIES = ["Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines", "Brunei", "Cambodia", "Laos", "Myanmar", "Japan", "South Korea", "China", "Hong Kong", "Taiwan", "India", "Maldives", "Sri Lanka", "United Arab Emirates", "Australia"];
const COUNTRIES_ID = ["Indonesia", "Malaysia", "Singapura", "Thailand", "Vietnam", "Filipina", "Brunei", "Kamboja", "Laos", "Myanmar", "Jepang", "Korea Selatan", "Tiongkok", "Hong Kong", "Taiwan", "India", "Maladewa", "Sri Lanka", "Uni Emirat Arab", "Australia"];
export const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const budget = (r) => r.priceMin == null && r.priceMax == null ? "" : r.priceMax == null ? T("above ", "di atas ") + rupiah(r.priceMin) : `${rupiah(r.priceMin || 0)} - ${rupiah(r.priceMax)}`;
// "Book again": the same request as before (hotel or city, stars, budget, guests, rooms - or the company details), only the dates are new.
export function againOpts(r) {
  const k = ["hotel", "tour", "corporate"].includes(r.kind) ? r.kind : "general";
  return { kind: k, ...(r.refId && k !== "corporate" ? { refId: r.refId, refName: r.refName || "", refCity: r.refCity || "" } : {}), again: r,
    title: T("Book again", "Pesan lagi") };
}
export function fillAgain(form, ag, { isCorp, hasRef, kindNow, sync }) {
  if (!ag) return;
  const setv = (n, v) => { const el = form.elements[n]; if (el && v != null && v !== "") el.value = String(v); };
  if (form.elements.kind && ag.kind) { setv("kind", ag.kind); sync(); }
  if (isCorp) {
    ["company", "help", "nightsMonth", "purpose", "billing", "budgetRoom", "city", "country"].forEach((k) => setv(k, ag[k]));
  } else if (!hasRef && kindNow() === "hotel") {
    setv("hotelMode", ag.hotelMode); setv("city", ag.city); setv("country", ag.country);
    if (ag.hotelMode === "one") setv("hotelName", ag.refName);
    (ag.stars || []).forEach((n) => { const c = form.querySelector(`[name=stars][value="${n}"]`); if (c) c.checked = true; });
    const pr = `${ag.priceMin ?? ""}-${ag.priceMax ?? ""}`;
    if (form.elements.price && [...form.elements.price.options].some((o) => o.value === pr)) form.elements.price.value = pr;
  } else if (!hasRef) { setv("refName", ag.refName); setv("tcountry", ag.country); }
  setv("adults", ag.adults); setv("children", ag.children); setv("rooms", ag.rooms);
  sync();
}
function requestModal(opts) {
  const m = modal(`<h3 data-en="${opts.title ? esc(opts.title) : "Ask for a quotation"}" data-id="${opts.title ? esc(opts.title) : "Minta penawaran"}">${opts.title ? esc(opts.title) : T("Ask for a quotation", "Minta penawaran")}</h3><p class="sk-sub">${esc(opts.refName || "")}</p><div id="rqHost"></div>`, { wide: false });
  mountRequestForm(m.q("#rqHost"), opts);
}
const PURPOSES = [["staff", "Staff travel", "Perjalanan dinas karyawan"], ["guests", "Visiting guests / clients", "Tamu / klien yang berkunjung"], ["project", "Project team", "Tim proyek"],
  ["group", "Group stay", "Menginap rombongan"], ["event", "Event or meeting", "Acara atau rapat"], ["other", "Other", "Lainnya"]];
// Corporate enquiry: what the company wants first, and roughly how many room nights a month (both optional for the rules)
const HELP = [["meeting", "A short meeting", "Pertemuan singkat"], ["review", "A hotel rate review", "Tinjauan tarif hotel"],
  ["booking", "A quotation for a stay", "Penawaran untuk menginap"], ["onboarding", "Become a corporate client", "Menjadi klien korporat"]];
const NIGHTS = [["", "Not sure yet", "Belum tahu"], ["lt10", "Under 10", "Di bawah 10"], ["10-30", "10 - 30", "10 - 30"], ["31-100", "31 - 100", "31 - 100"], ["gt100", "Over 100", "Lebih dari 100"]];
const ROLES = [["ga", "General Affairs", "General Affairs"], ["hr", "HR", "HR"], ["procurement", "Procurement", "Pengadaan"], ["finance", "Finance", "Keuangan"],
  ["travel", "Travel desk", "Travel desk"], ["management", "Management", "Manajemen"], ["other", "Other", "Lainnya"]];
const BOOKS_NOW = [["ota", "Online travel sites", "Situs travel online"], ["direct", "Directly with hotels", "Langsung ke hotel"], ["agent", "A travel agent", "Agen perjalanan"], ["mixed", "A mix", "Campuran"]];
const SLOTS = [["morning", "Morning (09-12)", "Pagi (09-12)"], ["afternoon", "Afternoon (13-17)", "Siang (13-17)"], ["any", "Any time", "Kapan saja"]];
// tap buttons (one choice) - the Stitch design's selector, in the site's colours
const pills = (name, list, cur = "") => `<div class="pills">${list.map(([v, en, id]) => `<label><input type="radio" name="${name}" value="${v}"${v === cur ? " checked" : ""}><span>${T(en, id)}</span></label>`).join("")}</div>`;
const BILLING = [["transfer", "Bank transfer per booking", "Transfer bank per pemesanan"], ["invoice", "Company invoice", "Tagihan (invoice) perusahaan"], ["other", "Other - see message", "Lainnya - lihat pesan"]];
function mountRequestForm(host, opts = {}) {
  const isCorp = opts.kind === "corporate";
  const helpNow = (typeof opts.help === "function" ? opts.help() : opts.help) || "meeting";
  const base = { kind: opts.kind || "general", refId: opts.refId || "", refName: opts.refName || "", refCity: opts.refCity || "" };
  const waText = () => T("Hello Satu Koneksi Hotel, I'd like a quotation", "Halo Satu Koneksi Hotel, saya ingin minta penawaran") + (base.refName ? T(" for ", " untuk ") + base.refName : "") + ".";
  const waBtn = (cls = "wa") => `<a class="sk-btn ${cls}" target="_blank" rel="noopener" href="${wa(waText())}">💬 ${T("Ask on WhatsApp instead", "Tanya lewat WhatsApp saja")}</a>`;
  let unsub = null, busy = false, done = false;
  const draw = async (user) => {
    if (!host.isConnected) { unsub?.(); return; }
    if (busy || done) return;                       // the guest sign-in while sending must not redraw the form or the thank-you
    // owner 6 Nov: no account needed - a visitor sends the request with name + WhatsApp (a temporary guest sign-in happens on Send)
    const guestMode = !user || user.isAnonymous;
    if (!guestMode && !user.emailVerified) {
      host.innerHTML = `<div class="boxcard"><div class="notice"><b>${T("Please verify your e-mail first.", "Mohon verifikasi e-mail Anda dulu.")}</b> ${T("We sent a link to", "Kami mengirim tautan ke")} <u>${esc(user.email)}</u>. ${T("Open it, then press the button below.", "Buka tautan itu, lalu tekan tombol di bawah.")}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="sk-btn gold" type="button" data-ok>${T("I've verified my e-mail", "Saya sudah verifikasi")}</button><button class="sk-btn" type="button" data-re>${T("Send the e-mail again", "Kirim ulang e-mail")}</button>${waBtn("line")}</div></div>`;
      $("[data-re]", host).onclick = async () => { try { await resendVerification(); toast(T("Sent again.", "Sudah dikirim ulang.")); } catch { toast(T("Please wait a moment and try again.", "Tunggu sebentar lalu coba lagi."), "err"); } };
      $("[data-ok]", host).onclick = async () => { const u = await refreshUser(); if (u?.emailVerified) draw(u); else toast(T("Not verified yet - please click the link in the e-mail.", "Belum terverifikasi - klik tautan di e-mail."), "err"); };
      return;
    }
    let prof = {}; if (!guestMode) try { const s = await F.getDoc(F.doc(db, "customers", user.uid)); if (s.exists()) prof = s.data(); } catch { /* ignore */ }
    const shownAt = Date.now();
    const today = C.todayStr(), isTour = () => ($("[name=kind]", host)?.value || base.kind) === "tour";
    const num = (n, from, one, many) => Array.from({ length: n - from + 1 }, (_, i) => `<option value="${i + from}">${i + from} ${i + from === 1 ? one : many}</option>`).join("");
    host.innerHTML = `<form class="skf" id="rq" novalidate>
      ${base.kind === "general" ? `<label>${T("I am interested in", "Saya tertarik pada")}<select name="kind"><option value="hotel">${T("A hotel stay", "Menginap di hotel")}</option><option value="tour">${T("A tour package", "Paket tur")}</option><option value="general">${T("Something else", "Lainnya")}</option></select></label>` : ""}
      ${isCorp ? `<div class="row2"><label>${T("Company name", "Nama perusahaan")}<input name="company" required maxlength="120" value="${esc(prof.company || "")}" autocomplete="organization"></label>
        <label>${T("How can we help?", "Apa yang bisa kami bantu?")}<select name="help">${HELP.map(([v, en, id]) => `<option value="${v}"${v === helpNow ? " selected" : ""}>${T(en, id)}</option>`).join("")}</select></label></div>
        <div data-meet><div class="fl">${T("Meeting format", "Bentuk pertemuan")}<div class="optcards">
          <label><input type="radio" name="meetFormat" value="online" checked><span><b>${T("Online video call", "Panggilan video online")}</b><small>Google Meet / Zoom · ${T("about 20 minutes", "sekitar 20 menit")}</small></span></label>
          <label><input type="radio" name="meetFormat" value="office"><span><b>${T("At your office", "Di kantor Anda")}</b><small>${T("We confirm if we can come to your city", "Kami konfirmasi apakah bisa datang ke kota Anda")}</small></span></label></div></div>
          <div class="row2"><label>${T("Preferred date", "Tanggal yang diinginkan")}<input name="meetDate" type="date" min="${today}"></label>
          <div class="fl">${T("Preferred time", "Waktu yang diinginkan")}${pills("meetSlot", SLOTS, "any")}</div></div></div>
        <div class="fl">${T("Your role", "Peran Anda")} <small style="text-transform:none;letter-spacing:0;font-weight:500">(${T("optional", "opsional")})</small>${pills("role", ROLES)}</div>
        <div class="row2"><label>${T("Main destination", "Tujuan utama")}<input name="city" required maxlength="80" placeholder="${T("e.g. Jakarta - Sudirman, Balikpapan", "mis. Jakarta - Sudirman, Balikpapan")}"></label>
        <label>${T("Country", "Negara")}<input name="country" maxlength="60" value="Indonesia" list="skCountries"></label></div>
        <datalist id="skCountries">${(lang() === "id" ? COUNTRIES_ID : COUNTRIES).map((c) => `<option value="${c}">`).join("")}</datalist>` : base.refName ? `<div class="notice" style="background:#eef7f1;border-color:#bfe0cb;color:#1e3a3a">${T("For:", "Untuk:")} <b>${esc(base.refName)}</b>${base.refCity ? " · " + esc(base.refCity) : ""}</div>` : `
      <div data-show="hotel">
        <label>${T("Hotel", "Hotel")}<select name="hotelMode"><option value="any">${T("Any hotel - show me the best options", "Hotel apa saja - tunjukkan pilihan terbaik")}</option><option value="one">${T("A specific hotel", "Hotel tertentu")}</option></select></label>
        <label data-hname>${T("Hotel name", "Nama hotel")}<input name="hotelName" maxlength="160" placeholder="${T("e.g. Aryaduta Palembang", "mis. Aryaduta Palembang")}"></label>
        <div class="row2"><label>${T("City", "Kota")}<input name="city" maxlength="80" value="${esc(base.refCity)}" placeholder="${T("e.g. Bali, Jakarta, Penang", "mis. Bali, Jakarta, Penang")}" autocomplete="address-level2"></label>
        <label>${T("Country", "Negara")}<input name="country" maxlength="60" value="${esc(opts.country || "Indonesia")}" list="skCountries" autocomplete="country-name"></label></div>
        <div class="row2"><div class="fl">${T("How many stars", "Berapa bintang")}<span class="starpick">${[5, 4, 3, 2].map((n) => `<label class="chk"><input type="checkbox" name="stars" value="${n}"><span>${n}★</span></label>`).join("")}</span><small style="text-transform:none;letter-spacing:0;font-weight:500">${T("Tick none = any", "Tidak dicentang = semua")}</small></div>
        <label>${T("Price range per room per night", "Kisaran harga per kamar per malam")}<select name="price">${PRICE_RANGES.map(([v, en, id]) => `<option value="${v}">${T(en, id)}</option>`).join("")}</select></label></div>
      </div>
      <div data-show="tour,general"><label><span data-what>${T("Tour or destination you have in mind", "Paket tur atau tujuan yang Anda inginkan")}</span><input name="refName" maxlength="160" placeholder="${T("e.g. Labuan Bajo 3 days", "mis. Labuan Bajo 3 hari")}"></label>
        <label>${T("Country", "Negara")}<input name="tcountry" maxlength="60" value="Indonesia" list="skCountries"></label></div>
      <datalist id="skCountries">${(lang() === "id" ? COUNTRIES_ID : COUNTRIES).map((c) => `<option value="${c}">`).join("")}</datalist>`}
      <div class="row2"><label>${isCorp ? T("Contact person", "Narahubung") : T("Your name", "Nama Anda")}<input name="name" required maxlength="100" value="${esc(prof.displayName || user?.displayName || "")}" autocomplete="name"></label>
      <label>${T("WhatsApp number", "Nomor WhatsApp")}<input name="whatsapp" required type="tel" maxlength="30" value="${esc(prof.phone || "")}" placeholder="+62 …" autocomplete="tel"></label></div>
      ${isCorp ? "<div class=\"row2\">" : ""}<label>${isCorp ? T("Business e-mail", "E-mail kantor") : T("E-mail", "E-mail")}<input name="email" type="email" maxlength="120" value="${esc(user?.email || "")}" autocomplete="email"${isCorp ? " required" : ""}></label>
      ${isCorp ? `</div><div class="fl">${T("Room nights a month (estimate)", "Malam kamar per bulan (perkiraan)")}${pills("nightsMonth", NIGHTS, "")}</div>
      <div class="fl">${T("How do you book hotels now?", "Bagaimana Anda memesan hotel saat ini?")} <small style="text-transform:none;letter-spacing:0;font-weight:500">(${T("optional", "opsional")})</small>${pills("booksNow", BOOKS_NOW)}</div>
      <details class="cdet"${helpNow === "booking" ? " open" : ""}><summary>${T("Stay details (optional)", "Detail menginap (opsional)")}</summary>` : ""}
      <div class="row2"><label><span data-ci>${T("Check-in / start date", "Check-in / tanggal mulai")}</span><input name="checkIn" type="date" min="${today}"></label><label>${T("Check-out / end date", "Check-out / tanggal selesai")}<input name="checkOut" type="date" min="${today}"></label></div>
      ${isCorp ? `<div class="row2"><label>${T("Number of guests", "Jumlah tamu")}<input name="adults" type="number" min="1" max="400" value="1"></label>
      <label data-rooms>${T("Number of rooms", "Jumlah kamar")}<input name="rooms" type="number" min="1" max="200" value="1"></label></div>
      <div class="row2"><label>${T("Budget per room per night (Rp)", "Anggaran per kamar per malam (Rp)")}<input name="budgetRoom" type="number" min="0" step="50000" placeholder="${T("e.g. 900000", "mis. 900000")}"></label>
      <label>${T("Billing", "Penagihan")}<select name="billing"><option value="">—</option>${BILLING.map(([v, en, id]) => `<option value="${v}">${T(en, id)}</option>`).join("")}</select></label></div>
      <label>${T("Purpose of the stay", "Tujuan menginap")}<select name="purpose"><option value="">—</option>${PURPOSES.map(([v, en, id]) => `<option value="${v}">${T(en, id)}</option>`).join("")}</select></label></details>` : `<div class="row3"><label>${T("Adults", "Dewasa")}<select name="adults">${num(30, 1, T("adult", "dewasa"), T("adults", "dewasa"))}</select></label>
      <label>${T("Children", "Anak")}<select name="children">${num(20, 0, T("child", "anak"), T("children", "anak"))}</select></label>
      <label data-rooms>${T("Rooms", "Kamar")}<select name="rooms">${num(10, 1, T("room", "kamar"), T("rooms", "kamar"))}</select></label></div>`}
      <label>${isCorp ? T("Additional requirements (optional)", "Kebutuhan tambahan (opsional)") : T("Message (optional)", "Pesan (opsional)")}<textarea name="message" maxlength="2000" placeholder="${isCorp ? T("Room types, breakfast, invoice details, names for the rooming list…", "Tipe kamar, sarapan, detail invoice, nama untuk daftar kamar…") : T("Budget, preferences, questions…", "Anggaran, preferensi, pertanyaan…")}"></textarea></label>
      <label class="chk"><input type="checkbox" name="consent" required><span>${T("I agree that Satu Koneksi Hotel keeps this information to answer my request.", "Saya setuju Satu Koneksi Hotel menyimpan informasi ini untuk menjawab permintaan saya.")} <a href="/privacy-policy" target="_blank" rel="noopener" style="color:var(--gold)">${T("Privacy Policy", "Kebijakan Privasi")}</a></span></label>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <p class="sk-err" id="rqErr"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="sk-btn gold" type="submit" id="rqGo">${T("Send request", "Kirim permintaan")}</button>${waBtn("line")}</div></form>`;
    if (guestMode) {
      host.insertAdjacentHTML("afterbegin", `<p class="notice" style="margin-bottom:14px">${T("No account needed - we reply on WhatsApp.", "Tidak perlu akun - kami membalas lewat WhatsApp.")}
        <button class="sk-btn sm line" type="button" data-signin style="margin-left:6px">${T("Sign in to follow it online", "Masuk untuk memantau secara online")}</button></p>`);
      $("[data-signin]", host).onclick = () => openAuth({ reason: T("Sign in so you can follow your request.", "Masuk agar Anda dapat memantau permintaan Anda.") });
    }
    const form = $("#rq", host), ci = form.checkIn, co = form.checkOut;
    const kindNow = () => ($("[name=kind]", host)?.value || base.kind);
    const sync = () => {
      const k = kindNow();
      $("[data-rooms]", host).style.display = isTour() ? "none" : "";
      $$("[data-show]", host).forEach((el) => { el.style.display = el.dataset.show.split(",").includes(k === "hotel" ? "hotel" : k) ? "" : "none"; });
      const hn = $("[data-hname]", host); if (hn) hn.style.display = form.hotelMode?.value === "one" ? "" : "none";
      const w = $("[data-what]", host); if (w) w.textContent = k === "tour" ? T("Tour or destination you have in mind", "Paket tur atau tujuan yang Anda inginkan") : T("What can we help you with?", "Apa yang bisa kami bantu?");
    };
    form.kind?.addEventListener("change", sync); form.hotelMode?.addEventListener("change", sync); sync();
    if (isCorp && form.help) {
      const hint = () => { const h = form.help.value, d = $(".cdet", host), mt = $("[data-meet]", host); if (mt) mt.style.display = h === "meeting" ? "" : "none";
        form.message.placeholder = h === "review" ? T("Which hotels and cities do you use now, and at what rates? We compare and reply.", "Hotel dan kota mana yang Anda pakai sekarang, dan berapa tarifnya? Kami bandingkan dan balas.")
          : h === "meeting" ? T("A good day and time for a short call or meeting.", "Hari dan jam yang cocok untuk telepon singkat atau pertemuan.")
          : T("Room types, breakfast, invoice details, names for the rooming list…", "Tipe kamar, sarapan, detail invoice, nama untuk daftar kamar…");
        if (h === "booking" && d) d.open = true; };
      form.help.addEventListener("change", hint); hint();
    }
    ci.onchange = () => { if (ci.value) { const d = new Date(ci.value + "T12:00:00"); d.setDate(d.getDate() + 1); co.min = d.toISOString().slice(0, 10); if (co.value && co.value <= ci.value) co.value = ""; } };
    const isoOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && v >= ci.min;     // dates from a Festivals & events "Ask for a quotation" button
    if (isoOk(opts.checkIn) && !ci.value) { ci.value = opts.checkIn; ci.onchange(); if (isoOk(opts.checkOut) && opts.checkOut > opts.checkIn) co.value = opts.checkOut; }
    if (opts.adults && form.adults) form.adults.value = String(opts.adults);                 // from "Price for your dates"
    if (opts.rooms && form.rooms) form.rooms.value = String(opts.rooms);
    if (opts.message && form.message && !form.message.value) form.message.value = String(opts.message).slice(0, 2000);       // e.g. a member price request
    fillAgain(form, opts.again, { isCorp, hasRef: !!base.refName, kindNow, sync });
    form.onsubmit = async (ev) => {
      ev.preventDefault(); const err = (t) => { $("#rqErr", host).textContent = t; }; err("");
      const f = new FormData(form), s = (k) => String(f.get(k) || "").trim();
      if (!s("name")) return err(T("Please enter your name.", "Isi nama Anda."));
      if (s("whatsapp").replace(/\D/g, "").length < 7) return err(T("Please enter a WhatsApp number we can reach you on.", "Isi nomor WhatsApp yang bisa kami hubungi."));
      if (!form.consent.checked) return err(T("Please tick the box to agree.", "Centang kotak persetujuan."));
      if (s("checkIn") && s("checkOut") && s("checkOut") <= s("checkIn")) return err(T("Check-out must be after check-in.", "Check-out harus setelah check-in."));
      if (isCorp && s("company").length < 2) return err(T("Please enter the company name.", "Isi nama perusahaan."));
      if (isCorp && !s("city")) return err(T("Please enter the destination or project location.", "Isi tujuan atau lokasi proyek."));
      if (isCorp && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s("email"))) return err(T("Please enter a business e-mail.", "Isi e-mail kantor."));
      const kind = base.kind === "general" ? s("kind") || "general" : base.kind;
      const data = { kind, name: s("name").slice(0, 100), whatsapp: s("whatsapp").slice(0, 30), email: s("email").slice(0, 120), adults: +s("adults") || 1, children: +s("children") || 0 };
      if (kind !== "tour") data.rooms = +s("rooms") || 1;
      if (isCorp) {
        data.adults = Math.min(400, Math.max(1, Math.round(+s("adults") || 1))); data.rooms = Math.min(200, Math.max(1, Math.round(+s("rooms") || 1))); delete data.children;
        Object.assign(data, { company: s("company").slice(0, 120), refName: s("company").slice(0, 160), city: s("city").slice(0, 80), country: s("country").slice(0, 60) || "Indonesia",
          help: HELP.some(([v]) => v === s("help")) ? s("help") : "meeting" });
        if (s("purpose")) data.purpose = s("purpose"); if (s("billing")) data.billing = s("billing");
        if (NIGHTS.some(([v]) => v && v === s("nightsMonth"))) data.nightsMonth = s("nightsMonth");
        const b = Math.round(+s("budgetRoom") || 0); if (b > 0) data.budgetRoom = Math.min(b, 100000000);
      }
      if (s("checkIn")) data.checkIn = s("checkIn"); if (s("checkOut")) data.checkOut = s("checkOut");
      if (!isCorp && !base.refName && kind === "hotel") {
        const mode = s("hotelMode") === "one" ? "one" : "any", city = s("city").slice(0, 80), country = s("country").slice(0, 60);
        if (mode === "one" && !s("hotelName")) return err(T("Please type the hotel name.", "Isi nama hotel."));
        if (mode === "any" && !city) return err(T("Please type the city.", "Isi nama kota."));
        const stars = f.getAll("stars").map(Number).filter(Boolean), [pmin, pmax] = String(s("price") || "-").split("-").map((x) => (x === "" ? null : +x));
        Object.assign(data, { hotelMode: mode, country });
        if (city) data.city = city;
        if (stars.length) data.stars = stars;
        if (pmin != null && !isNaN(pmin)) data.priceMin = pmin; if (pmax != null && !isNaN(pmax)) data.priceMax = pmax;
        data.refName = (mode === "one" ? s("hotelName") : T("Any hotel", "Hotel apa saja") + (stars.length ? ` (${stars.join("/")}★)` : "") + (city ? T(" in ", " di ") + city : "")).slice(0, 160);
        if (city) data.refCity = city;
      } else if (!isCorp && !base.refName) {
        if (s("refName")) data.refName = s("refName").slice(0, 160);
        if (s("tcountry")) data.country = s("tcountry").slice(0, 60);
      } else if (!isCorp) data.refName = base.refName.slice(0, 160);
      if (base.refId) data.refId = base.refId; if (base.refCity) data.refCity = base.refCity.slice(0, 80);
      if (isCorp) {
        const pick = (list, v) => (list.find(([k]) => k === v) || [])[1] || "";
        const lines = [data.help === "meeting" ? `Meeting: ${s("meetFormat") === "office" ? "at their office" : "online video call"}${s("meetDate") ? ", preferred " + s("meetDate") : ""}${s("meetSlot") && s("meetSlot") !== "any" ? ", " + pick(SLOTS, s("meetSlot")) : ""}` : "",
          pick(ROLES, s("role")) ? `Role: ${pick(ROLES, s("role"))}` : "", pick(BOOKS_NOW, s("booksNow")) ? `Books hotels now via: ${pick(BOOKS_NOW, s("booksNow"))}` : ""].filter(Boolean);
        const msg = [lines.join("\n"), s("message")].filter(Boolean).join("\n\n");
        if (msg) data.message = msg.slice(0, 2000);
      } else if (s("message")) data.message = s("message");
      const go = $("#rqGo", host); go.disabled = true;
      const thanks = (guest) => `<div class="okbox"><h3>✓ ${T("Thank you!", "Terima kasih!")}</h3><p>${guest
          ? T("Your request was sent. We will contact you on WhatsApp soon.", "Permintaan Anda terkirim. Kami akan segera menghubungi Anda lewat WhatsApp.")
          : T("Your request was sent. We will contact you on WhatsApp. You can follow it in your account.", "Permintaan Anda terkirim. Kami akan menghubungi Anda lewat WhatsApp. Anda bisa memantaunya di akun Anda.")}</p>
          <div class="mt" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${guest ? "" : `<a class="sk-btn gold" href="/account">${T("See my requests", "Lihat permintaan saya")}</a>`}<a class="sk-btn" href="/">${T("Back to home", "Kembali ke beranda")}</a></div></div>`;
      if (guestMode && (s("website") || Date.now() - shownAt < 3000)) { done = true; host.innerHTML = thanks(true); return; }   // a robot: filled the hidden box or was too fast
      busy = true;
      try {
        if (guestMode) {
          try { await guestSignIn(); } catch (e) {
            console.error(e); busy = false; go.disabled = false;
            return err(T("Sorry, sending without an account is not possible right now. Please use WhatsApp, or sign in.", "Maaf, mengirim tanpa akun belum bisa saat ini. Gunakan WhatsApp, atau masuk."));
          }
        }
        await createRequest(data);
        window.skTrack?.("generate_lead", { form: isCorp ? "corporate" : "booking", with_account: !guestMode });   // Google Analytics: no personal data
        if (!guestMode) ensureProfile(user, { displayName: data.name, phone: data.whatsapp, consentAt: F.serverTimestamp(), ...(isCorp ? { company: data.company } : {}) }).catch(() => {});
        if (guestMode) try { localStorage.setItem("skGuestSent", "1"); } catch { /* private mode */ }
        done = true; host.innerHTML = thanks(guestMode);
      } catch (e) {
        console.error(e); busy = false; go.disabled = false;
        let sent = false; try { sent = !!localStorage.getItem("skGuestSent"); } catch { /* private mode */ }
        err(guestMode && sent && /permission/i.test(String(e?.code || e))
          ? T("You have already sent a request from this browser - we will contact you on WhatsApp. For another request, please sign in or use WhatsApp.", "Anda sudah mengirim permintaan dari browser ini - kami akan menghubungi Anda lewat WhatsApp. Untuk permintaan lain, silakan masuk atau gunakan WhatsApp.")
          : T("Sorry, your request could not be sent. Please try again, or use WhatsApp.", "Maaf, permintaan tidak terkirim. Coba lagi, atau gunakan WhatsApp."));
      }
    };
  };
  unsub = onUser(draw);
  const relang = async () => {
    if (!host.isConnected) { removeEventListener("sk-lang", relang); return; }
    if ($(".okbox", host)) return;   // already sent: keep the thank-you message
    const restore = keepForms(host); await draw(auth.currentUser); restore();
  };
  addEventListener("sk-lang", relang);
}

// ================================================================ hotels page
// From the list files (fast): the first cards come from index.json (the fast first draw has usually shown them already); the slim rows
// (search, filters, order) and the card files are read only when the visitor searches, filters or wants more. No files -> the database.
async function hotels() {
  const idx = await listIndex();
  if (!idx) return hotelsFromDatabase();
  const app = $("#app"); const st = { q: qs("q") || "", region: "", type: "", shown: 24 };   // ?q= comes from the home page search box
  let opened = false, seq = 0;
  priceOn = !!idx.priceOn;                                   // the first draw does not wait for the database; checked right after
  HOTELS = null;
  const match = (h) => (!st.region || h.region === st.region) && (!st.type || h.type === st.type) && (!st.q || [h.name, h.city, h.country].join(" ").toLowerCase().includes(st.q.toLowerCase()));
  const empty = () => `<div class="empty"><h3>${idx.count ? T("No hotel matches your search", "Tidak ada hotel yang cocok") : T("Our hotel list is being prepared", "Daftar hotel kami sedang disiapkan")}</h3><p>${T("Tell us where and when you want to stay - we compare hotels for you.", "Beri tahu kami ke mana dan kapan Anda ingin menginap - kami bandingkan hotel untuk Anda.")}</p><p class="mt"><button class="sk-btn gold" type="button" data-general>${T("Ask for a quotation", "Minta penawaran")}</button> <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I'm looking for a hotel.", "Halo Satu Koneksi Hotel, saya mencari hotel."))}">💬 WhatsApp</a></p></div>`;
  const draw = async () => {
    const my = ++seq, wide = st.q || st.region || st.type || st.shown > idx.first.length;
    const ids = wide ? (await listSlim()).filter(match).map((h) => h.id) : idx.first.map((h) => h.id);
    const list = await listCards(ids.slice(0, st.shown));
    if (my !== seq) return;                                 // the visitor typed again meanwhile
    app.innerHTML = hotelsPageHTML({ list, total: wide ? ids.length : idx.count, regions: idx.regions || [], types: idx.types || [], st, priceOn, signedIn: !!auth.currentUser, empty: empty() });
    app.dataset.live = "1";
    const fq = $("#fq"); fq.oninput = () => { st.q = fq.value; st.shown = 24; const pos = fq.selectionStart; draw().then(() => { const n = $("#fq"); if (n && n !== fq) { n.focus(); n.setSelectionRange(pos, pos); } }); };
    $("#fr") && ($("#fr").onchange = (e) => { st.region = e.target.value; st.shown = 24; draw(); }); $("#ft") && ($("#ft").onchange = (e) => { st.type = e.target.value; st.shown = 24; draw(); });
    $("#hmore") && ($("#hmore").onclick = () => { st.shown += 24; draw(); });
    $$("[data-open]", app).forEach((a) => a.onclick = (e) => { e.preventDefault(); openHotel(a.dataset.open); });
    $$("[data-d]", app).forEach((b) => b.onclick = () => openHotel(b.dataset.d));
    $$("[data-pp]", app).forEach((b) => b.onclick = () => openHotel(b.dataset.pp, "price"));
    $$("[data-mp]", app).forEach((b) => b.onclick = () => memberPrice(b.dataset.mp));
    $$("[data-q]", app).forEach((b) => b.onclick = () => { const h = LIST.have[b.dataset.q] || {}; requestModal({ kind: "hotel", refId: h.id || b.dataset.q, refName: h.name || "", refCity: h.city || "" }); });
    const g = $("[data-general]", app); if (g) g.onclick = () => requestModal({ kind: "general" });
    lazyCovers(app);
  };
  await draw(); redraw(draw); osmSection(listSlim);
  checkPriceOn().then(() => { if (priceOn !== !!idx.priceOn) draw(); });   // the price buttons follow Admin -> Price rules (one read, after the cards are up)
  const id = qs("h"); if (id && !opened) { opened = true; const p = qs("p"); if (p === "m") memberPrice(id); else openHotel(id, p ? "price" : ""); }
}
async function hotelsFromDatabase() {                        // the old way: the compact list from the database (only when the list files are missing)
  const app = $("#app"); const all = await loadHotelList(); const st = { q: new URLSearchParams(location.search).get("q") || "", region: "", type: "", shown: 24 };   // ?q= comes from the home page search box
  let opened = false;
  await checkPriceOn();
  HOTELS = all;
  const draw = () => {
    const regions = [...new Set(all.map((h) => h.region).filter(Boolean))], types = [...new Set(all.map((h) => h.type).filter(Boolean))];
    const list = all.filter((h) => (!st.region || h.region === st.region) && (!st.type || h.type === st.type) && (!st.q || [h.name, h.city, h.country].join(" ").toLowerCase().includes(st.q.toLowerCase())));
    app.innerHTML = `<div class="bar"><input id="fq" type="search" value="${esc(st.q)}" placeholder="${T("Search hotel or city…", "Cari hotel atau kota…")}">
      ${regions.length > 1 ? `<select id="fr"><option value="">${T("All regions", "Semua wilayah")}</option>${regions.map((r) => `<option${st.region === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}
      ${types.length > 1 ? `<select id="ft"><option value="">${T("All types", "Semua jenis")}</option>${types.map((r) => `<option${st.type === r ? " selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}</div>
      ${list.length ? `<div class="grid hgrid">${list.slice(0, st.shown).map((h) => hotelCard(h, "page")).join("")}</div>${list.length > st.shown ? `<div class="ctr mt"><p class="meta">${T("Showing", "Menampilkan")} ${st.shown} ${T("of", "dari")} ${list.length}</p><button class="sk-btn" type="button" id="hmore">${T("Show more hotels", "Tampilkan lebih banyak hotel")}</button></div>` : ""}` : `<div class="empty"><h3>${all.length ? T("No hotel matches your search", "Tidak ada hotel yang cocok") : T("Our hotel list is being prepared", "Daftar hotel kami sedang disiapkan")}</h3><p>${T("Tell us where and when you want to stay - we compare hotels for you.", "Beri tahu kami ke mana dan kapan Anda ingin menginap - kami bandingkan hotel untuk Anda.")}</p><p class="mt"><button class="sk-btn gold" type="button" data-general>${T("Ask for a quotation", "Minta penawaran")}</button> <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I'm looking for a hotel.", "Halo Satu Koneksi Hotel, saya mencari hotel."))}">💬 WhatsApp</a></p></div>`}`;
    const fq = $("#fq"); fq.oninput = () => { st.q = fq.value; st.shown = 24; const pos = fq.selectionStart; draw(); const n = $("#fq"); n.focus(); n.setSelectionRange(pos, pos); };
    $("#fr") && ($("#fr").onchange = (e) => { st.region = e.target.value; st.shown = 24; draw(); }); $("#ft") && ($("#ft").onchange = (e) => { st.type = e.target.value; st.shown = 24; draw(); });
    $("#hmore") && ($("#hmore").onclick = () => { st.shown += 24; draw(); });
    $$("[data-open]", app).forEach((a) => a.onclick = (e) => { e.preventDefault(); openHotel(a.dataset.open); });
    $$("[data-d]", app).forEach((b) => b.onclick = () => openHotel(b.dataset.d));
    $$("[data-pp]", app).forEach((b) => b.onclick = () => openHotel(b.dataset.pp, "price"));
    $$("[data-mp]", app).forEach((b) => b.onclick = () => memberPrice(b.dataset.mp));
    $$("[data-q]", app).forEach((b) => b.onclick = () => { const h = all.find((x) => x.id === b.dataset.q); requestModal({ kind: "hotel", refId: h.id, refName: h.name, refCity: h.city || "" }); });
    const g = $("[data-general]", app); if (g) g.onclick = () => requestModal({ kind: "general" });
    lazyCovers(app);
  };
  draw(); redraw(draw); osmSection(all);
  const id = qs("h"); if (id && !opened) { opened = true; const p = qs("p"); if (p === "m") memberPrice(id); else openHotel(id, p ? "price" : ""); }
}


// ---------------- more hotels in Indonesia (OpenStreetMap names + map positions, no prices) ----------------
async function osmSection(ownHotels = []) {
  let hidden = null;                                                        // hotels we list ourselves are not shown twice (a list, or a function that loads it)
  const getHidden = async () => hidden || (hidden = new Set((typeof ownHotels === "function" ? await ownHotels() : ownHotels).map((h) => h.osmId).filter(Boolean)));
  const host = $("#osm"); if (!host) return;
  let idx; try { idx = await (await fetch("/data/hotels/index.json")).json(); } catch { return; }
  if (!idx?.length) return;
  const cache = {}, st = { island: "", slug: "", q: "", shown: 30, only: "" };
  const qs = new URLSearchParams(location.search);   // e.g. /hotel-directory?area=yogyakarta or ?island=Bali  (&q=hotel name from the home search box)
  st.q = qs.get("q") || "";
  const pre = idx.find((a) => a.slug === qs.get("area")), isl = idx.find((a) => a.island === qs.get("island"));
  if (pre) { st.island = pre.island; st.slug = pre.slug; } else if (isl) st.island = isl.island;
  if (pre || isl) setTimeout(() => host.scrollIntoView({ behavior: "smooth" }), 300);
  const islands = [...new Set(idx.map((a) => a.island))], ctry = (i) => idx.find((a) => a.island === i)?.country || "Indonesia";
  const TYPES = { "Guest house": ["Guest house", "Penginapan"], Hostel: ["Hostel", "Hostel"], Motel: ["Motel", "Motel"], Apartment: ["Apartment", "Apartemen"], "Chalet / bungalow": ["Chalet / bungalow", "Chalet / bungalow"], Resort: ["Resort", "Resor"] };
  const load = async (slug) => { if (!cache[slug]) { try { cache[slug] = await (await fetch(`/data/hotels/${slug}.json`)).json(); } catch { cache[slug] = []; } } return cache[slug]; };
  const draw = async () => {
    const areas = idx.filter((a) => !st.island || a.island === st.island);
    const area = idx.find((a) => a.slug === st.slug);
    const hid = st.slug ? await getHidden() : null;
    let list = st.slug ? (await load(st.slug)).filter((h) => !hid.has(h.id)) : [];
    if (st.q) list = list.filter((h) => h.n.toLowerCase().includes(st.q.toLowerCase()));
    if (st.only) list = list.filter((h) => !h.t || h.t === "Resort");
    const page = list.slice(0, st.shown);
    const pic = (h) => {
      if (h.ph?.length) return `<div class="ph"><img loading="lazy" src="${esc(h.ph[0])}" alt="${esc(h.n)}"><span class="tag">${T("Hotel photo", "Foto hotel")}</span></div>
        <div class="cr">${T("Photo provided by the hotel.", "Foto dari pihak hotel.")}</div>`;
      const pool = area?.photos || [], pick = [...String(h.id)].reduce((s, c) => s + c.charCodeAt(0), 0) % (pool.length || 1);
      const ph = h.p || pool[pick]; if (!ph) return `<div class="ph">🏨</div>`;
      const own = !!h.p, label = own ? T("Hotel photo", "Foto hotel") : T("Area photo", "Foto area") + (ph.sub ? " · " + esc(ph.sub) : "");
      return `<div class="ph"><img loading="lazy" src="${esc(ph.u)}" alt="${own ? esc(h.n) : T("Area photo, not the hotel", "Foto area, bukan foto hotel")}"><span class="tag">${label}</span></div>
        <div class="cr">${own ? "" : T("Not the hotel. ", "Bukan foto hotel. ")}${T("Photo", "Foto")}: <a href="${esc(ph.pg)}" target="_blank" rel="noopener">${esc(ph.by)}</a>, ${esc(ph.lic)}, Wikimedia Commons</div>`;
    };
    const card = (h, i) => `<article class="card osm">${pic(h)}<div class="bd"><h3>${esc(h.n)}</h3>${h.t ? `<div class="meta" style="font-weight:700;color:var(--teal2)">${esc(T(...(TYPES[h.t] || [h.t, h.t])))}</div>` : ""}${h.s ? `<div class="stars">${"★".repeat(Math.round(h.s))}</div>` : ""}<div class="meta">📍 ${esc(area?.area || "")}${h.a ? " · " + esc(h.a) : ""}</div>${h.f ? `<div class="am">${h.f.split("; ").slice(0, 3).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="act"><button class="sk-btn gold sm" type="button" data-oq="${i}">${T("Ask for a quotation", "Minta penawaran")}</button><a class="sk-btn sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${h.la}&mlon=${h.lo}#map=17/${h.la}/${h.lo}">${T("Map", "Peta")}</a>${h.w ? `<a class="sk-btn sm" target="_blank" rel="noopener nofollow" href="${esc(h.w)}">${T("Website", "Situs")}</a>` : ""}</div></div></article>`;
    const body = !st.slug ? `<div class="empty"><p>${T("Choose a city or area above to see its hotels.", "Pilih kota atau area di atas untuk melihat hotelnya.")}</p></div>`
      : !page.length ? `<div class="empty"><h3>${T("No hotel matches", "Tidak ada hotel yang cocok")}</h3></div>`
      : `<div class="grid">${page.map(card).join("")}</div>${list.length > st.shown ? `<p class="ctr mt"><button class="sk-btn" type="button" id="more">${T("Show more", "Tampilkan lebih banyak")} (${list.length - st.shown})</button></p>` : ""}`;
    host.innerHTML = `<div class="osmhead"><div class="kicker" style="font:800 12px 'Plus Jakarta Sans';letter-spacing:.26em;color:var(--gold);text-transform:uppercase;margin-bottom:8px">${T("Indonesia & South-East Asia", "Indonesia & Asia Tenggara")}</div>
      <h2>${T("More hotels and stays you can ask us about", "Hotel dan penginapan lain yang bisa Anda tanyakan")}</h2>
      <p>${T("Hotels, guest houses and other stays in Indonesia, Malaysia, Singapore, Brunei and Thailand, from OpenStreetMap. We don't show prices here - pick a hotel, ask for a quotation and we check the current rate for you.", "Hotel, penginapan, dan tempat menginap lain di Indonesia, Malaysia, Singapura, Brunei, dan Thailand, dari OpenStreetMap. Harga tidak ditampilkan di sini - pilih hotel, minta penawaran, dan kami cek tarif terbaru untuk Anda.")}</p></div>
      <div class="bar"><select id="oi"><option value="">${T("All islands & countries", "Semua pulau & negara")}</option><optgroup label="Indonesia">${islands.filter((i) => ctry(i) === "Indonesia").map((i) => `<option${st.island === i ? " selected" : ""}>${esc(i)}</option>`).join("")}</optgroup><optgroup label="${T("Other countries", "Negara lain")}">${islands.filter((i) => ctry(i) !== "Indonesia").map((i) => `<option${st.island === i ? " selected" : ""}>${esc(i)}</option>`).join("")}</optgroup></select>
      <select id="oa"><option value="">${T("Choose a city or area…", "Pilih kota atau area…")}</option>${areas.map((a) => `<option value="${a.slug}"${st.slug === a.slug ? " selected" : ""}>${esc(a.area)} (${a.count})</option>`).join("")}</select>
      ${st.slug ? `<select id="ot"><option value="">${T("All stays", "Semua penginapan")}</option><option value="h"${st.only ? " selected" : ""}>${T("Hotels & resorts only", "Hanya hotel & resor")}</option></select><input id="oq" type="search" value="${esc(st.q)}" placeholder="${T("Search by hotel name…", "Cari nama hotel…")}">` : ""}</div>
      ${body}
      <p class="osm-credit">${T("Hotel names and map positions", "Nama hotel dan posisi peta")} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. ${T("Details may be incomplete or out of date.", "Data bisa belum lengkap atau sudah berubah.")}</p>`;
    $("#oi").onchange = (e) => { st.island = e.target.value; st.slug = ""; st.q = ""; st.shown = 30; draw(); };
    $("#oa").onchange = (e) => { st.slug = e.target.value; st.q = ""; st.shown = 30; draw(); };
    if ($("#ot")) $("#ot").onchange = (e) => { st.only = e.target.value; st.shown = 30; draw(); };
    const oq = $("#oq"); if (oq) oq.oninput = () => { st.q = oq.value; st.shown = 30; const pos = oq.selectionStart; draw().then(() => { const n = $("#oq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); };
    const more = $("#more"); if (more) more.onclick = () => { st.shown += 30; draw(); };
    $$("[data-oq]", host).forEach((b) => b.onclick = () => { const h = page[+b.dataset.oq]; requestModal({ kind: "hotel", refId: "osm:" + h.id, refName: h.n, refCity: area?.area || "" }); });
  };
  draw(); redraw(draw);
}

// ================================================================ tour packages page
async function tours() {
  const app = $("#app"); const all = await loadPublished("tours"); const st = { q: "" }; let opened = false;
  const draw = () => {
    const list = all.filter((t) => !st.q || [L(t, "title"), t.destination].join(" ").toLowerCase().includes(st.q.toLowerCase()));
    app.innerHTML = `<div class="bar"><input id="fq" type="search" value="${esc(st.q)}" placeholder="${T("Search a tour or destination…", "Cari paket tur atau tujuan…")}"></div>
      ${list.length ? `<div class="grid">${list.map((t) => tourCard(t, "page")).join("")}</div>` : `<div class="empty"><h3>${all.length ? T("No tour matches your search", "Tidak ada paket yang cocok") : T("Our tour packages are being prepared", "Paket tur kami sedang disiapkan")}</h3><p>${T("Tell us where you want to go - we arrange the trip for you.", "Beri tahu kami tujuan Anda - kami atur perjalanannya.")}</p><p class="mt"><button class="sk-btn gold" type="button" data-general>${T("Ask for a quotation", "Minta penawaran")}</button> <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I'm looking for a tour package.", "Halo Satu Koneksi Hotel, saya mencari paket tur."))}">💬 WhatsApp</a></p></div>`}`;
    const fq = $("#fq"); fq.oninput = () => { st.q = fq.value; const pos = fq.selectionStart; draw(); const n = $("#fq"); n.focus(); n.setSelectionRange(pos, pos); };
    $$("[data-d]", app).forEach((b) => b.onclick = () => tourDetail(all.find((t) => t.id === b.dataset.d)));
    $$("[data-q]", app).forEach((b) => b.onclick = () => { const t = all.find((x) => x.id === b.dataset.q); requestModal({ kind: "tour", refId: t.id, refName: L(t, "title"), refCity: t.destination || "" }); });
    const g = $("[data-general]", app); if (g) g.onclick = () => requestModal({ kind: "general", refName: "" });
  };
  draw(); redraw(draw);
  const id = qs("t"); if (id && !opened) { const t = all.find((x) => x.id === id); if (t) { opened = true; tourDetail(t); } }
}

// ================================================================ offers page
async function offers() {
  const app = $("#app"); const all = await loadPublished("offers"); const hotelsAll = (await listIndex()) ? await listSlim() : await loadHotelList(), toursAll = await loadPublished("tours");
  const draw = () => {
    const list = all.filter((o) => offerActive(o));
    app.innerHTML = list.length ? list.map((o) => {
      const [k, id] = (o.link || "").split(":"), target = k === "hotel" ? hotelsAll.find((x) => x.id === id) : k === "tour" ? toursAll.find((x) => x.id === id) : null;
      const until = o.validUntil ? `<span class="until">${T("Valid until", "Berlaku hingga")} ${new Date(o.validUntil + "T12:00:00").toLocaleDateString(lang() === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>` : "";
      return `<article class="offer"><div class="oph"${bg(o.photo)}>${o.photo ? "" : "🏷️"}</div><div class="obd">${until}<h3>${esc(L(o, "title"))}</h3><p>${esc(L(o, "text"))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${target ? `<a class="sk-btn" href="${k === "hotel" ? "/hotel-directory?h=" : "/tour-packages?t="}${target.id}">${T("View details", "Lihat detail")}</a>` : ""}
        <button class="sk-btn gold" type="button" data-o="${o.id}">${T("Ask about this offer", "Tanya penawaran ini")}</button>
        <a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T(`Hello Satu Koneksi Hotel, I'd like to know more about the offer "${L(o, "title")}".`, `Halo Satu Koneksi Hotel, saya ingin tahu lebih lanjut tentang penawaran "${L(o, "title")}".`))}">💬 WhatsApp</a></div></div></article>`;
    }).join("") : `<div class="empty"><h3>${T("No offers are online right now", "Belum ada penawaran saat ini")}</h3><p>${T("Offers change often. Tell us your destination and dates and we will look for the best rate for you.", "Penawaran sering berubah. Beri tahu tujuan dan tanggal Anda, kami carikan tarif terbaik.")}</p><p class="mt"><a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I'd like to know this week's best hotel offers.", "Halo Satu Koneksi Hotel, saya ingin tahu penawaran hotel terbaik minggu ini."))}">💬 ${T("Ask for this week's offers", "Tanya penawaran minggu ini")}</a></p></div>`;
    $$("[data-o]", app).forEach((b) => b.onclick = () => { const o = all.find((x) => x.id === b.dataset.o); requestModal({ kind: "general", refName: L(o, "title") }); });
  };
  draw(); redraw(draw);
}

// ================================================================ book now
function book() {
  const kind = ["hotel", "tour"].includes(qs("kind")) ? qs("kind") : "general";
  const host = $("#app");
  mountRequestForm(host, { kind, refId: qs("id") || "", refName: qs("ref") || "", refCity: qs("city") || "", country: qs("country") || "", checkIn: qs("in") || "", checkOut: qs("out") || "" });
}

// ================================================================ customer account (panel: every request has its own page)
const STEPS = [["Request sent", "Permintaan terkirim"], ["Quotation", "Penawaran"], ["Agreed to book", "Setuju dipesan"], ["Payment sent", "Pembayaran dikirim"], ["Booking confirmed", "Pemesanan terkonfirmasi"], ["Completed", "Selesai"]];
const stepOf = (st) => ({ new: 0, contacted: 0, quoted: 1, accepted: 2, paymentSent: 3, confirmed: 4, completed: 5 }[st] ?? 0);
// What happens at each step - shown under the customer's step bar (the same words as the How it works page)
const NOW = {
  new: ["We are checking hotels and prices for you. Your quotation appears here and on WhatsApp.", "Kami sedang mengecek hotel dan harga. Penawaran akan muncul di sini dan di WhatsApp."],
  contacted: ["We are checking hotels and prices for you. Your quotation appears here and on WhatsApp.", "Kami sedang mengecek hotel dan harga. Penawaran akan muncul di sini dan di WhatsApp."],
  quoted: ["Your quotation is ready. A quotation is not a booking yet - press Agree to book when you are happy.", "Penawaran Anda sudah siap. Penawaran belum merupakan pemesanan - tekan Setuju memesan bila Anda setuju."],
  accepted: ["Next: transfer the amount to the bank details below and upload the slip.", "Berikutnya: transfer jumlahnya ke rekening di bawah dan unggah bukti transfer."],
  paymentSent: ["We are checking your payment. Then we book with the hotel and send your booking number.", "Kami sedang mengecek pembayaran Anda. Lalu kami memesan ke hotel dan mengirim nomor pemesanan."],
  confirmed: ["Your booking is confirmed. Keep the booking number for check-in.", "Pemesanan Anda terkonfirmasi. Simpan nomor pemesanan untuk check-in."],
  completed: ["Thank you for staying with us. Ask us anytime for your next stay.", "Terima kasih telah menginap bersama kami. Hubungi kami kapan saja untuk menginap berikutnya."],
};
const howLink = () => `<a href="${lang() === "id" ? "/id" : ""}/how-it-works" style="color:var(--gold);font-weight:700;white-space:nowrap">${T("How it works", "Cara kerja")} →</a>`;
const OPEN = ["new", "contacted", "quoted"], CAN_PAY = ["new", "contacted", "quoted", "accepted"];
const reqTitle = (r) => (r.kind === "corporate" && r.company ? T("Company stay - ", "Menginap perusahaan - ") + r.company : "") || r.refName || (r.kind === "tour" ? T("Tour package", "Paket tur") : r.kind === "hotel" ? T("Hotel stay", "Menginap di hotel") : T("General request", "Permintaan umum"));
const nightsOf = (r) => (r.checkIn && r.checkOut ? Math.round((new Date(r.checkOut) - new Date(r.checkIn)) / 864e5) : 0);
const reqNo = (id) => String(id).slice(0, 8).toUpperCase();
const guests = (r) => `${r.adults ?? 1} ${T((r.adults ?? 1) === 1 ? "adult" : "adults", "dewasa")}${r.children ? `, ${r.children} ${T("children", "anak")}` : ""}${r.rooms ? ` · ${r.rooms} ${T(r.rooms === 1 ? "room" : "rooms", "kamar")}` : ""}`;
const reqDoc = (id) => F.doc(db, "requests", id);
// same rule as the daily clean-up (alerts_apps_script/Retention.gs)
function keepUntilC(r) {
  const last = Number(r.updatedAt || r.createdAt || 0);
  if (["confirmed", "completed"].includes(r.status)) {
    const out = r.checkOut ? new Date(String(r.checkOut).slice(0, 10) + "T00:00:00Z").getTime() : 0;
    return new Date(Math.max(last, isNaN(out) ? 0 : out) + (3 * 365 + 1) * 864e5);
  }
  return new Date(last + 365 * 864e5);
}

async function agreeToBook(r) {
  const msg = r.quoteTotal ? T(`Agree to book "${reqTitle(r)}" for ${rupiah(r.quoteTotal)}?`, `Setuju memesan "${reqTitle(r)}" seharga ${rupiah(r.quoteTotal)}?`)
    : T("We have not sent you a price yet. Agree to book anyway? We confirm the final price with you before you pay.", "Kami belum mengirim harga. Tetap setuju memesan? Kami konfirmasi harga akhir sebelum Anda membayar.");
  if (!confirm(msg)) return false;
  try { await F.updateDoc(reqDoc(r.id), { status: "accepted", acceptedAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() }); toast(T("Thank you - we will hold your booking and send the payment details.", "Terima kasih - kami siapkan pemesanan Anda dan kirim detail pembayaran.")); return true; }
  catch (e) { console.error(e); toast(T("Could not save. Please try again or use WhatsApp.", "Gagal menyimpan. Coba lagi atau gunakan WhatsApp."), "err"); return false; }
}

async function account() {
  const app = $("#app");
  const draw = async (user) => {
    if (!user) {
      app.innerHTML = `<div class="boxcard ctr narrow"><h2 style="font-size:30px;color:var(--teal2);margin-bottom:8px">${T("Your account", "Akun Anda")}</h2><p style="color:var(--mute);margin-bottom:18px">${T("Sign in to see the hotels and tours you asked about, follow their status, read our replies, agree to book and send your payment slip.", "Masuk untuk melihat hotel dan tur yang Anda tanyakan, memantau statusnya, membaca balasan kami, setuju memesan, dan mengirim bukti transfer.")}</p><button class="sk-btn gold" type="button" data-signin>${T("Sign in / Create account", "Masuk / Buat akun")}</button></div>`;
      $("[data-signin]", app).onclick = () => openAuth({}); return;
    }
    if (qs("r")) return requestPage(app, user, qs("r"));
    app.innerHTML = `<div class="narrow"><p class="lead" style="color:var(--mute)">${T("Loading your account…", "Memuat akun Anda…")}</p></div>`;
    let prof = {}; try { const s = await F.getDoc(F.doc(db, "customers", user.uid)); if (s.exists()) prof = s.data(); } catch { /* ignore */ }
    const staff = await isStaffUser(user);
    app.innerHTML = `<div class="narrow">
      <div class="boxcard"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2 style="font-size:28px;color:var(--teal2)">${T("Hello", "Halo")}, ${esc((prof.displayName || user.displayName || user.email).split(" ")[0])}</h2><p style="color:var(--mute)">${esc(user.email)}${user.emailVerified ? "" : ` · <b style="color:#b45309">${T("not verified yet", "belum diverifikasi")}</b>`}</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${staff ? `<a class="sk-btn dark sm" href="/admin">${T("Open staff admin", "Buka admin staf")}</a>` : ""}<button class="sk-btn sm" type="button" data-out>${T("Sign out", "Keluar")}</button></div></div>
        <form class="skf mt" id="pf" novalidate><div class="row2"><label>${T("Your name", "Nama Anda")}<input name="displayName" maxlength="100" value="${esc(prof.displayName || user.displayName || "")}"></label><label>${T("WhatsApp number", "Nomor WhatsApp")}<input name="phone" type="tel" maxlength="30" value="${esc(prof.phone || "")}" placeholder="+62 …"></label></div>
        <button class="sk-btn sm" type="submit">${T("Save my details", "Simpan data saya")}</button></form></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:30px 0 14px;gap:12px;flex-wrap:wrap"><h2 style="font-size:30px;color:var(--teal2)">${T("My requests and bookings", "Permintaan dan pemesanan saya")}</h2><a class="sk-btn gold" href="/book-now">＋ ${T("New request", "Permintaan baru")}</a></div>
      <div id="reqs"><p style="color:var(--mute)">${T("Loading…", "Memuat…")}</p></div></div>`;
    $("[data-out]", app).onclick = () => signOut();
    if (location.hash === "#pf") $("#pf", app)?.scrollIntoView({ behavior: "smooth", block: "center" });   // sidebar: My details
    $("#pf", app).onsubmit = async (e) => { e.preventDefault(); if (!user.emailVerified) return toast(T("Please verify your e-mail first.", "Verifikasi e-mail Anda dulu."), "err"); const f = new FormData(e.target); try { await ensureProfile(user, { displayName: String(f.get("displayName")).trim(), phone: String(f.get("phone")).trim() }); toast(T("Saved.", "Tersimpan.")); } catch { toast(T("Could not save.", "Gagal menyimpan."), "err"); } };
    const load = async () => {
      let list = []; try { list = side.list = await myRequests(); } catch (e) { console.error(e); $("#reqs", app).innerHTML = `<div class="empty"><p>${T("Could not load your requests. Please reload the page.", "Gagal memuat permintaan. Muat ulang halaman.")}</p></div>`; return; }
      const F = { todo: [T("To do: agree to book or pay", "Perlu tindakan: setuju memesan atau bayar"), (r) => ["quoted", "accepted"].includes(r.status)],
        msgs: [T("Requests with a message from us", "Permintaan dengan pesan dari kami"), (r) => r.lastMsgFrom === "staff" && !["cancelled", "completed"].includes(r.status)],
        booked: [T("My bookings", "Pemesanan saya"), (r) => ["confirmed", "completed"].includes(r.status)] }[qs("f")];
      if (F) list = list.filter(F[1]);
      const head = F ? `<div class="notice" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${F[0]} (${list.length})</b><a href="/account" style="color:var(--gold);font-weight:700">${T("Show all", "Tampilkan semua")}</a></div>` : "";
      $("#reqs", app).innerHTML = head + (list.length ? list.map((r) => `<div class="req"><div class="top"><h3>${esc(reqTitle(r))}</h3>${renderStatus(r.status)}</div>
        <small>${T("Request no.", "No. permintaan")} ${reqNo(r.id)} · ${esc(fmtDate(r.createdAt))}${r.refCity ? " · " + esc(r.refCity) : ""}</small>
        <p style="margin-top:6px">${r.checkIn ? `📅 ${esc(r.checkIn)}${r.checkOut ? " → " + esc(r.checkOut) : ""} · ` : ""}👥 ${guests(r)}</p>
        ${r.quoteTotal ? `<p><b>${T("Our price:", "Harga kami:")} ${rupiah(r.quoteTotal)}</b></p>` : ""}
        ${r.lastMsgFrom === "staff" ? `<div class="note">💬 ${T("We sent you a message - open the request to read it.", "Kami mengirim pesan - buka permintaan untuk membacanya.")}</div>` : r.publicNote ? `<div class="note"><b>${T("Message from Satu Koneksi Hotel:", "Pesan dari Satu Koneksi Hotel:")}</b><br>${esc(r.publicNote)}</div>` : ""}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="sk-btn gold sm" href="/account?r=${esc(r.id)}">${T("Open", "Buka")} →</a>
        ${OPEN.includes(r.status) ? `<button class="sk-btn sm" type="button" data-agree="${esc(r.id)}">✓ ${T("Agree to book", "Setuju pesan")}</button>` : ""}
        ${CAN_PAY.includes(r.status) || r.status === "paymentSent" ? `<a class="sk-btn sm" href="/account?r=${esc(r.id)}#pay">🧾 ${T("Upload transfer slip", "Unggah bukti transfer")}</a>` : ""}
        <button class="sk-btn sm line" type="button" data-again="${esc(r.id)}">↻ ${T("Book again", "Pesan lagi")}</button></div></div>`).join("")
        : `<div class="empty"><h3>${F ? T("Nothing here right now", "Belum ada di sini") : T("No requests yet", "Belum ada permintaan")}</h3><p>${T("When you ask for a quotation, it shows up here with its status.", "Saat Anda meminta penawaran, permintaan muncul di sini beserta statusnya.")}</p></div>`);
      $$("[data-again]", app).forEach((b) => b.onclick = () => { const r = list.find((x) => x.id === b.dataset.again); if (r) requestModal(againOpts(r)); });
      $$("[data-agree]", app).forEach((b) => b.onclick = async () => { if (!user.emailVerified) return toast(T("Please verify your e-mail first.", "Verifikasi e-mail Anda dulu."), "err"); if (await agreeToBook(list.find((x) => x.id === b.dataset.agree))) load(); });
    };
    load();
  };
  onUser(draw);
  addEventListener("sk-lang", async () => { const restore = keepForms(app); await draw(auth.currentUser); restore(); });
}

// one request = one page: progress, our quotation, agree to book, bank-transfer slip, messages, booking confirmation
async function requestPage(app, user, id) {
  app.innerHTML = `<div class="narrow"><p class="lead" style="color:var(--mute)">${T("Loading…", "Memuat…")}</p></div>`;
  let r, msgs = [], slips = [];
  try {
    const sn = await F.getDoc(reqDoc(id)); if (!sn.exists()) throw new Error("not found");
    r = plain(sn);
    [msgs, slips] = await Promise.all([
      F.getDocs(F.query(F.collection(db, "requests", id, "messages"), F.orderBy("createdAt"))).then((x) => x.docs.map(plain)),
      F.getDocs(F.collection(db, "requests", id, "payments")).then((x) => x.docs.map(plain).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
    ]);
  } catch (e) { console.error(e); app.innerHTML = `<div class="narrow empty"><h3>${T("This request was not found", "Permintaan tidak ditemukan")}</h3><p class="mt"><a class="sk-btn" href="/account">← ${T("My requests", "Permintaan saya")}</a></p></div>`; return; }
  const again = () => requestPage(app, user, id);
  const st = r.status, step = stepOf(st), cancelled = st === "cancelled", n = nightsOf(r), booked = ["confirmed", "completed"].includes(st);
  const row = (k, v) => (v ? `<b>${k}</b><span>${v}</span>` : "");
  const thread = [...(r.publicNote ? [{ from: "staff", text: r.publicNote, createdAt: r.updatedAt }] : []), ...msgs];
  const waMsg = T(`Hello Satu Koneksi Hotel, about my request no. ${reqNo(id)}${r.refName ? " (" + r.refName + ")" : ""}.`, `Halo Satu Koneksi Hotel, mengenai permintaan saya no. ${reqNo(id)}${r.refName ? " (" + r.refName + ")" : ""}.`);
  app.innerHTML = `<div class="narrow">
    <p><a href="/account" style="color:var(--gold);font-weight:700">← ${T("My requests", "Permintaan saya")}</a></p>
    <div class="req mt"><div class="top"><h3 style="font-size:24px">${esc(reqTitle(r))}</h3>${renderStatus(st)}</div>
      <small>${T("Request no.", "No. permintaan")} ${reqNo(id)} · ${T("sent", "dikirim")} ${esc(fmtDate(r.createdAt))} · <a href="#" id="bookAgain" style="color:var(--gold);font-weight:700">↻ ${T("Book again with new dates", "Pesan lagi dengan tanggal baru")}</a></small>
      <small style="display:block;margin-top:2px">🗂 ${T("We keep this record until", "Kami menyimpan catatan ini hingga")} ${esc(keepUntilC(r).toLocaleDateString(lang() === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))}${["confirmed", "completed"].includes(r.status) ? T(" (bookings: 3 years)", " (pemesanan: 3 tahun)") : T(" (requests: 12 months after the last activity)", " (permintaan: 12 bulan setelah aktivitas terakhir)")}.</small>
      ${cancelled ? `<div class="notice mt">${T("This request was cancelled.", "Permintaan ini dibatalkan.")}</div>` : `<ol class="steps">${STEPS.map(([en, idn], i) => `<li class="${i < step ? "done" : i === step ? "now" : ""}">${i < step ? "✓ " : ""}${T(en, idn)}</li>`).join("")}</ol>
        <p style="margin:6px 0 0;font-size:14px">${esc(T(...(NOW[st] || NOW.new)))} ${howLink()}</p>`}</div>

    <div class="pbox"><h4>${T("Your request", "Permintaan Anda")}</h4><div class="kv2">
      ${row(T("Type", "Jenis"), esc(r.kind === "hotel" ? T("Hotel stay", "Menginap di hotel") : r.kind === "tour" ? T("Tour package", "Paket tur") : r.kind === "corporate" ? T("Company stay", "Menginap untuk perusahaan") : T("Other", "Lainnya")))}
      ${row(T("Company", "Perusahaan"), esc(r.company || ""))}${row(T("Purpose", "Tujuan"), esc((PURPOSES.find((x) => x[0] === r.purpose) || [])[lang() === "id" ? 2 : 1] || ""))}
      ${row(T("Billing", "Penagihan"), esc((BILLING.find((x) => x[0] === r.billing) || [])[lang() === "id" ? 2 : 1] || ""))}${row(T("Budget per room per night", "Anggaran per kamar per malam"), r.budgetRoom ? esc(rupiah(r.budgetRoom)) : "")}
      ${row(T("Hotel", "Hotel"), r.hotelMode === "any" ? T("Any hotel - please show me options", "Hotel apa saja - tunjukkan pilihan") : r.kind === "hotel" ? esc(r.refName || "") : "")}
      ${row(T("City", "Kota"), esc(r.city || r.refCity || ""))}${row(T("Country", "Negara"), esc(r.country || ""))}
      ${row(T("Stars", "Bintang"), (r.stars || []).length ? esc(r.stars.join(", ")) + " ★" : "")}${row(T("Budget per night", "Anggaran per malam"), esc(budget(r)))}
      ${row(T("Dates", "Tanggal"), r.checkIn ? esc(r.checkIn) + (r.checkOut ? " → " + esc(r.checkOut) : "") + (n ? ` (${n} ${T(n === 1 ? "night" : "nights", "malam")})` : "") : "")}
      ${row(T("Guests", "Tamu"), guests(r))}${row(T("Message", "Pesan"), r.message ? `<span style="white-space:pre-line">${esc(r.message)}</span>` : "")}</div></div>

    <div class="pbox quote"><h4>${T("Our quotation", "Penawaran kami")}</h4>
      ${r.quoteTotal ? `<div class="big">${rupiah(r.quoteTotal)}</div><small>${T("Total for your whole stay / trip", "Total untuk seluruh menginap / perjalanan")}</small>
        ${r.quoteText ? `<p style="white-space:pre-line;margin-top:10px">${esc(r.quoteText)}</p>` : ""}
        ${r.payBy ? `<p class="mt"><b>${T("Please pay before:", "Mohon bayar sebelum:")}</b> ${esc(r.payBy)}</p>` : ""}`
      : `<p style="color:var(--mute)">${cancelled ? "–" : T("We are checking prices for you. Your quotation will appear here, and we also send it on WhatsApp.", "Kami sedang mengecek harga. Penawaran akan muncul di sini dan juga kami kirim lewat WhatsApp.")}</p>`}</div>

    ${booked ? `<div class="pbox okb"><h4>${T("Booking confirmed", "Pemesanan terkonfirmasi")}</h4>
      ${r.bookingRef ? `<p><b>${T("Booking number:", "Nomor pemesanan:")}</b> <span style="font:800 20px 'Plus Jakarta Sans'">${esc(r.bookingRef)}</span></p>` : ""}
      ${r.bookingNote ? `<p style="white-space:pre-line;margin-top:6px">${esc(r.bookingNote)}</p>` : ""}
      <p class="mt"><button class="sk-btn sm" type="button" id="print">🖨 ${T("Print / save confirmation", "Cetak / simpan konfirmasi")}</button></p></div>` : ""}

    ${cancelled ? "" : `<div class="pbox" id="agree"><h4>${T("Agree to book", "Setuju memesan")}</h4>
      ${OPEN.includes(st) ? `<p>${r.quoteTotal ? T(`Happy with the price? Press the button and we hold the booking for you at ${rupiah(r.quoteTotal)}.`, `Setuju dengan harganya? Tekan tombol dan kami siapkan pemesanan seharga ${rupiah(r.quoteTotal)}.`) : T("We have not sent a price yet. You can already agree - we confirm the final price with you before you pay.", "Kami belum mengirim harga. Anda sudah bisa setuju - kami konfirmasi harga akhir sebelum Anda membayar.")}</p>
        <p class="mt"><button class="sk-btn gold" type="button" id="agreeBtn">✓ ${T("Agree to book", "Setuju memesan")}</button></p>`
      : `<p>✓ ${T("You agreed to book", "Anda setuju memesan")}${r.acceptedAt ? " - " + esc(fmtDate(r.acceptedAt)) : ""}.${st === "accepted" ? " " + T("Next: transfer the money and upload the slip below.", "Berikutnya: transfer dana dan unggah bukti di bawah.") : ""}</p>`}</div>`}

    ${cancelled ? "" : `<div class="pbox" id="pay"><h4>${T("Bank transfer", "Transfer bank")}</h4>
      ${r.bankInfo ? `<div class="note" style="white-space:pre-line;margin:0 0 12px"><b>${T("Pay to:", "Bayar ke:")}</b><br>${esc(r.bankInfo)}</div>` : `<p style="color:var(--mute);margin-bottom:10px">${T("Our bank details appear here with your quotation. Please do not transfer before you have them.", "Detail rekening kami muncul di sini bersama penawaran. Mohon jangan transfer sebelum menerimanya.")}</p>`}
      ${st === "completed" ? "" : `<form class="skf" id="slipForm" novalidate><label>${T("Transfer slip (photo, screenshot or PDF)", "Bukti transfer (foto, tangkapan layar, atau PDF)")}<input type="file" name="file" accept="image/*,application/pdf" style="padding-top:12px"></label>
        <div class="row2"><label>${T("Amount paid (Rp)", "Jumlah dibayar (Rp)")}<input type="number" name="amount" min="0" step="1000" value="${r.quoteTotal || ""}"></label><label>${T("Note (optional)", "Catatan (opsional)")}<input name="note" maxlength="500" placeholder="${T("e.g. BCA, paid by my husband", "mis. BCA, dibayar suami saya")}"></label></div>
        <button class="sk-btn gold" type="submit" id="slipGo">⬆ ${T("Upload transfer slip", "Unggah bukti transfer")}</button></form>`}
      ${slips.length ? `<p class="mt"><b>${T("Slips you sent:", "Bukti yang Anda kirim:")}</b></p><div class="slips">${slips.map((x, i) => `<a href="#" data-slip="${i}">${x.type === "image" ? `<img src="${x.data}" alt="">` : "📄 PDF<br>"}${esc(fmtDate(x.createdAt))}${x.amount ? "<br>" + rupiah(x.amount) : ""}</a>`).join("")}</div>` : ""}</div>`}

    <div class="pbox"><h4>${T("Messages", "Pesan")}</h4>
      <div class="thread">${thread.length ? thread.map((m) => `<div class="msg ${m.from === "staff" ? "staff" : "customer"}">${esc(m.text)}<small>${m.from === "staff" ? "Satu Koneksi Hotel" : T("You", "Anda")} · ${esc(fmtDate(m.createdAt))}</small></div>`).join("") : `<p style="color:var(--mute)">${T("No messages yet. Ask us anything about this request.", "Belum ada pesan. Tanyakan apa saja tentang permintaan ini.")}</p>`}</div>
      <form class="skf" id="msgForm" novalidate><label>${T("Write to us", "Tulis pesan")}<textarea name="text" maxlength="2000" placeholder="${T("Your question or reply…", "Pertanyaan atau balasan Anda…")}"></textarea></label>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="sk-btn gold" type="submit" id="msgGo">${T("Send message", "Kirim pesan")}</button><a class="sk-btn wa" target="_blank" rel="noopener" href="${wa(waMsg)}">💬 WhatsApp</a></div></form></div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0">${[...OPEN, "accepted"].includes(st) ? `<button class="sk-btn red sm" type="button" id="cancel">${T("Cancel request", "Batalkan permintaan")}</button>` : ""}<a class="sk-btn sm" href="/book-now">＋ ${T("New request", "Permintaan baru")}</a></div></div>`;

  const needVerified = () => { if (user.emailVerified) return false; toast(T("Please verify your e-mail first (see the link we sent you).", "Verifikasi e-mail Anda dulu (lihat tautan yang kami kirim)."), "err"); return true; };
  $("#agreeBtn", app)?.addEventListener("click", async () => { if (!needVerified() && await agreeToBook(r)) again(); });
  $("#cancel", app)?.addEventListener("click", async () => {
    if (needVerified() || !confirm(T("Cancel this request?", "Batalkan permintaan ini?"))) return;
    try { await F.updateDoc(reqDoc(id), { status: "cancelled", updatedAt: F.serverTimestamp() }); toast(T("Request cancelled.", "Permintaan dibatalkan.")); again(); } catch { toast(T("Could not cancel. Please use WhatsApp.", "Gagal membatalkan. Gunakan WhatsApp."), "err"); }
  });
  $$("[data-slip]", app).forEach((a) => a.onclick = (e) => { e.preventDefault(); showSlip(slips[+a.dataset.slip]); });
  const sf = $("#slipForm", app);
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault(); if (needVerified()) return;
    const file = sf.file.files[0]; if (!file) return toast(T("Please choose the slip file first.", "Pilih file bukti transfer dulu."), "err");
    const go = $("#slipGo", app); go.disabled = true; go.textContent = T("Uploading…", "Mengunggah…");
    try {
      const up = await slipFromFile(file), amt = Math.round(Number(sf.amount.value) || 0), note = sf.note.value.trim().slice(0, 500);
      await F.addDoc(F.collection(db, "requests", id, "payments"), C.clean({ data: up.data, type: up.type, name: file.name.slice(0, 120), amount: amt || undefined, note: note || undefined, uid: user.uid, createdAt: F.serverTimestamp() }));
      await F.updateDoc(reqDoc(id), { ...(CAN_PAY.includes(st) ? { status: "paymentSent" } : {}), paymentSentAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });   // every upload alerts staff
      toast(T("Thank you - slip received. We check the payment and confirm your booking.", "Terima kasih - bukti diterima. Kami cek pembayaran dan konfirmasi pemesanan Anda."));
      again();
    } catch (er) { console.error(er); toast(er.message && !/permission/i.test(er.message) ? er.message : T("Upload failed. Please try again or send the slip on WhatsApp.", "Gagal mengunggah. Coba lagi atau kirim bukti lewat WhatsApp."), "err"); go.disabled = false; go.textContent = T("Upload transfer slip", "Unggah bukti transfer"); }
  };
  const mf = $("#msgForm", app);
  mf.onsubmit = async (e) => {
    e.preventDefault(); if (needVerified()) return;
    const text = mf.text.value.trim().slice(0, 2000); if (!text) return;
    const go = $("#msgGo", app); go.disabled = true;
    try {
      await F.addDoc(F.collection(db, "requests", id, "messages"), { from: "customer", text, by: user.email, createdAt: F.serverTimestamp() });
      await F.updateDoc(reqDoc(id), { lastMsgFrom: "customer", lastMsgAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
      again();
    } catch (er) { console.error(er); toast(T("Message not sent. Please try again or use WhatsApp.", "Pesan tidak terkirim. Coba lagi atau gunakan WhatsApp."), "err"); go.disabled = false; }
  };
  $("#print", app)?.addEventListener("click", () => printConfirmation(r, id, n));
  $("#bookAgain", app)?.addEventListener("click", (e) => { e.preventDefault(); requestModal(againOpts(r)); });
  if (["#pay", "#agree"].includes(location.hash)) $(location.hash, app)?.scrollIntoView({ behavior: "smooth" });   // links from the customer e-mails
}

export function showSlip(x) {
  const w = open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Transfer slip</title><body style="margin:0;background:#333">${x.type === "pdf" ? `<iframe src="${x.data}" style="border:0;width:100%;height:100vh"></iframe>` : `<img src="${x.data}" style="max-width:100%;display:block;margin:auto">`}</body>`);
  w.document.close();
}

function printConfirmation(r, id, n) {
  const w = open("", "_blank"); if (!w) return;
  const line = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : "");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${T("Booking confirmation", "Konfirmasi pemesanan")} ${esc(r.bookingRef || reqNo(id))}</title>
    <style>body{font:15px/1.5 Arial,sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#1d2b2b}h1{color:#0e494a;margin-bottom:0}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;vertical-align:top}th{width:200px;color:#666}</style>
    <h1>Satu Koneksi Hotel</h1><p>www.satukoneksihotel.com</p><h2>${T("Booking confirmation", "Konfirmasi pemesanan")}</h2><table>
    ${line(T("Booking number", "Nomor pemesanan"), esc(r.bookingRef || ""))}${line(T("Request no.", "No. permintaan"), reqNo(id))}${line(T("Guest", "Tamu"), esc(r.name))}
    ${line(T("For", "Untuk"), esc(reqTitle(r)))}${line(T("City", "Kota"), esc([r.city || r.refCity, r.country].filter(Boolean).join(", ")))}
    ${line(T("Dates", "Tanggal"), r.checkIn ? esc(r.checkIn) + (r.checkOut ? " → " + esc(r.checkOut) : "") + (n ? ` (${n} ${T("nights", "malam")})` : "") : "")}
    ${line(T("Guests", "Tamu"), guests(r))}${line(T("Total", "Total"), r.quoteTotal ? rupiah(r.quoteTotal) : "")}
    ${line(T("Details", "Detail"), r.bookingNote ? `<span style="white-space:pre-line">${esc(r.bookingNote)}</span>` : "")}</table>
    <p style="margin-top:24px;color:#666">${T("Printed", "Dicetak")} ${esc(new Date().toLocaleString())}</p>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// ================================================================ home page (database texts + featured items)
async function home() {
  const h2 = (s) => esc(esc(s)); // text written inside an HTML attribute that is later put back with innerHTML is escaped twice
  const set = (el, en, id) => { if (!el) return; if (en) el.setAttribute("data-en", esc(en)); if (id || en) el.setAttribute("data-id", esc(id || en)); }; // setAttribute() keeps the text as is, so once is enough
  const dests = await loadPublished("destinations");
  const grid = $("#destGrid");
  if (grid && dests.length) {
    grid.innerHTML = dests.slice(0, 9).map((d, i) => `<button class="d${i === 0 ? " big" : ""}${d.photo ? "" : " plain g" + (i % 3 + 1)}" type="button" data-city="${esc(d.name)}">${d.photo ? `<img loading="lazy" src="${d.photo}" alt="">` : ""}<span class="tx"><h3>${esc(d.name)}</h3><small data-en="${h2(d.tagline_en || "")}" data-id="${h2(d.tagline_id || d.tagline_en || "")}">${esc(d.tagline_en || "")}</small></span></button>`).join("");
  }
  if (S.heroTitle_en) { const h = $(".hero h1"); if (h) { h.innerHTML = '<span id="heroTitleTxt"></span>'; set($("#heroTitleTxt"), S.heroTitle_en, S.heroTitle_id); } }
  if (S.heroLead_en) set($("#heroLead"), S.heroLead_en, S.heroLead_id);
  trustBlock(); redraw(trustBlock);
  if (S.bannerTitle_en) { const t = $("#bannerTitle"); if (t) set(t, S.bannerTitle_en, S.bannerTitle_id); }
  if (S.bannerText_en) set($("#bannerText"), S.bannerText_en, S.bannerText_id);
  if ((S.faq || []).length && $("#faqList")) $("#faqList").innerHTML = S.faq.map((f, i) => `<details${i === 0 ? " open" : ""}><summary data-id="${h2(f.q_id || f.q_en)}">${esc(f.q_en)}</summary><p data-id="${h2(f.a_id || f.a_en)}">${esc(f.a_en)}</p></details>`).join("");
  window.SK_applyLang?.();
  const idx = await listIndex();
  const [hs, ts] = await Promise.all([idx ? idx.featured || [] : loadHotelList(), loadPublished("tours")]);
  await checkPriceOn();
  HOTELS = idx ? null : hs;
  const fh = hs.filter((h) => h.featured).slice(0, 6), ft = ts.filter((t) => t.featured).slice(0, 6);
  const draw = () => {
    const a = $("#featHotels"), b = $("#featTours");
    if (a) { a.hidden = !fh.length; a.dataset.live = "1"; $("#featHotelsGrid").innerHTML = fh.map((h) => hotelCard(h, "home")).join(""); lazyCovers(a); }
    if (b) { b.hidden = !ft.length; $("#featToursGrid").innerHTML = ft.map((t) => tourCard(t, "home")).join(""); }
  };
  draw(); redraw(draw);
}

// ================================================================ customer sidebar (Book Now + My Account)
const side = { list: null };
async function customerSide(page) {
  const host = $("#custSide"); if (!host) return;
  const f = qs("f") || "", rid = qs("r") || "";
  const draw = async (user) => {
    if (!user) {
      host.innerHTML = `<div class="cs-card"><b>${T("Your Satu Koneksi account", "Akun Satu Koneksi Anda")}</b>
        <ul class="cs-why"><li>${T("Follow every request", "Pantau setiap permintaan")}</li><li>${T("Read our replies", "Baca balasan kami")}</li><li>${T("Agree to book and pay", "Setuju memesan dan bayar")}</li><li>${T("Keep your confirmations", "Simpan konfirmasi Anda")}</li></ul>
        <button class="sk-btn gold sm" type="button" data-cs-in>${T("Sign in / Create account", "Masuk / Buat akun")}</button></div>
        <nav class="cs-nav"><a href="/book-now"${page === "book" ? ' class="on"' : ""}>＋ ${T("New request", "Permintaan baru")}</a><a target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I have a question.", "Halo Satu Koneksi Hotel, saya ada pertanyaan."))}">💬 ${T("WhatsApp us", "WhatsApp kami")}</a></nav>`;
      $("[data-cs-in]", host).onclick = () => openAuth({}); return;
    }
    let list = side.list; if (!list) { try { list = side.list = await myRequests(); } catch { list = []; } }
    const n = (fn) => list.filter(fn).length, first = (fn) => list.find(fn);
    const todo = (r) => ["quoted", "accepted"].includes(r.status), booked = (r) => ["confirmed", "completed"].includes(r.status), msg = (r) => r.lastMsgFrom === "staff" && !["cancelled", "completed"].includes(r.status);
    const open = (r) => !["cancelled", "completed"].includes(r.status);
    const badge = (k) => (k ? `<span class="cs-n">${k}</span>` : "");
    const one = (fn, filter) => { const c = n(fn); const x = first(fn); return c === 1 && x ? `/account?r=${x.id}` : `/account?f=${filter}`; };
    const latest = list[0], name = (user.displayName || user.email || "").split(" ")[0];
    const on = (cond) => (cond ? ' class="on"' : "");
    host.innerHTML = `<div class="cs-card cs-me"><span class="cs-av">${esc((name || "?").slice(0, 1).toUpperCase())}</span><div><b>${esc(name)}</b><small>${esc(user.email || "")}</small></div></div>
      <nav class="cs-nav">
        <a href="/book-now"${on(page === "book")}>＋ ${T("New request", "Permintaan baru")}</a>
        <a href="/account"${on(page === "account" && !f && !rid)}>📋 ${T("My requests", "Permintaan saya")}${badge(n(open))}</a>
        <a href="${one(todo, "todo")}"${on(f === "todo")}>⏳ ${T("To do: agree / pay", "Perlu tindakan: setuju / bayar")}${badge(n(todo))}</a>
        <a href="${one(msg, "msgs")}"${on(f === "msgs")}>💬 ${T("Messages from us", "Pesan dari kami")}${badge(n(msg))}</a>
        <a href="${one(booked, "booked")}"${on(f === "booked")}>✅ ${T("My bookings", "Pemesanan saya")}${badge(n(booked))}</a>
        <a href="/account#pf">👤 ${T("My details", "Data saya")}</a>
        <a target="_blank" rel="noopener" href="${wa(T("Hello Satu Koneksi Hotel, I have a question.", "Halo Satu Koneksi Hotel, saya ada pertanyaan."))}">📱 ${T("WhatsApp us", "WhatsApp kami")}</a>
        <button type="button" data-cs-out>↩ ${T("Sign out", "Keluar")}</button>
      </nav>
      ${latest ? `<a class="cs-card cs-last" href="/account?r=${esc(latest.id)}"><small>${T("Latest request", "Permintaan terakhir")}</small><b>${esc(reqTitle(latest))}</b>${renderStatus(latest.status)}${latest.checkIn ? `<small>📅 ${esc(latest.checkIn)}${latest.checkOut ? " → " + esc(latest.checkOut) : ""}</small>` : ""}</a>` : ""}`;
    $("[data-cs-out]", host).onclick = () => signOut();
  };
  onUser(draw);
  addEventListener("sk-lang", () => draw(auth.currentUser));
}

// ================================================================ a hotel's own page (/hotels/<city>/<hotel>, made by the hotelpages engine)
// The page itself is plain HTML (for Google); here only its buttons: the price for the visitor's dates and the photos open the
// same pop-up as on the Hotels page, the quotation opens the request form.
// What the owner typed in Admin -> Settings -> Trust (reply time, cancellation line, real reviews). Nothing is shown when empty.
const replyText = () => S["replyTime_" + lang()] || S.replyTime_en || "";
function trustBlock() {
  const host = $("#trust"), grid = $("#trustGrid"); if (!host || !grid) return;
  const items = [];
  if (replyText()) items.push(`<div class="tb"><b>⏱ ${T("We reply", "Kami membalas")}</b>${esc(replyText())}</div>`);
  const cancel = S["cancelLine_" + lang()] || S.cancelLine_en || "";
  if (cancel) items.push(`<div class="tb"><b>🛡 ${T("If your plans change", "Jika rencana Anda berubah")}</b>${esc(cancel)} <a href="${lang() === "id" ? "/id" : ""}/how-it-works" style="color:var(--gold);font-weight:700">${T("Details", "Detail")} →</a></div>`);
  (S.reviews || []).filter((r) => r && r.text && r.name).slice(0, 2).forEach((r) => items.push(`<div class="tb"><b>⭐ ${T("What a guest said", "Kata tamu kami")}</b><blockquote>“${esc(r.text)}”</blockquote><small>${esc(r.name)}${r.place ? " · " + esc(r.place) : ""}</small></div>`));
  grid.innerHTML = items.join(""); host.hidden = !items.length;
}
async function hotelpage() {
  const m = $("main[data-hotel]"); if (!m) return;
  const id = m.dataset.hotel;
  const waBtn = $("aside .sk-btn.wa", m);
  if (waBtn && replyText()) waBtn.insertAdjacentHTML("afterend", `<p class="help" style="margin:4px 0 0;text-align:center">⏱ ${esc(replyText())}</p>`);
  $$("[data-hp]", m).forEach((b) => b.onclick = () => {
    const k = b.dataset.hp;
    if (k === "quote") requestModal({ kind: "hotel", refId: id, refName: m.dataset.name || "", refCity: m.dataset.city || "" });
    else openHotel(id, k === "price" ? "price" : "");
  });
}
async function howitworks() {
  const put = (id, html) => { const el = $("#" + id); if (el && html) el.innerHTML = html; };
  const para = (t) => String(t || "").split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  if (S.howTerms_en) put("howTerms", para(S.howTerms_en));
  if (S.howTerms_id || S.howTerms_en) put("howTermsId", para(S.howTerms_id || S.howTerms_en));
  if (S.companyName) { put("howCompany", `Satu Koneksi Hotel is operated by <b>${esc(S.companyName)}</b>.`); put("howCompanyId", `Satu Koneksi Hotel dikelola oleh <b>${esc(S.companyName)}</b>.`); }
}
async function about() {
  const host = $("#aboutWho"); if (!host) return;
  const name = S.founderName || "", role = S["founderRole_" + lang()] || S.founderRole_en || "", bio = S["founderBio_" + lang()] || S.founderBio_en || "";
  const facts = [S.companyName ? `${T("Registered business", "Badan usaha")}: <b>${esc(S.companyName)}</b>` : "", S.companyReg ? `${T("Registration no.", "Nomor registrasi")}: <b>${esc(S.companyReg)}</b>` : "",
    S.companyAddress ? `${T("Address", "Alamat")}: ${esc(S.companyAddress)}` : ""].filter(Boolean);
  if (!name && !facts.length) return;
  const photo = S.founderPhoto ? await loadImage(S.founderPhoto) : "";
  host.innerHTML = `<div class="boxcard mt" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">${photo ? `<img src="${photo}" alt="${esc(name)}" style="width:120px;height:120px;border-radius:50%;object-fit:cover">` : ""}
    <div style="flex:1;min-width:220px"><h2 style="margin-top:0">${T("Who is behind Satu Koneksi Hotel", "Siapa di balik Satu Koneksi Hotel")}</h2>
    ${name ? `<p><b style="font-size:19px">${esc(name)}</b>${role ? `<br><span style="color:var(--mute)">${esc(role)}</span>` : ""}</p>` : ""}${bio ? `<p style="white-space:pre-line">${esc(bio)}</p>` : ""}
    ${facts.length ? `<p>${facts.join("<br>")}</p>` : ""}</div></div>`;
}
async function corporate() {
  // the buttons on the page choose what the form asks for (meeting / rate review), then scroll to it
  let want = new URLSearchParams(location.search).get("help") || "meeting";
  $$("[data-help]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault(); want = b.dataset.help;
    const sel = $("#corpForm [name=help]"); if (sel) { sel.value = want; sel.dispatchEvent(new Event("change")); }
    $("#corpEnquiry")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  const host = $("#corpForm"); if (host) mountRequestForm(host, { kind: "corporate", help: () => want });
  // the contact person: Admin -> Settings (corporate contact, else the founder); nobody is shown when both are empty
  // The picture on the card: the one uploaded in Admin (or the founder's), else the default picture that comes with the website;
  // Admin can also choose "no picture" (plain icon).
  const card = $("#corpRM"), name = S.rmName || S.founderName || "";
  if (card) {
    const ph = card.querySelector(".ph"), img = ph?.querySelector("img"), ico = ph?.querySelector(".pic-icon");
    if (S.rmPhotoOff) { if (img) img.hidden = true; if (ico) ico.hidden = false; }
    else {
      const own = S.rmPhoto || (S.rmName ? "" : S.founderPhoto) || "", src = own ? await loadImage(own).catch(() => "") : "";
      if (src && img) img.src = src;
    }
    if (img && name) img.alt = name;
  }
  if (card && name) {
    const role = S["rmRole_" + lang()] || S.rmRole_en || (S.rmName ? "" : S["founderRole_" + lang()] || S.founderRole_en || "");
    card.querySelector(".nm").textContent = name; card.querySelector(".nm").removeAttribute("data-id");
    const rl = card.querySelector(".rl"); rl.textContent = role ? `${role} · Satu Koneksi Hotel` : "Satu Koneksi Hotel"; rl.removeAttribute("data-id");
  }
  // registered business details, only what is filled in
  const facts = [S.companyName ? `${T("Registered business", "Badan usaha")}: <b>${esc(S.companyName)}</b>` : "", S.companyReg ? `${T("Registration no.", "Nomor registrasi")}: <b>${esc(S.companyReg)}</b>` : "",
    S.companyAddress ? `${T("Address", "Alamat")}: ${esc(S.companyAddress)}` : "", S.email ? `${T("E-mail", "E-mail")}: <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ""].filter(Boolean);
  const fx = $("#corpFacts"); if (fx && facts.length) fx.innerHTML = facts.join("<br>");
  // phones: the "Corporate enquiry" button hides while the form is on screen
  const stick = $(".corpStick"), sec = $("#corpEnquiry");
  if (stick && sec && "IntersectionObserver" in window) new IntersectionObserver(([en]) => stick.classList.toggle("off", en.isIntersecting), { threshold: 0.05 }).observe(sec);
}
const PAGES = { home, hotels, tours, offers, book, account, hotelpage, howitworks, corporate, about };
export async function run(page) {
  S = await loadSettings();
  if (page === "book" || page === "account") customerSide(page);
  try { await PAGES[page]?.(); } catch (e) { console.error(e); const app = $("#app"); if (app) app.innerHTML = `<div class="empty"><h3>${T("Something went wrong", "Terjadi kesalahan")}</h3><p>${T("Please reload the page. If it keeps happening, message us on WhatsApp.", "Muat ulang halaman. Jika berlanjut, hubungi kami lewat WhatsApp.")}</p></div>`; }
}

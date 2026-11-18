/* City guide pages (e.g. /indonesia/yogyakarta): OpenStreetMap map, category filter, "add to my trip",
   and a trip planner that opens WhatsApp with the plan as a message (nothing is sent automatically). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const L_ = () => (document.documentElement.lang === "id" ? "id" : "en");
const tr = (en, id) => (L_() === "id" ? id : en);
const city = JSON.parse($("#gcity")?.textContent || '{"en":"","id":""}');
const places = JSON.parse($("#gmap-data")?.textContent || "[]");
const waNum = () => String(window.SK_WA || "6289530998988").replace(/\D/g, "");
const openWA = (text) => window.open(`https://wa.me/${waNum()}?text=${encodeURIComponent(text)}`, "_blank", "noopener");

/* ---------- map (loads when it comes into view) ---------- */
let map = null;
const markers = {};
function initMap() {
  const el = $("#gmap");
  if (map || !el || !window.L) return;
  map = L.map(el, { scrollWheelZoom: false, tap: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const pts = [];
  places.forEach((p, i) => {
    const icon = L.divIcon({ className: "gpin", html: `<span>${p.i}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
    const m = L.marker([p.lat, p.lon], { icon, title: p.n }).addTo(map);
    m.bindPopup(() => `<b>${p.i}. ${tr(p.n, p.ni)}</b><br><a href="#p-${p.k}">${tr("See details ↓", "Lihat detail ↓")}</a>`);
    markers[p.k] = m;
    pts.push([p.lat, p.lon]);
  });
  if (pts.length) map.fitBounds(pts, { padding: [30, 30] });
}
const mapEl = $("#gmap");
if (mapEl) {
  const start = () => (window.L ? initMap() : window.addEventListener("load", initMap, { once: true }));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: "300px" });
    io.observe(mapEl);
  } else start();
}
$$(".gmap-list li").forEach((li) => li.addEventListener("click", () => {
  const k = li.dataset.goto.replace(/^p-/, "");
  if (!map) initMap();
  const m = markers[k];
  if (m) { map.flyTo(m.getLatLng(), 12, { duration: 0.8 }); setTimeout(() => m.openPopup(), 850); }
  $$(".gmap-list li").forEach((o) => o.classList.toggle("on", o === li));
}));

/* ---------- category filter ---------- */
$$(".gchip").forEach((b) => b.addEventListener("click", () => {
  $$(".gchip").forEach((o) => o.classList.toggle("on", o === b));
  $$(".gp").forEach((c) => { c.hidden = b.dataset.cat !== "all" && c.dataset.cat !== b.dataset.cat; });
}));

/* ---------- my trip ---------- */
const chosen = new Set();
function syncTrip() {
  $$(".gp-add").forEach((b) => b.classList.toggle("added", chosen.has(b.dataset.add)));
  $$("#gplan .gpl-opt input").forEach((c) => { c.checked = chosen.has(c.value); });
  const bar = $("#gtrip");
  if (bar) { bar.hidden = chosen.size === 0; $("#gtrip-n").textContent = chosen.size; }
}
$$(".gp-add").forEach((b) => b.addEventListener("click", () => {
  chosen.has(b.dataset.add) ? chosen.delete(b.dataset.add) : chosen.add(b.dataset.add);
  syncTrip();
}));
$$("#gplan .gpl-opt input").forEach((c) => c.addEventListener("change", () => {
  c.checked ? chosen.add(c.value) : chosen.delete(c.value);
  syncTrip();
}));

/* ---------- send plan / ask for a sample trip on WhatsApp ---------- */
$("#gplan-send")?.addEventListener("click", () => {
  const f = $("#gplan");
  const id = L_() === "id";
  const names = $$(".gpl-opt input", f).filter((c) => c.checked).map((c) => (id ? c.dataset.nId : c.dataset.nEn));
  const style = f.style.selectedOptions[0];
  const lines = [
    tr(`Hello Satu Koneksi Hotel, I'd like to plan a trip to ${city.en}.`, `Halo Satu Koneksi Hotel, saya ingin merencanakan perjalanan ke ${city.id}.`),
    names.length ? tr("Places: ", "Tempat: ") + names.join(", ") : tr("Places: please suggest", "Tempat: mohon disarankan"),
    f.date.value ? tr("Arrival: ", "Tiba: ") + f.date.value : "",
    tr("Nights: ", "Malam: ") + f.nights.value,
    tr("Travellers: ", "Jumlah orang: ") + (f.pax.value || "2"),
    tr("Hotel: ", "Hotel: ") + (id ? style.dataset.id || style.value : style.value),
    f.name.value.trim() ? tr("Name: ", "Nama: ") + f.name.value.trim() : "",
    f.notes.value.trim() ? tr("Notes: ", "Catatan: ") + f.notes.value.trim() : "",
  ].filter(Boolean);
  openWA(lines.join("\n"));
});
$$(".gb-ask").forEach((b) => b.addEventListener("click", () => {
  const t = L_() === "id" ? b.dataset.bundleId : b.dataset.bundleEn;
  openWA(tr(`Hello Satu Koneksi Hotel, I'm interested in the ${city.en} trip "${t}". Could you send me a quote? My dates are: `,
    `Halo Satu Koneksi Hotel, saya tertarik dengan paket ${city.id} "${t}". Bisa kirimkan penawaran? Tanggal saya: `));
}));

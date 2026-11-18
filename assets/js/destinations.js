/* Destinations page: search (country or city), region tabs, Most visited / Attractive filter. */
const q = document.getElementById("dq");
const countries = [...document.querySelectorAll(".dc")];
const regions = [...document.querySelectorAll(".dreg")];
const empty = document.querySelector(".dempty");
const bar = document.querySelector(".dbar");
let region = "all";
// keep the region bar just under the site menu (its height changes with screen width)
const nav = document.getElementById("skNav");
const setNavH = () => document.documentElement.style.setProperty("--navh", (nav ? nav.offsetHeight : 68) + "px");
setNavH();
window.addEventListener("resize", setNavH);
let kind = "all";

function lang() {
  let l = (navigator.language || "").toLowerCase().indexOf("id") === 0 ? "id" : "en";
  try { l = localStorage.getItem("okLang") || l; } catch (e) { /* ignore */ }
  return l;
}
function placeholder(l) {
  if (!q) return;
  if (!q.dataset.phEn) q.dataset.phEn = q.placeholder;
  q.placeholder = l === "id" ? q.dataset.phId : q.dataset.phEn;
}

function apply() {
  const s = (q?.value || "").trim().toLowerCase();
  let shown = 0;
  countries.forEach((c) => {
    let any = false;
    c.querySelectorAll(".dp").forEach((p) => {
      const k = p.dataset.kind;
      const ok = kind === "all" || k === "both" || k === kind;
      p.hidden = !ok;
      any = any || ok;
    });
    const ok = any && (region === "all" || c.dataset.r === region) && (!s || c.dataset.s.includes(s));
    c.hidden = !ok;
    if (ok) shown++;
  });
  regions.forEach((r) => { r.hidden = ![...r.querySelectorAll(".dc")].some((c) => !c.hidden); });
  if (empty) empty.hidden = shown > 0;
}

function toList() {
  const top = document.querySelector(".dlist").getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight || 0) - 80;
  if (window.scrollY < top) window.scrollTo({ top, behavior: "smooth" });
}

q?.addEventListener("input", apply);
q?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); toList(); } });
document.querySelectorAll(".dtab").forEach((b) => b.addEventListener("click", () => {
  region = b.dataset.region;
  document.querySelectorAll(".dtab").forEach((o) => o.classList.toggle("on", o === b));
  apply();
  toList();
}));
document.querySelectorAll(".dkind").forEach((b) => b.addEventListener("click", () => {
  kind = b.dataset.kind;
  document.querySelectorAll(".dkind").forEach((o) => o.classList.toggle("on", o === b));
  apply();
}));
// picks and links to #c-<country>: make sure the target is visible even when filtered out
window.addEventListener("hashchange", reveal);
function reveal() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (!el || !el.classList.contains("dc")) return;
  if (el.hidden) {
    region = "all"; kind = "all"; if (q) q.value = "";
    document.querySelectorAll(".dtab, .dkind").forEach((o) => o.classList.toggle("on", o.dataset.region === "all" || o.dataset.kind === "all"));
    apply();
  }
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
  // far countries are drawn only when near the screen (lighter on phones), so their real heights arrive just after the jump:
  // keep landing on the country (instantly, no glide) until it stays put for a few frames - at most about 1 second
  const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  let tries = 0, still = 0;
  const step = () => {
    if (Math.abs(el.getBoundingClientRect().top - want) > 2) { el.scrollIntoView({ block: "start", behavior: "instant" }); still = 0; } else still++;
    if (still < 4 && ++tries < 60) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
window.addEventListener("sk-lang", (ev) => placeholder(ev.detail));
placeholder(lang());
reveal();

// ---------------- rotation: every 2 months each card shows its next photo and the Popular picks change city;
// ~6 weeks before a big event (Songkran, Chinese New Year...) the event city comes first. Same rule as travel_info/destinations.py.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bi = (en, idn, tag = "span", cls = "") => `<${tag}${cls ? ` class="${cls}"` : ""} data-id="${esc(idn)}">${esc(en)}</${tag}>`;
// Wikimedia photos come in standard widths: cards need 500 px (960 px on sharp phone screens), not the 1280 px banner size
const sized = (u, w) => String(u).replace(/\/\d{3,4}px-/, `/${w}px-`);
const srcset = (u) => /\/\d{3,4}px-/.test(u) ? `${sized(u, 500)} 500w, ${sized(u, 960)} 960w` : "";
const SIZES = "(max-width: 700px) 46vw, 340px";
async function rotate() {
  let R;
  try { R = await (await fetch("/data/dest-rotation.json", { cache: "no-cache" })).json(); } catch (e) { return; }
  const forced = (new URLSearchParams(location.search).get("day") || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);   // preview: /destinations?day=2027-03-05
  const now = forced ? new Date(+forced[1], +forced[2] - 1, +forced[3]) : new Date(), iso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const per = now.getFullYear() * 6 + Math.floor(now.getMonth() / 2);
  const pick = (k) => { const l = R.photos[k]; return l && l.length ? l[per % l.length] : null; };
  // 1. place cards: this period's photo + its credit
  document.querySelectorAll(".dp[data-pk]").forEach((card) => {
    const ph = pick(card.dataset.pk), img = card.querySelector(".dp-ph img"), cr = card.querySelector(".dp-bd .cr");
    if (!ph || !img || img.getAttribute("src") === ph[0]) return;
    img.src = sized(ph[0], 500);
    img.srcset = srcset(ph[0]);
    img.sizes = SIZES;
    if (cr) cr.innerHTML = `📷 <a href="${esc(ph[1])}" target="_blank" rel="noopener">${esc(ph[2])}</a> · ${esc(ph[3])}`;
  });
  // 2. Popular picks: events in their window first (soonest first), then this period's 8 from the list
  const grid = document.getElementById("pickGrid");
  if (!grid || !R.pool || !R.pool.length) return;
  const act = (R.events || []).filter((e) => e.from <= iso && iso <= e.end && R.cards[e.k]).sort((a, b) => (a.start < b.start ? -1 : 1));
  const chosen = [], seen = new Set();
  act.forEach((e) => { if (!seen.has(e.k) && chosen.length < R.count) { chosen.push([e.k, e]); seen.add(e.k); } });
  const start = (per * R.count) % R.pool.length;
  for (let i = 0; i < R.pool.length && chosen.length < R.count; i++) { const k = R.pool[(start + i) % R.pool.length]; if (!seen.has(k)) { chosen.push([k, null]); seen.add(k); } }
  grid.innerHTML = chosen.map(([k, e]) => {
    const c = R.cards[k], ph = pick(k);
    if (!c || !ph) return "";
    const sh = e ? e.s || e.l : null;
    const tag = e ? `<span class="pk-top"><span class="pk-when">📅 ${bi(sh[0], sh[1])}</span><span class="pk-evn">🎉 ${bi(e.en, e.id)}</span></span>` : "";
    return `<div class="pick${e ? " pk-event" : ""}"><a class="pk-link" href="#c-${esc(c.slug)}"><img loading="lazy" decoding="async" src="${esc(sized(ph[0], 500))}" srcset="${esc(srcset(ph[0]))}" sizes="${SIZES}" alt="${esc(c.short)}">`
      + `${tag}<span class="pk-tx"><b>${esc(c.short)}</b>${bi(c.cap[0], c.cap[1], "small")}</span></a>`
      + `<a class="sk-btn gold sm pk-q" href="${esc(c.q)}">${bi("Ask for a quotation", "Minta penawaran")}</a></div>`;
  }).join("");
  // 3. the event name on the city's own card further down
  act.forEach((e) => {
    const h = document.querySelector(`.dp[data-pk="${CSS.escape(e.k)}"] .dp-bd h3`);
    if (h && !h.parentNode.querySelector(".dp-ev")) h.insertAdjacentHTML("afterend", `<p class="dp-ev">🎉 ${bi(e.en, e.id, "b")} · ${bi(e.l[0], e.l[1])}</p>`);
  });
  if (window.SK_applyLang) window.SK_applyLang(document.querySelector(".dpicks"));
  if (window.SK_applyLang) window.SK_applyLang(document.querySelector(".dlist"));
}
rotate();

// Staff admin -> "Compare Price": every hotel in a city with its price for the proposed dates, cheapest first.
// A comparison is queued here; the cloud worker runs the tracker bot (RollingGo live prices) and saves the result (database engineTracker).
// Trivago / Google Hotels / Agoda / Booking.com / Trip.com / Traveloka forbid robots, so each hotel has links: staff open them, type the
// cheapest price they see, and the BEST price updates at once. Prices are a snapshot - re-check before confirming to a client.
// The loaders are passed in, so the same code is tested with sample data (tests/compare_ui_harness.html).

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const idr = (x) => (x == null || x === "" || isNaN(x) ? "–" : "Rp " + Math.round(Number(x)).toLocaleString("id-ID"));
const chip = (s) => `<span class="eng-chip ${/^(done)$/.test(s) ? "ok" : /^(queued|running|cancelled)$/.test(s) ? "warn" : "bad"}">${e(s)}</span>`;
const stars = (n) => (Number(n) ? "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "") : "");
const day = (v) => { if (!v) return ""; const t = new Date(typeof v === "number" ? v : String(v)); return isNaN(t) ? String(v) : t.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); };
const short = (d) => { const t = new Date(d + "T00:00:00"); return isNaN(t) ? d : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const LINKS = [["trivago", "Trivago"], ["google", "Google"], ["agoda", "Agoda"], ["booking", "Booking"], ["trip", "Trip.com"], ["traveloka", "Traveloka"], ["bookingUrl", "RollingGo"]];

// best price of one hotel: the lower of the bot's price and the price staff typed
export function best(h, chk) {
  const c = chk && Number(chk.price) > 0 ? Number(chk.price) : null;
  if (c != null && c < h.total) return { total: c, from: chk.where || "checked by hand" };
  return { total: h.total, from: h.source };
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : String(Date.now()) + Math.random().toString(36).slice(2, 10));

export async function compare({ main, toast, listResults, getResult, listJobs, queue, saveChecked, loadArchive = async () => null }) {
  const id = new URLSearchParams(location.hash.split("?")[1] || "").get("id");
  if (id) return detail({ main, toast, getResult, saveChecked, id });
  const [results, jobs, arch] = await Promise.all([listResults(), listJobs(), loadArchive().catch(() => null)]);
  const keptTo = (ms) => (ms ? new Date(Number(ms) + 30 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const doneIds = new Set(results.map((r) => r.id));
  const waiting = jobs.filter((j) => !(j.status === "done" && doneIds.has(saveId(j))) && j.status !== "cancelled").slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  main.innerHTML = `<h1>⚖️ Compare Price</h1>
    <p class="lead">Every hotel in a city with its live price for your dates, cheapest first - for writing a proposal. Then check the
    best ones on Trivago / Agoda / Traveloka with one click and type what you see: the BEST price updates by itself.</p>
    <div class="panel"><h3>New comparison</h3>
      <div class="eng-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:10px">
        <label class="fl">Hotel (optional)<input id="cHotel" placeholder="e.g. Aryaduta Palembang" maxlength="120"></label>
        <label class="fl">City<input id="cCity" placeholder="e.g. Palembang"></label>
        <label class="fl">Country<input id="cCountry" value="Indonesia"></label>
        <label class="fl">Check-in<input id="cIn" type="date" min="${today}"></label>
        <label class="fl">Check-out<input id="cOut" type="date" min="${today}"></label>
        <label class="fl">Arrival time (optional)<input id="cTime" type="time"></label>
        <label class="fl">Rooms<input id="cRooms" type="number" min="1" max="9" value="1"></label>
        <label class="fl">Adults<input id="cAdults" type="number" min="1" max="18" value="2"></label>
        <label class="fl">Children<input id="cKids" type="number" min="0" max="9" value="0"></label>
      </div>
      <div style="margin:8px 0 12px">Stars: ${[5, 4, 3, 2].map((s) => `<label style="margin-right:14px"><input type="checkbox" data-star="${s}" checked> ${s}-star</label>`).join("")}</div>
      <button class="sk-btn gold" id="cGo" type="button">Compare prices</button>
      <p class="help" style="margin-top:10px">With a <b>hotel</b>: that hotel's own room prices come first (highlighted), then the other hotels in the city to compare.
      Without a hotel: every hotel in the city. A new customer request starts a comparison by itself (Admin → Bots switch "compareAuto").<br>The cloud picks it up within about 30 minutes (07:00-22:00 Jakarta time) and the result appears below.
      Prices are for the whole stay, all rooms, in Rupiah - a snapshot at search time.</p></div>
    ${waiting.length ? `<div class="panel"><div class="tools"><h3>Waiting / running</h3><span class="sp"></span><button class="sk-btn sm" id="cRefresh" type="button">Refresh</button></div>
      <table class="t"><tr><th>Asked</th><th>Comparison</th><th>Status</th></tr>${waiting.map((j) => `<tr><td>${e(day(j.createdAt))}</td><td>${e(j.label || "")}${j.status === "failed" || j.status === "refused" ? `<details><summary>Why</summary><pre style="white-space:pre-wrap;font-size:12px">${e(String(j.output || "").slice(-1500))}</pre></details>` : ""}</td><td>${chip(j.status || "")}</td></tr>`).join("")}</table></div>` : ""}
    <div class="panel"><h3>Results</h3>
      <p class="help">History is kept here for <b>1 month</b> (done or failed), then moved automatically to Google Drive - one Google Sheet per year plus an Excel copy.${arch?.trackerArchiveFolder ? ` <a href="${e(arch.trackerArchiveFolder)}" target="_blank" rel="noopener">Open the archive folder</a>` : " The archive folder appears in Google Drive after the first move."}${arch?.trackerArchiveAt ? ` · last check ${e(day(arch.trackerArchiveAt))}${Number(arch.trackerArchiveMoved) ? ` (${e(arch.trackerArchiveMoved)} moved)` : ""}` : ""}</p>
      ${results.length ? `<table class="t"><tr><th>City</th><th>Dates</th><th>Guests</th><th>Hotels</th><th>Cheapest (best)</th><th>Searched</th><th>Kept here until</th></tr>${results.map((r) => {
      const b = (r.hotels || []).map((h) => ({ h, b: best(h, (r.checked || {})[h.k]) })).sort((x, y) => x.b.total - y.b.total)[0];
      return `<tr class="row" data-id="${e(r.id)}"><td>${r.hotel ? `<b>${e(r.hotel)}</b><br><small>${e(r.city || "")}</small>` : `<b>${e(r.city)}</b><br><small>${e(r.country || "")}</small>`}${String(r.id).startsWith("req-") ? `<br><span class="badge">customer request</span>` : ""}</td><td>${e(short(r.checkIn))} → ${e(short(r.checkOut))}<br><small>${e(r.nights)} night(s)${r.time ? " · arrive " + e(r.time) : ""}</small></td><td>${e(r.rooms)} room(s), ${e(r.adults)} adult(s)${Number(r.children) ? `, ${e(r.children)} child(ren)` : ""}</td><td>${(r.hotels || []).length}</td><td>${b ? `${idr(b.b.total)}<br><small>${e(b.h.name)}</small>` : "–"}</td><td><small>${e(r.searchedAt || "")}</small></td><td><small>${e(keptTo(r.createdAt))}</small></td></tr>`;
    }).join("")}</table>` : `<p class="lead">No comparisons yet - start one above.</p>`}</div>`;
  const $ = (s) => main.querySelector(s);
  main.querySelectorAll("tr.row").forEach((tr) => (tr.onclick = () => (location.hash = "#/compare?id=" + tr.dataset.id)));
  if ($("#cRefresh")) $("#cRefresh").onclick = () => compare({ main, toast, listResults, getResult, listJobs, queue, saveChecked });
  $("#cGo").onclick = async () => {
    const v = (s) => $(s).value.trim();
    const city = v("#cCity"), hotel = v("#cHotel"), cin = v("#cIn"), cout = v("#cOut"), st = [...main.querySelectorAll("[data-star]:checked")].map((x) => x.dataset.star);
    if (!(city || hotel) || !cin || !cout) return toast("Please fill in a hotel or a city, plus check-in and check-out.", "err");
    if (cout <= cin) return toast("Check-out must be after check-in.", "err");
    if (cin < today) return toast("Check-in is in the past.", "err");
    if ((new Date(cout) - new Date(cin)) / 864e5 > 28) return toast("At most 28 nights.", "err");
    if (!st.length) return toast("Tick at least one star rating.", "err");
    const rid = newId();
    const args = [...(city ? ["--city", city] : []), ...(hotel ? ["--hotel", hotel] : []), "--country", v("#cCountry") || "Indonesia", "--in", cin, "--out", cout, "--rooms", v("#cRooms") || "1",
      "--adults", v("#cAdults") || "2", "--children", v("#cKids") || "0", "--stars", st.join(","), ...(v("#cTime") ? ["--time", v("#cTime")] : []), "--save-online", rid];
    try {
      await queue("tracker", args, `Compare Price: ${hotel ? hotel + (city ? " / " : "") : ""}${city}, ${short(cin)} → ${short(cout)}`);
      toast("Queued - the result appears here within about 30 minutes.");
      compare({ main, toast, listResults, getResult, listJobs, queue, saveChecked });
    } catch (er) { toast("Could not queue: " + (er.message || er), "err"); }
  };
}

function saveId(job) { const a = job.args || []; const i = a.indexOf("--save-online"); return i >= 0 ? a[i + 1] : ""; }

async function detail({ main, toast, getResult, saveChecked, id }) {
  const r = await getResult(id);
  if (!r) { main.innerHTML = `<p class="lead">This comparison was not found. <a href="#/compare">Back</a></p>`; return; }
  const checked = { ...(r.checked || {}) };
  const hotels = r.hotels || [];
  const starList = [...new Set(hotels.map((h) => h.stars))].sort((a, b) => b - a);
  let dirty = false;
  main.innerHTML = `<p><a href="#/compare">← All comparisons</a></p>
    <h1>⚖️ ${e(r.hotel || r.city)} <small style="font-size:18px;color:var(--mute)">${r.hotel && r.city ? e(r.city) + " · " : ""}${e(short(r.checkIn))} → ${e(short(r.checkOut))}</small></h1>
    ${r.hotel && r.hotelNote ? `<div class="notice">⚠️ ${e(r.hotel)}: ${e(r.hotelNote)} - compare with the hotels below, or check it by hand.</div>` : ""}
    <p class="lead">${e(r.nights)} night(s)${r.time ? ", arrival " + e(r.time) : ""} · ${e(r.rooms)} room(s), ${e(r.adults)} adult(s)${Number(r.children) ? `, ${e(r.children)} child(ren)` : ""} ·
      ${hotels.length} hotels · searched ${e(r.searchedAt || "")}. Prices are totals for the whole stay in Rupiah.</p>
    <div class="panel"><div class="tools"><a class="sk-btn gold" href="${e(r.trivagoCity)}" target="_blank" rel="noopener">${r.city ? `Trivago - whole ${e(r.city)} (all sites, cheapest first)` : `Trivago - ${e(r.hotel)}`}</a>
      <span class="help">Trivago may ask for the dates again.</span></div><div id="sum"></div></div>
    <div class="panel"><div class="tools">
      <select id="fStar"><option value="">All stars</option>${starList.map((s) => `<option value="${s}">${s}-star</option>`).join("")}</select>
      <input id="fName" placeholder="Search hotel name">
      <label><input type="checkbox" id="fChk"> Only hotels I checked</label><span class="sp"></span>
      <button class="sk-btn sm gold" id="save" type="button">Save checked prices</button></div>
      <p class="help">How to check: press <b>Trivago</b> (that hotel on Trivago - all booking sites) or <b>Google</b>, find the cheapest TOTAL for these dates,
      type it in <b>Checked total</b> and the site in <b>Where</b>. The <b>BEST</b> column takes the lower price.</p>
      <div id="tbl"></div></div>`;
  const $ = (s) => main.querySelector(s);
  const draw = () => {
    const fs = $("#fStar").value, fn = $("#fName").value.trim().toLowerCase(), fc = $("#fChk").checked;
    const rows = hotels.map((h) => ({ h, b: best(h, checked[h.k]) }))
      .filter((x) => (!fs || String(x.h.stars) === fs) && (!fn || x.h.name.toLowerCase().includes(fn)) && (!fc || checked[x.h.k]))
      .sort((x, y) => (y.h.focus ? 1 : 0) - (x.h.focus ? 1 : 0) || x.b.total - y.b.total);      // the asked hotel's rooms first
    $("#tbl").innerHTML = `<table class="t"><tr><th>#</th><th>Hotel</th><th>Bot price</th><th>Check on</th><th>Checked total</th><th>Where</th><th>BEST</th></tr>${rows.map((x, i) => {
      const c = checked[x.h.k] || {};
      return `<tr${x.h.focus ? ' style="background:#fbf3df"' : ""}><td>${i + 1}</td><td><b>${e(x.h.name)}</b> <span style="color:#b98a2e">${stars(x.h.stars)}</span>${x.h.focus ? ' <span class="badge">asked hotel</span>' : ""}<br><small>${e(x.h.address || "")}</small></td>
        <td>${idr(x.h.total)}<br><small>${idr(x.h.perNight)}/night · ${e(x.h.source)}</small></td>
        <td style="min-width:150px">${LINKS.filter(([k]) => x.h[k]).map(([k, n]) => `<a href="${e(x.h[k])}" target="_blank" rel="noopener" style="display:inline-block;margin:2px 6px 2px 0;font-size:13px">${n}</a>`).join("")}</td>
        <td><input data-k="${e(x.h.k)}" data-f="price" type="number" min="0" step="1000" value="${e(c.price ?? "")}" style="width:130px;height:38px"></td>
        <td><input data-k="${e(x.h.k)}" data-f="where" value="${e(c.where ?? "")}" placeholder="e.g. Agoda" style="width:110px;height:38px"></td>
        <td><b>${idr(x.b.total)}</b><br><small>${e(x.b.from)}</small></td></tr>`;
    }).join("")}</table>${rows.length ? "" : `<p class="lead">No hotels match.</p>`}`;
    main.querySelectorAll("[data-k]").forEach((inp) => (inp.onchange = () => {
      const k = inp.dataset.k, cur = { ...(checked[k] || {}) };
      if (inp.dataset.f === "price") cur.price = inp.value === "" ? null : Math.round(Number(inp.value)); else cur.where = inp.value.trim().slice(0, 40);
      if (cur.price == null && !cur.where) delete checked[k]; else checked[k] = cur;
      dirty = true; draw(); summary();
    }));
  };
  const summary = () => {
    const all = hotels.map((h) => ({ h, b: best(h, checked[h.k]) })).sort((x, y) => x.b.total - y.b.total);
    const per = starList.map((s) => all.find((x) => x.h.stars === s)).filter(Boolean);
    $("#sum").innerHTML = all.length ? `<table class="t" style="margin-top:8px"><tr><th></th><th>Hotel</th><th>BEST total</th><th>From</th></tr>
      ${(() => { const f = all.find((x) => x.h.focus), alt = all.find((x) => !x.h.focus); return f ? `<tr style="background:#fbf3df"><td><b>Asked hotel - cheapest room</b></td><td>${e(f.h.name)}</td><td><b>${idr(f.b.total)}</b></td><td>${e(f.b.from)}</td></tr>${alt ? `<tr><td><b>Cheapest other hotel</b></td><td>${e(alt.h.name)}</td><td>${idr(alt.b.total)}</td><td>${e(alt.b.from)}</td></tr>` : ""}` : ""; })()}
      <tr><td><b>Cheapest overall</b></td><td>${e(all[0].h.name)}</td><td><b>${idr(all[0].b.total)}</b></td><td>${e(all[0].b.from)}</td></tr>
      ${per.map((x) => `<tr><td>${x.h.stars}-star</td><td>${e(x.h.name)}</td><td>${idr(x.b.total)}</td><td>${e(x.b.from)}</td></tr>`).join("")}</table>` : "";
  };
  ["#fStar", "#fName", "#fChk"].forEach((s) => ($(s).oninput = draw));
  $("#save").onclick = async () => {
    try { await saveChecked(id, checked); dirty = false; toast("Checked prices saved."); } catch (er) { toast("Could not save: " + (er.message || er), "err"); }
  };
  addEventListener("hashchange", function warn() { removeEventListener("hashchange", warn); if (dirty) toast("Checked prices were NOT saved.", "err"); });
  draw(); summary();
}

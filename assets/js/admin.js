// Staff admin: requests (customers), hotels, tour packages, offers, destinations, page settings, team, backup.
import * as C from "./sk-core.js";
import { engines as enginesView } from "./admin-engines.js";
import { quotes as quotesView } from "./admin-quotes.js";
import { bots as botsView } from "./admin-bots.js";
import { compare as compareView } from "./admin-compare.js";
import { travelAlerts } from "./admin-alerts.js";
import { priceRules } from "./admin-prices.js";
import { reels as reelsView } from "./admin-reels.js";
import { sales as salesView } from "./admin-sales.js";
import { visitors as visitorsView } from "./admin-visitors.js";
import { seoChecklist } from "./admin-seo.js";
import { poster as posterView } from "./admin-poster.js";
import { smartTable } from "./admin-table.js";
import { guideBox, replyPicker, waRepliesView, logWa, createWaRequest, addReceipt } from "./admin-guide.js";
import { loadPicIndex, picFromIndex } from "./fastlist.js";
const { $, $$, esc, db, F, auth, toast, modal, STATUS, renderStatus, fmtDate, waLink, plain, clean, saveImage, thumbFromFile, fileToDataUrl, loadImage, onUser, signOut, isStaffUser, openAuth, OWNERS } = C;
const main = $("#main");
let me = null, owner = false;
const col = (n) => F.collection(db, n);
// A deleted hotel is written on a short list (one document) so the cloud robot can take it off the website's compact hotel list
// without re-reading every hotel. Newest 1000 are kept.
async function noteDeletedHotel(id) {
  try {
    const ref = F.doc(db, "engineControl", "deletedHotels");
    const old = (await F.getDoc(ref)).data()?.ids || [];
    const ids = [...old.filter((x) => x && x.id !== id), { id, at: new Date().toISOString() }].slice(-1000);
    await F.setDoc(ref, { ids, updatedAt: F.serverTimestamp(), updatedBy: auth.currentUser?.email || "" });
  } catch (e) { toast("The hotel is deleted, but the website's hotel list was not told: " + e.message, "err"); }
}
const dref = (n, id) => F.doc(db, n, id);
const val = (el) => (el ? el.value.trim() : "");
const when = (ts) => fmtDate(ts) || "—";

// ------------------------------------------------------------------ sign in gate
$("#loginBtn").onclick = () => openAuth({ staff: true });
$("#outBtn").onclick = () => signOut();
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");
onUser(async (u) => {
  if (!u) { show(false); $("#loginMsg").textContent = "Sign in with your Google account to manage hotels, tour packages and customer requests."; return; }
  if (!u.emailVerified) { show(false); $("#loginMsg").textContent = `${u.email}: this e-mail is not verified, so it cannot open the admin.`; return; }
  if (!(await isStaffUser(u))) { show(false); $("#loginMsg").innerHTML = `You are signed in as <b>${esc(u.email)}</b>, but this account is not on the staff list. <button class="sk-link" id="so" type="button">Sign out</button>`; $("#so").onclick = () => signOut(); return; }
  me = u; owner = OWNERS.includes(u.email.toLowerCase()); $("#meMail").textContent = u.email; const av = $("#meAv"); if (av) av.textContent = (u.displayName || u.email || "S").trim()[0]; show(true); route();
});
function show(on) { $("#loginBtn").style.display = ""; $("#login").style.display = on ? "none" : "grid"; $("#shell").style.display = on ? "block" : "none"; $("#menuBtn").style.display = on ? "" : "none"; }
addEventListener("hashchange", () => me && route());

// ------------------------------------------------------------------ router
const ROUTES = { dashboard, requests, hotels: () => crud("hotels"), tours: () => crud("tours"), offers: () => crud("offers"), destinations: () => crud("destinations"), customers, settings, team, backup, engines, quotes, bots, compare, alerts: () => travelAlerts({ main, toast, db, F, me }), prices: () => priceRules({ main, toast, db, F, me }), reels: () => reelsView({ main, toast, db, F, me }), poster: () => posterView({ main, toast, db, F, me }), sales: () => salesView({ main, toast, db, F, me }), wareplies: () => waRepliesView({ main }), visitors: () => visitorsView({ main, getToken: () => auth.currentUser.getIdToken() }), seo: () => seoChecklist({ main, toast, me, getToken: () => auth.currentUser.getIdToken(),
    load: async (n) => { const sn = await F.getDoc(dref("engineControl", n)); return sn.exists() ? sn.data() : null; },
    saveChecks: (items) => F.setDoc(dref("engineControl", "seoChecklist"), { items, updatedBy: me.email, updatedAt: F.serverTimestamp() }) }) };
async function route() {
  const r = (location.hash.replace(/^#\//, "") || "dashboard").split("?")[0];
  $$("#side a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  const here = $(`#side a[data-r="${r}"] .tx`), pt = $("#pageTitle");                // the page name in the top bar
  if (pt) pt.textContent = here ? here.textContent.trim() : "Dashboard";
  document.title = `${pt ? pt.textContent : "Admin"} - Staff admin - Satu Koneksi Hotel`;
  $("#side").classList.remove("open");
  main.innerHTML = `<p class="lead">Loading…</p>`;
  try { await (ROUTES[r] || dashboard)(); } catch (e) { console.error(e); main.innerHTML = `<div class="panel"><h3>Something went wrong</h3><p class="sk-err">${esc(e.message || e)}</p><p>Try reloading the page. If it keeps happening, tell Claude what you were doing.</p></div>`; }
  updateNewCount();
}
async function count(q) { try { return (await F.getCountFromServer(q)).data().count; } catch { return "?"; } }
async function updateNewCount() { const n = await count(F.query(col("requests"), F.where("status", "in", ["new", "accepted", "paymentSent"]))); const el = $("#newCount"); el.textContent = n; el.style.display = n && n !== "?" ? "inline" : "none"; }

// ------------------------------------------------------------------ engines (results of the Python bots, saved from the office PC)
async function engines() {
  const one = async (n) => { const sn = await F.getDoc(dref("engines", n)); return sn.exists() ? sn.data() : null; };
  await enginesView({
    main, toast,
    load: one,
    loadResearch: async () => (await F.getDocs(col("engineResearch"))).docs.map(plain),
    loadPosts: async () => (await F.getDocs(col("enginePosts"))).docs.map(plain).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.topic).localeCompare(String(b.topic))),
    savePost: (id, d) => F.updateDoc(dref("enginePosts", id), { status: d.status, staffNote: d.staffNote, updatedAt: F.serverTimestamp(),
      ...(d.status === "approved" ? { approvedBy: me?.email || "", approvedAt: F.serverTimestamp() } : {}) }),
    loadSocial: async () => { const sn = await F.getDoc(dref("engineControl", "social")); return sn.exists() ? sn.data() : null; },
  });
}

// ------------------------------------------------------------------ quotes (prepared by the PC quotes engine for website hotel enquiries; MG trade rates = staff only)
async function quotes() {
  await quotesView({
    main, toast,
    list: async () => (await F.getDocs(col("engineQuotes"))).docs.map(plain).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
    save: (id, d) => F.updateDoc(dref("engineQuotes", id), { ...d, updatedAt: F.serverTimestamp() }),
  });
}

// ------------------------------------------------------------------ bots (queue jobs for the cloud worker; the office PC is only a backup)
async function bots() {
  await botsView({
    main, toast,
    listJobs: async () => (await F.getDocs(col("engineJobs"))).docs.map(plain).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, 40),
    queue: (engine, args, label) => F.addDoc(col("engineJobs"), { engine, args, label, requestedBy: me.email, status: "queued", createdAt: F.serverTimestamp() }),
    cancel: (id) => F.updateDoc(dref("engineJobs", id), { status: "cancelled", updatedAt: F.serverTimestamp() }),
    loadWorker: async () => { const sn = await F.getDoc(dref("engines", "worker")); return sn.exists() ? sn.data() : null; },
    loadSpeed: async () => { const sn = await F.getDoc(dref("engineControl", "speed")); return sn.exists() ? sn.data() : null; },
    loadSearch: async () => { const sn = await F.getDoc(dref("engineControl", "searchreport")); return sn.exists() ? sn.data() : null; },
    loadSeo: async () => { const sn = await F.getDoc(dref("engineControl", "seo")); return sn.exists() ? sn.data() : null; },
    loadSeoDeep: async () => { const sn = await F.getDoc(dref("engineControl", "seodeep")); return sn.exists() ? sn.data() : null; },
    loadGuard: async () => { const sn = await F.getDoc(dref("engineControl", "guard")); return sn.exists() ? sn.data() : null; },
    loadSwitches: async () => { const sn = await F.getDoc(dref("engineControl", "switches")); return sn.exists() ? sn.data() : null; },
    saveSwitches: (d) => F.setDoc(dref("engineControl", "switches"), { ...d, updatedBy: me.email, updatedAt: F.serverTimestamp() }),
    inboxInfo: async () => {
      const sn = await F.getDoc(dref("engineControl", "inbox")).catch(() => null);
      const n = (s) => count(F.query(col("hotelInbox"), F.where("status", "==", s)));
      const [waiting, done, failed] = await Promise.all([n("new"), n("done"), n("failed")]);
      return { hasCode: !!(sn && sn.exists()), updatedAt: sn && sn.exists() ? sn.data().updatedAt : null, waiting, done, failed };
    },
    newInboxCode: async () => {
      const a = new Uint8Array(24); crypto.getRandomValues(a);
      const code = [...a].map((x) => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join("");
      await F.setDoc(dref("engineControl", "inbox"), { code, updatedBy: me.email, updatedAt: F.serverTimestamp() });
      return code;
    },
  });
}

// ------------------------------------------------------------------ compare price (tracker bot: every hotel in a city, cheapest first; staff add hand-checked prices)
async function compare() {
  await compareView({
    main, toast,
    listResults: async () => (await F.getDocs(col("engineTracker"))).docs.map(plain).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
    getResult: async (id) => { const sn = await F.getDoc(dref("engineTracker", id)); return sn.exists() ? { id: sn.id, ...sn.data() } : null; },
    listJobs: async () => (await F.getDocs(F.query(col("engineJobs"), F.where("engine", "==", "tracker")))).docs.map(plain).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
    queue: (engine, args, label) => F.addDoc(col("engineJobs"), { engine, args, label: label.slice(0, 120), requestedBy: me.email, status: "queued", createdAt: F.serverTimestamp() }),
    saveChecked: (id, checked) => F.updateDoc(dref("engineTracker", id), { checked, updatedAt: F.serverTimestamp() }),
    loadArchive: async () => { const sn = await F.getDoc(dref("engines", "alerts")); return sn.exists() ? plain(sn) : null; },
  });
}

// ------------------------------------------------------------------ dashboard
// The robot queue: what is waiting for the cloud robot (GitHub), when it last ran and how many of GitHub's free minutes it used this month.
// All read online (a few count queries + 2 documents) - nothing depends on the office PC.
function robotQueue(nJobs, nInbox, worker, sw) {
  const t = Date.parse(String(worker?.lastSeen || "").replace(" UTC", "Z").replace(" ", "T")), ago = isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
  const agoTxt = ago == null ? "never" : ago < 90 ? ago + " min ago" : ago < 2880 ? Math.round(ago / 60) + " hours ago" : Math.round(ago / 1440) + " days ago";
  const month = new Date().toISOString().slice(0, 7), used = worker?.minutesMonth === month ? +worker.minutesUsed || 0 : 0, guard = +sw?.minutesGuard || 1500;
  const late = ago == null || ago > 8 * 60;
  return `<div class="panel" style="border-left:4px solid ${late ? "#b42318" : "#12602c"}"><div class="tools"><h3 style="font:700 20px 'Plus Jakarta Sans'">🤖 Robot queue</h3><span class="sp"></span><a class="sk-btn sm" href="#/bots">Robot settings</a></div>
    <div class="tiles"><a class="tile${nJobs ? " hot" : ""}" href="#/bots"><b>${nJobs}</b><span>Admin jobs waiting for the robot</span></a>
    <a class="tile" href="#/bots"><b>${nInbox}</b><span>Hotels from the second PC waiting</span></a>
    <div class="tile"><b style="font-size:20px">${esc(agoTxt)}</b><span>Robot last ran (${esc(worker?.runner || "-")})</span></div>
    <div class="tile${used >= guard ? " hot" : ""}"><b style="font-size:20px">${used} / 2,000</b><span>GitHub minutes this month (guard ${guard})</span></div></div>
    <p class="help">Customer requests always arrive here at once, and Google sends the WhatsApp / e-mail alert. The robot only adds the automatic price comparison and the quote draft.
    ${late ? "<b>The robot has not run for a while</b> - answer new requests by hand (open them below); the automatic comparison follows when the robot runs again." : ""}</p></div>`;
}
// ---- staff-only supplier and margin (Admin request window). Stored in requestNotes/<id>, which customers can never read.
const SUPPLIERS = ["MG Bedbank", "WebBeds", "Hotel direct", "Online (RollingGo / OTA)", "Other"];
function marginOf(sell, cost) {
  const margin = Math.round(Number(sell) - Number(cost));
  return { margin, pct: Number(sell) ? Math.round((margin / Number(sell)) * 1000) / 10 : 0 };
}
function supplierBlock(r, nd, qt) {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const expired = nd.validUntil && nd.validUntil < today && ["quoted", "accepted", "contacted", "new"].includes(r.status);
  const mgSeen = qt?.mg?.cheapest?.totalIDR || qt?.mgManual?.total || null;
  return `<div style="border:1.5px dashed #b38d40;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fffaf0">
    <b>🔒 Supplier and margin - staff only (the customer never sees this)</b>
    ${expired ? `<div class="notice" style="margin:8px 0;border-color:#b42318;color:#b42318">This quote expired on <b>${esc(nd.validUntil)}</b>. Check the supplier price again before you confirm the booking.</div>` : ""}
    <div class="row3" style="margin-top:8px"><label>Supplier<select name="supplier"><option value="">—</option>${SUPPLIERS.map((s) => `<option${nd.supplier === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label>Supplier cost - total (Rp)<input name="supplierCost" type="number" min="0" step="1000" value="${nd.supplierCost ?? ""}" placeholder="${mgSeen ? "MG rate seen: " + Math.round(mgSeen) : ""}"></label>
    <label>Supplier confirmation no.<input name="supplierRef" maxlength="80" value="${esc(nd.supplierRef || "")}" placeholder="e.g. MG-123456"></label></div>
    <div class="row2"><label>Supplier price checked on<input name="rateCheckedAt" type="date" value="${esc(nd.rateCheckedAt || "")}"></label>
    <label>Quote valid until<input name="validUntil" type="date" value="${esc(nd.validUntil || "")}"></label></div>
    <p class="help" id="marginOut" style="margin:4px 0 0"></p></div>`;
}
function expiring(list) {
  if (!list.length) return "";
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `<div class="panel" style="border-left:4px solid #b42318"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">⏳ Quotes expiring (${list.length})</h3>
    <table class="t"><tr><th>Valid until</th><th>Who</th><th>Price</th><th>Margin</th></tr>${list.map((d) => `<tr class="row" data-fu="${esc(d.id)}" style="cursor:pointer"><td>${esc(d.validUntil)}${d.validUntil < today ? ' <small style="color:#b42318;font-weight:700">expired</small>' : ""}</td><td><b>${esc(d.who || d.id)}</b></td><td>${d.quoteTotal ? "Rp " + Number(d.quoteTotal).toLocaleString("id-ID") : "—"}</td><td>${d.margin != null ? "Rp " + Number(d.margin).toLocaleString("id-ID") + ` (${d.marginPct}%)` : "—"}</td></tr>`).join("")}</table>
    <p class="help">Quotes not yet paid whose "valid until" date is today, tomorrow or past. Check the supplier price again, or tell the customer.</p></div>`;
}
// Follow-ups that are due today or earlier (Admin request -> "Next follow-up date"; corporate leads first)
function followUps(due) {
  if (!due.length) return "";
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `<div class="panel" style="border-left:4px solid #b38d40"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">📅 Follow-ups due (${due.length})</h3>
    <table class="t"><tr><th>Due</th><th>Who</th><th>Type</th><th>Assigned to</th></tr>${due.map((d) => `<tr class="row" data-fu="${esc(d.id)}" style="cursor:pointer"><td>${esc(d.followUp)}${d.followUp < today ? ' <small style="color:#b42318;font-weight:700">late</small>' : ""}</td><td><b>${esc(d.who || d.id)}</b></td><td>${esc(d.kind === "corporate" ? "🏢 Corporate" : d.kind || "")}</td><td>${esc(d.assignedTo || "—")}</td></tr>`).join("")}</table></div>`;
}
async function dashboard() {
  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const due = await F.getDocs(F.query(col("requestNotes"), F.where("followUp", "<=", todayStr), F.where("followUp", ">", ""), F.limit(30)))
    .then((s) => s.docs.map(plain).sort((a, b) => (a.kind === "corporate" ? 0 : 1) - (b.kind === "corporate" ? 0 : 1) || String(a.followUp).localeCompare(String(b.followUp)))).catch(() => []);
  const tomorrow = new Date(Date.now() + 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const exp = await F.getDocs(F.query(col("requestNotes"), F.where("validUntil", "<=", tomorrow), F.where("validUntil", ">", ""), F.limit(40)))
    .then((s) => s.docs.map(plain).filter((d) => ["new", "contacted", "quoted", "accepted"].includes(d.status)).sort((a, b) => String(a.validUntil).localeCompare(String(b.validUntil)))).catch(() => []);
  const [nNew, nOpen, nH, nT, nO, nJobs, nInbox, wk, swd] = await Promise.all([
    count(F.query(col("requests"), F.where("status", "in", ["new", "accepted", "paymentSent"]))),
    count(F.query(col("requests"), F.where("status", "in", ["contacted", "quoted"]))),
    count(F.query(col("hotels"), F.where("published", "==", true))), count(F.query(col("tours"), F.where("published", "==", true))),
    count(F.query(col("offers"), F.where("published", "==", true))),
    count(F.query(col("engineJobs"), F.where("status", "==", "queued"))), count(F.query(col("hotelInbox"), F.where("status", "==", "new"))),
    F.getDoc(dref("engines", "worker")).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
    F.getDoc(dref("engineControl", "switches")).then((s) => (s.exists() ? s.data() : null)).catch(() => null)]);
  const latest = (await F.getDocs(F.query(col("requests"), F.orderBy("createdAt", "desc"), F.limit(8)))).docs.map(plain);
  main.innerHTML = `<h1>Welcome back 👋</h1><p class="lead">Here is what is happening on your website.</p>
  <div class="tiles"><a class="tile hot" href="#/requests"><b>${nNew}</b><span>New requests</span></a><a class="tile" href="#/requests"><b>${nOpen}</b><span>In progress</span></a>
  <a class="tile" href="#/hotels"><b>${nH}</b><span>Hotels on the website</span></a><a class="tile" href="#/tours"><b>${nT}</b><span>Tour packages online</span></a></div>
  ${robotQueue(nJobs, nInbox, wk, swd)}
  ${followUps(due)}
  ${expiring(exp)}
  <div class="panel"><div class="tools"><h3 style="font:700 20px 'Plus Jakarta Sans'">Latest requests</h3><span class="sp"></span><a class="sk-btn sm" href="#/requests">See all</a></div>
  ${latest.length ? requestTable(latest) : `<p class="lead">No requests yet. When a customer sends one from the website, it appears here.</p>`}</div>
  <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:10px">Quick start</h3>
  <p>1. <a href="#/hotels" style="color:var(--gold)"><b>Add a hotel</b></a> or a <a href="#/tours" style="color:var(--gold)"><b>tour package</b></a> – it shows on the website as soon as you switch “Show on website” on.<br>
  2. Customers sign in, send a quotation request, and you answer on WhatsApp. Change the status so they can follow it in their account.<br>
  3. Pictures are shrunk automatically – just choose the photos from your PC or phone.</p></div>`;
  bindRows(latest);
  $$("[data-fu]", main).forEach((tr) => tr.onclick = async () => { const sn = await F.getDoc(dref("requests", tr.dataset.fu)); if (sn.exists()) openRequest(plain(sn), () => route()); });
}
function requestTable(list) {
  return `<table class="t"><tr><th>When</th><th>Customer</th><th>For</th><th>Dates</th><th>Status</th></tr>${list.map((r) => `<tr class="row" data-id="${r.id}"><td>${when(r.createdAt)}</td><td><b>${esc(r.name)}</b><br><small>${esc(r.whatsapp)}</small></td><td>${esc(r.refName || (r.kind === "general" ? "General request" : r.kind))}<br><small>${esc(r.kind)}</small></td><td>${esc(r.checkIn || "")}${r.checkOut ? " → " + esc(r.checkOut) : ""}</td><td>${renderStatus(r.status)}${r.lastMsgFrom === "customer" ? '<br><small style="color:#c2410c;font-weight:700">💬 customer wrote</small>' : ""}</td></tr>`).join("")}</table>`;
}
function bindRows(list) { $$("tr.row", main).forEach((tr) => tr.onclick = () => openRequest(list.find((x) => x.id === tr.dataset.id), () => route())); }

// ------------------------------------------------------------------ requests
let reqCache = [];
// a customer who wrote on WhatsApp (no website request): staff type the details, the request appears in Requests with the
// "What to do now" steps, and the customer's message is saved in its conversation (admin-guide.js createWaRequest)
function addWaRequestForm() {
  const m = modal(`<h3>＋ Add a WhatsApp request</h3><p class="sk-sub">For a customer who wrote on WhatsApp. The request goes into Requests with its steps, and the message is saved in the conversation.</p>
  <form id="wf"><div class="row2"><label>Customer name *<input name="name" required maxlength="100"></label><label>WhatsApp number *<input name="phone" type="tel" required maxlength="30" placeholder="+62 …"></label></div>
  <div class="row2"><label>E-mail (optional)<input name="email" type="email" maxlength="120"></label><label>Type<select name="kind"><option value="hotel">Hotel</option><option value="tour">Tour</option><option value="general">General question</option></select></label></div>
  <div class="row2"><label>Hotel (if the customer named one)<input name="hotel" maxlength="160"></label><label>City<input name="city" maxlength="80"></label></div>
  <div class="row2"><label>Country<input name="country" maxlength="60" placeholder="Indonesia"></label><label>Language<select name="lang"><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></label></div>
  <div class="row2"><label>Check-in<input name="checkIn" type="date"></label><label>Check-out<input name="checkOut" type="date"></label></div>
  <div class="row3"><label>Adults<input name="adults" type="number" min="1" max="60" value="2"></label><label>Children<input name="children" type="number" min="0" max="40" value="0"></label><label>Rooms<input name="rooms" type="number" min="1" max="30" value="1"></label></div>
  <label>The customer's WhatsApp message (paste it here)<textarea name="message" maxlength="2000" rows="4" placeholder="Paste exactly what the customer wrote"></textarea></label>
  <div class="fh"><button class="sk-btn gold" type="submit">Save the request</button></div></form>`, { wide: true });
  m.q("#wf").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const id = await createWaRequest(v, String(v.message || "").trim());
      m.close(); toast("WhatsApp request saved - follow the yellow box.");
      await requests();
      const sn = await F.getDoc(dref("requests", id)); if (sn.exists()) openRequest(plain(sn), () => route());
    } catch (er) { toast(er.message || "Could not save.", "err"); btn.disabled = false; }
  };
}

async function requests() {
  const snap = await F.getDocs(F.query(col("requests"), F.orderBy("createdAt", "desc"), F.limit(300)));
  reqCache = snap.docs.map(plain);
  main.innerHTML = `<h1>Requests</h1><p class="lead">Quotation and booking requests from customers. Click a row to answer, change the status or add notes.</p>
  <div class="panel"><div class="tools"><input id="q" type="search" placeholder="Search name, phone, hotel…" style="min-width:240px">
  <select id="fs"><option value="">All statuses</option>${Object.keys(STATUS).map((s) => `<option value="${s}">${STATUS[s][0]}</option>`).join("")}</select>
  <select id="fk"><option value="">Hotels + tours</option><option value="hotel">Hotels</option><option value="tour">Tours</option><option value="general">General</option><option value="corporate">Corporate</option></select>
  <select id="fsrc"><option value="">All channels</option>${Object.entries(C.SOURCES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select><span class="sp"></span>
  <button class="sk-btn sm gold" id="addWa" type="button">＋ Add WhatsApp request</button><button class="sk-btn sm" id="csv" type="button">⬇ Export to Excel</button></div><p class="help" id="alertsLine"></p><div id="tb"></div><p class="help" id="more"></p></div><div id="bySource"></div>`;
  alertsStatus($("#alertsLine"));
  $("#addWa").onclick = () => addWaRequestForm();
  $("#bySource").innerHTML = bySource(reqCache);
  const ms = (t) => (t?.toMillis ? t.toMillis() : t ? +new Date(t) || 0 : 0), ORDER = Object.keys(STATUS);
  const setStatus = (status) => async (list) => {        // the same fields the request window saves (requestNotes keeps the status for the dashboard lists)
    const res = await Promise.allSettled(list.map(async (r) => {
      const b = F.writeBatch(db);
      b.update(dref("requests", r.id), { status, updatedAt: F.serverTimestamp() });
      b.set(dref("requestNotes", r.id), { status, updatedAt: F.serverTimestamp() }, { merge: true });
      await b.commit(); r.status = status;
    }));
    const bad = res.filter((x) => x.status === "rejected").length;
    toast(bad ? `${list.length - bad} changed, ${bad} could not be changed.` : `${list.length} marked "${STATUS[status][0]}".`, bad ? "err" : undefined); updateNewCount();
  };
  const tbl = smartTable($("#tb"), {
    key: "requests", sort: "when", dir: -1, empty: "Nothing found.", open: (r) => openRequest(r, () => route()),
    cols: [
      { k: "when", label: "When", sort: (r) => ms(r.createdAt), html: (r) => `<span class="nowrap">${esc(when(r.createdAt))}</span>` },
      { k: "who", label: "Customer", sort: (r) => String(r.company || r.name || "").toLowerCase(), html: (r) => `<b>${esc(r.kind === "corporate" && r.company ? r.company : r.name)}</b><div class="sub">${esc(r.kind === "corporate" && r.company ? r.name + " · " : "")}${esc(r.whatsapp)}</div>` },
      { k: "for", label: "For", sort: (r) => String(r.refName || "").toLowerCase(), cls: "ttl", html: (r) => `${esc(r.refName || (r.kind === "general" ? "General request" : r.kind))}<div class="sub">${esc(r.kind)}</div>` },
      { k: "dates", label: "Dates", sort: (r) => r.checkIn || "", html: (r) => `<span class="nowrap">${esc(r.checkIn || "—")}${r.checkOut ? " → " + esc(r.checkOut) : ""}</span>` },
      { k: "src", label: "Channel", sort: (r) => C.SOURCES[r.source] || "~", html: (r) => esc(C.SOURCES[r.source] || "—") },
      { k: "status", label: "Status", sort: (r) => ORDER.indexOf(r.status), html: (r) => `${renderStatus(r.status)}${r.lastMsgFrom === "customer" ? '<div class="sub" style="color:#c2410c;font-weight:700">💬 customer wrote</div>' : ""}` },
    ],
    actions: [
      { id: "contacted", label: "Mark contacted", run: setStatus("contacted") },
      { id: "completed", label: "Mark completed", run: setStatus("completed") },
      { id: "cancelled", label: "Mark cancelled", confirm: (l) => `Mark ${l.length} request(s) as cancelled? Customers who gave an e-mail get the usual "cancelled" e-mail.`, run: setStatus("cancelled") },
      { id: "csv", label: "⬇ Export ticked", run: async (l) => csvDownload("requests-ticked", l.map(reqRow)) },
      { id: "del", label: "Delete", cls: "red", confirm: (l) => `Delete ${l.length} request(s) for good? This cannot be undone.`,
        run: async (l) => {
          const res = await Promise.allSettled(l.map(async (r) => { await F.deleteDoc(dref("requests", r.id)); await F.deleteDoc(dref("requestNotes", r.id)).catch(() => {}); }));
          const gone = new Set(l.filter((_, i) => res[i].status === "fulfilled").map((r) => r.id));
          reqCache = reqCache.filter((r) => !gone.has(r.id)); toast(`${gone.size} deleted.`); updateNewCount(); draw();
        } },
    ],
  });
  const draw = () => {
    const q = val($("#q")).toLowerCase(), s = $("#fs").value, k = $("#fk").value, src = $("#fsrc").value;
    tbl.set(reqCache.filter((r) => (!s || r.status === s) && (!k || r.kind === k) && (!src || r.source === src) && (!q || [r.name, r.company, r.whatsapp, r.email, r.refName, r.message].join(" ").toLowerCase().includes(q))));
    $("#more").textContent = reqCache.length >= 300 ? "Showing the latest 300 requests. Older ones are in the Backup & export page." : "";
  };
  ["q", "fs", "fk", "fsrc"].forEach((i) => $("#" + i).oninput = draw); draw();
  $("#csv").onclick = () => csvDownload("requests", reqCache.map(reqRow));
}
// one request as a row of the Excel export
function reqRow(r) {
  return ({ Date: when(r.createdAt), Status: r.status, Type: r.kind, Channel: C.SOURCES[r.source] || "", For: r.refName, City: r.refCity, Name: r.name, WhatsApp: r.whatsapp, Email: r.email, CheckIn: r.checkIn, CheckOut: r.checkOut, Adults: r.adults, Children: r.children, Rooms: r.rooms, Message: r.message, "Note shown to customer": r.publicNote, Language: r.lang });
}
// Which channel brings requests and bookings (from the requests already loaded - no extra reads)
const BOOKED = ["confirmed", "completed"];
function bySource(list) {
  const rows = {};
  for (const r of list) {
    const k = r.source || "unknown", x = (rows[k] ||= { n: 0, quoted: 0, booked: 0, value: 0 });
    x.n++; if (r.quoteTotal || ["quoted", "accepted", "paymentSent", ...BOOKED].includes(r.status)) x.quoted++;
    if (BOOKED.includes(r.status)) { x.booked++; x.value += Number(r.quoteTotal) || 0; }
  }
  const keys = Object.keys(rows).sort((a, b) => rows[b].n - rows[a].n);
  if (!keys.length) return "";
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
  return `<div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">📊 Where requests come from (latest ${list.length})</h3>
    <table class="t"><tr><th>Channel</th><th>Requests</th><th>Quoted</th><th>Booked</th><th>Request → booking</th><th>Booked value</th></tr>${keys.map((k) => { const x = rows[k]; return `<tr><td><b>${esc(C.SOURCES[k] || "Not known")}</b></td><td>${x.n}</td><td>${x.quoted}</td><td>${x.booked}</td><td>${pct(x.booked, x.n)}</td><td>${x.value ? "Rp " + x.value.toLocaleString("id-ID") : "—"}</td></tr>`; }).join("")}</table>
    <p class="help">A request's channel is recorded from 25 Oct 2026: the link the customer clicked (put <b>satukoneksihotel.com/?src=ig</b> in the Instagram bio, <b>?src=fb</b> on Facebook, <b>?src=xhs</b> on Xiaohongshu, <b>?src=li</b> on LinkedIn) or the website they came from.
    WhatsApp chats started from the website end with "(via Instagram)" etc. "Booked" = confirmed or completed.</p></div>`;
}
// e-mail / WhatsApp alerts to staff are sent by the Google Apps Script in alerts_apps_script/ (it writes engines/alerts every 5 minutes)
async function alertsStatus(el) {
  try {
    const sn = await F.getDoc(dref("engines", "alerts")); const a = sn.exists() ? plain(sn) : null;
    const t = a?.lastCheck ? new Date(a.lastCheck).getTime() : 0, mins = t ? Math.round((Date.now() - t) / 60000) : null;
    el.innerHTML = !a ? "🔕 Staff alerts are not set up yet (e-mail / WhatsApp when a customer agrees, pays or writes) - see alerts_apps_script/SETUP.md."
      : mins > 20 ? `⚠️ Staff alerts stopped ${mins} minutes ago - open the Apps Script and run <b>setup</b> again.`
      : `🔔 Staff alerts on: e-mail${a.whatsapp ? " + WhatsApp" : " (WhatsApp not set)"} · last checked ${mins} min ago${a.lastAlertAt ? " · last alert " + when(a.lastAlertAt) : ""}.` +
        ` 🗑 Old records are deleted automatically (requests 12 months, valid purchases 3 years)${a.lastCleanup ? " · last clean-up " + when(a.lastCleanup) + (a.lastCleanupDeleted ? ` (${a.lastCleanupDeleted} deleted)` : "") : ""}.`;
  } catch { el.textContent = ""; }
}
// ready-made WhatsApp messages to the customer (option A: staff check the text in WhatsApp and press Send)
const WA_STEPS = [["hello", "👋 Request received"], ["quote", "💰 Quotation"], ["bank", "🏦 Bank details"], ["confirmed", "✅ Booking confirmed"], ["account", "💬 Please check your account"]];
function waCustomerText(kind, r, f) {
  const id = r.lang === "id", T = (en, idn) => (id ? idn : en), no = String(r.id).slice(0, 8).toUpperCase();
  const link = `https://www.satukoneksihotel.com/account?r=${r.id}`, name = String(r.name || "").split(" ")[0];
  const rp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  const day = (d) => { const t = new Date(String(d).slice(0, 10) + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString(id ? "id-ID" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const n = r.checkIn && r.checkOut ? Math.round((new Date(r.checkOut) - new Date(r.checkIn)) / 864e5) : 0;
  const dates = r.checkIn ? `${day(r.checkIn)}${r.checkOut ? " – " + day(r.checkOut) : ""}${n ? ` (${n} ${T(n === 1 ? "night" : "nights", "malam")})` : ""}` : T("your dates", "tanggal Anda");
  const guests = `${r.adults ?? 1} ${T((r.adults ?? 1) === 1 ? "adult" : "adults", "dewasa")}${r.children ? `, ${r.children} ${T(r.children === 1 ? "child" : "children", "anak")}` : ""}${r.rooms ? `, ${r.rooms} ${T(r.rooms === 1 ? "room" : "rooms", "kamar")}` : ""}`;
  const hotel = r.refName ? `🏨 ${r.refName}${r.city || r.refCity ? " – " + (r.city || r.refCity) : ""}\n` : "";
  const payBy = f.payBy ? "\n" + T("Please pay before: ", "Mohon bayar sebelum: ") + day(f.payBy) : "";
  if (kind === "hello") return T(`Hello ${name}, thank you for your request with Satu Koneksi Hotel (no. ${no})${r.refName ? " for " + r.refName : ""}. We are checking the best prices for ${dates} and will send you a quotation shortly.\n\nYou can follow your request here: ${link}`,
    `Halo ${name}, terima kasih atas permintaan Anda di Satu Koneksi Hotel (no. ${no})${r.refName ? " untuk " + r.refName : ""}. Kami sedang mengecek harga terbaik untuk ${dates} dan akan segera mengirim penawaran.\n\nPantau permintaan Anda di sini: ${link}`);
  if (kind === "quote") return T(`Hello ${name}, your quotation is ready ✨\n\n${hotel}📅 ${dates}\n👥 ${guests}\n💰 Total: ${rp(f.quoteTotal)}${f.quoteText ? "\n\n" + f.quoteText : ""}${f.payBy ? "\n\nPlease confirm before " + day(f.payBy) + "." : ""}\n\nTo book, press "Agree to book" here: ${link}#agree`,
    `Halo ${name}, penawaran Anda sudah siap ✨\n\n${hotel}📅 ${dates}\n👥 ${guests}\n💰 Total: ${rp(f.quoteTotal)}${f.quoteText ? "\n\n" + f.quoteText : ""}${f.payBy ? "\n\nMohon konfirmasi sebelum " + day(f.payBy) + "." : ""}\n\nUntuk memesan, tekan "Setuju memesan" di sini: ${link}#agree`);
  if (kind === "bank") return T(`Hello ${name}, thank you for booking with Satu Koneksi Hotel 🙏\n\nPlease transfer ${f.quoteTotal ? rp(f.quoteTotal) + " " : ""}to:\n${f.bankInfo}${payBy}\n\nAfter transferring, please upload your transfer slip here: ${link}#pay`,
    `Halo ${name}, terima kasih telah memesan di Satu Koneksi Hotel 🙏\n\nSilakan transfer ${f.quoteTotal ? rp(f.quoteTotal) + " " : ""}ke:\n${f.bankInfo}${payBy}\n\nSetelah transfer, mohon unggah bukti transfer di sini: ${link}#pay`);
  if (kind === "confirmed") return T(`Hello ${name}, your booking is confirmed ✅\n\nBooking number: ${f.bookingRef || no}\n${hotel}📅 ${dates}\n👥 ${guests}${f.bookingNote ? "\n\n" + f.bookingNote : ""}\n\nYour confirmation: ${link}\nThank you for choosing Satu Koneksi Hotel!`,
    `Halo ${name}, pemesanan Anda sudah terkonfirmasi ✅\n\nNomor pemesanan: ${f.bookingRef || no}\n${hotel}📅 ${dates}\n👥 ${guests}${f.bookingNote ? "\n\n" + f.bookingNote : ""}\n\nKonfirmasi Anda: ${link}\nTerima kasih telah memilih Satu Koneksi Hotel!`);
  return T(`Hello ${name}, we have replied to your request no. ${no}. Please check your messages here: ${link}`, `Halo ${name}, kami sudah membalas permintaan Anda no. ${no}. Silakan cek pesan Anda di sini: ${link}`);
}
// how long a request is kept (same rule as alerts_apps_script/Retention.gs): 12 months after the last activity; valid purchases 3 years
function keepUntil(r) {
  const last = Number(r.updatedAt || r.createdAt || 0);
  if (["confirmed", "completed"].includes(r.status)) {
    const out = r.checkOut ? new Date(String(r.checkOut).slice(0, 10) + "T00:00:00Z").getTime() : 0;
    return new Date(Math.max(last, isNaN(out) ? 0 : out) + (3 * 365 + 1) * 864e5);
  }
  return new Date(last + 365 * 864e5);
}
async function openRequest(r, after) {
  if (!r) return;
  const sub = (n) => F.collection(db, "requests", r.id, n);
  const [noteSnap, msgs, slips, waLog, cmp, cmpJob, qt] = await Promise.all([
    F.getDoc(dref("requestNotes", r.id)),
    F.getDocs(F.query(sub("messages"), F.orderBy("createdAt"))).then((s) => s.docs.map(plain)).catch(() => []),
    F.getDocs(sub("payments")).then((s) => s.docs.map(plain).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))).catch(() => []),
    F.getDocs(sub("waLog")).then((s) => s.docs.map(plain).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))).catch(() => []),
    F.getDoc(dref("engineTracker", "req-" + r.id)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
    F.getDoc(dref("engineJobs", "auto-" + r.id)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
    F.getDoc(dref("engineQuotes", r.id)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
  ]);
  const cmpBest = cmp ? (cmp.hotels || []).map((h) => { const c = (cmp.checked || {})[h.k]; const cp = Number(c?.price) > 0 ? Number(c.price) : null; return { h, t: cp != null && cp < h.total ? cp : h.total }; }).sort((a, b) => a.t - b.t)[0] : null;
  const cmpBox = cmp ? `<div class="notice" style="background:#eef7f1;border-color:#bfe0cb;color:#1e3a3a">⚖️ <b>Compare Price for this request:</b> ${(cmp.hotels || []).length} hotels in ${esc(cmp.city)}, ${esc(cmp.checkIn)} → ${esc(cmp.checkOut)}${cmpBest ? ` · cheapest ${esc(cmpBest.h.name)} Rp ${Math.round(cmpBest.t).toLocaleString("id-ID")}` : ""} · <a href="#/compare?id=req-${esc(r.id)}">Open the comparison</a> <small>(internet prices for the whole stay - never send trade rates)</small></div>`
    : cmpJob ? `<div class="notice">⚖️ Compare Price for this request: <b>${esc(cmpJob.status || "queued")}</b>${cmpJob.status === "failed" || cmpJob.status === "refused" ? " - open Admin → Bots to see why, or start one by hand in Compare Price" : " - the result appears here within about 30 minutes (07:00-22:00 Jakarta)"}.</div>`
    : r.kind === "hotel" ? `<p class="help">⚖️ No automatic Compare Price for this request (it needs a city and future dates, and the switch in Admin → Bots). You can start one in <a href="#/compare">Compare Price</a>.</p>` : "";
  // the quote engine's price check made when the request arrived (engineQuotes/<id>, kept - Admin -> Quotes has the full page)
  const rpx = (n) => (Number(n) > 0 ? "Rp " + Math.round(Number(n)).toLocaleString("id-ID") : "—");
  const qWhen = (v) => { const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !isNaN(d) ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""; };
  const quoteBox = qt ? (() => {
    const rg = qt.web?.rollinggo || {}, pr = qt.pricing || {}, mg = qt.mg?.cheapest || null, opts = (rg.options || []).slice(0, 3);
    const rows = [
      ["RollingGo (internet)", rg.status === "ok" ? `${opts.map((o) => `${esc(o.room || "room")}${o.meal ? " · " + esc(o.meal) : ""}: <b>${rpx(o.totalIDR)}</b>`).join("<br>")}` : esc(rg.note || "no price")],
      ["MG rate (trade)", mg ? `${rpx(mg.totalIDR)}${mg.room ? " · " + esc(mg.room) : ""}` : (qt.mgManual?.total ? rpx(qt.mgManual.total) + " (typed by staff)" : "—")],
      ["Cheapest found", pr.cheapest ? `${rpx(pr.cheapest)}${pr.cheapestSource ? " (" + esc(pr.cheapestSource) + ")" : ""}` : "—"],
      ["Suggested quote", pr.quote ? `<b>${rpx(pr.quote)}</b>` : (pr.target ? `${rpx(pr.target)} target - ${esc(pr.rule || "")}` : esc(pr.rule || "—"))],
      ["Final price", qt.finalPrice ? `<b>${rpx(qt.finalPrice)}</b>` : "—"],
    ];
    return `<div class="panel" style="background:#faf8f4;box-shadow:none;border:1.5px solid var(--line);padding:16px 18px;margin:12px 0">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><b>💬 Price check when the request arrived</b>
      <span class="help" style="margin:0">${esc(qWhen(qt.createdAt))}${qt.status ? " · " + esc(qt.status) : ""} · <a href="#/quotes">open in Quotes</a></span></div>
      <div class="kv" style="margin:10px 0 0">${rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join("")}</div>
      ${(rg.options || []).length > 3 ? `<p class="help" style="margin:6px 0 0">${rg.options.length - 3} more room offers in Quotes.</p>` : ""}</div>`;
  })() : "";
  const priv = noteSnap.exists() ? noteSnap.data().note || "" : "";
  const nd = noteSnap.exists() ? noteSnap.data() : {};
  const idLang = r.lang === "id";
  const hello = idLang
    ? `Halo ${r.name}, kami dari Satu Koneksi Hotel mengenai permintaan Anda${r.refName ? " untuk " + r.refName : ""}${r.checkIn ? " (" + r.checkIn + (r.checkOut ? " – " + r.checkOut : "") + ")" : ""}. `
    : `Hello ${r.name}, this is Satu Koneksi Hotel about your request${r.refName ? " for " + r.refName : ""}${r.checkIn ? " (" + r.checkIn + (r.checkOut ? " – " + r.checkOut : "") + ")" : ""}. `;
  let lastBank = ""; try { lastBank = localStorage.getItem("skBankInfo") || ""; } catch { /* ignore */ }
  const rp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  const budget = r.priceMin == null && r.priceMax == null ? "" : r.priceMax == null ? "above " + rp(r.priceMin) : `${rp(r.priceMin || 0)} – ${rp(r.priceMax)}`;
  const thread = [...(r.publicNote ? [{ from: "staff", text: r.publicNote, createdAt: r.updatedAt, by: "(old note)" }] : []), ...msgs,
    ...waLog.map((x) => ({ from: x.kind === "in" ? "customer" : "staff", text: x.text, by: x.by, createdAt: x.createdAt, wa: x.kind }))]
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  const who = (x) => x.wa ? (x.from === "staff" ? `💬 WhatsApp sent${x.wa !== "in" ? " · " + x.wa : ""}` : "💬 WhatsApp from the customer") : (x.from === "staff" ? "Staff · account" : "Customer · account");
  const m = modal(`<h3>${esc(r.name)}</h3><p class="sk-sub">${esc(r.kind)} request · no. ${esc(String(r.id).slice(0, 8).toUpperCase())} · ${when(r.createdAt)} · ${renderStatus(r.status)}</p>
  ${guideBox(r)}
  <div class="kv"><b>For</b><span>${esc(r.refName || "General request")}${r.refCity ? " – " + esc(r.refCity) : ""}</span>
  ${r.hotelMode ? `<b>Hotel</b><span>${r.hotelMode === "any" ? "ANY hotel – customer wants options" : "A specific hotel"}</span>` : ""}
  ${r.city || r.country ? `<b>City / country</b><span>${esc([r.city, r.country].filter(Boolean).join(", "))}</span>` : ""}
  ${(r.stars || []).length ? `<b>Stars</b><span>${esc(r.stars.join(", "))} ★</span>` : ""}${budget ? `<b>Budget / night</b><span>${esc(budget)}</span>` : ""}
  <b>WhatsApp</b><span>${esc(r.whatsapp)}</span><b>E-mail</b><span>${esc(r.email || "—")}</span>
  <b>Came from</b><span>${esc(C.SOURCES[r.source] || "Not known (sent before this was recorded)")}${r.campaign ? " · campaign: " + esc(r.campaign) : ""}</span>
  <b>Dates</b><span>${esc(r.checkIn || "—")}${r.checkOut ? " → " + esc(r.checkOut) : ""}</span>
  <b>Guests</b><span>${r.adults ?? "—"} adults, ${r.children ?? 0} children, ${r.rooms ?? 1} room(s)</span>
  ${r.kind === "corporate" ? `<b>Company</b><span><b>${esc(r.company || "—")}</b></span><b>Wants</b><span><b>${esc({ meeting: "A meeting with our team", review: "A hotel rate review", booking: "A quotation for a stay", onboarding: "To become a corporate client" }[r.help] || "—")}</b></span><b>Room nights / month</b><span>${esc({ lt10: "Under 10", "10-30": "10 - 30", "31-100": "31 - 100", gt100: "Over 100" }[r.nightsMonth] || "Not given")}</span><b>Purpose</b><span>${esc(r.purpose || "—")}</span><b>Billing</b><span>${esc({ transfer: "Bank transfer per booking", invoice: "Company invoice", other: "Other - see message" }[r.billing] || "—")}</span><b>Budget / room / night</b><span>${r.budgetRoom ? "Rp " + Number(r.budgetRoom).toLocaleString("id-ID") : "—"}</span><b>Location</b><span>${esc([r.city, r.country].filter(Boolean).join(", ") || "—")}</span>` : ""}
  <b>Message</b><span style="white-space:pre-wrap">${esc(r.message || "—")}</span><b>Language</b><span>${idLang ? "Bahasa Indonesia" : "English"}</span>
  ${r.acceptedAt ? `<b>Agreed to book</b><span>${when(r.acceptedAt)}</span>` : ""}${r.paymentSentAt ? `<b>Slip sent</b><span>${when(r.paymentSentAt)}</span>` : ""}
  <b>Kept until</b><span>${keepUntil(r).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} <small style="color:#888">(${["confirmed", "completed"].includes(r.status) ? "valid purchase: 3 years" : "request: 12 months after the last activity"}, then deleted automatically)</small></span></div>

  ${quoteBox}${cmpBox}
  <h4 style="margin:16px 0 6px">Transfer slips from the customer (${slips.length})</h4>
  ${slips.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap">${slips.map((x, i) => `<a href="#" data-slip="${i}" style="border:1px solid #ddd;border-radius:10px;padding:6px;font-size:13px;text-align:center;max-width:160px">${x.type === "image" ? `<img src="${x.data}" style="width:140px;height:100px;object-fit:cover;display:block;border-radius:6px">` : "📄 PDF"}<br>${when(x.createdAt)}${x.amount ? "<br><b>" + rp(x.amount) + "</b>" : ""}${x.note ? "<br>" + esc(x.note) : ""}</a>`).join("")}</div>
    <p class="help">Check the money is really in the bank account before you confirm.</p>` : `<p class="help">None yet.</p>`}

  <h4 style="margin:16px 0 6px">Conversation with the customer – website account and WhatsApp (${thread.length})</h4>
  <div id="convo" style="max-height:360px;overflow:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">${thread.length ? thread.map((x) => `<div style="max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;${x.from === "staff" ? `align-self:flex-end;background:${x.wa ? "#dff5e6" : "#eef7f1"}` : `align-self:flex-start;background:${x.wa ? "#fff4dc" : "#e7f0ff"}`}">${esc(x.text)}<br><small style="color:#777">${esc(who(x))}${x.by ? (x.wa === "in" ? " · saved by " : " · ") + esc(x.by) : ""} · ${when(x.createdAt)}</small></div>`).join("") : `<p class="help">No messages yet.</p>`}</div>
  <div class="wa-in" id="waIn"><label>📥 The customer wrote on WhatsApp? Paste it here, so Admin keeps the whole conversation<textarea id="waInText" maxlength="4000" rows="2" placeholder="Paste the customer's WhatsApp message"></textarea></label>
  <div class="fh" style="justify-content:flex-start;flex-wrap:wrap;gap:8px"><button class="sk-btn sm" type="button" id="waInSave">Save the customer's message</button>
  <label style="display:inline-flex;align-items:center;gap:6px;margin:0;font-weight:600">📎 Receipt sent on WhatsApp<input type="file" id="waSlip" accept="image/*,application/pdf" style="max-width:230px"></label><button class="sk-btn sm" type="button" id="waSlipSave">Save the receipt</button></div></div>
  <h4 style="margin:16px 0 6px">💬 Standard replies (R01–R41, owner and supplier messages) – pick the situation</h4><div id="rpHost"></div>
  <h4 style="margin:16px 0 6px">WhatsApp the customer – ready messages (${r.lang === "id" ? "Bahasa Indonesia" : "English"})</h4>
  <div style="display:flex;gap:6px;flex-wrap:wrap">${WA_STEPS.map(([k, label]) => `<button class="sk-btn sm" type="button" data-wa="${k}">${label}</button>`).join("")}</div>
  <p class="help">Opens WhatsApp with the message already written, using what is typed in the form below (even before saving). Check it, then press Send in WhatsApp. Each one is saved in the conversation above.</p>
  <form id="mf"><label>Reply (the customer sees it in their account)<textarea name="text" maxlength="2000" placeholder="e.g. Here are 3 options…"></textarea></label><div class="fh"><button class="sk-btn" type="submit">Send reply</button></div></form>

  <form id="rf"><h4 style="margin:16px 0 6px">Quotation and booking</h4>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>Price for the customer – total (Rp)<input name="quoteTotal" type="number" min="0" step="1000" value="${r.quoteTotal ?? ""}"></label>
  <label>Pay before (date)<input name="payBy" type="date" value="${esc(r.payBy || "")}"></label></div>
  <label>Quotation details (hotel, room, what is included)<textarea name="quoteText" maxlength="3000" placeholder="e.g. Aryaduta Palembang, Deluxe King, breakfast for 2, 2 nights">${esc(r.quoteText || "")}</textarea></label>
  <label>Bank details for the transfer<textarea name="bankInfo" maxlength="600" placeholder="Bank, account number, account name">${esc(r.bankInfo || lastBank)}</textarea></label>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>Booking number (after confirming)<input name="bookingRef" maxlength="60" value="${esc(r.bookingRef || "")}"></label>
  <label>Status<select name="status">${Object.keys(STATUS).map((s) => `<option value="${s}"${r.status === s ? " selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select></label></div>
  <label>Confirmation details for the customer (hotel confirmation no., check-in info)<textarea name="bookingNote" maxlength="2000">${esc(r.bookingNote || "")}</textarea></label>
  ${supplierBlock(r, nd, qt)}
  <div class="row2"><label>Assigned to (staff e-mail)<input name="assignedTo" type="email" maxlength="120" value="${esc(noteSnap.exists() ? noteSnap.data().assignedTo || "" : "")}" placeholder="${esc(me?.email || "")}"></label>
  <label>Next follow-up date<input name="followUp" type="date" value="${esc(noteSnap.exists() ? noteSnap.data().followUp || "" : "")}"></label></div>
  <label>Private notes (only staff see this)<textarea name="priv" placeholder="e.g. VIP, prefers pool villa">${esc(priv)}</textarea></label>
  <p class="help">Typing a price on a New/Contacted request moves it to "Quotation sent" when you save. Never type trade (MG / WebBeds) rates here – the customer sees this price.</p>
  <div class="fh"><a class="sk-btn wa" target="_blank" rel="noopener" href="${waLink(r.whatsapp, hello)}">💬 WhatsApp</a><button class="sk-btn red" type="button" id="del">Delete</button>
  ${["paymentSent", "accepted"].includes(r.status) ? `<button class="sk-btn" type="button" id="paid">✓ Payment received – confirm booking</button>` : ""}<button class="sk-btn gold" type="submit">Save</button></div></form>`, { wide: true });

  const calcMargin = () => {
    const g = (k) => Number(m.q(`#rf [name=${k}]`)?.value || 0), sell = g("quoteTotal"), cost = g("supplierCost"), o = m.q("#marginOut");
    if (!o) return;
    if (!sell || !cost) { o.innerHTML = "Type the customer price and the supplier cost to see the margin."; o.style.color = ""; return; }
    const mg = marginOf(sell, cost);
    o.innerHTML = `Margin: <b>Rp ${mg.margin.toLocaleString("id-ID")}</b> (${mg.pct}% of the customer price)`; o.style.color = mg.margin < 0 ? "#b42318" : mg.pct < 3 ? "#b38d40" : "#12602c";
  };
  ["quoteTotal", "supplierCost"].forEach((k) => m.q(`#rf [name=${k}]`)?.addEventListener("input", calcMargin)); calcMargin();
  m.el.querySelectorAll("[data-slip]").forEach((a) => a.onclick = (e) => {
    e.preventDefault(); const x = slips[+a.dataset.slip]; const w = open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Transfer slip</title><body style="margin:0;background:#333">${x.type === "pdf" ? `<iframe src="${x.data}" style="border:0;width:100%;height:100vh"></iframe>` : `<img src="${x.data}" style="max-width:100%;display:block;margin:auto">`}</body>`); w.document.close();
  });
  const sentWa = async (kind, text) => {
    try {
      await logWa(r.id, kind, text);
      if (r.status === "new") {
        const b = F.writeBatch(db);
        b.update(dref("requests", r.id), { status: "contacted", updatedAt: F.serverTimestamp() });
        b.set(dref("requestNotes", r.id), { status: "contacted", updatedAt: F.serverTimestamp() }, { merge: true });
        await b.commit(); r.status = "contacted";
      }
    } catch (er) { toast("Sent, but not saved in Admin: " + er.message, "err"); }
  };
  const reopen = () => { m.close(); openRequest(r, after); };
  m.q("#waInSave").onclick = async () => {
    const t = m.q("#waInText").value.trim(); if (!t) return toast("Paste the customer's message first.", "err");
    try { await logWa(r.id, "in", t); r.lastMsgFrom = "customer"; toast("Saved in the conversation."); reopen(); } catch (er) { toast("Could not save: " + er.message, "err"); }
  };
  m.q("#waSlipSave").onclick = async () => {
    const f = m.q("#waSlip").files[0]; if (!f) return toast("Choose the receipt photo first.", "err");
    try { r.status = await addReceipt(r, f, Number(m.q("#rf [name=quoteTotal]")?.value) || r.quoteTotal); toast("Receipt saved. Check the bank, then press Payment received."); reopen(); }
    catch (er) { toast("Could not save: " + er.message, "err"); }
  };
  const formNow = () => { const g = (k) => String(m.q(`#rf [name=${k}]`)?.value || "").trim(); return { quoteTotal: Number(g("quoteTotal")) || r.quoteTotal || 0, payBy: g("payBy"), bankInfo: g("bankInfo"), bookingRef: g("bookingRef") }; };
  replyPicker(m.q("#rpHost"), r, formNow, {
    onWhatsApp: (id, text) => sentWa("sent " + id, text),
    toAccount: (text) => { const t = m.q("#mf textarea"); t.value = text; t.scrollIntoView({ block: "center" }); t.focus(); toast("Check the text, then press Send reply."); },
  }).catch((er) => console.error("replies", er));
  m.el.querySelectorAll("[data-wa]").forEach((b) => b.onclick = () => {
    const g = (k) => String(m.q(`#rf [name=${k}]`)?.value || "").trim();
    const f = { quoteTotal: Number(g("quoteTotal")) || r.quoteTotal || 0, payBy: g("payBy"), quoteText: g("quoteText"), bankInfo: g("bankInfo"), bookingRef: g("bookingRef"), bookingNote: g("bookingNote") };
    const k = b.dataset.wa;
    if (k === "quote" && !f.quoteTotal) return toast("Type the price for the customer first (Quotation and booking).", "err");
    if (k === "bank" && !f.bankInfo) return toast("Type the bank details first (Quotation and booking).", "err");
    if (!String(r.whatsapp || "").replace(/\D/g, "")) return toast("This customer has no WhatsApp number.", "err");
    const text = waCustomerText(k, r, f);
    open(waLink(r.whatsapp, text), "_blank", "noopener");
    sentWa("sent " + k, text);
  });
  m.q("#mf").onsubmit = async (e) => {
    e.preventDefault(); const text = String(new FormData(e.target).get("text") || "").trim().slice(0, 2000); if (!text) return;
    try {
      await F.addDoc(sub("messages"), { from: "staff", text, by: me.email, createdAt: F.serverTimestamp() });
      await F.updateDoc(dref("requests", r.id), { lastMsgFrom: "staff", lastMsgAt: F.serverTimestamp(), ...(r.status === "new" ? { status: "contacted" } : {}), updatedAt: F.serverTimestamp() });
      toast("Reply sent – the customer sees it in their account. Tip: also tell them on WhatsApp."); m.close(); openRequest({ ...r, ...(r.status === "new" ? { status: "contacted" } : {}), lastMsgFrom: "staff" }, after);
    } catch (er) { toast("Could not send: " + er.message, "err"); }
  };
  const save = async (extra = {}) => {
    const f = new FormData(m.q("#rf")), num = (k) => { const v = String(f.get(k) || "").trim(); return v === "" ? null : Math.round(Number(v)); };
    const quoteTotal = num("quoteTotal");
    let status = String(f.get("status"));
    if (quoteTotal && ["new", "contacted"].includes(status) && !r.quoteTotal) status = "quoted";
    const bankInfo = String(f.get("bankInfo") || "").trim().slice(0, 600);
    const d = { status, quoteTotal, payBy: String(f.get("payBy") || ""), quoteText: String(f.get("quoteText") || "").slice(0, 3000), bankInfo,
      bookingRef: String(f.get("bookingRef") || "").trim().slice(0, 60), bookingNote: String(f.get("bookingNote") || "").slice(0, 2000), ...extra, updatedAt: F.serverTimestamp() };
    if (quoteTotal && !r.quoteTotal) d.quotedAt = F.serverTimestamp();
    const b = F.writeBatch(db);
    b.update(dref("requests", r.id), d);
    const supplierCost = num("supplierCost"), sellNow = quoteTotal ?? r.quoteTotal ?? null, mg = sellNow && supplierCost ? marginOf(sellNow, supplierCost) : null;
    b.set(dref("requestNotes", r.id), { note: String(f.get("priv")), assignedTo: String(f.get("assignedTo") || "").trim().slice(0, 120),
      followUp: String(f.get("followUp") || "").slice(0, 10), kind: r.kind || "", who: String(r.company || r.name || "").slice(0, 120),
      supplier: String(f.get("supplier") || "").slice(0, 40), supplierCost, rateCheckedAt: String(f.get("rateCheckedAt") || "").slice(0, 10),
      validUntil: String(f.get("validUntil") || "").slice(0, 10), supplierRef: String(f.get("supplierRef") || "").trim().slice(0, 80),
      quoteTotal: sellNow, margin: mg ? mg.margin : null, marginPct: mg ? mg.pct : null, status, updatedAt: F.serverTimestamp() });
    await b.commit();
    if (bankInfo) try { localStorage.setItem("skBankInfo", bankInfo); } catch { /* ignore */ }
  };
  m.q("#rf").onsubmit = async (e) => { e.preventDefault(); try { await save(); toast("Saved."); m.close(); after?.(); } catch (er) { toast("Could not save: " + er.message, "err"); } };
  const paid = m.q("#paid");
  if (paid) paid.onclick = async () => {
    if (!confirm("Is the money really in the bank account? This tells the customer the booking is confirmed.")) return;
    const ref = m.q("[name=bookingRef]"); if (!ref.value.trim()) ref.value = "SK-" + String(r.id).slice(0, 6).toUpperCase();
    try { await save({ status: "confirmed", paidAt: F.serverTimestamp(), confirmedBy: me.email }); toast("Booking confirmed – the customer sees it in their account. Tell them on WhatsApp too."); m.close(); after?.(); }
    catch (er) { toast("Could not save: " + er.message, "err"); }
  };
  m.q("#del").onclick = async () => { if (!confirm("Delete this request for good?")) return; await F.deleteDoc(dref("requests", r.id)); await F.deleteDoc(dref("requestNotes", r.id)).catch(() => {}); toast("Deleted."); m.close(); after?.(); };
}

// ------------------------------------------------------------------ content editors (hotels, tours, offers, destinations)
const REGION = ["Indonesia", "ASEAN", "Worldwide"];
const DEFS = {
  hotels: { title: "Hotels", one: "hotel", help: "The hotels shown on the Hotel Directory page. Customers can ask you for a quotation on each one.",
    cols: (d) => [d.name, `${d.city || ""}${d.country ? ", " + d.country : ""}`, d.type || ""], head: ["Hotel", "City", "Type"], sortBy: "name",
    fields: [
      { k: "name", t: "text", label: "Hotel name", req: 1 }, { k: "city", t: "text", label: "City / area", req: 1, row: 1 }, { k: "country", t: "text", label: "Country", row: 1, ph: "Indonesia" },
      { k: "region", t: "select", label: "Region", opts: REGION, row: 1 }, { k: "type", t: "select", label: "Type", opts: ["Hotel", "Resort", "Villa", "Apartment"], row: 1 }, { k: "stars", t: "select", label: "Stars", opts: ["", "1", "2", "3", "4", "5"], row: 1 },
      { k: "short", t: "bi", label: "Short description (one or two lines)", area: 2 }, { k: "desc", t: "bi", label: "Full description", area: 5 },
      { k: "priceNote", t: "bi", label: "Price note", ph: "e.g. Rooms from IDR 1,200,000 / night – ask for today's rate", help: "Prices change, so write a hint, not a promise." },
      { k: "amenities", t: "tags", label: "Facilities (separate with commas)", ph: "Pool, Breakfast, Free Wi-Fi" },
      { k: "rooms", t: "tags", label: "Room types (separate with commas)", ph: "Deluxe King, Superior Twin", help: "Filled by the second PC from the WebBeds page (names only, never rates). You can edit it." },
      { k: "specialPrice", t: "number", label: "Special discount price (Rp per night, optional)", row: 1, help: "Shown on the website next to the live price while it is valid. Empty = no special price." },
      { k: "specialUntil", t: "date", label: "Special price valid until", row: 1 },
      { k: "photos", t: "photos", label: "Photos", max: 5 }, { k: "sort", t: "number", label: "Order on the page (small = first)", row: 1 },
      { k: "osmId", t: "text", label: "Map id (optional)", row: 1, ph: "e.g. w506869238", help: "Hides this hotel's plain card from the 'More hotels' map list, so it is not shown twice." },
      { k: "featured", t: "bool", label: "Highlight on the home page", row: 1 }, { k: "published", t: "bool", label: "Show on website" }] },
  tours: { title: "Tour packages", one: "tour package", help: "Tour packages shown on the Tour Packages page, with a day-by-day plan.",
    cols: (d) => [d.title_en, d.destination || "", d.days ? d.days + " days" : ""], head: ["Package", "Destination", "Length"], sortBy: "title_en",
    fields: [
      { k: "title", t: "bi", label: "Package name", req: 1 }, { k: "destination", t: "text", label: "Destination", req: 1, row: 1, ph: "Labuan Bajo" }, { k: "days", t: "number", label: "Number of days", row: 1 },
      { k: "region", t: "select", label: "Region", opts: REGION, row: 1 },
      { k: "summary", t: "bi", label: "Summary", area: 4 }, { k: "priceNote", t: "bi", label: "Price note", ph: "e.g. From IDR 4,500,000 per person – depends on dates and group size" },
      { k: "itinerary", t: "days", label: "Day-by-day plan" }, { k: "includes", t: "bilines", label: "What is included (one item per line)" }, { k: "excludes", t: "bilines", label: "What is NOT included (one item per line)" },
      { k: "photos", t: "photos", label: "Photos", max: 5 }, { k: "sort", t: "number", label: "Order on the page", row: 1 }, { k: "featured", t: "bool", label: "Highlight on the home page", row: 1 }, { k: "published", t: "bool", label: "Show on website" }] },
  offers: { title: "Offers", one: "offer", help: "Special offers on the Offers page. An offer hides itself after its end date, so expired offers never show.",
    cols: (d) => [d.title_en, d.validUntil ? "until " + d.validUntil : "no end date", ""], head: ["Offer", "Valid", ""], sortBy: "title_en",
    fields: [
      { k: "title", t: "bi", label: "Offer title", req: 1 }, { k: "text", t: "bi", label: "Details", area: 4 },
      { k: "validFrom", t: "date", label: "Starts (optional)", row: 1 }, { k: "validUntil", t: "date", label: "Ends (optional)", row: 1 },
      { k: "link", t: "ref", label: "Link this offer to a hotel or tour (optional)" }, { k: "photo", t: "photo", label: "Picture (optional)" },
      { k: "sort", t: "number", label: "Order", row: 1 }, { k: "published", t: "bool", label: "Show on website" }] },
  destinations: { title: "Destinations", one: "destination", help: "The destination tiles on the home page. Clicking one fills in the search box for the visitor.",
    cols: (d) => [d.name, d.tagline_en || "", ""], head: ["City", "Tagline", ""], sortBy: "name",
    fields: [
      { k: "name", t: "text", label: "City / destination", req: 1, ph: "Bali" }, { k: "tagline", t: "bi", label: "Short line under the name", ph: "Ubud, Seminyak, Uluwatu" },
      { k: "photo", t: "photo", label: "Picture (optional)" }, { k: "sort", t: "number", label: "Order", row: 1 }, { k: "published", t: "bool", label: "Show on website" }] },
};
let hotelOpts = [];
// The Hotels tab does NOT read every hotel (thousands of database reads each time it opened): it reads the robot's compact list of the published
// hotels (a few reads) plus the hidden ones (up to 300). A hotel's full record is read only when you open it. Hotels you saved, hid or deleted in this
// Admin session are laid over the list, because the compact list catches up only when the robot runs (about every 30 minutes).
const recentHotels = new Map();
const HIDDEN_MAX = 300;
async function adminHotelList() {
  const [cards, hidden] = await Promise.all([
    C.loadHotelList(true).catch(() => []),
    F.getDocs(F.query(col("hotels"), F.where("published", "==", false), F.limit(HIDDEN_MAX))).then((s) => s.docs.map(plain)).catch(() => []),
  ]);
  adminHotelList.capped = hidden.length >= HIDDEN_MAX;
  const byId = new Map([...cards.map((c) => ({ ...c, published: true })), ...hidden].map((h) => [h.id, h]));
  for (const [id, h] of recentHotels) { if (h) byId.set(id, h); else byId.delete(id); }
  return [...byId.values()];
}
async function fullHotel(it) {
  try { const d = await F.getDoc(dref("hotels", it.id)); return d.exists() ? plain(d) : it; } catch { return it; }
}
async function crud(name) {
  const D = DEFS[name];
  const items = (name === "hotels" ? await adminHotelList() : (await F.getDocs(col(name))).docs.map(plain)).sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a[D.sortBy] || "").localeCompare(String(b[D.sortBy] || "")));
  main.innerHTML = `<h1>${D.title}</h1><p class="lead">${D.help}</p><div class="panel"><div class="tools"><input id="q" type="search" placeholder="Search…" style="min-width:220px">
    <select id="qp"><option value="">On + off the website</option><option value="on">On the website</option><option value="off">Hidden</option></select><span class="sp"></span>
    <button class="sk-btn gold" id="add" type="button">＋ Add ${D.one}</button></div><div id="tb"></div><p class="help" id="tnote"></p></div>`;
  const publish = (on) => async (list) => {
    const todo = list.filter((d) => !!d.published !== on);
    const res = await Promise.allSettled(todo.map((d) => F.updateDoc(dref(name, d.id), { published: on, updatedAt: F.serverTimestamp() })));
    res.forEach((r, i) => { if (r.status === "fulfilled") { todo[i].published = on; if (name === "hotels") recentHotels.set(todo[i].id, { ...todo[i] }); } });
    const bad = res.filter((r) => r.status === "rejected").length;
    toast(bad ? `${todo.length - bad} changed, ${bad} could not be changed.` : todo.length ? `${todo.length} ${on ? "now on" : "hidden from"} the website.` : "Nothing to change.", bad ? "err" : undefined);
  };
  const removeAll = async (list) => {            // the same as the Delete button in the edit window: the photos, the item, and (hotels) the note for the robot
    const gone = new Set();
    for (const it of list) {
      try {
        const full = name === "hotels" ? await fullHotel(it) : it;
        for (const id of full.photos || []) await F.deleteDoc(dref("images", id)).catch(() => {});
        await F.deleteDoc(dref(name, it.id));
        if (name === "hotels") { await noteDeletedHotel(it.id); recentHotels.set(it.id, null); }
        gone.add(it.id);
      } catch (er) { toast(`${it.name || it.title_en || it.id}: ${er.message}`, "err"); }
    }
    for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].id)) items.splice(i, 1);
    toast(`${gone.size} deleted.`); draw();
  };
  // hotel thumbnails: the small card pictures the website already has (about 14 KB each), loaded only when their row is on screen
  let pics = {};
  const tbl = smartTable($("#tb"), {
    key: name, empty: items.length ? "Nothing found." : `Nothing here yet. Click "Add ${D.one}".`,
    open: async (it) => editor(name, name === "hotels" ? await fullHotel(it) : it),
    cols: [
      { k: "pic", label: "", html: (d) => { const img = (name === "hotels" && picFromIndex(d.id, pics[d.id])) || d.cover || d.photo || "";
        return img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" decoding="async" width="62" height="46" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb'}))">` : `<div class="thumb"></div>`; } },
      ...D.head.map((h, i) => ({ k: "c" + i, label: h, cls: i === 0 ? "ttl" : "", sort: h ? (d) => String(D.cols(d)[i] || "").toLowerCase() : null,
        html: (d) => (i === 0 ? `<b>${esc(D.cols(d)[0])}</b>` : esc(D.cols(d)[i])) })).filter((c) => c.label),
      { k: "pub", label: "On website", sort: (d) => (d.published ? 0 : 1), html: (d) => `<label class="sw"><input type="checkbox" data-pub="${esc(d.id)}"${d.published ? " checked" : ""}><i></i></label>` },
    ],
    actions: [
      { id: "on", label: "Show on website", run: publish(true) },
      { id: "off", label: "Hide from website", run: publish(false) },
      { id: "del", label: "Delete", cls: "red", confirm: (l) => `Delete ${l.length} ${l.length === 1 ? D.one : D.title.toLowerCase()} for good, with their photos? This cannot be undone.`, run: removeAll },
    ],
    after: () => $$("[data-pub]", main).forEach((cb) => cb.onchange = async () => { try { await F.updateDoc(dref(name, cb.dataset.pub), { published: cb.checked, updatedAt: F.serverTimestamp() }); const it = items.find((x) => x.id === cb.dataset.pub); if (it) it.published = cb.checked; if (name === "hotels" && it) recentHotels.set(it.id, { ...it }); toast(cb.checked ? "Now on the website." : "Hidden from the website."); } catch (e) { toast(e.message, "err"); cb.checked = !cb.checked; } }),
  });
  const draw = () => {
    const q = val($("#q")).toLowerCase(), p = $("#qp").value;
    tbl.set(items.filter((d) => (!p || (p === "on") === !!d.published) && (!q || JSON.stringify(D.cols(d)).toLowerCase().includes(q))));
    $("#tnote").textContent = name === "hotels" && adminHotelList.capped ? `Only the first ${HIDDEN_MAX} hidden hotels are listed.` : "";
  };
  $("#q").oninput = draw; $("#qp").onchange = draw; draw(); $("#add").onclick = () => editor(name, null);
  if (name === "hotels") loadPicIndex().then((p) => { if (p) { pics = p; tbl.redraw(); } }).catch(() => {});
}
async function editor(name, item) {
  const D = DEFS[name]; const isNew = !item; item = item || { published: false };
  if (D.fields.some((f) => f.t === "ref")) { const [h, t] = await Promise.all([adminHotelList(), F.getDocs(col("tours"))]); hotelOpts = [...h.map((d) => ({ id: "hotel:" + d.id, label: "Hotel: " + d.name })), ...t.docs.map((d) => ({ id: "tour:" + d.id, label: "Tour: " + d.data().title_en }))]; }
  const state = { photos: [...(item.photos || [])], th: {}, removed: [], photo: item.photo || "", days: (item.itinerary || []).map((x) => ({ ...x })) };
  const field = (f) => {
    const v = item[f.k]; const L = (extra = "") => `<label>${f.label}${f.help ? `<span class="help">${f.help}</span>` : ""}${extra}`;
    switch (f.t) {
      case "text": return `${L()}<input name="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || "")}"${f.req ? " required" : ""}></label>`;
      case "number": return `${L()}<input name="${f.k}" type="number" min="0" value="${esc(v ?? "")}"></label>`;
      case "date": return `${L()}<input name="${f.k}" type="date" value="${esc(v || "")}"></label>`;
      case "select": return `${L()}<select name="${f.k}">${f.opts.map((o) => `<option${String(v ?? "") === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
      case "tags": return `${L()}<input name="${f.k}" value="${esc((v || []).join(", "))}" placeholder="${esc(f.ph || "")}"></label>`;
      case "bool": return `<label class="chk" style="font-weight:700;color:var(--teal2)"><input type="checkbox" name="${f.k}"${v ? " checked" : ""}> ${f.label}</label>`;
      case "bi": return `<div class="fl">${f.label}${f.help ? `<span class="help">${f.help}</span>` : ""}<div class="row2">${["en", "id"].map((l) => (f.area ? `<textarea name="${f.k}_${l}" rows="${f.area}" placeholder="${l === "en" ? "English" : "Bahasa Indonesia (optional)"}">${esc(item[f.k + "_" + l] || "")}</textarea>` : `<input name="${f.k}_${l}" value="${esc(item[f.k + "_" + l] || "")}" placeholder="${l === "en" ? "English" + (f.ph ? " – " + f.ph : "") : "Bahasa Indonesia (optional)"}"${f.req && l === "en" ? " required" : ""}>`)).join("")}</div></div>`;
      case "bilines": return `<div class="fl">${f.label}<div class="row2">${["en", "id"].map((l) => `<textarea name="${f.k}_${l}" rows="4" placeholder="${l === "en" ? "English" : "Bahasa Indonesia (optional)"}">${esc((item[f.k + "_" + l] || []).join("\n"))}</textarea>`).join("")}</div></div>`;
      case "ref": return `${L()}<select name="link"><option value="">— none —</option>${hotelOpts.map((o) => `<option value="${esc(o.id)}"${item.link === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
      case "photos": return `<div class="fl">${f.label}<span class="help">The first picture is the cover. Choose up to ${f.max}. They are shrunk automatically.</span><div class="photos" id="ph"></div><input type="file" id="phIn" accept="image/*" multiple style="height:auto;padding:10px"></div>`;
      case "photo": return `<div class="fl">${f.label}<div class="photos" id="ph1"></div><input type="file" id="ph1In" accept="image/*" style="height:auto;padding:10px"></div>`;
      case "days": return `<div class="fl">${f.label}<span class="help">One block per day. Indonesian is optional.</span><div id="days"></div><button type="button" class="sk-btn sm" id="addDay">＋ Add a day</button></div>`;
      default: return "";
    }
  };
  let html = "", openRow = false;
  for (const f of D.fields) { if (f.row && !openRow) { html += `<div class="row3">`; openRow = true; } if (!f.row && openRow) { html += `</div>`; openRow = false; } html += field(f); }
  if (openRow) html += "</div>";
  const m = modal(`<h3>${isNew ? "Add" : "Edit"} ${D.one}</h3><form id="ef">${html}<p class="sk-err" id="eerr"></p><div class="fh">${isNew ? "" : `<button class="sk-btn red" type="button" id="del">Delete</button>`}<button class="sk-btn" type="button" id="cancel">Cancel</button><button class="sk-btn gold" type="submit" id="save">Save</button></div></form>`, { wide: true });
  const drawPhotos = () => {
    const box = m.q("#ph"); if (box) box.innerHTML = state.photos.map((id, i) => `<div class="p${i ? "" : " cover"}" style="background-image:url('${state.th[id] || ""}')">${i ? "" : "<em>Cover</em>"}<button type="button" data-rm="${i}" title="Remove">×</button></div>`).join("");
    $$("[data-rm]", m.el).forEach((b) => b.onclick = () => { const i = +b.dataset.rm; state.removed.push(state.photos[i]); state.photos.splice(i, 1); drawPhotos(); });
    const b1 = m.q("#ph1"); if (b1) { b1.innerHTML = state.photo ? `<div class="p cover" style="background-image:url('${state.photo}')"><button type="button" id="rm1">×</button></div>` : ""; const rm = m.q("#rm1"); if (rm) rm.onclick = () => { state.photo = ""; drawPhotos(); }; }
  };
  const drawDays = () => { const box = m.q("#days"); if (!box) return; box.innerHTML = state.days.map((d, i) => `<div class="rep"><button type="button" class="sk-btn sm red rm" data-rd="${i}">Remove</button><b>Day ${i + 1}</b><div class="row2" style="margin-top:8px"><input data-d="${i}" data-k="title_en" placeholder="Title (English)" value="${esc(d.title_en || "")}"><input data-d="${i}" data-k="title_id" placeholder="Judul (Indonesia, optional)" value="${esc(d.title_id || "")}"></div><div class="row2" style="margin-top:8px"><textarea data-d="${i}" data-k="text_en" rows="3" placeholder="What happens (English)">${esc(d.text_en || "")}</textarea><textarea data-d="${i}" data-k="text_id" rows="3" placeholder="Kegiatan (Indonesia, optional)">${esc(d.text_id || "")}</textarea></div></div>`).join("");
    $$("[data-d]", box).forEach((el) => el.oninput = () => { state.days[+el.dataset.d][el.dataset.k] = el.value; });
    $$("[data-rd]", box).forEach((b) => b.onclick = () => { state.days.splice(+b.dataset.rd, 1); drawDays(); });
  };
  drawPhotos(); drawDays();
  state.photos.forEach((id) => loadImage(id).then((u) => { state.th[id] = u; drawPhotos(); }));
  const addDay = m.q("#addDay"); if (addDay) addDay.onclick = () => { state.days.push({}); drawDays(); };
  const phIn = m.q("#phIn"); if (phIn) phIn.onchange = async () => {
    const max = D.fields.find((f) => f.t === "photos").max;
    for (const file of [...phIn.files]) { if (state.photos.length >= max) { toast(`Up to ${max} pictures.`, "err"); break; } try { toast("Adding " + file.name + "…"); const id = await saveImage(file); state.photos.push(id); state.th[id] = await thumbFromFile(file, 420); drawPhotos(); } catch (e) { toast(e.message, "err"); } }
    phIn.value = "";
  };
  const ph1In = m.q("#ph1In"); if (ph1In) ph1In.onchange = async () => { try { state.photo = (await fileToDataUrl(ph1In.files[0], 640, 0.72, 70000)).data; drawPhotos(); } catch (e) { toast(e.message, "err"); } ph1In.value = ""; };
  m.q("#cancel").onclick = () => m.close();
  const del = m.q("#del"); if (del) del.onclick = async () => { if (!confirm(`Delete this ${D.one} for good?`)) return; for (const id of state.photos) await F.deleteDoc(dref("images", id)).catch(() => {}); await F.deleteDoc(dref(name, item.id)); if (name === "hotels") { await noteDeletedHotel(item.id); recentHotels.set(item.id, null); } toast("Deleted."); m.close(); route(); };
  m.q("#ef").onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(e.target), data = {};
    for (const f of D.fields) {
      if (["text", "select", "date"].includes(f.t)) data[f.k] = String(fd.get(f.k) ?? "").trim();
      else if (f.t === "number") data[f.k] = fd.get(f.k) === "" || fd.get(f.k) === null ? null : Number(fd.get(f.k));
      else if (f.t === "bool") data[f.k] = fd.get(f.k) === "on";
      else if (f.t === "tags") data[f.k] = String(fd.get(f.k) || "").split(",").map((s) => s.trim()).filter(Boolean);
      else if (f.t === "bi") { data[f.k + "_en"] = String(fd.get(f.k + "_en") || "").trim(); data[f.k + "_id"] = String(fd.get(f.k + "_id") || "").trim(); }
      else if (f.t === "bilines") { for (const l of ["en", "id"]) data[f.k + "_" + l] = String(fd.get(f.k + "_" + l) || "").split("\n").map((s) => s.trim()).filter(Boolean); }
      else if (f.t === "ref") data.link = String(fd.get("link") || "");
    }
    if (D.fields.some((f) => f.t === "photos")) {
      data.photos = state.photos;
      const first = state.photos[0];
      if (!first) data.cover = "";
      else if (first === item.photos?.[0] && item.cover) data.cover = item.cover;
      else { const src = state.th[first] || (await loadImage(first)); data.cover = src ? (await fileToDataUrl(await (await fetch(src)).blob(), 420, 0.7, 45000)).data : ""; }
    }
    if (D.fields.some((f) => f.t === "photo")) data.photo = state.photo;
    if (D.fields.some((f) => f.t === "days")) data.itinerary = state.days.filter((d) => d.title_en || d.text_en || d.title_id);
    if (data.stars !== undefined) data.stars = data.stars === "" ? null : Number(data.stars);
    data.updatedAt = F.serverTimestamp(); const btn = m.q("#save"); btn.disabled = true;
    try {
      let savedId = item.id;
      if (isNew) { data.createdAt = F.serverTimestamp(); savedId = (await F.addDoc(col(name), clean(data))).id; } else await F.setDoc(dref(name, item.id), clean(data), { merge: true });
      if (name === "hotels") { const { updatedAt, createdAt, ...keep } = data; recentHotels.set(savedId, { ...item, ...keep, id: savedId }); }
      for (const id of state.removed) await F.deleteDoc(dref("images", id)).catch(() => {});
      toast("Saved."); m.close(); route();
    } catch (er) { $("#eerr", m.el).textContent = "Could not save: " + er.message; btn.disabled = false; }
  };
}

// ------------------------------------------------------------------ customers
async function customers() {
  const snap = await F.getDocs(col("customers")); const list = snap.docs.map(plain).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  main.innerHTML = `<h1>Customers</h1><p class="lead">People who created an account on your website. Click one to see everything they asked for.</p><div class="panel"><div class="tools"><input id="q" type="search" placeholder="Search…" style="min-width:240px"><span class="sp"></span><button class="sk-btn sm" id="csv" type="button">⬇ Export to Excel</button></div><div id="tb"></div></div>`;
  const draw = () => { const q = val($("#q")).toLowerCase(); const l = list.filter((c) => !q || [c.displayName, c.email, c.phone].join(" ").toLowerCase().includes(q));
    $("#tb").innerHTML = l.length ? `<table class="t"><tr><th>Name</th><th>E-mail</th><th>Phone</th><th>Joined</th></tr>${l.map((c) => `<tr class="row" data-id="${c.id}"><td><b>${esc(c.displayName || "—")}</b></td><td>${esc(c.email)}</td><td>${esc(c.phone || "—")}</td><td>${when(c.createdAt)}</td></tr>`).join("")}</table>` : `<p class="lead">No customer accounts yet.</p>`;
    $$("tr.row", main).forEach((tr) => tr.onclick = async () => { const c = list.find((x) => x.id === tr.dataset.id); const rs = (await F.getDocs(F.query(col("requests"), F.where("uid", "==", c.id)))).docs.map(plain).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const m = modal(`<h3>${esc(c.displayName || c.email)}</h3><p class="sk-sub">${esc(c.email)} · ${esc(c.phone || "no phone")}</p><h4 style="margin:10px 0">Requests (${rs.length})</h4>${rs.length ? requestTable(rs) : "<p>No requests yet.</p>"}`, { wide: true });
      $$("tr.row", m.el).forEach((r2) => r2.onclick = () => { m.close(); openRequest(rs.find((x) => x.id === r2.dataset.id), () => route()); }); }); };
  $("#q").oninput = draw; draw();
  $("#csv").onclick = () => csvDownload("customers", list.map((c) => ({ Name: c.displayName, Email: c.email, Phone: c.phone, Joined: when(c.createdAt) })));
}

// ------------------------------------------------------------------ page texts & settings
async function settings() {
  const d = (await F.getDoc(dref("settings", "site"))).data() || {}; const v = (k) => esc(d[k] ?? "");
  const tv = (k) => esc(d.timesSet ? d[k] ?? "" : String(d[k] || "").trim() || C.TIME_DEFAULTS[k] || "");   // the times: what the website shows now
  const faq = (d.faq || []).map((x) => ({ ...x }));
  main.innerHTML = `<h1>Page texts &amp; settings</h1><p class="lead">Contact details and texts shown on the website. Leave a box empty to use the website's built-in text.</p>
  <form id="sf" class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:12px">Contact</h3>
  <div class="fl">WhatsApp numbers<span class="help">Add as many as you need. Each WhatsApp button on the website goes to the numbers set for that page; when there is more than one, the customer chooses who to chat with.
    A number set for the Corporate, Hotel or Tour pages replaces the "Whole website" numbers there. The first "Whole website" number is the main one (footer). Type the number with the country code, e.g. 6289530998988.</span>
    <div id="wans"></div><button class="sk-btn sm" type="button" id="addWa">＋ Add a WhatsApp number</button></div>
  <div class="row3"><label>Contact e-mail (only if it really works)<input name="email" value="${v("email")}"></label><label>Instagram link<input name="instagram" value="${v("instagram")}" placeholder="https://www.instagram.com/satukoneksihotel/"></label><label>Facebook link<input name="facebook" value="${v("facebook")}"></label></div>
  <div class="row2"><label>Opening hours – English<input name="hours_en" value="${v("hours_en")}" placeholder="Daily 07:00 – 23:00 (WIB)"></label><label>Jam layanan – Indonesia<input name="hours_id" value="${v("hours_id")}"></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 12px">Announcement bar (top of every page)</h3>
  <label class="chk" style="font-weight:700;color:var(--teal2)"><input type="checkbox" name="announcementOn"${d.announcementOn ? " checked" : ""}> Show the announcement bar</label>
  <div class="row2"><label>Text – English<input name="announcement_en" value="${v("announcement_en")}" placeholder="e.g. Ask us for this week's hotel offers"></label><label>Teks – Indonesia<input name="announcement_id" value="${v("announcement_id")}"></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 12px">Home page</h3>
  <div class="row2"><label>Main headline – English<input name="heroTitle_en" value="${v("heroTitle_en")}" placeholder="Every hotel. Best price. One hub."></label><label>Judul utama – Indonesia<input name="heroTitle_id" value="${v("heroTitle_id")}" placeholder="Semua hotel. Harga terbaik. Satu tempat."></label></div>
  <div class="row2"><label>Headline text under the title – English<textarea name="heroLead_en" rows="2">${v("heroLead_en")}</textarea></label><label>Teks di bawah judul – Indonesia<textarea name="heroLead_id" rows="2">${v("heroLead_id")}</textarea></label></div>
  <div class="row2"><label>Offers banner title – English<input name="bannerTitle_en" value="${v("bannerTitle_en")}"></label><label>Judul banner penawaran – Indonesia<input name="bannerTitle_id" value="${v("bannerTitle_id")}"></label></div>
  <div class="row2"><label>Offers banner text – English<textarea name="bannerText_en" rows="2">${v("bannerText_en")}</textarea></label><label>Teks banner penawaran – Indonesia<textarea name="bannerText_id" rows="2">${v("bannerText_id")}</textarea></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">Trust (home page, hotel pages)</h3><p class="help">Only what is TRUE. Each item shows on the website only when filled in. Reviews: real customers who agreed to be quoted.</p>
  <p class="help">The two times below show on How it works, the Corporate page, the home page and the hotel pages. Change them any time; empty a box to hide that line.</p>
  <div class="row2"><label>Reply time – English<input name="replyTime_en" value="${tv("replyTime_en")}" placeholder="e.g. We reply within 30 minutes."></label><label>Waktu balas – Indonesia<input name="replyTime_id" value="${tv("replyTime_id")}" placeholder="mis. Kami membalas dalam 30 menit."></label></div>
  <div class="row2"><label>Payment check time – English<input name="payCheck_en" value="${tv("payCheck_en")}" placeholder="e.g. We check payments within 1 hour."></label><label>Waktu cek pembayaran – Indonesia<input name="payCheck_id" value="${tv("payCheck_id")}" placeholder="mis. Kami mengecek pembayaran dalam 1 jam."></label></div>
  <div class="row2"><label>Cancellation line – English<input name="cancelLine_en" value="${v("cancelLine_en")}" placeholder="e.g. Cancellation rules are written in your quotation before you pay"></label><label>Kalimat pembatalan – Indonesia<input name="cancelLine_id" value="${v("cancelLine_id")}"></label></div>
  <div id="revs"></div><button class="sk-btn sm" type="button" id="addRev">+ Add a real review</button>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">About page: who is behind the business</h3>
  <div class="row2"><label>Your name (founder / manager)<input name="founderName" value="${v("founderName")}"></label><label>Business registration no. (e.g. NIB)<input name="companyReg" value="${v("companyReg")}"></label></div>
  <div class="row2"><label>Your role – English<input name="founderRole_en" value="${v("founderRole_en")}" placeholder="e.g. Founder"></label><label>Peran – Indonesia<input name="founderRole_id" value="${v("founderRole_id")}" placeholder="mis. Pendiri"></label></div>
  <div class="row2"><label>Short background – English<textarea name="founderBio_en" rows="3">${v("founderBio_en")}</textarea></label><label>Latar belakang singkat – Indonesia<textarea name="founderBio_id" rows="3">${v("founderBio_id")}</textarea></label></div>
  <div class="row2"><label>Business address<input name="companyAddress" value="${v("companyAddress")}"></label><label>Your photo (square works best)${d.founderPhoto ? " - one is saved" : ""}<input name="founderPhotoFile" type="file" accept="image/*" style="padding-top:12px"></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">Corporate page: your contact person</h3><p class="help">Shown on <b>/corporate</b> as the person companies deal with. Use a real person and a real photo. Empty = the founder details above are used; both empty = no name is shown.</p>
  <div class="row2"><label>Name<input name="rmName" value="${v("rmName")}"></label><div class="fl">Photo (square works best)
    <div style="display:flex;gap:12px;align-items:center;margin:6px 0"><img id="rmPrev" src="/assets/img/corporate-contact.webp" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #e9c176;background:#fff"><span class="help" style="margin:0" id="rmPrevT">Now showing: the default picture.</span></div>
    <input name="rmPhotoFile" type="file" accept="image/*" style="padding-top:12px">
    <label class="chk" style="margin:8px 0 0"><input type="checkbox" name="rmPhotoReset"> Remove my uploaded photo (go back to the default picture)</label>
    <label class="chk" style="margin:4px 0 0"><input type="checkbox" name="rmPhotoOff"${d.rmPhotoOff ? " checked" : ""}> Show no picture (a plain icon)</label></div></div>
  <div class="row2"><label>Role – English<input name="rmRole_en" value="${v("rmRole_en")}" placeholder="e.g. Corporate Relationship Manager"></label><label>Peran – Indonesia<input name="rmRole_id" value="${v("rmRole_id")}" placeholder="mis. Manajer Hubungan Korporat"></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">How it works page (your rules)</h3><p class="help">Shown on the public page <b>/how-it-works</b>. Write only what is true for your business. Leave empty to show: "Each hotel has its own cancellation rules - ask us before you pay; we write them in your quotation."</p>
  <label>Registered business name (e.g. PT ...)<input name="companyName" value="${v("companyName")}" placeholder="PT ..."></label>
  <div class="row2"><label>Payment, cancellation &amp; refund rules – English<textarea name="howTerms_en" rows="4">${v("howTerms_en")}</textarea></label><label>Aturan pembayaran, pembatalan &amp; pengembalian dana – Indonesia<textarea name="howTerms_id" rows="4">${v("howTerms_id")}</textarea></label></div>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">Google map on the home page</h3><p class="help">When a visitor types a city or hotel, the home page shows a Google map of hotels there. Paste your free <b>Maps Embed API</b> key here (Google Cloud → APIs &amp; Services → Credentials; restrict it to satukoneksihotel.com). Empty = visitors get an "Open in Google Maps" link instead. Google's prices are never shown.</p>
  <label>Google Maps Embed key<input name="mapsKey" value="${v("mapsKey")}" placeholder="AIza…" autocomplete="off"></label>
  <h3 style="font:700 20px 'Plus Jakarta Sans';margin:14px 0 6px">Questions &amp; answers (FAQ)</h3><p class="help">If you add any, they replace the built-in ones on the home page.</p><div id="faqs"></div><button class="sk-btn sm" type="button" id="addFaq">＋ Add a question</button>
  <p class="sk-err" id="serr"></p><div class="fh"><button class="sk-btn gold" type="submit">Save settings</button></div></form>`;
  const drawFaq = () => { $("#faqs").innerHTML = faq.map((x, i) => `<div class="rep"><button type="button" class="sk-btn sm red rm" data-rf="${i}">Remove</button><div class="row2"><input data-f="${i}" data-k="q_en" placeholder="Question (English)" value="${esc(x.q_en || "")}"><input data-f="${i}" data-k="q_id" placeholder="Pertanyaan (Indonesia)" value="${esc(x.q_id || "")}"></div><div class="row2" style="margin-top:8px"><textarea data-f="${i}" data-k="a_en" rows="2" placeholder="Answer (English)">${esc(x.a_en || "")}</textarea><textarea data-f="${i}" data-k="a_id" rows="2" placeholder="Jawaban (Indonesia)">${esc(x.a_id || "")}</textarea></div></div>`).join("");
    $$("[data-f]", main).forEach((el) => el.oninput = () => { faq[+el.dataset.f][el.dataset.k] = el.value; }); $$("[data-rf]", main).forEach((b) => b.onclick = () => { faq.splice(+b.dataset.rf, 1); drawFaq(); }); };
  drawFaq(); $("#addFaq").onclick = () => { faq.push({}); drawFaq(); };
  const wans = (Array.isArray(d.waNumbers) && d.waNumbers.length ? d.waNumbers : [{ num: d.whatsapp || C.WA_DEFAULT, label_en: "", label_id: "", use: "all", on: true }]).map((x) => ({ on: true, use: "all", ...x }));
  const drawWa = () => { $("#wans").innerHTML = wans.map((x, i) => `<div class="rep"><button type="button" class="sk-btn sm red rm" data-rw="${i}">Remove</button>
      <p class="rhead">WhatsApp ${i + 1}${x.num ? ` <span style="font-weight:500;color:var(--a-mute)">· customers see ${esc(C.waShow(x.num))}</span>` : ""}</p>
      <div class="row3"><label>Number (with country code)<input data-w="${i}" data-k="num" value="${esc(x.num || "")}" placeholder="e.g. 6289530998988" inputmode="tel"></label>
      <label>Name shown - English<input data-w="${i}" data-k="label_en" value="${esc(x.label_en || "")}" placeholder="e.g. Reservations"></label>
      <label>Nama - Indonesia<input data-w="${i}" data-k="label_id" value="${esc(x.label_id || "")}" placeholder="mis. Reservasi"></label></div>
      <div class="row2" style="align-items:end"><label>Show on<select data-w="${i}" data-k="use">${Object.entries(C.WA_USES).map(([k, [en]]) => `<option value="${k}"${x.use === k ? " selected" : ""}>${en}</option>`).join("")}</select></label>
      <label class="chk" style="margin:0 0 22px"><input type="checkbox" data-w="${i}" data-k="on"${x.on !== false ? " checked" : ""}> On (shown on the website)</label></div></div>`).join("");
    $$("[data-w]", main).forEach((el) => el.oninput = el.onchange = () => { const w = wans[+el.dataset.w]; w[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; });
    $$("[data-rw]", main).forEach((b) => b.onclick = () => { wans.splice(+b.dataset.rw, 1); drawWa(); }); };
  { const pv = $("#rmPrev"), pt = $("#rmPrevT");        // what the contact card shows now, and a preview of a photo you choose
    if (d.rmPhotoOff) { pv.style.opacity = ".25"; pt.textContent = "Now showing: no picture (a plain icon)."; }
    else if (d.rmPhoto) { pt.textContent = "Now showing: your uploaded photo."; C.loadImage(d.rmPhoto).then((u) => { if (u) pv.src = u; }).catch(() => {}); }
    $("#sf [name=rmPhotoFile]").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { pv.src = r.result; pv.style.opacity = ""; pt.textContent = "New photo chosen - press Save settings."; }; r.readAsDataURL(f); }; }
  drawWa(); $("#addWa").onclick = () => { wans.push({ num: "", label_en: "", label_id: "", use: "all", on: true }); drawWa(); };
  const revs = (d.reviews || []).map((x) => ({ ...x }));
  const drawRevs = () => { $("#revs").innerHTML = revs.map((x, i) => `<div class="rep"><button type="button" class="sk-btn sm red rm" data-rr="${i}">Remove</button><textarea data-r="${i}" data-k="text" rows="2" placeholder="What the guest said (their own words)">${esc(x.text || "")}</textarea><div class="row2"><input data-r="${i}" data-k="name" placeholder="Name (as they agreed, e.g. Budi S.)" value="${esc(x.name || "")}"><input data-r="${i}" data-k="place" placeholder="Stay, e.g. Bali, March 2026" value="${esc(x.place || "")}"></div></div>`).join("");
    $$("[data-r]", main).forEach((el) => el.oninput = () => { revs[+el.dataset.r][el.dataset.k] = el.value; }); $$("[data-rr]", main).forEach((b) => b.onclick = () => { revs.splice(+b.dataset.rr, 1); drawRevs(); }); };
  drawRevs(); $("#addRev").onclick = () => { revs.push({}); drawRevs(); };
  tabify($("#sf"), { "Contact": "Contact & WhatsApp", "Announcement bar (top of every page)": "Announcement", "Trust (home page, hotel pages)": "Trust & reviews",
    "About page: who is behind the business": "About us", "Corporate page: your contact person": "Corporate contact", "How it works page (your rules)": "How it works",
    "Google map on the home page": "Google map", "Questions & answers (FAQ)": "FAQ" }, "settings");
  $("#sf").onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target), out = {};
    for (const k of ["email", "instagram", "facebook", "hours_en", "hours_id", "announcement_en", "announcement_id", "heroTitle_en", "heroTitle_id", "heroLead_en", "heroLead_id", "bannerTitle_en", "bannerTitle_id", "bannerText_en", "bannerText_id", "mapsKey", "companyName", "howTerms_en", "howTerms_id", "replyTime_en", "replyTime_id", "payCheck_en", "payCheck_id", "cancelLine_en", "cancelLine_id",
      "founderName", "founderRole_en", "founderRole_id", "founderBio_en", "founderBio_id", "companyReg", "companyAddress", "rmName", "rmRole_en", "rmRole_id"]) out[k] = String(fd.get(k) || "").trim();
    const waOut = wans.map((x) => ({ num: C.waDigits(x.num), label_en: String(x.label_en || "").trim().slice(0, 40), label_id: String(x.label_id || "").trim().slice(0, 40),
      use: C.WA_USES[x.use] ? x.use : "all", on: x.on !== false })).filter((x) => x.num);
    const badWa = waOut.find((x) => x.num.length < 8 || x.num.length > 15);
    if (badWa) { $("#serr").textContent = `This WhatsApp number does not look right: ${badWa.num}. Use the country code, e.g. 6289530998988.`; return; }
    if (!waOut.some((x) => x.on && x.use === "all")) { $("#serr").textContent = 'Keep at least one WhatsApp number that is On and shown on the "Whole website".'; return; }
    const mainWa = waOut.find((x) => x.on && x.use === "all");
    out.waNumbers = waOut; out.whatsapp = mainWa.num; out.whatsappDisplay = C.waShow(mainWa.num);    // older pages and scripts still read "whatsapp"
    out.announcementOn = fd.get("announcementOn") === "on"; out.timesSet = true; out.faq = faq.filter((x) => x.q_en && x.a_en); out.updatedAt = F.serverTimestamp();
    out.reviews = revs.filter((x) => x.text && x.name).map((x) => ({ text: String(x.text).slice(0, 400), name: String(x.name).slice(0, 80), place: String(x.place || "").slice(0, 80) })).slice(0, 6);
    out.founderPhoto = d.founderPhoto || ""; out.rmPhoto = fd.get("rmPhotoReset") === "on" ? "" : d.rmPhoto || ""; out.rmPhotoOff = fd.get("rmPhotoOff") === "on";
    const rp = fd.get("rmPhotoFile"); if (rp && rp.size) { try { out.rmPhoto = await saveImage(rp, { maxSide: 600, name: "contact" }); } catch (er) { $("#serr").textContent = "Photo not saved: " + er.message; return; } }
    const pf = fd.get("founderPhotoFile"); if (pf && pf.size) { try { out.founderPhoto = await saveImage(pf, { maxSide: 600, name: "founder" }); } catch (er) { $("#serr").textContent = "Photo not saved: " + er.message; return; } }
    try { await F.setDoc(dref("settings", "site"), out); sessionStorage.removeItem("skc_settings"); toast("Saved. The website shows it within a few minutes."); } catch (er) { $("#serr").textContent = "Could not save: " + er.message; } };
}

// Long forms read like WordPress settings: one tab per section (each <h3> starts one), one Save bar for all of them.
// Nothing moves out of the form, so Save still saves every tab. The open tab is remembered for this browser tab.
function tabify(form, names = {}, key = "") {
  if (!form) return;
  const save = form.querySelector(".fh"), err = form.querySelector("#serr"), secs = []; let cur = null;
  for (const el of [...form.children]) {
    if (el === save || el === err) continue;
    if (el.tagName === "H3") { cur = document.createElement("section"); cur.className = "adm-sec"; secs.push({ title: el.textContent.trim(), sec: cur }); }
    if (cur) cur.appendChild(el);
  }
  if (secs.length < 2) return;
  const bar = document.createElement("div"); bar.className = "adm-tabs"; bar.setAttribute("role", "tablist");
  const show = (i) => { secs.forEach((s, j) => { s.sec.hidden = j !== i; bar.children[j].classList.toggle("on", j === i); bar.children[j].setAttribute("aria-selected", j === i); });
    try { sessionStorage.setItem("admTab_" + key, String(i)); } catch { /* ignore */ } };
  secs.forEach(({ title }, i) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = names[title] || title.replace(/\s*[(:].*$/, ""); b.onclick = () => show(i); bar.appendChild(b); });
  form.prepend(bar); secs.forEach(({ sec }) => form.insertBefore(sec, err || save || null));
  if (save && !save.querySelector(".note")) save.insertAdjacentHTML("afterbegin", '<span class="note">Saves every tab at once.</span>');
  let start = 0; try { start = Math.min(secs.length - 1, +(sessionStorage.getItem("admTab_" + key) || 0)); } catch { /* ignore */ }
  form.addEventListener("invalid", (e) => { const i = secs.findIndex((s) => s.sec.contains(e.target)); if (i >= 0) show(i); }, true);   // a missing required box opens its tab
  show(start);
}

// ------------------------------------------------------------------ team
async function team() {
  const snap = await F.getDocs(col("admins")); const list = snap.docs.map((d) => ({ id: d.id }));
  main.innerHTML = `<h1>Team</h1><p class="lead">Who can open this admin. The two owners always can. ${owner ? "Add a colleague's Google e-mail below." : "Only the owners can add people."}</p>
  <div class="panel"><table class="t"><tr><th>E-mail</th><th>Role</th><th></th></tr>${OWNERS.map((e) => `<tr><td>${esc(e)}</td><td><span class="badge">Owner</span></td><td></td></tr>`).join("")}${list.map((x) => `<tr><td>${esc(x.id)}</td><td><span class="badge off">Staff</span></td><td>${owner ? `<button class="sk-btn sm red" data-rm="${esc(x.id)}">Remove</button>` : ""}</td></tr>`).join("")}</table>
  ${owner ? `<form id="tf" class="tools" style="margin-top:18px"><input name="e" type="email" required placeholder="colleague@gmail.com" style="min-width:260px"><button class="sk-btn gold" type="submit">Add staff member</button></form><p class="help">Staff can manage hotels, tours, offers and requests, but cannot add other staff. They must sign in with this exact Google e-mail.</p>` : ""}</div>`;
  const tf = $("#tf"); if (tf) tf.onsubmit = async (e) => { e.preventDefault(); const em = val(tf.e).toLowerCase(); try { await F.setDoc(dref("admins", em), { addedBy: me.email, createdAt: F.serverTimestamp() }); toast("Added."); route(); } catch (er) { toast(er.message, "err"); } };
  $$("[data-rm]", main).forEach((b) => b.onclick = async () => { if (!confirm("Remove " + b.dataset.rm + "?")) return; await F.deleteDoc(dref("admins", b.dataset.rm)); route(); });
}

// ------------------------------------------------------------------ backup & export
function csvDownload(name, rows) {
  if (!rows.length) return toast("Nothing to export.", "err");
  const heads = Object.keys(rows[0]); const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [heads.map(q).join(","), ...rows.map((r) => heads.map((h) => q(r[h])).join(","))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `satu-koneksi-${name}-${C.todayStr()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
async function backup() {
  main.innerHTML = `<h1>Backup &amp; export</h1><p class="lead">The free plan has no automatic backups, so download a copy now and then (for example once a month). Keep the file somewhere safe.</p>
  <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:10px">Download everything</h3><p class="help">All requests, customers, hotels, tours, offers, destinations, settings and team (without pictures).</p><button class="sk-btn gold" id="all" type="button">⬇ Download backup file</button> <button class="sk-btn" id="allp" type="button">⬇ Backup including pictures (big file)</button><p id="bmsg" class="help"></p></div>
  <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:10px">Excel lists</h3><div class="tools"><button class="sk-btn sm" data-x="requests">Requests</button><button class="sk-btn sm" data-x="customers">Customers</button><button class="sk-btn sm" data-x="hotels">Hotels</button><button class="sk-btn sm" data-x="tours">Tour packages</button></div></div>`;
  const dump = async (withImages) => { const names = ["settings", "hotels", "tours", "offers", "destinations", "requests", "requestNotes", "customers", "admins", ...(withImages ? ["images"] : [])]; const out = { exportedAt: new Date().toISOString(), by: me.email };
    for (const n of names) { $("#bmsg").textContent = "Reading " + n + "…"; out[n] = (await F.getDocs(col(n))).docs.map(plain); }
    $("#bmsg").textContent = "Done."; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" })); a.download = `satu-koneksi-backup-${C.todayStr()}${withImages ? "-with-pictures" : ""}.json`; a.click(); URL.revokeObjectURL(a.href); };
  $("#all").onclick = () => dump(false).catch((e) => toast(e.message, "err")); $("#allp").onclick = () => dump(true).catch((e) => toast(e.message, "err"));
  $$("[data-x]", main).forEach((b) => b.onclick = async () => { const n = b.dataset.x; const rows = (await F.getDocs(col(n))).docs.map(plain);
    const flat = rows.map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) { if (["cover", "photos", "photo", "itinerary"].includes(k)) continue; o[k] = k.endsWith("At") ? when(v) : Array.isArray(v) ? v.join("; ") : v; } return o; });
    csvDownload(n, flat); });
}

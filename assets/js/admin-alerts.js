// Staff admin -> "Travel alerts": the live alerts shown on the Festivals & events pages, the country guides and Destinations.
// Most alerts are AUTOMATIC (the "festivals" engine, every 3 hours in the cloud): GDACS disaster alerts (earthquakes, cyclones,
// floods, volcanoes, wildfires), Reuters headlines (floods, airports closed, curfews, holidays declared ...) and one-off public
// holidays. Staff can hide a wrong automatic match, and add a notice of their own (shown on the website at once).
// The list: search, filters, sort by any column, tick one / tick all, then Hide / Show / Delete the ticked ones together.
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const newId = () => "staff-" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const LEVEL = { red: [3, "Danger", "bad"], orange: [2, "Warning", "warn"], info: [1, "Information", "info"] };
const KIND = { disaster: "Disaster", holiday: "Holiday", event: "Event", notice: "Notice" };
const STATUS = { live: [1, "On the website", "ok"], soon: [2, "Upcoming", "info"], hidden: [3, "Hidden", "warn"], old: [4, "Expired", ""] };
const VIEW_KEY = "admAlertsView";

export async function travelAlerts({ main, toast, db, F, me }) {
  const col = F.collection(db, "travelAlerts");
  const snap = await F.getDocs(col);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const st = all.find((a) => a.id === "_status") || {};
  const names = st.names || {};
  const t = today();
  let items = all.filter((a) => a.id !== "_status");
  const status = (a) => (a.hidden ? "hidden" : String(a.until || "") < t ? "old" : String(a.from || "") > t ? "soon" : "live");
  const country = (a) => (a.countries || []).map((s) => (s === "all" ? "All countries" : names[s] || s)).join(", ");
  const live = () => items.filter((a) => status(a) === "live").length;
  const checked = st.checkedAt?.toDate ? st.checkedAt.toDate().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never";
  const opts = Object.entries(names).sort((a, b) => a[1].localeCompare(b[1])).map(([s, n]) => `<option value="${e(s)}">${e(n)}</option>`).join("");

  // what the list shows: filters + sort (remembered for this browser tab) and the ticked alerts
  let view = { q: "", st: "", lv: "", src: "", sort: "status", dir: 1, shown: 60 };
  try { view = { ...view, ...JSON.parse(sessionStorage.getItem(VIEW_KEY) || "{}") }; } catch { /* ignore */ }
  const sel = new Set();
  const keep = () => { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...view, shown: 60 })); } catch { /* ignore */ } };
  const SORT = {
    level: (a) => -(LEVEL[a.level] || LEVEL.info)[0], title: (a) => String(a.title_en || "").toLowerCase(), country: (a) => country(a).toLowerCase(),
    from: (a) => String(a.from || ""), until: (a) => String(a.until || ""), status: (a) => STATUS[status(a)][0], source: (a) => String(a.source || "").toLowerCase(),
  };
  const filtered = () => {
    const q = view.q.trim().toLowerCase();
    const l = items.filter((a) => (!view.st || status(a) === view.st) && (!view.lv || (a.level || "info") === view.lv)
      && (!view.src || (view.src === "own" ? a.auto === false : a.auto !== false))
      && (!q || [a.title_en, a.title_id, country(a), a.source, a.kind].join(" ").toLowerCase().includes(q)));
    const k = SORT[view.sort] || SORT.status;
    return l.sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * view.dir || String(b.from || "").localeCompare(String(a.from || "")); });
  };
  const count = (fn) => items.filter(fn).length;
  const chip = (cls, txt) => `<span class="eng-chip ${cls}">${e(txt)}</span>`;
  const head = (k, label) => `<th data-sort="${k}" class="${view.sort === k ? "on" : ""}" title="Sort by ${e(label.toLowerCase())}">${e(label)}<i>${view.sort === k ? (view.dir > 0 ? "▲" : "▼") : "↕"}</i></th>`;
  const when = (a) => {
    const s = status(a), left = a.until ? days(t, a.until) : null, start = a.from ? days(t, a.from) : null;
    const note = s === "old" ? "ended" : s === "soon" ? `starts in ${start} day${start === 1 ? "" : "s"}` : left === 0 ? "ends today" : left != null ? `ends in ${left} day${left === 1 ? "" : "s"}` : "";
    return `<span class="nowrap">${e(a.from || "?")} → ${e(a.until || "?")}</span>${note ? `<div class="sub">${e(note)}</div>` : ""}`;
  };
  const row = (a) => {
    const s = status(a), lv = LEVEL[a.level] || LEVEL.info;
    return `<tr data-id="${e(a.id)}" class="st-${s}${sel.has(a.id) ? " picked" : ""}">
      <td class="cb"><input type="checkbox" data-sel="${e(a.id)}"${sel.has(a.id) ? " checked" : ""} aria-label="Tick this alert"></td>
      <td>${chip(lv[2], lv[1])}</td>
      <td class="ttl"><b>${e(a.title_en)}</b>${a.url ? ` <a href="${e(a.url)}" target="_blank" rel="noopener" title="Open the source">↗</a>` : ""}
        <div class="sub">${e(KIND[a.kind] || a.kind || "Alert")} · ${e(a.source || "")}${a.auto === false ? " · <b>our own notice</b>" : ""}</div></td>
      <td>${e(country(a))}</td><td>${when(a)}</td><td>${chip(STATUS[s][2], STATUS[s][1])}</td>
      <td class="act">${a.hidden ? `<button class="sk-btn sm" data-one="show">Show</button>` : `<button class="sk-btn sm" data-one="hide">Hide</button>`}
        ${a.auto === false ? `<button class="sk-btn sm red" data-one="del">Delete</button>` : ""}</td></tr>`;
  };

  main.innerHTML = `<h1>Travel alerts</h1>
  <p class="lead">Live alerts on the <a href="/travel-info/festivals-events" target="_blank">Festivals &amp; events</a> pages, the country guides and Destinations.
  They are found <b>automatically every 3 hours</b>: disaster alerts (GDACS), Reuters headlines and one-off public holidays. Wrong match? <b>Hide</b> it.</p>
  <div class="tiles">
    <a class="tile" href="#" data-quick="live"><b id="nLive">${live()}</b><span>On the website now</span></a>
    <a class="tile" href="#" data-quick="red"><b>${count((a) => a.level === "red" && status(a) === "live")}</b><span>Danger alerts live</span></a>
    <a class="tile" href="#" data-quick="hidden"><b id="nHidden">${count((a) => a.hidden)}</b><span>Hidden by staff</span></a>
    <div class="tile"><b style="font-size:17px;line-height:1.35">${e(checked)}</b><span>Last automatic check</span></div></div>
  <div class="panel" id="alist">
    <div class="tools">
      <input id="aq" type="search" placeholder="Search title, country, source…" value="${e(view.q)}" style="min-width:240px">
      <select id="ast"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${view.st === k ? " selected" : ""}>${v[1]} (${count((a) => status(a) === k)})</option>`).join("")}</select>
      <select id="alv"><option value="">All levels</option>${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}"${view.lv === k ? " selected" : ""}>${v[1]} (${count((a) => (a.level || "info") === k)})</option>`).join("")}</select>
      <select id="asrc"><option value="">All sources</option><option value="auto"${view.src === "auto" ? " selected" : ""}>Automatic</option><option value="own"${view.src === "own" ? " selected" : ""}>Our own notices</option></select>
      <span class="sp"></span><button class="sk-btn sm" id="chk" type="button">Check now</button>
      <button class="sk-btn sm gold" id="addBtn" type="button">＋ Add a notice</button></div>
    <div class="bulk" id="abulk" hidden><b id="asel"></b><span class="sp"></span>
      <button class="sk-btn sm" data-bulk="hide" type="button">Hide from website</button><button class="sk-btn sm" data-bulk="show" type="button">Show on website</button>
      <button class="sk-btn sm red" data-bulk="del" type="button">Delete</button><button class="sk-link" data-bulk="none" type="button">Clear</button></div>
    <div class="tscroll"><table class="t at"><thead><tr><th class="cb"><input type="checkbox" id="aall" aria-label="Tick all shown"></th>
      ${head("level", "Level")}${head("title", "Alert")}${head("country", "Country")}${head("until", "Dates")}${head("status", "Status")}<th></th></tr></thead><tbody id="arows"></tbody></table></div>
    <p class="help" id="acount" style="margin:12px 0 0"></p><div id="amore" style="text-align:center"></div></div>
  <details class="panel" id="addbox"><summary>＋ Add a notice of your own</summary>
    <p class="help" style="margin-top:12px">Only for news the automatic check cannot know - e.g. “Hotel area in Bangkok flooded, airport open”. It shows on the website at once.</p>
    <form id="nf"><div class="row2">
      <label>Country<select name="country" required><option value="all">All countries</option>${opts}</select></label>
      <label>Importance<select name="level"><option value="info">Information</option><option value="orange">Warning</option><option value="red">Danger</option></select></label>
      <label>Title (English)<input name="title_en" required minlength="3" maxlength="200" placeholder="Floods in Bangkok - Suvarnabhumi airport open"></label>
      <label>Title (Indonesian)<input name="title_id" maxlength="200" placeholder="Banjir di Bangkok - bandara Suvarnabhumi tetap buka"></label>
      <label>Text (English)<textarea name="text_en" maxlength="800" rows="2"></textarea></label>
      <label>Text (Indonesian)<textarea name="text_id" maxlength="800" rows="2"></textarea></label>
      <label>Link (optional, https://)<input name="url" maxlength="500" placeholder="https://"></label>
      <label>Type<select name="kind"><option value="notice">Notice</option><option value="disaster">Disaster</option><option value="holiday">Holiday</option><option value="event">Event</option></select></label>
      <label>Show from<input name="from" type="date" value="${t}" required></label>
      <label>Show until<input name="until" type="date" value="${plus(t, 7)}" required></label></div>
      <div><button class="sk-btn gold" type="submit">Publish notice</button></div></form></details>`;

  const $ = (s) => main.querySelector(s);
  const draw = () => {
    const list = filtered(), shown = list.slice(0, view.shown);
    for (const id of [...sel]) if (!items.some((a) => a.id === id)) sel.delete(id);
    $("#arows").innerHTML = shown.map(row).join("") || `<tr><td colspan="7" class="empty">${items.length ? "No alert matches these filters." : "No alerts yet - the first automatic check fills this list."}</td></tr>`;
    $("#acount").textContent = `Showing ${shown.length} of ${list.length}${list.length !== items.length ? ` (filtered from ${items.length})` : ""}. Click a column title to sort; click it again to reverse.`;
    $("#amore").innerHTML = list.length > shown.length ? `<button class="sk-btn sm" type="button" id="moreBtn">Show ${Math.min(60, list.length - shown.length)} more</button>` : "";
    const ticked = shown.filter((a) => sel.has(a.id)).length, box = $("#aall");
    box.checked = !!shown.length && ticked === shown.length; box.indeterminate = ticked > 0 && ticked < shown.length;
    $("#abulk").hidden = !sel.size; $("#asel").textContent = `${sel.size} ticked`;
    main.querySelectorAll("thead th[data-sort]").forEach((th) => { const on = th.dataset.sort === view.sort; th.classList.toggle("on", on); th.querySelector("i").textContent = on ? (view.dir > 0 ? "▲" : "▼") : "↕"; });
    $("#nLive").textContent = live(); $("#nHidden").textContent = count((a) => a.hidden);
  };
  const bust = () => { try { sessionStorage.removeItem("skAlerts1"); } catch { /* ignore */ } };
  const setHidden = async (ids, hidden) => {
    const todo = items.filter((a) => ids.includes(a.id) && !!a.hidden !== hidden);
    const res = await Promise.allSettled(todo.map((a) => F.updateDoc(F.doc(db, "travelAlerts", a.id), { hidden, hiddenBy: me.email, updatedAt: F.serverTimestamp() })));
    res.forEach((r, i) => { if (r.status === "fulfilled") todo[i].hidden = hidden; });
    const bad = res.filter((r) => r.status === "rejected").length; bust();
    toast(bad ? `${todo.length - bad} changed, ${bad} could not be changed.` : todo.length ? `${todo.length} ${hidden ? "hidden from" : "shown on"} the website.` : "Nothing to change.", bad ? "err" : undefined);
  };
  const remove = async (ids) => {
    const own = items.filter((a) => ids.includes(a.id) && a.auto === false), auto = ids.length - own.length;
    if (!own.length) return toast("Automatic alerts cannot be deleted - hide them instead.", "err");
    if (!confirm(`Delete ${own.length} notice${own.length === 1 ? "" : "s"} of our own for good?${auto ? `\n(${auto} automatic alert${auto === 1 ? "" : "s"} will be skipped - hide those instead.)` : ""}`)) return;
    const res = await Promise.allSettled(own.map((a) => F.deleteDoc(F.doc(db, "travelAlerts", a.id))));
    const gone = new Set(own.filter((_, i) => res[i].status === "fulfilled").map((a) => a.id));
    items = items.filter((a) => !gone.has(a.id)); gone.forEach((id) => sel.delete(id)); bust();
    toast(`${gone.size} deleted.${auto ? ` ${auto} automatic skipped.` : ""}`);
  };

  // filters, sort, tick boxes, the buttons
  $("#aq").oninput = (ev) => { view.q = ev.target.value; view.shown = 60; keep(); draw(); };
  [["#ast", "st"], ["#alv", "lv"], ["#asrc", "src"]].forEach(([s, k]) => { $(s).onchange = (ev) => { view[k] = ev.target.value; view.shown = 60; keep(); draw(); }; });
  main.querySelector("thead").onclick = (ev) => {
    const th = ev.target.closest("th[data-sort]"); if (!th) return;
    if (view.sort === th.dataset.sort) view.dir = -view.dir; else { view.sort = th.dataset.sort; view.dir = th.dataset.sort === "until" || th.dataset.sort === "level" ? 1 : 1; }
    keep(); draw();
  };
  $("#aall").onchange = (ev) => { filtered().slice(0, view.shown).forEach((a) => (ev.target.checked ? sel.add(a.id) : sel.delete(a.id))); draw(); };
  $("#arows").onchange = (ev) => { const id = ev.target.dataset?.sel; if (!id) return; ev.target.checked ? sel.add(id) : sel.delete(id); draw(); };
  $("#arows").onclick = async (ev) => {
    const b = ev.target.closest("[data-one]"), tr = ev.target.closest("tr[data-id]"); if (!tr) return;
    if (!b) { if (!ev.target.closest("a,input,button")) { const id = tr.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); draw(); } return; }   // a click on the row ticks it
    b.disabled = true; const id = tr.dataset.id;
    if (b.dataset.one === "del") await remove([id]); else await setHidden([id], b.dataset.one === "hide");
    draw();
  };
  $("#abulk").onclick = async (ev) => {
    const b = ev.target.closest("[data-bulk]"); if (!b) return; const ids = [...sel];
    if (b.dataset.bulk === "none") { sel.clear(); return draw(); }
    b.disabled = true;
    if (b.dataset.bulk === "del") await remove(ids); else { await setHidden(ids, b.dataset.bulk === "hide"); sel.clear(); }
    b.disabled = false; draw();
  };
  $("#amore").onclick = (ev) => { if (ev.target.id === "moreBtn") { view.shown += 60; draw(); } };
  main.querySelectorAll("[data-quick]").forEach((a) => (a.onclick = (ev) => {
    ev.preventDefault(); const q = a.dataset.quick;
    Object.assign(view, { q: "", st: q === "red" ? "live" : q, lv: q === "red" ? "red" : "", src: "", shown: 60 });
    $("#aq").value = ""; $("#ast").value = view.st; $("#alv").value = view.lv; $("#asrc").value = ""; keep(); draw();
    $("#alist").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#addBtn").onclick = () => { const d = $("#addbox"); d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); d.querySelector("[name=title_en]")?.focus({ preventScroll: true }); };
  $("#chk").onclick = async () => {
    await F.addDoc(F.collection(db, "engineJobs"), { engine: "festivals", args: ["--alerts"], label: "Travel alerts: check now", requestedBy: me.email, status: "queued", createdAt: F.serverTimestamp() });
    toast("Queued - the cloud checks within about 30 minutes (Admin → Bots shows progress).");
  };
  $("#nf").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), v = (k) => String(f.get(k) || "").trim();
    if (v("url") && !/^https:\/\//.test(v("url"))) return toast("The link must start with https://", "err");
    if (v("until") < v("from")) return toast("'Show until' must be after 'Show from'.", "err");
    try {
      const id = newId(), doc = {
        kind: v("kind"), type: "", level: v("level"), countries: [v("country")], title_en: v("title_en"), title_id: v("title_id") || v("title_en"),
        text_en: v("text_en"), text_id: v("text_id") || v("text_en"), url: v("url"), source: "Satu Koneksi Hotel", from: v("from"), until: v("until"),
        auto: false, hidden: false, createdBy: me.email, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() };
      await F.setDoc(F.doc(db, "travelAlerts", id), doc);
      items.unshift({ ...doc, id }); bust(); ev.target.reset(); $("#addbox").open = false; draw();
      toast("Published - it shows on the website now.");
    } catch (er) { toast(er.message, "err"); }
  };
  draw();
}

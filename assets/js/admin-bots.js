// Staff admin -> "Bots": start the Python bots from the Admin Panel. A job is queued here; the cloud worker (GitHub, every ~10 minutes)
// runs it and writes the result back. The office PC is only a backup. Nothing is posted or published without the buttons that say so.
// The loaders are passed in, so the same code is tested with sample data (tests/bots_ui_harness.html).

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const chip = (s) => `<span class="eng-chip ${/^(done)$/.test(s) ? "ok" : /^(queued|running|cancelled)$/.test(s) ? "warn" : "bad"}">${e(s)}</span>`;
const mins = (s) => { const t = Date.parse(String(s || "").replace(" UTC", "Z").replace(" ", "T")); return isNaN(t) ? null : Math.round((Date.now() - t) / 60000); };
const day = (v) => { if (!v) return ""; const t = typeof v === "number" ? new Date(v) : new Date(String(v)); return isNaN(t) ? String(v) : t.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); };

// [group, title, help, engine, fields, build(values) -> args, confirm?]
const BOTS = [
  ["Quotes", "Check new website enquiries now", "Internet price + reply draft for every new hotel enquiry → Quotes. Type the MG rate there (MG's e-mail code stops robots from logging in).", "quotes", [], () => []],
  ["Quotes", "Redo one enquiry with fresh prices", "Your notes and status are kept.", "quotes", [["req", "Enquiry id (from the Quotes page address or Requests)"]], (v) => ["--request", v.req]],
  ["Quotes", "Try a quote (no real enquiry)", "The result appears in the job output below. Nothing is saved.", "quotes",
    [["hotel", "Hotel name as in MG, e.g. The Lokha Ubud"], ["city", "City (optional)", ""], ["in", "Check-in", undefined, "date"], ["out", "Check-out", undefined, "date"], ["rooms", "Rooms", "1", "number"], ["adults", "Adults", "2", "number"]],
    (v) => ["--test", v.hotel, ...(v.city ? ["--city", v.city] : []), "--in", v.in, "--out", v.out, "--rooms", v.rooms || "1", "--adults", v.adults || "2"]],
  ["Hotels", "Read a hotel from MG and save it in our database", "Facts, facilities and photos (never rates). ⚠️ Needs an MG login: MG asks for an e-mail code at every login, so this works from the PC backup only for now.", "mghotel",
    [["hotel", "Hotel name as in MG"]], (v) => ["--hotel", v.hotel, "--save-online"]],
  ["Hotels", "Find map positions of hotels (30 minutes at a time)", "Gives every hotel its map position (latitude / longitude) from our OpenStreetMap list and the free map search, so the robot can tell that two entries are the same hotel by place. Free. About 2 seconds per hotel: press again until it says '0 hotels without a map position'. Never changes prices, photos or texts.", "hotelgeo", [], () => ["--max-minutes", "28"]],
  ["Hotels", "Map positions - instant part only", "Only the hotels found in our OpenStreetMap list (no internet search). Takes a minute or two.", "hotelgeo", [], () => ["--offline-only"]],
  ["Hotels", "Refresh a hotel's MG details in the database", "For a hotel already read (folder name, e.g. the-lokha-ubud).", "hoteldb", [["slug", "Hotel folder name"]], (v) => ["--hotel", v.slug]],
  ["Posts", "Make a hotel post draft", "Dark 'Urban Vibe' picture + Indonesian/English caption. Leave the price empty to say 'ask for rates' (never an MG rate).", "hotelpost",
    [["slug", "Hotel folder name, e.g. the-lokha-ubud"], ["price", "YOUR OWN selling price per night (optional)", ""]], (v) => ["--hotel", v.slug, ...(v.price ? ["--selling-price", v.price] : [])]],
  ["Posts", "Make 3 post drafts from the trends", "Places that are rising / in season. Drafts appear in Engines → Post drafts.", "posts", [], () => ["--from-trends", "3"]],
  ["Posts", "Make a post draft for one place", "city:bali or country:japan (add the word visa for a 'check the rules' post).", "posts", [["topic", "e.g. city:bali"], ["type", "places or visa", "places"]], (v) => ["--topic", v.topic, "--type", v.type || "places"]],
  ["Posts", "Approve a post draft", "After you have READ the picture and caption. Nothing is posted yet.", "metapost", [["folder", "Draft folder name, e.g. 2026-10-10_the-lokha-ubud_hotel"]], (v) => ["--approve", v.folder]],
  ["Posts", "POST an approved draft to Facebook + Instagram", "Needs the Meta key in GitHub secrets. Posts for everyone to see.", "metapost", [["folder", "Approved draft folder name"]], (v) => ["--post", v.folder, "--live"], true],
  ["Website", "Check MG 'Unbeatable Deals' → Offers", "New deals are saved hidden. Also runs by itself daily if switched on.", "mgoffers", [], () => []],
  ["Website", "Run ALL weekly bots", "Trends, links, audit, MG deals, 3 post drafts - and save the results. Also runs by itself on Sunday if switched on.", "weekly", [], () => ["--sync"]],
  ["Website", "Trends: what is rising / in season", "", "trends", [], () => []],
  ["Website", "Check all official links", "", "links", [], () => []],
  ["Website", "Safe self-check of the website (audit)", "", "audit", [], () => []],
  ["Website", "Refresh the hotel list from OpenStreetMap", "Downloads the free world map files, finds every hotel, resort, guest house, hostel and apartment in Indonesia, Malaysia, Singapore, Brunei and Thailand, and puts the Hotels page list + home search LIVE. Takes ~15 minutes. No prices or photos.", "hotellist", [], () => ["--deploy"], true],
  ["Website", "Travel alerts: check now", "Looks for sudden news and puts it on the Festivals & events pages at once: earthquakes, cyclones, floods, volcanoes (GDACS), Reuters headlines (floods, airports closed, curfews, holidays declared…) and one-off public holidays. Also runs by itself every 3 hours if switched on. See Admin → Travel alerts.", "festivals", [], () => ["--alerts"]],
  ["Website", "Festivals & events: what is coming", "Lists the events of the next 2 months and the alerts it would show. Changes nothing.", "festivals", [], () => []],
  ["Website", "Festivals & events pages → LIVE", "Rebuilds the Festivals & events page of every country (festivals, F1/MotoGP, Olympics, trade fairs, public holidays for the next 15 months) and puts the website live. Also runs by itself once a month if switched on.", "festivals", [], () => ["--deploy"]],
  ["Website", "Destinations: what is featured now", "Lists the Popular picks of today (event cities first) and the coming events with the date each city starts showing. Changes nothing.", "rotation", [], () => []],
  ["Website", "Destinations: refresh event dates → LIVE", "Works out the event dates for the next 2 years (Songkran, Chinese New Year, Ramadan…) and puts the Destinations page live. Photos and cities change by themselves every 2 months. Also runs by itself at the start of every 2-month period if switched on. (New photos are added only with a review, not from here.)", "rotation", [], () => ["--deploy"]],
  ["Website", "Hotel list → fast website files (+ live)", "Writes the hotel list as small website files (the Hotels page shows its cards at once, no database reads) and puts the website live. Runs by itself when hotels change.", "sitelist", [], () => ["--force", "--deploy"]],
  ["Website", "Hotel card pictures → website files", "Makes a small picture file for every hotel that has none yet (300 hotels per run - press again until it says 0 waiting). Runs by itself too.", "sitepics", [], () => ["--hotels", "--max-reads", "300"]],
  ["Website", "Hotel + city pages for Google (+ live)", "A page per hotel and per city (English + Indonesian), so Google searches like 'Gran Mahakam Jakarta' or 'hotel di Ubud' find us. Only changed hotels are read. Runs by itself when hotels change.", "hotelpages", [], () => []],
  ["Website", "Google searches report now", "What people typed in Google before they saw or clicked our website (last 28 days) - shown in the Google searches panel above. Needs Search Console set up once. Runs by itself once a day.", "searchreport", [], () => []],
  ["Website", "Hotel pictures: prepare the other photos (priority cities first)", "Makes small card pictures from each hotel's other photos, Jakarta first, then Bali, Bandung, Bogor, Yogyakarta, Singapore, Kuala Lumpur ... (about 130 hotels per press; also runs by itself).", "picprep", [], () => ["--max-reads", "450"]],
  ["Website", "Hotel pictures: rotate every card to its next photo now", "Moves all hotel cards and hotel pages to the next photo right away (it also happens by itself every few months - set in Automatic jobs). The website is updated within about 2 hours.", "picrotate", [], () => ["--now"], true],
  ["Website", "Measure the website speed now", "Google's free speed measurement of the home page and the Hotels page (phone + computer). The result appears in the Website speed panel above. Runs by itself once a day.", "speedcheck", [], () => []],
  ["Website", "Hotels from the second PC: publish now", "The second PC sends the hotels it read to a mailbox; the cloud publishes them by itself within minutes. Press this only to start it right now. Result: Bots -> Jobs.", "hotelinbox", [], () => []],
  ["Website", "Research a new destination in Indonesia", "Places, map positions and photo candidates → Engines → Research.", "research", [["city", "e.g. Palembang"]], (v) => ["--city", v.city]],
];

const speedPanel = (sp) => {                              // Google's speed scores (speedcheck engine): 0 very slow ... 100 very fast
  const L = sp?.latest || {}, keys = Object.keys(L);
  if (!keys.length) return `<div class="panel"><h3>⚡ Website speed</h3><p class="help">Not measured yet - press "Measure the website speed now" below (it also runs by itself once a day).</p></div>`;
  const col = (s) => (s >= 90 ? "#12602c" : s >= 50 ? "#b38d40" : "#b42318");
  const row = (page) => ["mobile", "desktop"].map((st) => { const m = L[`${page}|${st}`]; return m ? `<td><b style="color:${col(m.score)}">${e(m.score)}</b><small> · ${e(m.lcp)} s</small></td>` : "<td>-</td>"; }).join("");
  const at = keys.map((k) => L[k]?.at).filter(Boolean).sort().pop() || "";
  const hist = (sp.history || []).slice(-10).map((h) => Math.round(Object.values(h.scores || {}).reduce((a, b) => a + b, 0) / (Object.keys(h.scores || {}).length || 1)));
  return `<div class="panel"><h3>⚡ Website speed <small style="font-weight:400">(Google, ${e(String(at).replace("T", " ").slice(0, 16))} UTC)</small></h3>
    <table class="t"><tr><th>Page</th><th>Phone</th><th>Computer</th></tr><tr><td>Home</td>${row("home")}</tr><tr><td>Hotels</td>${row("hotels")}</tr></table>
    <p class="help">Score 0-100 (90+ is fast) · the seconds are when the main part of the page shows. ${hist.length > 1 ? "Last runs (average): " + hist.join(" → ") : ""}</p></div>`;
};

const searchPanel = (r) => {                             // Google Search Console (searchreport engine): what people searched before they found us
  if (!r?.queries) return `<div class="panel"><h3>🔎 Google searches</h3><p class="help">No report yet. It needs Google Search Console set up once (the job output of "Google searches report now" says how), then it runs by itself every day.</p></div>`;
  const row = (q) => `<tr><td>${e(q.key)}</td><td>${e(q.clicks)}</td><td>${e(q.impressions)}</td><td>${e(q.position)}</td></tr>`;
  return `<div class="panel"><h3>🔎 Google searches <small style="font-weight:400">(${e(r.from)} - ${e(r.to)})</small></h3>
    <p>${e(r.totals?.clicks ?? 0)} clicks · shown ${e(r.totals?.impressions ?? 0)} times in Google</p>
    <table class="t"><tr><th>Search</th><th>Clicks</th><th>Shown</th><th>Place</th></tr>${(r.queries || []).slice(0, 10).map(row).join("")}</table>
    ${(r.easyWins || []).length ? `<p class="help" style="margin-top:10px"><b>Easy wins</b> (we are on Google's page 1-2 - a little work brings them up): ${(r.easyWins || []).slice(0, 8).map((q) => e(q.key)).join(" · ")}</p>` : ""}</div>`;
};

const seoPanel = (r) => {                                // seocheck engine (Rust): every page checked for Google + the IndexNow notice
  if (!r?.checkedAt) return `<div class="panel"><h3>🧭 Pages for Google</h3><p class="help">Not checked yet - on the PC: Control Panel → SEO 3.</p></div>`;
  const col = r.score >= 90 ? "#12602c" : r.score >= 60 ? "#b38d40" : "#b42318";
  const row = (p) => `<tr><td>${p.severity === "error" ? "❗" : "•"} ${e(p.what)}</td><td>${e(p.count)}</td><td><small>${(p.examples || []).map(e).join("<br>")}</small></td></tr>`;
  const n = r.notice;
  return `<div class="panel"><h3>🧭 Pages for Google <small style="font-weight:400">(checked ${e(String(r.checkedAt).replace("T", " ").slice(0, 16))} UTC)</small></h3>
    <p><b style="color:${col};font-size:20px">${e(r.score)}</b> / 100 · ${e(r.pages)} pages (${e(r.indexable)} for Google, ${e(r.inSitemaps)} in the site maps) · ${e(r.errors)} errors · ${e(r.warnings)} warnings</p>
    ${(r.problems || []).length ? `<table class="t"><tr><th>What to fix</th><th>Pages</th><th>Examples</th></tr>${r.problems.map(row).join("")}</table>` : `<p class="help">Nothing to fix.</p>`}
    <p class="help">${n ? `Search engines told (IndexNow: Bing, Yandex, Naver…): ${e(n.sent)} new / changed pages on ${e(String(n.at).replace("T", " ").slice(0, 16))} UTC. ` : ""}Google reads the site maps by itself. On the PC: Control Panel → SEO 3 (check) · SEO 4 (tell the search engines).</p></div>`;
};

const deepPanel = (x) => {                               // seo_engine deep / speed (Rust): what keeps pages out of Google + almost-there searches
  const d = x?.deep, s = x?.speed;
  if (!d && !s) return `<div class="panel"><h3>🚀 Ways to more visitors from Google</h3><p class="help">Not run yet - on the PC: Control Panel → SEO 5 (it also runs with every publish).</p></div>`;
  const when = (t) => e(String(t || "").replace("T", " ").slice(0, 16));
  const kinds = (list) => (list || []).length ? `<table class="t"><tr><th>What to fix</th><th>Pages</th><th>Examples</th></tr>${list.map((p) => `<tr><td>${p.severity === "error" ? "❗" : "•"} ${e(p.what)}</td><td>${e(p.count)}</td><td><small>${(p.examples || []).map(e).join("<br>")}</small></td></tr>`).join("")}</table>` : `<p class="help" style="margin:0">Nothing to fix.</p>`;
  const rows = (list, title) => (list || []).length ? `<p style="margin:10px 0 4px"><b>${title}</b></p><table class="t"><tr><th>Search / page</th><th>Shown</th><th>Clicks</th><th>Place</th><th>What to do</th></tr>${list.map((r) => `<tr><td>${e(r.name)}</td><td>${e(r.shown)}</td><td>${e(r.clicks)}</td><td>${e(Number(r.position).toFixed(1))}</td><td><small>${e(r.note || "")}</small></td></tr>`).join("")}</table>` : "";
  let h = "";
  if (d) {
    const depth = Object.entries(d.depth || {}).map(([k, v]) => `${e(k)}: <b>${e(v)}</b>`).join(" · ");
    const types = Object.entries(d.thinByType || {}).map(([k, v]) => `${e(k)}s ${e(v[0])} of ${e(v[1])}`).join(" · ");
    h += `<p><small>Checked ${when(d.checkedAt)} UTC · ${e(d.pages)} pages for Google</small></p>
      ${(d.todo || []).length ? `<p style="margin:6px 0 4px"><b>What to do first</b></p><ol style="margin:0 0 8px 18px">${d.todo.map((t) => `<li>${e(t)}</li>`).join("")}</ol>` : ""}
      <p style="margin:10px 0 4px"><b>Own wording</b> - middle page ${e(d.medianOwnPct)}% of its wording is its own; ${e(d.thin)} pages have little of their own (${types}).</p>
      <p style="margin:6px 0 4px"><b>Look-alike pages</b> - ${e(d.lookAlikePages)} pages in ${e(d.lookAlikeGroups)} groups read almost the same.</p>
      <p style="margin:6px 0 4px"><b>Lost pages</b> - clicks from the home page: ${depth}. No links in: ${e(d.noLinksIn)}.</p>
      <p style="margin:10px 0 4px"><b>Hotel details for Google</b> (${e(d.hotelPages)} hotel pages)</p>${kinds(d.hotel)}
      <p style="margin:10px 0 4px"><b>Page weight</b> - middle page ${e(d.medianFirstKb)} KB before it shows on a phone</p>${kinds(d.weight)}`;
    const q = d.search;
    h += q ? `<p style="margin:10px 0 4px"><b>Almost there (Search Console)</b> - ${e(q.queries)} searches, ${e(q.pages)} pages read</p>
        ${rows(q.queriesNear, "Searches on Google's page 1-2")}${rows(q.pagesNear, "Pages on Google's page 1-2")}${rows(q.lowClicks, "Shown but rarely clicked - better title / description")}
        ${(q.notIndexed || []).map((n) => `<p class="help" style="margin:6px 0">Not indexed (${e(n.file)}): ${e(n.urls)} addresses - ${e(n.thin)} little own wording, ${e(n.lookAlike)} look-alike, ${e(n.far)} far from home, ${e(n.gone)} no longer on the website.</p>`).join("")}`
      : `<p class="help">Almost-there list: download the Search Console exports (Performance → Export → CSV; Pages → a reason → Export) into the search_console folder on the PC, then Control Panel → SEO 5.</p>`;
  }
  if (s) h += `<p style="margin:10px 0 4px"><b>Live speed</b> <small>(${when(s.checkedAt)} UTC)</small> - middle first answer ${e(s.medianFirstMs)} ms, full page ${e(s.medianFullMs)} ms, ${e(s.slow)} slow</p>`;
  return `<div class="panel"><h3>🚀 Ways to more visitors from Google</h3>${h}<p class="help">On the PC: Control Panel → SEO 5 (deeper check, also with every publish) · SEO 6 (live speed). Full lists: reports/seo_deep.md and seo_deep_pages.csv.</p></div>`;
};

const guardPanel = (g) => {                              // site_guard (Rust): security of the built and the live website
  if (!g || (!g.scan && !g.live)) return `<div class="panel"><h3>🛡️ Security guard</h3><p class="help">Not run yet - on the PC: Control Panel → GUARD 1 and GUARD 2 (they also run with every publish).</p></div>`;
  const part = (x, title) => {
    if (!x) return "";
    const col = x.fails ? "#b42318" : x.warns ? "#b38d40" : "#12602c";
    const rows = (x.items || []).map((i) => `<li>${i.level === "fail" ? "❗" : "•"} <b>${e(i.area)}</b> – ${e(i.what)}${i.detail ? ` <small>(${e(i.detail)})</small>` : ""}</li>`).join("");
    return `<p style="margin:8px 0 4px"><b>${title}</b> <span style="color:${col};font-weight:700">${x.fails} FAIL · ${x.warns} WARN · ${x.passes} passed</span> <small>(${e(String(x.checkedAt).replace("T", " ").slice(0, 16))} UTC)</small></p>
      ${rows ? `<ul style="margin:0 0 6px 18px">${rows}</ul>` : `<p class="help" style="margin:0">Nothing to fix.</p>`}`;
  };
  return `<div class="panel"><h3>🛡️ Security guard</h3>${part(g.scan, "Before publishing")}${part(g.live, "Live website")}
    <p class="help">A FAIL in "Before publishing" stops the publish. On the PC: Control Panel → GUARD 1 (built website) · GUARD 2 (live website).</p></div>`;
};

export async function bots({ main, toast, listJobs, queue, cancel, loadWorker, loadSwitches, saveSwitches, inboxInfo = async () => null, newInboxCode = async () => "", loadSpeed = async () => null, loadSearch = async () => null, loadSeo = async () => null, loadGuard = async () => null, loadSeoDeep = async () => null }) {
  let [jobs, worker, sw, speed, search, seo, guard, deep] = await Promise.all([listJobs(), loadWorker(), loadSwitches(), loadSpeed().catch(() => null), loadSearch().catch(() => null), loadSeo().catch(() => null), loadGuard().catch(() => null), loadSeoDeep().catch(() => null)]);
  sw = { quotesAuto: true, weeklyAuto: true, mgDealsAuto: true, compareAuto: true, rotationAuto: true, festivalsAuto: true, picRotateAuto: false, picRotateMonths: 3, wakeOn: true, wakeRequestMin: 15, wakeInboxHours: 6, wakeTimedHours: 6, minutesGuard: 1500, ...(sw || {}) };
  const age = mins(worker?.lastSeen);
  const groups = [...new Set(BOTS.map((b) => b[0]))];
  const field = (bi, [k, label, def = "", type = "text"]) => `<label class="fl" style="margin:6px 0">${e(label)}<input data-b="${bi}" data-k="${e(k)}" type="${type}" value="${e(def)}"></label>`;
  main.innerHTML = `<h1>🚀 Bots</h1><p class="lead">Start the bots from here - your PC is only a backup. A job waits in the list below until the cloud picks it up (every ~10 minutes), then its result appears.</p>
    <div class="panel" style="border-left:4px solid ${age == null || age > 40 ? "#b42318" : "#12602c"}"><h3>Cloud worker</h3>
      ${age == null ? `<p><b>The cloud has not checked in yet.</b> It starts working once the GitHub setup is finished (see the setup page in the project: CLOUD_SETUP.md).</p>`
        : `<p>Last check-in: <b>${age <= 1 ? "just now" : age + " minutes ago"}</b> (${e(worker.runner || "")}). ${age > 40 ? "<b>That is late</b> - GitHub may be paused or a secret may be missing." : ""}</p><p class="help">Last jobs: ${e((worker.lastJobs || []).join(", ") || "none")}</p>`}</div>
    ${speedPanel(speed)}${searchPanel(search)}${seoPanel(seo)}${deepPanel(deep)}${guardPanel(guard)}
    <div class="panel"><h3>Automatic jobs</h3>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swQ" ${sw.quotesAuto ? "checked" : ""}> Prepare quotes for new hotel enquiries by themselves (every ~10 minutes)</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swC" ${sw.compareAuto ? "checked" : ""}> Run Compare Price by itself when a customer sends a hotel request (city + future dates)</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swF" ${sw.festivalsAuto ? "checked" : ""}> Travel alerts every 3 hours (disasters, Reuters headlines, sudden holidays) + Festivals & events pages refreshed once a month</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swR" ${sw.rotationAuto ? "checked" : ""}> Destinations: refresh event dates at the start of every 2-month period (Jan, Mar, May, Jul, Sep, Nov)</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swW" ${sw.weeklyAuto ? "checked" : ""}> Weekly bots every Sunday (trends, links, audit, MG deals, post drafts)</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swM" ${sw.mgDealsAuto ? "checked" : ""}> Check MG 'Unbeatable Deals' once a day (new offers saved hidden)</label>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swP" ${sw.picRotateAuto ? "checked" : ""}> Hotel pictures (5-star hotels only): every card moves to the hotel's next photo every <select id="swPM" style="width:auto;display:inline-block">${[1, 2, 3, 4, 6, 12].map((m) => `<option value="${m}"${+sw.picRotateMonths === m ? " selected" : ""}>${m}</option>`).join("")}</select> month(s) (priority cities first: Jakarta, Bali, Bandung ...)</label>
      <button class="sk-btn sm gold" id="swSave" type="button">Save switches</button></div>
    <div class="panel"><h3>⏱️ Robot wake rules and GitHub minutes</h3>
      <p class="help">GitHub gives the cloud robot <b>2,000 free minutes a month</b> (about 66 a day). Every start costs at least 1 minute, even when there is nothing to do. These rules keep it inside the allowance. They are used by the Google "wake the robot" script and by the robot itself.</p>
      <p>Used this month (${e(worker?.minutesMonth || "-")}): <b>about ${e(worker?.minutesUsed ?? 0)} of 2,000 minutes</b> ${(+worker?.minutesUsed || 0) >= +sw.minutesGuard ? `<span class="eng-chip bad">GUARD ON - heavy optional jobs are paused</span>` : ""}</p>
      <label style="display:block;margin:6px 0"><input type="checkbox" id="swWk" ${sw.wakeOn ? "checked" : ""}> Wake the robot straight away when there is work (needs the Google wake script)</label>
      <label style="display:block;margin:6px 0">Customer requests and Admin jobs: start the robot at most every <input id="swWR" type="number" min="5" max="240" value="${e(sw.wakeRequestMin)}" style="width:70px"> minutes</label>
      <label style="display:block;margin:6px 0">Hotels sent by the second PC: start the robot every <input id="swWI" type="number" min="1" max="24" value="${e(sw.wakeInboxHours)}" style="width:60px"> hours</label>
      <label style="display:block;margin:6px 0">Timed start (travel alerts, daily jobs): every <input id="swWT" type="number" min="1" max="24" value="${e(sw.wakeTimedHours)}" style="width:60px"> hours</label>
      <label style="display:block;margin:6px 0">Minutes guard: pause the heavy optional jobs (pictures, pages, weekly bots, big rebuilds) after <input id="swMG" type="number" min="200" max="2000" step="50" value="${e(sw.minutesGuard)}" style="width:80px"> minutes in a month</label>
      <p class="help">Saved with the "Save switches" button above. GitHub has no timer of its own: the Google wake script is the only thing that starts the robot, and only when there is work. It never wakes it within 2 hours after a failed run, and stops for the month at 1,950 minutes (the free limit is 2,000).</p></div>
    <div class="panel" id="inboxBox"><h3>📮 Hotel upload code (second PC)</h3><p class="help">Loading…</p></div>
    ${groups.map((g) => `<h2 style="font-size:24px;margin:24px 0 10px;color:var(--teal2)">${e(g)}</h2><div class="eng-grid">${BOTS.map((b, i) => b[0] !== g ? "" : `<div class="panel eng-post" style="margin:0"><h3 style="font-size:17px">${e(b[1])}</h3>${b[2] ? `<p class="help">${e(b[2])}</p>` : ""}${b[4].map((f) => field(i, f)).join("")}<button class="sk-btn sm ${b[6] ? "" : "gold"}" data-run="${i}" type="button">${b[6] ? "⚠️ " : ""}Run</button></div>`).join("")}</div>`).join("")}
    <div class="panel" style="margin-top:24px"><div class="tools"><h3>Jobs</h3><span class="sp"></span><button class="sk-btn sm" id="refresh" type="button">Refresh</button></div><div id="jobs"></div></div>`;
  const $ = (s) => main.querySelector(s);
  const drawJobs = () => {
    $("#jobs").innerHTML = jobs.length ? `<table class="t"><tr><th>When</th><th>Job</th><th>By</th><th>Status</th><th></th></tr>${jobs.map((j) => `<tr><td>${e(day(j.createdAt))}</td><td><b>${e(j.label || j.engine)}</b><br><small>${e(j.engine)} ${e((j.args || []).join(" "))}</small>${j.output ? `<details><summary>Result</summary><pre style="white-space:pre-wrap;max-height:340px;overflow:auto;font-size:12px;background:#faf8f4;padding:10px;border-radius:10px">${e(j.output)}</pre></details>` : ""}</td><td><small>${e(j.requestedBy || "")}</small></td><td>${chip(j.status || "")}${j.finishedAt ? `<br><small>${e(j.finishedAt)}</small>` : ""}</td><td>${j.status === "queued" ? `<button class="sk-link" data-cancel="${e(j.id)}" type="button">cancel</button>` : ""}</td></tr>`).join("")}</table>`
      : `<p class="lead">No jobs yet.</p>`;
    main.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => { try { await cancel(b.dataset.cancel); toast("Cancelled."); jobs = await listJobs(); drawJobs(); } catch (er) { toast(er.message || String(er), "err"); } }));
  };
  drawJobs();
  const drawInbox = async () => {
    const box = $("#inboxBox"), i = await inboxInfo().catch(() => null);
    if (!box) return;
    if (!i) { box.innerHTML = `<h3>📮 Hotel upload code (second PC)</h3><p class="help">Not available.</p>`; return; }
    box.innerHTML = `<h3>📮 Hotel upload code (second PC)</h3>
      <p class="help">Another PC can read hotels from WebBeds and send them to the website by itself - no login on that PC. It only needs this code, once. The code can only drop hotel files in a mailbox: it cannot read or change anything on the website.
      <b>Never send the code by e-mail or chat</b> - type or paste it only into "Set upload code.bat" on that PC.</p>
      <p>Code: <b>${i.hasCode ? "set" : "not made yet"}</b> · Mailbox: <b>${e(i.waiting)}</b> hotels waiting · <b>${e(i.done)}</b> published · <b>${e(i.failed)}</b> failed</p>
      <button class="sk-btn sm gold" id="mkCode" type="button">${i.hasCode ? "Make a NEW code (the old one stops working)" : "Create the upload code"}</button>
      <div id="codeShow"></div>`;
    $("#mkCode").onclick = async () => {
      if (i.hasCode && !confirm("Make a new code? The second PC will need the new code (run 'Set upload code.bat' again).")) return;
      try {
        const code = await newInboxCode();
        $("#codeShow").innerHTML = `<div class="notice" style="margin-top:12px;background:#fff7e0"><b>Your new code - shown only now:</b><br><input id="codeVal" readonly value="${e(code)}" style="width:100%;max-width:420px;font:700 17px monospace;padding:8px;margin:8px 0">
          <br><button class="sk-btn sm" id="cpCode" type="button">Copy</button> <small>On the second PC: double-click <b>Set upload code.bat</b>, paste this code, press Enter, then reopen the Control Panel.</small></div>`;
        $("#cpCode").onclick = async () => { try { await navigator.clipboard.writeText(code); toast("Copied."); } catch { $("#codeVal").select(); toast("Press Ctrl+C to copy."); } };
        $("#codeVal").select();
      } catch (er) { toast("Could not make the code: " + (er.message || er), "err"); }
    };
  };
  drawInbox();
  $("#refresh").onclick = async () => { jobs = await listJobs(); drawJobs(); };
  $("#swSave").onclick = async () => { try { await saveSwitches({ quotesAuto: $("#swQ").checked, weeklyAuto: $("#swW").checked, mgDealsAuto: $("#swM").checked, compareAuto: $("#swC").checked, rotationAuto: $("#swR").checked, festivalsAuto: $("#swF").checked, picRotateAuto: $("#swP").checked, picRotateMonths: +$("#swPM").value,
      wakeOn: $("#swWk").checked, wakeRequestMin: Math.round(+$("#swWR").value), wakeInboxHours: Math.round(+$("#swWI").value), wakeTimedHours: Math.round(+$("#swWT").value), minutesGuard: Math.round(+$("#swMG").value) }); toast("Switches saved."); } catch (er) { toast("Could not save: " + (er.message || er), "err"); } };
  main.querySelectorAll("[data-run]").forEach((btn) => (btn.onclick = async () => {
    const i = +btn.dataset.run, b = BOTS[i], v = {};
    main.querySelectorAll(`[data-b="${i}"]`).forEach((inp) => (v[inp.dataset.k] = inp.value.trim()));
    const missing = b[4].filter(([k, , def]) => def === undefined && !v[k]);
    if (missing.length) return toast("Please fill in: " + missing.map((m) => m[1]).join(", "), "err");
    if (b[6] && !confirm(`${b[1]}?\n\nThis publishes for everyone to see.`)) return;
    try { await queue(b[3], b[5](v).map(String), b[1]); toast("Queued - the cloud picks it up within ~10 minutes."); jobs = await listJobs(); drawJobs(); }
    catch (er) { toast("Could not queue: " + (er.message || er), "err"); }
  }));
}

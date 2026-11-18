// Staff admin -> "Engines": what the Python bots found (trends, link check, audit, post drafts, research, weekly summary).
// The bots run on the office PC (Control Panel -> Run bots) and save their results here with "Run bot I / Run ALL weekly bots".
// This page only SHOWS results (and lets staff mark post drafts approved / rejected). It cannot start the bots.
// The loaders are passed in, so the same code is tested with sample data (tests/engines_ui_harness).

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (d) => { const t = new Date(d); if (isNaN(t)) return ""; const n = Math.round((Date.now() - t) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`; };
const pct = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);
const num = (x) => (x == null ? "–" : Number(x).toLocaleString("en-US"));
const chip = (s) => `<span class="eng-chip ${/^(OK|PASS|QUEUED)$/i.test(s) ? "ok" : /^(WARN|BOT-CHECK|DIFF|NONE)$/i.test(s) ? "warn" : "bad"}">${e(s)}</span>`;

function md(src) {   // tiny markdown: headings, bullets, tables, bold
  const lines = String(src || "").split("\n"); let out = "", list = false, tbl = [];
  const flushT = () => { if (!tbl.length) return; const rows = tbl.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    out += `<table class="t">${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join("")}</tr>`).join("")}</table>`; tbl = []; };
  const inline = (s) => e(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  for (const l of lines) {
    if (l.startsWith("|")) { tbl.push(l); continue; } flushT();
    if (/^\s*[-*] /.test(l)) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`; continue; }
    if (list) { out += "</ul>"; list = false; }
    if (/^#{1,3} /.test(l)) out += `<h4>${inline(l.replace(/^#+ /, ""))}</h4>`; else if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  flushT(); if (list) out += "</ul>"; return out;
}

export async function engines({ main, load, loadResearch, loadPosts, savePost, toast, loadSocial = async () => null }) {
  const social = await loadSocial().catch(() => null);
  const [status, trends, links, audit, weekly, research, posts, mg] = await Promise.all([load("status"), load("trends"), load("links"), load("audit"), load("weekly"), loadResearch(), loadPosts(), load("mgoffers")]);
  const synced = status?.syncedOn;
  const stale = synced && (Date.now() - new Date(synced)) / 864e5 > 8;
  const TABS = [["overview", "Overview"], ["mg", "MG deals"], ["trends", "Trends"], ["links", `Links${links?.problems?.length ? ` (${links.problems.length})` : ""}`], ["audit", "Audit"],
    ["posts", `Post drafts${posts.length ? ` (${posts.length})` : ""}`], ["research", `Research${research.length ? ` (${research.length})` : ""}`], ["weekly", "Weekly summary"], ["help", "How it works"]];
  let tab = "overview";
  const shell = () => {
    main.innerHTML = `<h1>🤖 Engines</h1><p class="lead">What the Python bots found for the website. The bots run on the office PC and save their results here.</p>
    ${!status ? `<div class="panel"><h3>Nothing saved yet</h3><p>On the PC open the <b>Website Content Panel → Run bots</b> tab and click <b>Run ALL weekly bots</b> (it saves the results here automatically).</p></div>` : ""}
    <div class="eng-tabs">${TABS.map(([k, t]) => `<button type="button" data-t="${k}" class="${k === tab ? "on" : ""}">${t}</button>`).join("")}</div><div id="engBody"></div>`;
    main.querySelectorAll(".eng-tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; shell(); }));
    ({ overview, mg: mgv, trends: tr, links: lk, audit: au, posts: ps, research: rs, weekly: wk, help: hp })[tab]();
  };
  const body = () => main.querySelector("#engBody");

  function overview() {
    const L = status?.latest || {};
    const tiles = ["weekly", "trends", "links", "audit", "posts", "publish", "sync"].map((k) => L[k] ? `<div class="tile"><span>${k}</span><b style="font-size:20px">${chip(L[k].status)}</b><small>${e(ago(L[k].time))}</small></div>` : "").join("");
    const runs = (status?.runs || []).slice(0, 14).map((r) => `<tr><td>${e(String(r.time || "").replace("T", " "))}</td><td><b>${e(r.engine)}</b></td><td>${chip(r.status)}</td><td>${e(r.summary || "")}</td></tr>`).join("");
    body().innerHTML = `${stale ? `<div class="panel" style="border-left:4px solid #b42318"><b>The results are ${e(ago(synced))} old.</b> Run the weekly bots on the PC to refresh them.</div>` : ""}
    <div class="tiles">${tiles || `<p class="lead">No bot has run yet.</p>`}</div>
    <div class="panel"><div class="tools"><h3 style="font:700 20px 'Plus Jakarta Sans'">Latest runs</h3><span class="sp"></span><small>Saved online: ${e(synced || "never")} ${synced ? "(" + e(ago(synced)) + ")" : ""}</small></div>
    ${runs ? `<table class="t"><tr><th>When</th><th>Bot</th><th>Result</th><th>What it found</th></tr>${runs}</table>` : `<p class="lead">Nothing yet.</p>`}</div>`;
  }

  function mgv() {
    if (!mg) return (body().innerHTML = `<div class="panel"><p class="lead">The MG Bedbank deals bot has not run yet. On the PC: Control Panel → Run bots → <b>Run bot J</b>.</p></div>`);
    const act = (a) => (/^new.*(hidden|held)/.test(a) ? chip("WARN") + " " : /^new/.test(a) ? chip("OK") + " " : /^ended/.test(a) ? chip("BAD") + " " : "") + e(a);
    body().innerHTML = `<div class="panel"><div class="tools"><h3 style="font:700 20px 'Plus Jakarta Sans'">MG Bedbank "Unbeatable Deals" → our Offers</h3><span class="sp"></span><a class="sk-btn gold sm" href="#/offers">Open Offers</a></div>
    <p class="lead">${e(mg.summary)} · checked ${e(mg.date)} · new deals go live by themselves: <b>${mg.autoPublish ? "ON" : "OFF (saved hidden - you press “Show on website”)"}</b></p>
    <table class="t"><tr><th>Hotel</th><th>Place</th><th>Stars</th><th>Included</th><th>What happened</th></tr>${(mg.deals || []).map((d) => `<tr><td><b>${e(d.name)}</b></td><td>${e(d.place)}</td><td>${d.stars ? "★".repeat(d.stars) : "–"}</td><td>${e((d.extras || []).join(", ") || "–")}</td><td>${act(d.action || "")}${d.held ? " <small>(Makkah/Madinah/Umrah hotels are always checked by a person)</small>" : ""}</td></tr>`).join("")}</table>
    <p class="help">The bot reads only the <b>public</b> page of mgbedbank.com (no login, no password, no rates). The offer text always says to ask us for the current rate. Pictures come from MG's page - make sure you may show them. An offer ends by itself 14 days after the last check, so if the bot stops the offers disappear on their own. Your own offers are never touched (only those whose id starts with “mg-”).</p></div>`;
  }

  function tr() {
    if (!trends) return (body().innerHTML = `<div class="panel"><p class="lead">No trends saved yet.</p></div>`);
    const by = Object.fromEntries((trends.rows || []).map((r) => [r.slug, r]));
    const table = (slugs, cols) => `<table class="t"><tr><th>Destination</th><th>EN readers/mo</th><th>ID readers/mo</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr>${(slugs || []).map((s) => by[s]).filter(Boolean).map((r) =>
      `<tr><td><b>${e(r.name)}</b> <small>${e(r.kind)}</small></td><td>${num(r.en_avg12)}</td><td>${num(r.id_avg12)}</td>${cols.map((c) => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="9">none</td></tr>`}</table>`;
    body().innerHTML = `<p class="lead">Source: Wikipedia page views (English + Indonesian), up to ${e(trends.lastMonth)} · saved ${e(trends.date)}. A hint about public interest – not bookings or Google searches. One-month news spikes are ignored.</p>
    <div class="panel"><h3>📈 Rising (growing faster than the average destination)</h3>${table(trends.rising, [["Growth vs average", (r) => pct(r.growth_vs_average)]])}</div>
    <div class="panel"><h3>🗓️ Usually busy in the next 2 months</h3>${table(trends.season, [["Season lift", (r) => (r.season_lift ? "×" + r.season_lift.toFixed(2) : "–")]])}</div>
    <div class="panel"><h3>🏆 Top interest overall</h3>${table(trends.top, [["Growth vs average", (r) => pct(r.growth_vs_average)]])}</div>
    <div class="panel"><h3>🇮🇩 Favourites of Indonesian readers</h3>${table(trends.favourites, [["Growth vs average", (r) => pct(r.growth_vs_average)]])}</div>
    <div class="panel"><h3>Calendar hooks</h3><ul>${(trends.hooks || []).map((h) => `<li>${e(h)}</li>`).join("")}</ul></div>`;
  }

  function lk() {
    if (!links) return (body().innerHTML = `<div class="panel"><p class="lead">No link check saved yet.</p></div>`);
    const c = links.counts || {};
    const row = (r) => `<tr><td>${e(r.country)}</td><td>${e(r.title)}</td><td><a href="${e(r.url)}" target="_blank" rel="noopener" style="color:var(--gold)">${e(r.url)}</a></td><td>${r.status ? chip(r.status) : ""}</td><td>${e(r.note)}</td></tr>`;
    body().innerHTML = `<div class="tiles">${Object.entries(c).map(([k, v]) => `<div class="tile"><span>${e(k)}</span><b>${v}</b></div>`).join("")}</div>
    <div class="panel"><h3>Needs fixing</h3>${links.problems?.length ? `<table class="t"><tr><th>Guide</th><th>Link</th><th>Address</th><th>Result</th><th>What happened</th></tr>${links.problems.map(row).join("")}</table>` : `<p class="lead">✅ No broken links.</p>`}</div>
    <details class="panel"><summary><b>Security-check pages (${links.botcheck?.length || 0})</b> – open once in a browser</summary>${links.botcheck?.length ? `<table class="t">${links.botcheck.map((r) => row({ ...r, status: "" })).join("")}</table>` : ""}</details>
    <p class="help">Checked ${e(links.date)} · ${links.total} links. When a link is fine in a browser, the PC bot remembers it (sk_engines/config/link_overrides.json).</p>`;
  }

  function au() {
    if (!audit) return (body().innerHTML = `<div class="panel"><p class="lead">No audit saved yet.</p></div>`);
    const list = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : `<p class="lead">none</p>`);
    body().innerHTML = `<div class="tiles"><div class="tile ${audit.fail?.length ? "hot" : ""}"><b>${audit.fail?.length || 0}</b><span>FAIL – fix before publishing</span></div><div class="tile"><b>${audit.warn?.length || 0}</b><span>WARN – have a look</span></div><div class="tile"><b>${audit.ok?.length || 0}</b><span>passed</span></div></div>
    <div class="panel"><h3>FAIL</h3>${list(audit.fail)}</div><div class="panel"><h3>WARN</h3>${list(audit.warn)}</div><details class="panel"><summary><b>Passed checks</b></summary>${list(audit.ok)}</details><p class="help">Audit of ${e(audit.date)}.</p>`;
  }

  // Posting to Facebook + Instagram: staff review each draft here and press "Approve for posting"; the cloud robot (every ~30 minutes) then posts ONLY approved
  // drafts, and only while the master switch (file SOCIAL_POSTING_OFF.txt) is off-the-way and Meta is connected. The robot writes the result back (Posted / Failed).
  function banner() {
    const when = social?.checkedAt ? ` <small>(checked ${e(String(social.checkedAt).replace("T", " ").slice(0, 16))} UTC)</small>` : "";
    if (!social) return `<div class="notice">⏸ Posting status not known yet (the cloud robot reports it every ~30 minutes). Until posting is switched on, approved drafts only wait.</div>`;
    if (!social.postingOn) return `<div class="notice">⏸ <b>Posting to Facebook and Instagram is SWITCHED OFF.</b> You can review and approve drafts; approved drafts wait and nothing is posted until posting is switched on.${when}</div>`;
    if (!social.metaConnected) return `<div class="notice">⚠️ Posting is switched on, but <b>Meta is not connected</b> yet, so approved drafts wait.${when}</div>`;
    if (social.metaError) return `<div class="notice">⚠️ Posting is switched on, but <b>Facebook refused the Page key</b> at the last check, so approved drafts wait. Facebook said: ${e(social.metaError)}. Reconnect: run "Connect Meta (run once).bat" in the social_autopost folder, then update the GitHub secret SK_FB_PAGE_TOKEN.${when}</div>`;
    return `<div class="notice" style="background:#eef7f1;border-color:#bfe0cb;color:#1e3a3a">🟢 <b>Posting is ON.</b> An approved draft is posted to Facebook${social.instagramConnected ? " and Instagram" : " (Instagram is not connected yet)"} by the robot within about 30 minutes.${when}</div>`;
  }
  const stateChip = (p) => ({ approved: `<span class="eng-chip warn">APPROVED - WAITING TO POST</span>`, posted: `<span class="eng-chip ok">POSTED ✓</span>`, failed: `<span class="eng-chip bad">FAILED</span>`,
    rejected: `<span class="eng-chip bad">REJECTED</span>` }[p.status] || `<span class="eng-chip">DRAFT</span>`);

  function ps() {
    if (!posts.length) return (body().innerHTML = `<div class="panel"><p class="lead">No post drafts saved yet. On the PC: Run bot E (post drafts), then Run bot I (save online).</p></div>`);
    body().innerHTML = `${banner()}<p class="lead">Drafts made by the bot from our own website data. Read the picture and the caption (Indonesian first, then English). <b>Approve for posting</b> only when you are happy: a posted item is public.
      <b>Nothing is posted without your approval here.</b></p>
    <div class="eng-grid">${posts.map((p) => `<article class="panel eng-post" data-id="${e(p.id)}"><img src="${e(p.image)}" alt="${e(p.topic)}">
      <div class="tools"><b>${e(p.topic)}</b> <small>${e(p.type)} · ${e(p.date)}</small><span class="sp"></span>${stateChip(p)}</div>
      ${p.status === "posted" && p.postedAt ? `<p class="help">Posted ${e(String(p.postedAt).replace("T", " ").slice(0, 16))} UTC${p.approvedBy ? " · approved by " + e(p.approvedBy) : ""}.</p>` : p.status === "approved" && p.approvedBy ? `<p class="help">Approved by ${e(p.approvedBy)}.</p>` : ""}
      ${p.postError ? `<p class="sk-err">Last try: ${e(p.postError)}</p>` : ""}
      <textarea readonly rows="9">${e(p.caption)}</textarea>
      <div class="tools"><button class="sk-btn sm" data-copy type="button">📋 Copy caption</button><a class="sk-btn sm" download="${e(p.folder)}.jpg" href="${e(p.image)}">⬇ Picture</a></div>
      <div class="tools"><input data-note type="text" maxlength="500" placeholder="Note (optional)" value="${e(p.staffNote || "")}" style="flex:1;min-width:120px">
      ${p.status === "posted" ? "" : p.status === "approved" ? `<button class="sk-btn sm" data-set="draft" type="button">Withdraw approval</button>`
        : `<button class="sk-btn gold sm" data-set="approved" type="button">✅ ${p.status === "failed" ? "Approve again" : "Approve for posting"}</button>${p.status === "rejected" ? "" : `<button class="sk-btn sm" data-set="rejected" type="button">Reject</button>`}`}
      <button class="sk-btn sm" data-set="${e(p.status || "draft")}" data-keep type="button">Save note</button></div></article>`).join("")}</div>`;
    body().querySelectorAll(".eng-post").forEach((card) => {
      const id = card.dataset.id, p = posts.find((x) => x.id === id);
      card.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(p.caption); toast("Caption copied"); } catch { card.querySelector("textarea").select(); toast("Select + copy the caption"); } };
      card.querySelectorAll("[data-set]").forEach((b) => (b.onclick = async () => {
        const to = b.dataset.set, keep = b.hasAttribute("data-keep");
        if (!keep && to === "approved" && !confirm("Approve this post?\n\nThe robot posts it to Facebook" + (social?.instagramConnected ? " and Instagram" : "") + " within about 30 minutes - as soon as posting is switched on. A posted item is public.")) return;
        try { await savePost(id, { status: to, staffNote: card.querySelector("[data-note]").value.trim() }); p.status = to; p.staffNote = card.querySelector("[data-note]").value.trim();
          toast(keep ? "Saved" : to === "approved" ? "Approved - it will be posted when posting is switched on." : to === "rejected" ? "Rejected" : "Back to draft"); ps(); } catch (er) { toast("Could not save: " + (er.message || er)); }
      }));
    });
  }

  function rs() {
    if (!research.length) return (body().innerHTML = `<div class="panel"><p class="lead">No research packs yet. On the PC: Run bot D (research a new destination), then Run bot I.</p></div>`);
    body().innerHTML = `<p class="lead">Ranked by how many people read about each place (a hint). The description texts stay on the PC – they come from Wikivoyage (share-alike licence) and must be rewritten in our own words.</p>` + research.map((r) => `<div class="panel"><div class="tools"><h3>${e(r.name)}</h3><span class="sp"></span><small>${e(r.date)} · draft guide: ${e(r.draftFile)}</small></div><p>${e(r.summary || "")}</p>
      <table class="t"><tr><th>#</th><th>Place</th><th>Type</th><th>Readers/mo</th><th>Map</th><th>Free photo found</th></tr>${(r.places || []).map((p, i) => `<tr><td>${i + 1}</td><td><b>${e(p.name)}</b></td><td>${e(p.type)}</td><td>${num(p.views)}</td><td>${p.lat != null ? `<a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}" target="_blank" rel="noopener" style="color:var(--gold)">map</a>` : "–"}</td><td>${p.photo ? e(p.licence) : "none"}</td></tr>`).join("")}</table></div>`).join("");
  }

  function wk() { body().innerHTML = weekly ? `<div class="panel eng-md">${md(weekly.markdown)}</div><p class="help">Weekly summary of ${e(weekly.date)}.</p>` : `<div class="panel"><p class="lead">No weekly summary saved yet.</p></div>`; }

  function hp() {
    body().innerHTML = `<div class="panel eng-md"><h3>How the engines work</h3>
    <p>The website runs on a free hosting plan, which cannot run Python programs. So the <b>bots run on the office PC</b> and <b>save their results here</b>.</p>
    <table class="t"><tr><th>Bot</th><th>What it does</th></tr>
    <tr><td><b>Trends</b></td><td>Which destinations people read about more, and which are about to be in season.</td></tr>
    <tr><td><b>Links</b></td><td>Checks every official link on the Travel Info pages and finds broken ones.</td></tr>
    <tr><td><b>Audit</b></td><td>Safety check of all website texts before publishing (made-up claims, wrong phone numbers, prices, missing photos).</td></tr>
    <tr><td><b>Research</b></td><td>Builds a research pack for a new destination (ranked places, map positions, photo candidates).</td></tr>
    <tr><td><b>Posts</b></td><td>Makes Facebook / Instagram post drafts (picture + Indonesian & English caption). Never posts by itself.</td></tr>
    <tr><td><b>Publish</b></td><td>Builds, checks and (only when you confirm) publishes the website.</td></tr></table>
    <h4>Every week</h4><ul><li>On the PC: Website Content Panel → <b>Run bots</b> tab → <b>Run ALL weekly bots</b> (it saves the results here).</li>
    <li>Here: read Trends, fix broken Links, look at Audit warnings, review Post drafts.</li>
    <li>Approve a draft here (<b>Posts</b> tab) → the cloud robot posts it within about 30 minutes, when posting is switched on and Meta is connected.</li></ul>
    <p class="help">Staff can read this page; only the owners' PC can write results here. The full guide is in the project folder: sk_engines/README.md.</p></div>`;
  }
  shell();
}

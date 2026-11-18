// Admin -> Visitors: who came, from where, which pages and for how long. The record lives on Cloudflare (visits_engine), not in the Firebase database.
import { VISITS_URL, NO_TRACK_KEY } from "./sk-light.js";
import { esc as e } from "./sk-text.js";

const JAKARTA = 7 * 3600;
const stay = (s) => { s = Math.round(s || 0); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };
const whenJk = (ts) => new Date(ts * 1000).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });
const COUNTRY = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const countryName = (c) => { if (!c || c === "XX") return "Unknown"; if (c === "T1") return "Tor network"; try { return COUNTRY?.of(c) || c; } catch { return c; } };
// A cell starting with = + - @ would run as a formula in Excel, and these words come from strangers' browsers.
const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
function box(title, rows, opts = {}) {
  const max = Math.max(...rows.map((r) => r.views ?? r.hits ?? 0), 1);
  const body = rows.map((r) => {
    const n = r.views ?? r.hits ?? 0, name = (opts.name || ((x) => x))(r.k);
    return `<div class="vis-row${opts.filter && r.k ? " vis-pick" : ""}"${opts.filter && r.k ? ` data-f="${opts.filter}" data-v="${e(r.k)}" title="Show only these visits"` : ""}><i style="width:${Math.round(100 * n / max)}%"></i><span>${e(name || "Unknown")}</span><b>${n.toLocaleString("en-US")}</b><b>${opts.secs ? e(stay(r.secs)) : ""}</b></div>`;
  }).join("");
  return `<div class="panel vis-box"><h3>${e(title)}</h3>${opts.note ? `<p class="help">${e(opts.note)}</p>` : ""}${body || '<p class="help">Nothing yet.</p>'}</div>`;
}
// "2026-11-04 10" + robots in that hour -> one line per hour: "04 Nov 10:00", total, and who they were
function robotHours(rows) {
  const by = new Map();
  for (const r of rows || []) { if (!by.has(r.k)) by.set(r.k, []); by.get(r.k).push(r); }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const lines = [...by].map(([k, list]) => {
    const [day, hour] = k.split(" "), [, m, d] = day.split("-");
    const who = list.map((r) => `${String(r.robot).replace("Hidden robot: ", "").replace(" servers", "")} ${r.hits}`).join(" · ");
    return { k: `${d} ${MON[+m - 1] || m} ${hour}:00 · ${who}`, hits: list.reduce((a, r) => a + r.hits, 0) };
  });
  return box("Robots by hour, Jakarta time (newest first)", lines, { note: "Which company's servers the hidden robots came from, hour by hour. Counted from 4 Nov." });
}
let timer = 0;

export async function visitors({ main, getToken, url = VISITS_URL }) {
  let days = 0;
  const onThisPage = () => document.body.contains(main.querySelector("#visTiles"));
  const range = () => {
    const now = Math.floor(Date.now() / 1000);
    const midnight = Math.floor((now + JAKARTA) / 86400) * 86400 - JAKARTA;   // today starts at midnight in Jakarta
    return { from: days ? now - days * 86400 : midnight, to: now + 60 };
  };
  const api = async (path) => {
    const r = await fetch(url + path, { headers: { Authorization: `Bearer ${await getToken()}` }, cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 401 ? "this account is not on the staff list" : `the record answered ${r.status}`);
    return r.json();
  };
  const noTrack = (() => { try { return !!localStorage.getItem(NO_TRACK_KEY); } catch { return false; } })();
  main.innerHTML = `<h1>Visitors</h1>
    <div class="tools" id="visTools">
      ${[[0, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([d, t]) => `<button class="sk-btn sm${d === 0 ? " gold" : ""}" type="button" data-d="${d}">${t}</button>`).join("")}
      <button class="sk-btn sm" type="button" id="visRefresh">Refresh</button>
      <button class="sk-btn sm" type="button" id="visExport">Download spreadsheet</button>
      <label class="vis-me"><input type="checkbox" id="visMe"${noTrack ? " checked" : ""}> Don't count my own visits on this browser</label>
    </div>
    <p class="sk-err" id="visErr" hidden></p>
    <div class="tiles" id="visTiles"><div class="tile"><span>Loading…</span></div></div>
    <div class="vis-grid" id="visBoxes"></div>
    <div class="panel vis-list">
      <h3>Each visit, newest first</h3>
      <div class="vis-find"><input type="search" id="visWho" placeholder="Find an internet address or visitor number" aria-label="Find an internet address or visitor number"><span class="help" id="visFilter"></span></div>
      <div class="vis-scroll"><table class="vis-table"><thead><tr><th>When (Jakarta)</th><th>Where</th><th>Internet address</th><th>Came from</th><th>Device</th><th>Pages</th><th>Stayed</th><th>Who</th></tr></thead><tbody id="visRows"></tbody></table></div>
      <div class="tools"><button class="sk-btn sm" type="button" id="visNewer">Newer</button><button class="sk-btn sm" type="button" id="visOlder">Older</button><span class="help" id="visPage"></span></div>
      <p class="help">Tap a visit to see every page in order and the time spent on each. The internet address is shortened for visitors in Europe, who also get no lasting visitor number. Only staff can see this list.</p>
    </div>
    <p class="help">"Time" counts only while a page was on screen, so a page left open in a hidden tab does not add up; time on the very last page can be missing when a phone browser closes suddenly. Nobody's name is kept: a "visitor" is one browser on one device. Records are deleted after 90 days. The record limit restarts every day at 07:00 Jakarta time; past it the website carries on, only the counting pauses.</p>`;
  const $ = (s) => main.querySelector(s);

  const pick = { country: "", source: "", page: 0 };
  const time = (ts) => new Date(ts * 1000).toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" });
  const niceWhen = (ts) => new Date(ts * 1000).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  async function loadVisits() {
    const { from, to } = range();
    const q = new URLSearchParams({ from, to, page: pick.page, country: pick.country, source: pick.source, who: $("#visWho").value.trim() });
    $("#visFilter").innerHTML = [pick.country && `Country: ${e(countryName(pick.country))}`, pick.source && `From: ${e(pick.source)}`].filter(Boolean).join(" · ")
      + (pick.country || pick.source ? ' <button type="button" class="sk-btn sm" id="visClear">Clear</button>' : "");
    try {
      const d = await api(`/api/admin/visits/list?${q}`);
      $("#visRows").innerHTML = d.visits.map((v) => `<tr class="vis-visit" data-sid="${e(v.sid)}">
        <td>${e(niceWhen(v.first))}</td>
        <td>${e(countryName(v.country))}<div class="vis-note">${e([v.city, v.region].filter(Boolean).join(", "))}</div><div class="vis-note">${e(v.timezone || "")}</div></td>
        <td>${e(v.ip || "")}${v.europe ? '<div class="vis-note">shortened (Europe)</div>' : ""}<div class="vis-note">${e(v.org || "")}</div></td>
        <td>${e(v.source || "")}<div class="vis-note">first page: ${e(v.entry || "")}</div></td>
        <td>${e(v.device || "")}<div class="vis-note">${e(v.browser || "")} · ${e(v.os || "")}</div><div class="vis-note">${e(v.screen || "")} · ${e(v.lang || "")}</div></td>
        <td>${e(v.pages)}</td><td>${e(stay(v.secs))}</td>
        <td>${v.europe ? "Unknown" : v.new_person ? "New" : "Returning"}<div class="vis-note">${e(String(v.visitor || "").slice(0, 8))}</div></td></tr>`).join("")
        || '<tr><td colspan="8" class="help">No visits in this period.</td></tr>';
      $("#visNewer").disabled = pick.page === 0;
      $("#visOlder").disabled = d.visits.length < d.page_size;
      $("#visPage").textContent = `Page ${pick.page + 1}`;
    } catch (err) {
      $("#visRows").innerHTML = `<tr><td colspan="8" class="sk-err">Could not load the visits: ${e(err.message)}</td></tr>`;
    }
  }

  async function load(auto = false) {
    clearTimeout(timer);
    const { from, to } = range();
    try {
      const d = await api(`/api/admin/visits/summary?from=${from}&to=${to}`);
      $("#visErr").hidden = true;
      const x = d.totals[0] || {}, num = (v) => (v || 0).toLocaleString("en-US"), today = (d.today[0] || {}).views || 0;
      const t = (label, value, hot) => `<div class="tile${hot ? " hot" : ""}"><b>${e(value)}</b><span>${e(label)}</span></div>`;
      $("#visTiles").innerHTML = [
        t("On the site now", num((d.online[0] || {}).n)),
        t("Visitors", num(x.people)),
        t("Visits", num(x.visits)),
        t("Pages viewed", num(x.views)),
        t("New visitors", num(x.new_people)),
        t("Time per visit", stay((x.total || 0) / Math.max(x.visits || 0, 1))),
        t("Time per page", stay(x.secs)),
        t("Today's record limit", `${today.toLocaleString("en-US")} of ${d.limit_a_day.toLocaleString("en-US")}`, today >= d.limit_a_day),
      ].join("");
      $("#visBoxes").innerHTML = [
        box("Came from (views, time per page)", d.sources, { secs: true, filter: "source" }),
        box("Countries (views, time per page)", d.countries, { secs: true, name: countryName, filter: "country" }),
        box("Pages (views, time per page)", d.pages, { secs: true }),
        box("Days, Jakarta time", d.days),
        box("Hours, Jakarta time", d.hours, { name: (h) => `${h}:00` }),
        box("Devices", d.devices), box("Browsers", d.browsers), box("Systems", d.systems), box("Languages", d.languages),
        box("Robots that ran our pages", d.robots, { note: "Search engines and AI tools. Only robots that run scripts show here, so the real count is higher; Google Search Console has the full one." }),
        robotHours(d.robotHours),
      ].join("");
    } catch (err) {
      $("#visErr").hidden = false;
      $("#visErr").textContent = `Could not load the visitors: ${err.message}.`;
      if ($("#visTiles .tile span")?.textContent === "Loading…") $("#visTiles").innerHTML = "";
    }
    if (!(auto && $(".vis-trail"))) loadVisits();   // the minute-by-minute refresh must not close a visit that staff are reading
    // the free plan counts every row read: only "Today" refreshes by itself, and only while it is on screen
    if (!days) timer = setTimeout(() => { if (onThisPage()) { if (document.hidden) { timer = setTimeout(() => load(true), 60000); } else load(true); } }, 60000);
  }

  $("#visTools").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-d]");
    if (!b) return;
    main.querySelectorAll("#visTools [data-d]").forEach((x) => x.classList.toggle("gold", x === b));
    days = +b.dataset.d;
    pick.page = 0;
    load();
  });
  // on the boxes and the list themselves (they are made again on every visit to this page), never on `main`, which would pile up handlers
  const onPick = async (ev) => {
    const f = ev.target.closest("[data-f]");
    if (f) { pick[f.dataset.f] = f.dataset.v; pick.page = 0; return loadVisits(); }
    if (ev.target.id === "visClear") { pick.country = pick.source = ""; pick.page = 0; return loadVisits(); }
    const row = ev.target.closest("tr.vis-visit");
    if (!row) return;
    const open = row.nextElementSibling?.classList.contains("vis-trail") ? row.nextElementSibling : null;
    if (open) return open.remove();
    const d = await api(`/api/admin/visits/trail?sid=${encodeURIComponent(row.dataset.sid)}`).catch(() => ({ pages: [] }));
    row.insertAdjacentHTML("afterend", `<tr class="vis-trail"><td colspan="8"><ol>${d.pages.map((p) =>
      `<li><b>${e(p.path)}</b> <span class="vis-note">at ${e(time(p.ts))}, on screen ${e(stay(p.seconds))}</span></li>`).join("")}</ol></td></tr>`);
  };
  $("#visBoxes").addEventListener("click", onPick);
  $(".vis-list").addEventListener("click", onPick);
  $("#visNewer").onclick = () => { pick.page = Math.max(0, pick.page - 1); loadVisits(); };
  $("#visOlder").onclick = () => { pick.page += 1; loadVisits(); };
  $("#visWho").onchange = () => { pick.page = 0; loadVisits(); };
  $("#visRefresh").onclick = load;
  $("#visMe").onchange = (ev) => {
    try { if (ev.target.checked) localStorage.setItem(NO_TRACK_KEY, "1"); else localStorage.removeItem(NO_TRACK_KEY); } catch { /* blocked: nothing to remember */ }
  };
  $("#visExport").onclick = async (ev) => {
    const b = ev.target, { from, to } = range(), all = [];
    b.disabled = true;
    try {
      for (let page = 0; page < 1000; page++) {
        b.textContent = `Reading… ${all.length.toLocaleString("en-US")} rows`;
        const d = await api(`/api/admin/visits/rows?from=${from}&to=${to}&page=${page}`);
        all.push(...d.rows);
        if (d.rows.length < d.page_size) break;
      }
      const cols = ["jakarta_time", "page", "seconds_on_screen", "visit", "visitor", "first_visit", "ip", "country", "region", "city", "timezone", "network", "asn", "browser", "system", "device", "screen", "language", "came_from", "europe"];
      const line = (r) => [whenJk(r.ts), r.path, r.seconds, r.sid, r.vid, r.first_visit, r.ip, r.country, r.region, r.city, r.timezone, r.org, r.asn, r.browser, r.os, r.device, r.screen, r.lang, r.source, r.europe].map(cell).join(",");
      const href = URL.createObjectURL(new Blob(["﻿" + [cols.join(","), ...all.map(line)].join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href, download: `satukoneksi-visitors-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      URL.revokeObjectURL(href);
      b.textContent = "Download spreadsheet";
    } catch (err) {
      b.textContent = `Could not download: ${err.message}`.slice(0, 60);
    }
    b.disabled = false;
  };
  await load();
}

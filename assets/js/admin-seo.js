// Admin -> SEO checklist: everything that must be done for visitors to find the website, each with a coloured indicator.
// Most indicators read the results of the robots (engineControl/*) and the visitor record; the rest are steps only a person can do, ticked here.
import { VISITS_URL } from "./sk-light.js";
import { esc as e } from "./sk-text.js";

const DAY = 86400000, OLD_DAYS = 14;
export const LABEL = { good: "Good", work: "Needs work", bad: "Problem", unknown: "Not known" };
const num = (v) => Number(v || 0).toLocaleString("en-US");
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
// the higher the better: at or above "good" is good, at or above "work" needs work, else a problem
const band = (v, good, work) => (v >= good ? "good" : v >= work ? "work" : "bad");
// the lower the better
const low = (v, good, work) => (v <= good ? "good" : v <= work ? "work" : "bad");
const LINK = { gsc: "https://search.google.com/search-console", bing: "https://www.bing.com/webmasters", naver: "https://searchadvisor.naver.com", gbp: "https://www.google.com/business/",
  bingplaces: "https://www.bingplaces.com", apple: "https://businessconnect.apple.com", linkedin: "https://www.linkedin.com/company/setup/new/" };

// A check that is too old cannot be called good. -> { status, note }
function fresh(status, at, now) {
  const t = Date.parse(at || "");
  if (isNaN(t)) return { status, note: "" };
  const days = Math.floor((now - t) / DAY);
  return { status: status === "good" && days > OLD_DAYS ? "work" : status, note: days > OLD_DAYS ? ` Checked ${days} days ago: run it again.` : ` Checked ${days < 1 ? "today" : days + " day(s) ago"}.` };
}
function auto(id, name, status, value, todo, at, now) {
  const f = at ? fresh(status, at, now) : { status, note: "" };
  return { id, name, status: f.status, value: value + f.note, todo: f.status === "good" ? "" : todo };
}
function unknown(id, name, value, todo) { return { id, name, status: "unknown", value, todo }; }
function owner(id, name, how, link, checks) {
  const c = checks?.[id];
  return { id, name, tick: true, done: !!c?.done, link, status: c?.done ? "good" : "work", value: c?.done ? `Ticked by ${e(c.by || "staff")}${c.at ? " on " + e(String(c.at).slice(0, 10)) : ""}. The website cannot check this by itself.` : "Not ticked yet.", todo: c?.done ? "" : how };
}

export function seoItems({ seo, deep, speed, pagespeed, guard, search, visits, checks } = {}, now = Date.now()) {
  const d = deep, q = d?.search, h = d?.hotelMissing || {}, hp = d?.hotelPages || 0;
  const mobile = pagespeed?.latest?.["home|mobile"];
  const noPhoto = (d?.hotel || []).find((k) => k.key === "hotel-no-image")?.count || 0;
  const reachable = d ? (d.noLinksIn || 0) + (d.unreachable || 0) : null;
  const google = visits ? (visits.sources || []).find((s) => s.k === "Google Search")?.visits || 0 : null;
  const week = visits ? visits.totals?.[0]?.visits || 0 : null;
  const tot = search?.totals;
  // Google's own average when the report has it; an older report keeps a place per search, so the average weighs each by how often it was shown
  const shown = (search?.queries || []).reduce((n, x) => n + (x.impressions || 0), 0);
  const place = tot?.position != null ? tot.position : shown ? Math.round((10 * search.queries.reduce((n, x) => n + (x.position || 0) * (x.impressions || 0), 0)) / shown) / 10 : null;
  return [
    { title: "1. Google can read the website", help: "The robots check this from the built pages and the live website.", items: [
      seo?.checkedAt ? auto("score", "Pages are built correctly for Google", band(seo.score, 90, 60), `Score ${e(seo.score)} of 100 on ${num(seo.pages)} pages: ${num(seo.errors)} errors, ${num(seo.warnings)} warnings.`, "Control Panel -> SEO 3 lists what to fix.", seo.checkedAt, now)
        : unknown("score", "Pages are built correctly for Google", "Not checked yet.", "Control Panel -> SEO 3."),
      seo?.checkedAt ? auto("sitemap", "Every page is in the site maps", seo.inSitemaps === seo.indexable ? "good" : "work", `${num(seo.inSitemaps)} of ${num(seo.indexable)} pages for Google.`, "Build the site again: Control Panel -> Run bot G.", seo.checkedAt, now)
        : unknown("sitemap", "Every page is in the site maps", "Not checked yet.", "Control Panel -> SEO 3."),
      reachable != null ? auto("links", "Every page can be reached by clicking", reachable === 0 ? "good" : "bad", `${num(reachable)} pages cannot be reached.`, "Control Panel -> SEO 5 lists them.", d.checkedAt, now)
        : unknown("links", "Every page can be reached by clicking", "Not checked yet.", "Control Panel -> SEO 5."),
      speed?.checkedAt ? auto("speed", "The website answers fast", speed.slow ? "work" : "good", `Middle page answers in ${num(speed.medianFirstMs)} thousandths of a second; ${num(speed.slow)} slow of ${num(speed.pages)} timed.`, "Control Panel -> SEO 6 shows the slow pages.", speed.checkedAt, now)
        : unknown("speed", "The website answers fast", "Not timed yet.", "Control Panel -> SEO 6."),
      mobile ? auto("phone", "Fast on a phone (Google's own score)", band(mobile.score, 70, 50), `Home page on a phone: ${e(mobile.score)} of 100.`, "Control Panel -> SPEED 4 shows what slows it.", mobile.at, now)
        : unknown("phone", "Fast on a phone (Google's own score)", "No score yet: Google's speed check has no key.", "Owner's step, free: add a PageSpeed key as the GitHub secret PAGESPEED_API_KEY."),
      guard?.live ? auto("guard", "The live website passes the security guard", guard.live.fails ? "bad" : "good", `${num(guard.live.fails)} failures, ${num(guard.live.warns)} warnings.`, "Admin -> Bots -> Security guard lists them.", guard.live.checkedAt, now)
        : unknown("guard", "The live website passes the security guard", "Not checked yet.", "Control Panel -> GUARD 2."),
      seo?.notice?.at ? auto("indexnow", "Search engines are told about changed pages", "good", `${num(seo.notice.sent)} pages sent to Bing, Yandex and Naver.`, "Control Panel -> SEO 4.", seo.notice.at, now)
        : unknown("indexnow", "Search engines are told about changed pages", "No notice recorded.", "Control Panel -> SEO 4."),
    ] },
    { title: "2. The website is registered with search engines", help: "Tick a step once it is done. These need the owner's own sign-in.", items: [
      owner("gsc", "Website added to Google Search Console", "Sign in to Search Console and check that satukoneksihotel.com is listed.", LINK.gsc, checks),
      owner("gscmap", "Site map sent to Google", "Search Console -> Sitemaps -> add sitemap.xml.", LINK.gsc, checks),
      tot ? auto("gscrobot", "Our robot can read Google's numbers", "good", `Report for ${e(search.from)} to ${e(search.to)}.`, "Run the Google searches report: Control Panel -> SEO 2.", search.to, now)
        : { id: "gscrobot", name: "Our robot can read Google's numbers", status: "bad", value: "No report: the robot has no access, so Google's numbers here are out of date.", todo: "Search Console -> Settings -> Users and permissions -> add the robot's e-mail as Restricted. Control Panel -> SEO 2 prints the e-mail.", link: LINK.gsc },
      q ? (q.notIndexed?.length ? auto("notindexed", "We know which pages Google left out", "good", `${num(q.notIndexed.reduce((n, x) => n + (x.urls || 0), 0))} addresses in the saved report.`, "", d.checkedAt, now)
        : { id: "notindexed", name: "We know which pages Google left out", status: "unknown", value: "Google's list of left-out pages has not been saved here.", todo: "Search Console -> Pages -> open a reason -> Export -> save into the search_console folder on the PC, then Control Panel -> SEO 5.", link: LINK.gsc })
        : unknown("notindexed", "We know which pages Google left out", "No Search Console files saved.", "Search Console -> Pages -> Export, into the search_console folder on the PC, then Control Panel -> SEO 5."),
      owner("bing", "Website added to Bing Webmaster Tools", "Sign in and choose \"import from Google Search Console\".", LINK.bing, checks),
      owner("naver", "Website added to Naver Search Advisor (Korea)", "Sign in and add the website.", LINK.naver, checks),
    ] },
    { title: "3. The pages are worth showing", help: "Google often leaves out pages that read like many others. Add only real facts, never guesses.", items: [
      d ? auto("wording", "Pages have wording of their own", low(pct(d.thin, d.pages), 25, 50), `${num(d.thin)} of ${num(d.pages)} pages (${pct(d.thin, d.pages)}%) have little of their own.`, "Add real facts to the hotel pages, starting with the hotels people search for.", d.checkedAt, now)
        : unknown("wording", "Pages have wording of their own", "Not checked yet.", "Control Panel -> SEO 5."),
      d ? auto("alike", "Pages do not read like each other", low(pct(d.lookAlikePages, d.pages), 1, 5), `${num(d.lookAlikePages)} pages in ${num(d.lookAlikeGroups)} groups read almost the same.`, "Make each one different, or join them.", d.checkedAt, now)
        : unknown("alike", "Pages do not read like each other", "Not checked yet.", "Control Panel -> SEO 5."),
      hp ? auto("map", "Hotels have a map position", low(pct(h["map location"], hp), 10, 50), `${num(h["map location"])} of ${num(hp)} hotel pages have none.`, "Run: python run_engine.py hotelgeo", d.checkedAt, now)
        : unknown("map", "Hotels have a map position", "Not checked yet.", "Control Panel -> SEO 5."),
      hp ? auto("photo", "Hotels have a photo", low(pct(noPhoto, hp), 1, 5), `${num(noPhoto)} of ${num(hp)} hotel pages have none.`, "Control Panel -> SEO 5 lists them.", d.checkedAt, now)
        : unknown("photo", "Hotels have a photo", "Not checked yet.", "Control Panel -> SEO 5."),
      hp ? auto("facts", "Hotels show address and phone", low(pct(Math.max(h["street address"] || 0, h["hotel phone"] || 0), hp), 25, 75), `Address missing on ${num(h["street address"])}, phone on ${num(h["hotel phone"])} of ${num(hp)} hotel pages.`, "Add real values only, from the hotels themselves.", d.checkedAt, now)
        : unknown("facts", "Hotels show address and phone", "Not checked yet.", "Control Panel -> SEO 5."),
      q ? auto("near", "Searches close to Google's first page are worked on", q.queriesNear?.length ? "work" : "good", `${num(q.queriesNear?.length)} of the saved searches stand on Google's page 1-2, for example: ${e((q.queriesNear || []).slice(0, 3).map((x) => x.name).join(", ")) || "none"}.`, "Admin -> Bots -> Ways to more visitors from Google lists them. Improve those pages first.", d.checkedAt, now)
        : unknown("near", "Searches close to Google's first page are worked on", "No Search Console files saved.", "Search Console -> Performance -> Export, into the search_console folder on the PC, then Control Panel -> SEO 5."),
    ] },
    { title: "4. People hear about us outside Google", help: "A new website needs other places sending people to it. Tick a step once it is done.", items: [
      owner("gbp", "Google Business Profile set up", "Add the company so it can show in Google Maps and in searches for our name.", LINK.gbp, checks),
      owner("social", "Posting on social media regularly", "Posting is switched on (owner, 8 Nov): approve the drafts in Engines -> Posts; Facebook only until Instagram is connected.", null, checks),
      owner("links", "Other websites link to us", "Ask partner hotels, tourism directories and business listings to link to satukoneksihotel.com.", null, checks),
      // free listings (owner, 8 Nov 2026 - "outreach"): each is a trusted link to us and a place AI assistants read; the owner signs up, never a robot
      owner("bingplaces", "Listed on Bing Places (free)", "Sign in with the business Microsoft or Google account and choose \"import from Google Business Profile\". Bing feeds ChatGPT and Copilot answers.", LINK.bingplaces, checks),
      owner("apple", "Listed on Apple Business Connect (free)", "Add the company so it shows in Apple Maps and Siri on iPhones. Online business: no shop address needed.", LINK.apple, checks),
      owner("linkedin", "LinkedIn company page (free)", "Create a company page with the website link and the About Us text.", LINK.linkedin, checks),
    ] },
    { title: "5. Results, last 7 days", help: "From the visitor record, which started on 4 Nov 2026. Our own yardstick: 10 visits a day is good, 1 a day needs work.", items: [
      week != null ? auto("visits", "Visits to the website", band(week, 70, 7), `${num(week)} visits.`, "See sections 2 to 4.") : unknown("visits", "Visits to the website", "The visitor record could not be read.", "Press Refresh, or open Admin -> Visitors."),
      google != null ? auto("fromgoogle", "Visits from Google", band(google, 35, 7), `${num(google)} visits.`, "See section 3.") : unknown("fromgoogle", "Visits from Google", "The visitor record could not be read.", "Press Refresh."),
      place != null ? auto("place", "Average place in Google", low(place, 10, 20), `Place ${place} (1-10 is the first page), ${num(tot?.clicks)} clicks, shown ${num(tot?.impressions)} times.`, "See section 3.", search.to, now)
        : unknown("place", "Average place in Google", "The robot cannot read Google's numbers yet (see section 2).", "See section 2."),
    ] },
  ];
}

// The page-1 booster's daily result (seo_engine boost, engineControl/seoboost): how many searches stand on Google's page 1,
// what moved up or dropped, Google visits per day, the searches worked into pages, and ideas for new pages.
export function boostPanel(b) {
  if (!b?.to) return `<div class="panel"><h3>6. Daily Google progress (page-1 booster)</h3><p class="help">No result yet. The Rust engine runs every day in the cloud, right after the Google searches report (after 10:00 Jakarta).</p></div>`;
  const tbl = (head, rows) => rows.length ? `<table class="seo-tbl"><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="help">None.</p>`;
  const place = (v) => (v == null ? "-" : e(Math.round(v * 10) / 10));
  const days = (b.days || []).slice(-14);
  const clicks = days.reduce((n, d) => n + (d.clicks || 0), 0);
  const hist = (b.history || []).slice(-2);
  const was = hist.length > 1 ? hist[0].page1 : null;
  return `<div class="panel"><h3>6. Daily Google progress (page-1 booster) <small class="seo-sum">Google data to ${e(b.to)}</small></h3>
    <p class="help">Every day the Rust engine works the searches where a page is near Google's page 1 into that page (title, a "People also search" line, description). Pages usually move within 1-4 weeks.</p>
    <div class="tiles">
      <div class="tile seo-t good"><b>${num(b.page1)}</b><span>searches on Google's page 1${was != null ? ` (${b.page1 - was >= 0 ? "+" : ""}${b.page1 - was})` : ""}</span></div>
      <div class="tile seo-t work"><b>${num(b.page2)}</b><span>on page 2 (worked on)</span></div>
      <div class="tile seo-t good"><b>${num(b.pages)}</b><span>pages boosted, ${num(b.titles)} titles</span></div>
      <div class="tile seo-t ${clicks ? "good" : "work"}"><b>${num(clicks)}</b><span>visits from Google, last ${days.length} days</span></div>
    </div>
    <h4>Visits from Google per day</h4>${tbl(["Day", "Visits", "Shown"], days.slice().reverse().map((d) => [e(d.date), num(d.clicks), num(d.shown)]))}
    <h4>Moved onto page 1${b.comparedWith ? ` since ${e(b.comparedWith)}` : ""}</h4>${tbl(["Search", "Was", "Now", "Shown"], (b.up || []).map((m) => [e(m.q), place(m.was), place(m.now), num(m.shown)]))}
    <h4>Dropped off page 1</h4>${tbl(["Search", "Was", "Now", "Shown"], (b.down || []).map((m) => [e(m.q), place(m.was), place(m.now), num(m.shown)]))}
    <h4>Searches worked into pages (most shown)</h4>${tbl(["Search", "Page", "Place", "Shown"], (b.boosted || []).map((x) => [e(x.q), `<a href="${e(x.page)}" target="_blank" rel="noopener">${e(x.page)}</a>`, place(x.pos), num(x.shown)]))}
    <h4>Ideas for new pages</h4><p class="help">Searches people make where no page of ours is on Google's page 1 yet. The robot works each into our page that fits it best; "none" means no page fits - a page made for it (with real facts only) can bring new visitors.</p>
    ${tbl(["Search", "Shown", "Best place", "Page Google used", "Now worked into"], (b.gaps || []).map((g) => [e(g.q), num(g.shown), place(g.pos), e(g.page), g.to ? `<a href="${e(g.to)}" target="_blank" rel="noopener">${e(g.to)}</a>` : "none - idea for a new page"]))}</div>`;
}

// The Question agent's daily result (seo_engine questions, engineControl/seoquestions): what people ask Google before they book,
// the brand "how many stars?" pages, the "hotels near <place>" pages, and questions with no page yet.
export function questionsPanel(q) {
  if (!q?.to) return `<div class="panel"><h3>7. What people ask Google (question agent)</h3><p class="help">No result yet. The Rust engine runs every day in the cloud, after the page-1 booster.</p></div>`;
  const tbl = (head, rows) => rows.length ? `<table class="seo-tbl"><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="help">None.</p>`;
  const place = (v) => (v == null ? "-" : e(Math.round(v * 10) / 10));
  const fam = q.families || {};
  const FAM = { stars: "how many stars", near: "hotel near a place", airport: "hotel near an airport", kind: "kind of stay", question: "other questions", name: "a hotel's name" };
  return `<div class="panel"><h3>7. What people ask Google (question agent) <small class="seo-sum">Google data to ${e(q.to)}</small></h3>
    <p class="help">The big booking sites own the word "hotel". We win the questions they do not answer on one page: "Aston bintang berapa?", "hotel dekat Malioboro". Every day the Rust engine reads what people asked and the robot makes or updates the answer pages - only from facts we hold.</p>
    <div class="tiles">
      <div class="tile seo-t good"><b>${num(q.brands)}</b><span>brand "how many stars?" pages</span></div>
      <div class="tile seo-t good"><b>${num(q.quick)}</b><span>hotel pages with Quick answers</span></div>
      <div class="tile seo-t work"><b>${num(q.push)}</b><span>page-2 hotels linked from their city</span></div>
      <div class="tile seo-t good"><b>${num(fam.stars || 0)}</b><span>times shown for star questions</span></div>
    </div>
    <h4>What people ask (times Google showed us)</h4>${tbl(["Kind of question", "Shown"], Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([k, v]) => [e(FAM[k] || k), num(v)]))}
    <h4>Brands people ask "how many stars?" about</h4>${tbl(["Brand", "Our hotels", "Asked", "Page"], (q.asked || []).map((b) => [e(b.name), num(b.hotels), num(b.shown), `<a href="/hotel-brands/${e(b.slug)}" target="_blank" rel="noopener">open</a>`]))}
    <h4>Top questions</h4>${tbl(["Search", "Kind", "Shown", "Best place"], (q.top || []).map((t) => [e(t.q), e(FAM[t.family] || t.family), num(t.shown), place(t.pos)]))}
    <h4>"Hotel near the airport" - answered by our airport pages</h4>${tbl(["Airport", "Shown", "Searches"], (q.airports || []).map((a) => [a.slug ? `<a href="/hotels-near-airport/${e(a.slug)}" target="_blank" rel="noopener">${e(a.iata)}</a>` : e(a.iata), num(a.shown), e((a.searches || []).join(" · "))]))}
    <h4>"Hotel near ..." with no page yet (ideas)</h4><p class="help">Places people search hotels near that are not in our city guides yet. Adding the place to a city guide (with its map position) gives it a page automatically.</p>
    ${tbl(["Search", "Shown", "Best place"], (q.ideas || []).map((t) => [e(t.q), num(t.shown), place(t.pos)]))}</div>`;
}

// GEO check (seo_engine geo, engineControl/seogeo): is the website ready for the AI answer tools? Beside it: the AI robots that really
// came and the visitors AI tools sent (visitor record, last 7 days), and a monthly "ask the AI tools yourself" list with ticks.
const AI_NAMES = ["ChatGPT", "Claude", "Perplexity", "Google AI", "Copilot", "Gemini", "Meta", "Amazon", "Apple"];
export function geoPanel(g, visits, checks = {}) {
  const tbl = (head, rows) => rows.length ? `<table class="seo-tbl"><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="help">None yet.</p>`;
  const ask = [
    ["geo-ask-chatgpt", "ChatGPT", "https://chatgpt.com/"], ["geo-ask-perplexity", "Perplexity", "https://www.perplexity.ai/"],
    ["geo-ask-gemini", "Google Gemini", "https://gemini.google.com/"], ["geo-ask-copilot", "Microsoft Copilot", "https://copilot.microsoft.com/"],
  ];
  const questions = ["What is Satu Koneksi Hotel?", "How can I book a hotel in Bali by WhatsApp?", "Jasa reservasi hotel untuk rombongan perusahaan di Indonesia"];
  const tick = ([id, name, link]) => { const c = checks[id]; return `<div class="seo-row geo-row"><span class="seo-dot ${c?.done ? "good" : "unknown"}">${c?.done ? "Mentioned" : "Not checked"}</span>
    <div class="seo-tx"><b>${e(name)}</b><small>${c?.at ? "Last ticked " + e(String(c.at).slice(0, 10)) + (c.by ? " by " + e(c.by) : "") : "Ask the questions below once a month."} <a href="${e(link)}" target="_blank" rel="noopener">Open</a></small></div>
    <label class="seo-tick"><input type="checkbox" data-tick="${e(id)}"${c?.done ? " checked" : ""}> It mentioned us</label></div>`; };
  const manual = `<h4>Ask the AI tools yourself (once a month)</h4>
    <p class="help">No free tool can ask ChatGPT for us, so this part is done by a person: open each tool, ask these questions, and tick it when the answer names Satu Koneksi Hotel.</p>
    <ul class="help">${questions.map((q) => `<li>${e(q)}</li>`).join("")}</ul>${ask.map(tick).join("")}`;
  const robots = (visits?.robots || []).filter((r) => AI_NAMES.includes(r.k));
  const sent = (visits?.sources || []).filter((r) => AI_NAMES.includes(r.k));
  const seen = `<h4>AI robots that read our pages (last 7 days)</h4>${visits ? tbl(["AI tool", "Pages read"], robots.map((r) => [e(r.k), num(r.hits)])) : `<p class="help">The visitor record could not be read.</p>`}
    <h4>Visitors sent by AI tools (last 7 days)</h4>${visits ? tbl(["AI tool", "Page views"], sent.map((r) => [e(r.k), num(r.views ?? r.hits ?? r.n ?? 0)])) : ""}
    <p class="help">Only robots that run the page's script are counted, so the real number is higher.</p>`;
  if (!g?.items) return `<div class="panel"><h3>8. AI answers (GEO check)</h3><p class="help">No result yet. The Rust engine runs every day in the cloud (or Control Panel → SEO 9). It checks that ChatGPT, Claude, Perplexity, Google AI and Copilot can read, understand and quote the website.</p>${seen}${manual}</div>`;
  const row = (i) => `<div class="seo-row geo-row"><span class="seo-dot ${i.status === "good" ? "good" : i.status === "bad" ? "bad" : "work"}">${LABEL[i.status === "good" ? "good" : i.status === "bad" ? "bad" : "work"]}</span>
    <div class="seo-tx"><b>${e(i.name)}</b><small>${e(i.value)}</small>${i.todo ? `<small class="seo-do">To do: ${e(i.todo)}</small>` : ""}</div></div>`;
  const answer = (g.robots || []).filter((r) => r.answers), okAns = answer.filter((r) => r.allowed).length;
  return `<div class="panel"><h3>8. AI answers (GEO check) <small class="seo-sum">checked ${e(String(g.checkedAt || "").slice(0, 10))}</small></h3>
    <p class="help">GEO = being found and quoted by the AI answer tools (ChatGPT, Claude, Perplexity, Google AI, Copilot). Every day the Rust engine checks that they may read the website, understand who we are, and find answers worth quoting. It changes nothing and asks no paid service.</p>
    <div class="tiles geo-tiles">
      <div class="tile seo-t ${g.score >= 85 ? "good" : g.score >= 60 ? "work" : "bad"}"><b>${num(g.score)}</b><span>GEO score out of 100</span></div>
      <div class="tile seo-t ${okAns === answer.length ? "good" : "bad"}"><b>${okAns} / ${answer.length}</b><span>AI answer robots allowed in</span></div>
      <div class="tile seo-t ${g.faqPages ? "good" : "work"}"><b>${num(g.faqPages)}</b><span>pages with questions and answers (${num(g.faqQuestions)} answers)</span></div>
      <div class="tile seo-t ${g.work || g.bad ? "work" : "good"}"><b>${num((g.work || 0) + (g.bad || 0))}</b><span>things to work on</span></div>
    </div>
    ${(g.items || []).map(row).join("")}
    <h4>Which AI robots may read the website (robots.txt)</h4>${tbl(["Robot", "Tool", "Kind", "May read"], (g.robots || []).map((r) => [e(r.robot), e(r.tool), r.answers ? "answers questions" : "training", r.allowed ? "yes" : "<b>no</b>"]))}
    ${seen}${manual}</div>`;
}

export async function seoChecklist({ main, toast, load, saveChecks, getToken, me, url = VISITS_URL }) {
  const week = async () => {
    const now = Math.floor(Date.now() / 1000);
    const r = await fetch(`${url}/api/admin/visits/summary?from=${now - 7 * 86400}&to=${now + 60}`, { headers: { Authorization: `Bearer ${await getToken()}` }, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };
  let data = {}, checks = {};
  const draw = () => {
    const sections = seoItems({ ...data, checks });
    const all = sections.flatMap((s) => s.items);
    const n = (st) => all.filter((i) => i.status === st).length;
    const row = (i) => `<div class="seo-row"><span class="seo-dot ${i.status}">${LABEL[i.status]}</span>
      <div class="seo-tx"><b>${e(i.name)}</b><small>${i.value}</small>${i.todo ? `<small class="seo-do">To do: ${e(i.todo)}${i.link ? ` <a href="${e(i.link)}" target="_blank" rel="noopener">Open</a>` : ""}</small>` : ""}</div>
      ${i.tick ? `<label class="seo-tick"><input type="checkbox" data-tick="${e(i.id)}"${i.done ? " checked" : ""}> Done</label>` : ""}</div>`;
    main.innerHTML = `<h1>SEO checklist</h1>
      <p class="lead">Everything that must be done for visitors to find the website. A colour comes from the robots' latest results; a tick comes from a person.</p>
      <div class="tools"><button class="sk-btn sm" type="button" id="seoRefresh">Refresh</button></div>
      <div class="tiles">${["good", "work", "bad", "unknown"].map((s) => `<div class="tile seo-t ${s}"><b>${n(s)}</b><span>${LABEL[s]}</span></div>`).join("")}</div>
      ${sections.map((s) => {
        const count = (st) => s.items.filter((i) => i.status === st).length;
        return `<div class="panel"><h3>${e(s.title)} <small class="seo-sum">${count("good")} of ${s.items.length} good</small></h3><p class="help">${e(s.help)}</p>${s.items.map(row).join("")}</div>`;
      }).join("")}${boostPanel(data.boost)}${questionsPanel(data.questions)}${geoPanel(data.geo, data.visits, checks)}`;
    main.querySelector("#seoRefresh").onclick = () => read();
    main.querySelectorAll("[data-tick]").forEach((b) => { b.onchange = async () => {
      const before = checks[b.dataset.tick];
      checks[b.dataset.tick] = { done: b.checked, by: me?.email || "", at: new Date().toISOString() };
      try { await saveChecks(checks); draw(); } catch (err) {
        if (before) checks[b.dataset.tick] = before; else delete checks[b.dataset.tick];
        toast("Could not save the tick: " + err.message, "err"); draw();
      }
    }; });
  };
  async function read() {
    const [seo, deepDoc, pagespeed, guard, search, saved, visits, boost, questions, geo] = await Promise.all([
      load("seo"), load("seodeep"), load("speed"), load("guard"), load("searchreport"), load("seoChecklist"), week(), load("seoboost"), load("seoquestions"), load("seogeo"),
    ].map((p) => Promise.resolve(p).catch(() => null)));
    data = { seo, deep: deepDoc?.deep, speed: deepDoc?.speed, pagespeed, guard, search: search?.queries ? search : null, visits, boost, questions, geo };
    checks = saved?.items || {};
    draw();
  }
  await read();
}

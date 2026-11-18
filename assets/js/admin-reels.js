// Staff admin -> "Reels": city reels and AI films. The cloud robot does the work (reelkit engines E1-E8); the finished films are kept
// in the owner's Google Drive ("Satu Koneksi Reels / Finished"). Nothing is ever posted by itself.
//   city reel: city + length + instruction + words on screen + your own photos / videos / music -> robot finds more free photos + clips
//              -> tick the ones you like (order = film order) -> Make reel
//   AI film:   clips made in Kling / Veo / Hailuo / Pika in Drive "Satu Koneksi Reels / AI clips / <name>" + a cue list -> Assemble
// Your own files are sent from this page straight to your Google Drive (Uploads/<project>) through the reels link (Reels.gs, "put").
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MUSIC = [["auto", "Auto (from the instruction, else the country's style)"], ["gamelan", "Gamelan (Indonesia)"], ["thai", "Thai"], ["japan", "Japanese"],
  ["china", "Chinese"], ["korea", "K-pop"], ["arabic", "Arabic"], ["indian", "Indian"], ["latin", "Latin"], ["euro", "European"], ["edm", "Dance (EDM)"],
  ["comedy", "Comedy"], ["epic", "Epic"], ["none", "No music"]];
const AI_MUSIC = [["comedy", "Comedy (bouncy)"], ["villain", "Villain (dark)"], ["epic", "Epic"], ["edm", "Dance (EDM)"], ["gamelan", "Gamelan"], ["none", "No music"]];
const LENGTHS = [["", "Auto (from the instruction, else 15 s)"], ["10", "10 seconds"], ["15", "15 seconds"], ["20", "20 seconds"], ["30", "30 seconds"],
  ["45", "45 seconds"], ["60", "60 seconds (1 minute)"]];
const SFX = "whoosh, impact, hit, thud, clang, boing, pop, confetti, splash, bang, flag, slide, slip, drumroll, scratch, gong, sparkle, crash, tick";
const PROMPT_HELP = "Plain words, English or Bahasa Indonesia. I understand: length (30 seconds / 1 menit) · slow or relaxing / fast or energetic · music (gamelan, latin, k-pop, edm, epic, no music …) · topics (food, night, beach, market, temple, mosque, skyline, culture, history …) · \"text in quotes\" shown on screen · title: … · end: … · gold / red / white title · no title · start with … / end with …";
const ST = { queued: ["⏳ waiting for the robot", "warn"], finding: ["🔎 finding media", "warn"], review: ["✋ tick your photos / clips", "warn"],
  rendering: ["🎬 making the film", "warn"], done: ["✅ finished", "ok"], failed: ["❌ stopped", "bad"] };
const MAX_MB = 25, MAX_UPLOADS = 20;
const chip = (s) => { const x = ST[s] || [s || "-", ""]; return `<span class="eng-chip ${x[1]}">${e(x[0])}</span>`; };
const when = (v) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""; };
const mb = (n) => (n ? (n / 1048576).toFixed(1) + " MB" : "");
const KEY_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomKey = () => { const a = new Uint8Array(40); crypto.getRandomValues(a); return [...a].map((x) => KEY_CHARS[x % KEY_CHARS.length]).join(""); };   // 40 characters

// ---------------------------------------------------------------- your own files -> Google Drive (through the reels link)
const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const loadImg = (url) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
function canvasJpeg(src, w, h, maxSide, q) {
  const s = Math.min(1, maxSide / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function prepare(file) {
  const kind = file.type.startsWith("image/") ? "photo" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "";
  if (!kind) throw new Error(`${file.name}: not a photo, video or sound file`);
  if (kind === "photo") {                                         // big photos are made smaller (max 4000 px) before sending
    const url = URL.createObjectURL(file); const img = await loadImg(url);
    const big = canvasJpeg(img, img.naturalWidth, img.naturalHeight, 4000, 0.92);
    const blob = await new Promise((ok) => big.toBlob(ok, "image/jpeg", 0.92));
    const thumb = canvasJpeg(img, img.naturalWidth, img.naturalHeight, 220, 0.6).toDataURL("image/jpeg", 0.6);
    URL.revokeObjectURL(url);
    return { kind, blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", thumb, w: big.width, h: big.height };
  }
  if (file.size > MAX_MB * 1048576) throw new Error(`${file.name}: ${mb(file.size)} - the limit is ${MAX_MB} MB (make it shorter / smaller)`);
  if (kind === "video") {
    const url = URL.createObjectURL(file), v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    const info = await new Promise((ok) => { v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); }; v.onseeked = () => ok(true); v.onerror = () => ok(false); setTimeout(() => ok(false), 8000); });
    let thumb = "";
    try { if (info) thumb = canvasJpeg(v, v.videoWidth, v.videoHeight, 220, 0.6).toDataURL("image/jpeg", 0.6); } catch { /* ignore */ }
    const meta = { w: v.videoWidth || 0, h: v.videoHeight || 0, dur: Math.round(v.duration || 0) };
    URL.revokeObjectURL(url);
    return { kind, blob: file, name: file.name, mime: file.type || "video/mp4", thumb, ...meta };
  }
  return { kind, blob: file, name: file.name, mime: file.type || "audio/mpeg", thumb: "" };
}
async function sendToDrive(cfg, folder, item) {
  const data = b64(await item.blob.arrayBuffer());
  const r = await fetch(cfg.driveUrl, { method: "POST", body: JSON.stringify({ key: cfg.key, action: "put", path: folder, name: item.name, mime: item.mime, data }) });
  const js = await r.json();
  if (!js.ok) throw new Error(js.error || "Drive did not accept the file");
  return js;
}
async function uploadAll(cfg, pid, files, say) {
  const out = [];
  for (const [i, f] of [...files].entries()) {
    say(`Sending ${i + 1}/${files.length}: ${f.name} …`);
    const it = await prepare(f);
    const js = await sendToDrive(cfg, `Uploads/${pid}`, it);
    out.push({ id: js.id, name: js.name, size: js.size, type: it.kind, thumb: it.thumb, w: it.w || 0, h: it.h || 0, dur: it.dur || 0 });
  }
  return out;
}
const asCandidate = (u) => ({ id: "up-" + String(u.id).slice(0, 16), type: u.type, source: "Your upload", title: u.name, author: "Satu Koneksi Hotel", license: "own",
  page: "", thumb: u.thumb || "", url: "drive:" + u.id, w: u.w || 0, h: u.h || 0, dur: u.dur || 0, fps: 0, query: "own" });

// ---------------------------------------------------------------- page look (WordPress-style: title + tabs, list table, edit screen with sidebar)
const CSS = `<style id="rk-css">
.rk h1{font:800 28px 'Plus Jakarta Sans';display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.rk .rk-add{font:700 13px 'Plus Jakarta Sans';padding:6px 12px;border:1.5px solid #b38d40;color:#8a6420;border-radius:8px;text-decoration:none;background:#fff}
.rk .rk-add:hover{background:#b38d40;color:#fff}
.rk .rk-sub{color:#6b7473;font-size:14px;margin:0 0 14px}
.rk .rk-tabs{display:flex;gap:2px;border-bottom:1px solid #d8d4cc;margin:0 0 18px;flex-wrap:wrap}
.rk .rk-tabs a{padding:9px 16px;font:700 14px 'Plus Jakarta Sans';color:#4b5554;text-decoration:none;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;margin-bottom:-1px}
.rk .rk-tabs a.on{background:#fff;border-color:#d8d4cc;color:#0e494a}
.rk .rk-filters{display:flex;gap:4px;flex-wrap:wrap;font-size:13.5px;margin:0 0 10px;color:#8a9291}
.rk .rk-filters a{color:#0e494a;text-decoration:none}.rk .rk-filters a.on{font-weight:800;color:#111}
.rk .rk-cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
.rk .box{background:#fff;border:1px solid #e3dfd6;border-radius:12px;margin:0 0 16px;overflow:hidden}
.rk .box>h2,.rk .box>summary{font:700 15px 'Plus Jakarta Sans';margin:0;padding:12px 16px;border-bottom:1px solid #eee9df;background:#faf8f4;color:#1e3a3a;cursor:default;list-style:none}
.rk details.box>summary{cursor:pointer}.rk details.box>summary::after{content:"▾";float:right;color:#8a9291}.rk details.box:not([open])>summary::after{content:"▸"}
.rk details.box:not([open])>summary{border-bottom:0}
.rk .box .in{padding:14px 16px}
.rk .num{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#0e494a;color:#fff;font-size:12px;margin-right:8px}
.rk .fld{margin:0 0 14px}.rk .fld:last-child{margin-bottom:0}
.rk .fld>label,.rk .fld>.lbl{display:block;font-weight:700;font-size:13.5px;color:#1e3a3a;margin:0 0 5px}
.rk .fld input[type=text],.rk .fld input:not([type]),.rk .fld input[type=password],.rk .fld select,.rk .fld textarea{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #cfcac0;border-radius:8px;font:inherit;font-size:14px;background:#fff}
.rk .fld textarea{resize:vertical}.rk .fld input:focus,.rk .fld select:focus,.rk .fld textarea:focus{outline:2px solid #b38d4055;border-color:#b38d40}
.rk .hint{display:block;color:#7a8382;font-size:12.5px;margin-top:5px;line-height:1.45}
.rk .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rk .opt{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:6px 0}.rk .opt input{margin-top:3px}
.rk .side .box .in>p{margin:0 0 10px;font-size:13.5px}
.rk .side .big{width:100%;justify-content:center}
.rk .msg{font-size:13px;color:#8a6420;margin:8px 0 0}
.rk table.wp{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3dfd6;border-radius:12px;overflow:hidden}
.rk table.wp th{text-align:left;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em;color:#6b7473;background:#faf8f4;padding:10px 12px;border-bottom:1px solid #e3dfd6}
.rk table.wp td{padding:11px 12px;border-bottom:1px solid #f0ece4;font-size:14px;vertical-align:top}
.rk table.wp tr:hover td{background:#fcfbf8}.rk table.wp td a.t{font-weight:800;color:#0e494a;text-decoration:none}
.rk .acts{font-size:12.5px;margin-top:3px;visibility:hidden}.rk tr:hover .acts{visibility:visible}.rk .acts a{color:#8a6420}
.rk .form-table th{width:220px;text-align:left;vertical-align:top;padding:12px 16px 12px 0;font-size:14px}.rk .form-table td{padding:8px 0}
.rk .rk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.rk .rk-card{position:relative;display:block;border:3px solid transparent;border-radius:10px;overflow:hidden;background:#fff;cursor:pointer;box-shadow:0 2px 8px #0001}
.rk .rk-card img,.rk .rk-ph{width:100%;height:105px;object-fit:cover;display:block}.rk .rk-ph{display:grid;place-items:center;font-size:30px;background:#eef2f2}.rk .rk-card.on{border-color:#b38d40}
.rk .rk-card small{display:block;padding:5px 7px 2px;font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rk .rk-card a{display:block;padding:0 7px 5px;font-size:11px;color:#b38d40}
.rk .rk-n{position:absolute;top:5px;left:5px;min-width:24px;height:24px;border-radius:12px;background:#b38d40;color:#fff;font-weight:800;text-align:center;line-height:24px;font-size:13px}.rk .rk-n:empty{display:none}
.rk .rk-v{position:absolute;top:5px;right:5px;background:#000a;color:#fff;font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:8px}
.rk .rk-own{position:absolute;top:80px;right:5px;background:#0e494a;color:#fff;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:8px}
.rk .files li{margin:4px 0;font-size:13.5px}
@media(max-width:1000px){.rk .rk-cols{grid-template-columns:minmax(0,1fr)}.rk .row2{grid-template-columns:1fr}.rk .form-table th{display:block;width:auto;padding-bottom:0}}
</style>`;

const fld = (label, inner, hint = "") => `<div class="fld"><label>${label}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur ?? "") === v ? "selected" : ""}>${e(l)}</option>`).join("")}</select>`;
const box = (n, title, body, open = true, collapsible = true) => collapsible
  ? `<details class="box" ${open ? "open" : ""}><summary>${n ? `<span class="num">${n}</span>` : ""}${title}</summary><div class="in">${body}</div></details>`
  : `<div class="box"><h2>${n ? `<span class="num">${n}</span>` : ""}${title}</h2><div class="in">${body}</div></div>`;

function header(tab, linked) {
  const t = (k, label, href) => `<a href="${href}" class="${tab === k ? "on" : ""}">${label}</a>`;
  return `${CSS}<h1>🎬 Reels <a class="rk-add" href="#/reels?new=city">+ Add city reel</a><a class="rk-add" href="#/reels?new=ai">+ Add AI film</a></h1>
  <p class="rk-sub">The cloud robot makes the films; they go to your Google Drive folder <b>Satu Koneksi Reels</b>. Nothing is posted by itself - watch every film first.
  ${linked ? "" : ` <b style="color:#b42318">Google Drive link not set up yet - see Setup.</b>`}</p>
  <nav class="rk-tabs">${t("list", "Projects", "#/reels")}${t("city", "New city reel", "#/reels?new=city")}${t("ai", "New AI film", "#/reels?new=ai")}${t("setup", "Setup", "#/reels?tab=setup")}</nav>`;
}

// the film settings boxes (new city reel + edit screen)
function cityBoxes(p = {}, opt = {}) {
  return box(1, "Place &amp; length", `<div class="row2">${fld("City", `<input name="city" required maxlength="60" value="${e(p.city || "")}" placeholder="Jakarta" ${p.id ? "disabled" : ""}>`)}
      ${fld("Country", `<input name="country" maxlength="60" value="${e(p.country || "")}" placeholder="Indonesia" ${p.id ? "disabled" : ""}>`)}</div>
    ${fld("Length", sel("duration", LENGTHS, p.duration || ""), "Auto = the length in your instruction, otherwise 15 seconds. Every cut stays on the music's beat.")}`)
    + box(2, "Instruction (prompt)", fld("What should the film be like?", `<textarea name="prompt" rows="3" maxlength="1000" placeholder="e.g. 30 seconds, relaxing, focus on food and night views, latin music, gold title, end with Monas">${e(p.prompt || "")}</textarea>`, e(PROMPT_HELP)))
    + box(3, "Words on screen", fld("Text lines", `<textarea name="words" rows="3" maxlength="800" placeholder="Welcome to Jakarta&#10;Best hotel prices in one chat&#10;0:12 Book now">${e(p.words || "")}</textarea>`,
      "One line each. Put a time first to choose when it shows (<code>0:05 Welcome</code>), otherwise the lines are spread evenly.")
      + `<div class="row2">${fld("Title", `<input name="title" maxlength="40" value="${e(p.title || "")}" placeholder="(city name)">`, "Big title at the start. Empty = the city name.")}
      ${fld("Ending text", `<input name="ending" maxlength="80" value="${e(p.ending || "")}" placeholder="Book at satukoneksihotel.com">`, "Shown over the last shot.")}</div>`)
    + box(4, "Your own photos &amp; videos", fld("Add files", `<input name="own" type="file" accept="image/*,video/*" multiple>`,
      `Optional - up to ${MAX_UPLOADS} files, videos max ${MAX_MB} MB. They are marked “Yours” and ticked already.${(p.uploads || []).length ? ` Already added: <b>${p.uploads.length}</b>.` : ""}`)
      + (p.id ? "" : `<label class="opt"><input type="checkbox" name="onlyOwn"> <span>Use only my own photos / videos (no search)</span></label>`), true)
    + box(5, "Music &amp; sound", fld("Music style", sel("music", MUSIC, opt.music || "auto"))
      + fld(`Your music or sound${p.audio ? ` - now: <b>${e(p.audio.name)}</b> (<a href="#" id="rmAudio">remove</a>)` : ""}`, `<input name="audio" type="file" accept="audio/*">`, `Optional - mp3 / m4a / wav, max ${MAX_MB} MB.`)
      + `<label class="opt"><input type="radio" name="audioMode" value="music" ${p.audioMode !== "voice" ? "checked" : ""}> <span><b>As the music</b> - the film follows its beat</span></label>
      <label class="opt"><input type="radio" name="audioMode" value="voice" ${p.audioMode === "voice" ? "checked" : ""}> <span><b>As a voice-over</b> - our music plays quietly underneath</span></label>`)
    + box(6, "Picture options", `<label class="opt"><input type="checkbox" name="depth" ${opt.depth !== false ? "checked" : ""}> <span>3D photo motion (photos move like filmed shots)</span></label>
      <label class="opt"><input type="checkbox" name="steady" ${opt.steady ? "checked" : ""}> <span>Steady shaky video clips</span></label>`, false);
}
function readSettings(form) {
  const f = new FormData(form), v = (k) => String(f.get(k) || "").trim();
  return { duration: v("duration"), prompt: v("prompt"), words: v("words"), title: v("title"), ending: v("ending"), audioMode: v("audioMode") || "music",
    options: { music: v("music") || "auto", depth: !!f.get("depth"), steady: !!f.get("steady") } };
}

export async function reels({ main, toast, db, F, me }) {
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  clearTimeout(timer);
  const cfgSn = await F.getDoc(F.doc(db, "engineControl", "reels")).catch(() => null);
  const cfg = cfgSn?.exists() ? cfgSn.data() : {};
  const linked = !!(cfg.key && cfg.driveUrl);
  const ctx = { main, toast, db, F, me, cfg, linked };
  main.innerHTML = `<div class="rk"><p class="help">Loading…</p></div>`;
  if (qs.get("id")) return project(ctx, qs.get("id"));
  if (qs.get("new") === "city") return newCity(ctx);
  if (qs.get("new") === "ai") return newAi(ctx);
  if (qs.get("tab") === "setup") return setup(ctx);
  return projects(ctx, qs.get("status") || "all");
}
const queueJob = (ctx, engine, args, label) => ctx.F.addDoc(ctx.F.collection(ctx.db, "engineJobs"), { engine, args, label: label.slice(0, 120), requestedBy: ctx.me.email, status: "queued", createdAt: ctx.F.serverTimestamp() });

// ---------------------------------------------------------------- Projects (list table)
const GROUPS = [["all", "All", () => true], ["busy", "In progress", (p) => ["queued", "finding", "rendering"].includes(p.status)],
  ["review", "Waiting for you", (p) => p.status === "review"], ["done", "Finished", (p) => p.status === "done"], ["failed", "Stopped", (p) => p.status === "failed"]];
async function projects(ctx, status) {
  const { main, db, F } = ctx;
  const snap = await F.getDocs(F.query(F.collection(db, "reelProjects"), F.orderBy("createdAt", "desc"), F.limit(60)));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const g = GROUPS.find((x) => x[0] === status) || GROUPS[0];
  const list = all.filter(g[2]);
  main.innerHTML = `<div class="rk">${header("list", ctx.linked)}
  <div class="rk-filters">${GROUPS.map(([k, l, fn], i) => `${i ? "|" : ""} <a href="#/reels?status=${k}" class="${k === g[0] ? "on" : ""}">${l}</a> (${all.filter(fn).length})`).join(" ")}</div>
  ${list.length ? `<table class="wp"><thead><tr><th>Film</th><th>Type</th><th>Length</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>
    ${list.map((p) => `<tr><td><a class="t" href="#/reels?id=${e(p.id)}">${e(p.kind === "ai" ? p.name : p.city + (p.country ? ", " + p.country : ""))}</a>
      <div class="acts"><a href="#/reels?id=${e(p.id)}">Open</a>${p.status === "done" && (p.outputs || [])[0] ? ` | <a href="${e(p.outputs[0].url)}" target="_blank" rel="noopener">Watch 4K</a>` : ""}</div></td>
      <td>${p.kind === "ai" ? "🤖 AI film" : "🏙️ City reel"}</td><td>${e(p.duration ? p.duration + " s" : p.kind === "ai" ? "-" : "auto")}</td><td>${chip(p.status)}</td>
      <td><small>${e((p.progress || "").slice(0, 110))}</small></td><td><small>${e(when(p.createdAt))}<br>${e(p.createdBy || "")}</small></td></tr>`).join("")}</tbody></table>`
    : `<div class="box"><div class="in">No films here yet. <a href="#/reels?new=city">Make a city reel</a> or <a href="#/reels?new=ai">an AI film</a>.</div></div>`}</div>`;
}

// ---------------------------------------------------------------- New city reel (edit screen: boxes left, Create sidebar right)
function newCity(ctx) {
  const { main, toast, db, F, me, cfg } = ctx;
  main.innerHTML = `<div class="rk">${header("city", ctx.linked)}<form id="newCity"><div class="rk-cols"><div>${cityBoxes()}</div>
    <div class="side">${box("", "Create", `<p>The robot first finds free photos and video clips (about 5 minutes). Then you tick the ones you like and press <b>Make reel</b>.</p>
      <button class="sk-btn gold big" type="submit" ${ctx.linked ? "" : "disabled title='Set up the Google Drive link first'"}>Find photos &amp; clips</button><p class="msg" id="upMsg"></p>`, true, false)}
      ${box("", "Tips", `<p>• 10-25 pictures is best; video clips give real movement.</p><p>• Your first tick is the title background, your last tick is the final shot.</p>
      <p>• Look at every picture - a title can be wrong.</p><p>• Never use other people's faces or famous characters.</p>`, true, false)}</div></div></form></div>`;
  main.querySelector("#newCity").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.target, f = new FormData(form), btn = form.querySelector("button[type=submit]"), say = (t) => (main.querySelector("#upMsg").textContent = t);
    const city = String(f.get("city")).trim(), country = String(f.get("country") || "").trim();
    const own = [...form.own.files], aud = form.audio.files[0], onlyOwn = !!f.get("onlyOwn");
    if (own.length > MAX_UPLOADS) return toast(`Up to ${MAX_UPLOADS} files please.`, "err");
    if (onlyOwn && own.length < 6) return toast("With 'only my own' please add at least 6 photos / videos.", "err");
    btn.disabled = true;
    try {
      const ref = await F.addDoc(F.collection(db, "reelProjects"), { kind: "city", city, country, ...readSettings(form), onlyOwn,
        status: "queued", progress: own.length || aud ? "Sending your files to Google Drive…" : "Waiting for the robot (a few minutes)", picks: [], uploads: [],
        createdBy: me.email, createdAt: F.serverTimestamp() });
      if (own.length || aud) {
        const ups = own.length ? await uploadAll(cfg, ref.id, own, say) : [];
        const extra = {};
        if (aud) { const [a] = await uploadAll(cfg, ref.id, [aud], say); extra.audio = { id: a.id, name: a.name, size: a.size }; }
        await F.updateDoc(F.doc(db, "reelProjects", ref.id), { uploads: ups, candidates: ups.map(asCandidate), picks: ups.map((u) => asCandidate(u).id), ...extra, progress: "Waiting for the robot (a few minutes)" });
      }
      await queueJob(ctx, "reel", ["--project", ref.id, "--step", "find"], `Reel ${city}: find photos + clips`);
      toast("Queued - the robot looks for photos and clips (about 5 minutes)."); location.hash = "#/reels?id=" + ref.id;
    } catch (er) { say(""); toast("Stopped: " + (er.message || er), "err"); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- New AI film
function newAi(ctx) {
  const { main, toast, db, F, me } = ctx;
  main.innerHTML = `<div class="rk">${header("ai", ctx.linked)}<form id="newAi"><div class="rk-cols"><div>
    ${box(1, "Film name &amp; clips", fld("Name", `<input name="name" required maxlength="60" placeholder="Rate Robber">`,
      "Must be the same as the Google Drive folder: <b>Satu Koneksi Reels / AI clips / &lt;name&gt;</b>. Put the clips there named 01.mp4, 02.mp4 … (max 48 MB each), made in Kling / Google Veo / Hailuo / Pika with your own characters only."))}
    ${box(2, "Cue list (sounds, music changes, title, ending)", fld("One instruction per line",
      `<textarea name="cues" rows="9" placeholder="title: SATU KONEKSI PRESENTS&#10;0:00 music: villain&#10;0:02 slip&#10;0:04.5 clang&#10;0:05 music: comedy&#10;0:07 confetti&#10;0:10 splash&#10;0:15 flag&#10;end: Book at satukoneksihotel.com"></textarea>`,
      "Empty = a whoosh on every cut. Sounds: " + SFX))}
    </div><div class="side">${box("", "Assemble", fld("Music", sel("music", AI_MUSIC, "comedy"))
      + `<label class="opt"><input type="checkbox" name="keep" checked> <span>Keep the clips' own sound underneath</span></label>
      <button class="sk-btn gold big" type="submit">Assemble film</button>`, true, false)}</div></div></form></div>`;
  main.querySelector("#newAi").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), name = String(f.get("name")).trim().replace(/[\\/]/g, "-");
    const ref = await F.addDoc(F.collection(db, "reelProjects"), { kind: "ai", name, cues: String(f.get("cues") || "").slice(0, 4000), music: String(f.get("music")),
      keepSound: !!f.get("keep"), status: "queued", progress: "Waiting for the robot", createdBy: me.email, createdAt: F.serverTimestamp() });
    await queueJob(ctx, "aiclips", ["--project", ref.id], `AI film ${name}`);
    toast("Queued - the robot fetches the clips from Drive and makes the film."); location.hash = "#/reels?id=" + ref.id;
  };
}

// ---------------------------------------------------------------- Setup (settings table)
async function setup(ctx) {
  const { main, toast, db, F, me, cfg } = ctx;
  const infoSn = await F.getDoc(F.doc(db, "engines", "reels")).catch(() => null);
  const info = infoSn?.exists() ? infoSn.data() : {};
  main.innerHTML = `<div class="rk">${header("setup", ctx.linked)}<form id="setup"><div class="box"><div class="in"><table class="form-table">
    <tr><th>Google Drive link</th><td><div class="fld"><input name="driveUrl" value="${e(cfg.driveUrl || "")}" placeholder="https://script.google.com/macros/s/…/exec">
      <span class="hint">${ctx.linked ? "✅ linked." : "❌ not yet."} Apps Script (project “Satu Koneksi alerts”) → <b>Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone</b>, then paste the address here.
      The secret reels key is made here by itself and kept in the database.</span></div></td></tr>
    <tr><th>Pixabay key</th><td><div class="fld"><input name="pixabayKey" type="password" autocomplete="off" placeholder="${cfg.pixabayKey ? "set - leave empty to keep" : ""}">
      <span class="hint">${cfg.pixabayKey ? "✅ set." : "–"} Free key for real video clips: <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com/api/docs</a>. Type it yourself - never send it by chat or e-mail.</span></div></td></tr>
    <tr><th>Pexels key</th><td><div class="fld"><input name="pexelsKey" type="password" autocomplete="off" placeholder="${cfg.pexelsKey ? "set - leave empty to keep" : ""}">
      <span class="hint">${cfg.pexelsKey ? "✅ set." : "–"} Optional (Pexels has paused new keys for now): <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a>.</span></div></td></tr>
    <tr><th>Drive folders</th><td>${info.finished ? `<a href="${e(info.finished)}" target="_blank" rel="noopener">Finished films</a> · <a href="${e(info.aiclips)}" target="_blank" rel="noopener">AI clips</a> · <a href="${e(info.music)}" target="_blank" rel="noopener">Music</a> · <a href="${e(info.root)}" target="_blank" rel="noopener">Satu Koneksi Reels</a>` : "<span class='hint'>Shown after the first film.</span>"}</td></tr>
    </table><button class="sk-btn gold" type="submit">Save changes</button></div></div></form></div>`;
  main.querySelector("#setup").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), v = (k) => String(f.get(k) || "").trim();
    const url = v("driveUrl");
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) return toast("The address must look like https://script.google.com/macros/s/…/exec", "err");
    const data = { driveUrl: url, key: cfg.key || randomKey(), updatedBy: me.email, updatedAt: F.serverTimestamp() };
    if (v("pexelsKey")) data.pexelsKey = v("pexelsKey"); else if (cfg.pexelsKey) data.pexelsKey = cfg.pexelsKey;
    if (v("pixabayKey")) data.pixabayKey = v("pixabayKey"); else if (cfg.pixabayKey) data.pixabayKey = cfg.pixabayKey;
    try { await F.setDoc(F.doc(db, "engineControl", "reels"), data); toast("Saved."); reels(ctx); } catch (er) { toast(er.message, "err"); }
  };
}

// ---------------------------------------------------------------- one project (edit screen)
let timer = null;
async function project(ctx, id) {
  const { main, toast, db, F, me, cfg } = ctx;
  const sn = await F.getDoc(F.doc(db, "reelProjects", id));
  if (!sn.exists()) { main.innerHTML = `<div class="rk">${header("list", ctx.linked)}<p class="lead">Project not found. <a href="#/reels">Back</a></p></div>`; return; }
  const p = { id, ...sn.data() };
  const picks = [...(p.picks || [])];
  const outs = p.outputs || [];
  const busy = ["queued", "finding", "rendering"].includes(p.status);
  const card = (c) => {
    const n = picks.indexOf(c.id) + 1, own = c.source === "Your upload";
    return `<label class="rk-card${n ? " on" : ""}" data-c="${e(c.id)}">${c.thumb ? `<img loading="lazy" src="${e(c.thumb)}" alt="">` : `<div class="rk-ph">${c.type === "video" ? "▶" : "🖼️"}</div>`}
      ${c.type === "video" ? `<span class="rk-v">▶ ${Math.round(c.dur || 0)} s${c.fps >= 48 ? " · slow-mo" : ""}</span>` : ""}${own ? `<span class="rk-own">Yours</span>` : ""}
      <span class="rk-n">${n || ""}</span><small title="${e(c.title || "")}">${e(c.source)} · ${e((c.title || "").slice(0, 60))}</small>
      ${c.page ? `<a href="${e(c.page)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">source ↗</a>` : ""}</label>`;
  };
  const statusBox = box("", "Status", `<p>${chip(p.status)}</p><p>${e(p.progress || "")}</p>${p.plan ? `<p class="hint">🧠 ${e(p.plan)}</p>` : ""}
    ${busy ? `<p class="hint">This page refreshes by itself.</p>` : ""}
    <p class="hint">Created ${e(when(p.createdAt))} by ${e(p.createdBy || "")}</p>`
    + (p.kind === "ai" ? `<button class="sk-btn gold big" id="again" type="button" ${busy ? "disabled" : ""}>Assemble again</button>`
      : `<button class="sk-btn gold big" id="make" type="button" ${busy ? "disabled" : ""}>Make reel (<span id="cnt">${picks.length}</span> picked)</button>
         <button class="sk-btn big" id="save" type="button" style="margin-top:8px" ${busy ? "disabled" : ""}>Save settings &amp; send files</button><p class="msg" id="upMsg"></p>`), true, false);
  const filesBox = outs.length ? box("", "🎞️ Finished files", `<ul class="files" style="margin:0;padding-left:18px">${outs.map((o) => `<li><a href="${e(o.url)}" target="_blank" rel="noopener">${e(o.name.replace(/^.*?_reel_\d{4}-\d\d-\d\d_\d{4}_/, ""))}</a> <small>${mb(o.size)}</small></li>`).join("")}</ul>
    ${(p.qa || []).map((q) => `<div class="hint">${q.ok ? "✅" : "⚠️"} ${e(q.file.replace(/^.*_(4K|9x16|whatsapp)/, "$1"))} ${e((q.problems || []).join("; "))}</div>`).join("")}`, true, false) : "";
  const captionBox = p.caption ? box("", "Caption credit", `<textarea readonly rows="5" style="width:100%;font-size:12.5px">${e(p.caption)}</textarea><span class="hint">Paste it into every post.</span>`, true, false) : "";
  const title = p.kind === "ai" ? "🤖 " + p.name : "🏙️ " + p.city + (p.country ? ", " + p.country : "");
  const mainCol = p.kind === "ai"
    ? box("", "Settings", `<p>Drive folder: <b>Satu Koneksi Reels / AI clips / ${e(p.name)}</b> · music: ${e(p.music)} · clip sound: ${p.keepSound ? "kept" : "off"}</p>
      <pre style="white-space:pre-wrap;background:#faf8f4;padding:10px;border-radius:8px;margin:0">${e(p.cues || "(no cue list - whoosh on every cut)")}</pre>`, true, false)
    : box("", `Photos &amp; clips (${(p.candidates || []).length}) - click in film order: 1st = title background, last = final shot`,
      `<div class="rk-grid">${(p.candidates || []).map(card).join("") || `<p class="hint">${busy ? "The robot is still looking…" : "Nothing found."}</p>`}</div>`, true, false)
      + `<form id="sets">${cityBoxes(p, p.options || {}).replace(/<details class="box" open>/g, '<details class="box">')}</form>`;
  main.innerHTML = `<div class="rk">${header("list", ctx.linked)}<p style="margin:-6px 0 10px"><a href="#/reels">← All projects</a></p>
    <h2 style="font:800 22px 'Plus Jakarta Sans';margin:0 0 12px">${e(title)}</h2>
    <div class="rk-cols"><div>${mainCol}</div><div class="side">${statusBox}${filesBox}${captionBox}</div></div></div>`;
  const $ = (s) => main.querySelector(s);
  const ref = F.doc(db, "reelProjects", id);
  main.querySelectorAll(".rk-card").forEach((c) => (c.onclick = (ev) => {
    if (ev.target.tagName === "A") return;
    ev.preventDefault();
    const i = picks.indexOf(c.dataset.c);
    if (i >= 0) picks.splice(i, 1); else picks.push(c.dataset.c);
    main.querySelectorAll(".rk-card").forEach((x) => { const n = picks.indexOf(x.dataset.c) + 1; x.classList.toggle("on", !!n); x.querySelector(".rk-n").textContent = n || ""; });
    if ($("#cnt")) $("#cnt").textContent = picks.length;
  }));
  const saveSettings = async () => {
    const form = $("#sets"), say = (t) => ($("#upMsg").textContent = t);
    const own = [...form.own.files], aud = form.audio.files[0];
    if ((p.uploads || []).length + own.length > MAX_UPLOADS) throw new Error(`Up to ${MAX_UPLOADS} own files per film.`);
    if ((own.length || aud) && !ctx.linked) throw new Error("Set up the Google Drive link first (Reels → Setup).");
    const upd = { ...readSettings(form), picks };
    if (own.length) {
      const ups = await uploadAll(cfg, id, own, say);
      const cands = ups.map(asCandidate);
      upd.uploads = [...(p.uploads || []), ...ups];
      upd.candidates = [...cands, ...(p.candidates || [])];
      upd.picks = [...cands.map((c) => c.id), ...picks];
      picks.splice(0, picks.length, ...upd.picks);
    }
    if (aud) { const [a] = await uploadAll(cfg, id, [aud], say); upd.audio = { id: a.id, name: a.name, size: a.size }; }
    say("");
    await F.updateDoc(ref, upd);
  };
  if ($("#save")) $("#save").onclick = async () => {
    try { await saveSettings(); toast("Saved."); project(ctx, id); } catch (er) { toast(er.message || String(er), "err"); }
  };
  if ($("#rmAudio")) $("#rmAudio").onclick = async (ev) => { ev.preventDefault(); await F.updateDoc(ref, { audio: null }); toast("Your sound is no longer used (the file stays in Drive)."); project(ctx, id); };
  if ($("#make")) $("#make").onclick = async () => {
    if (picks.length < 6) return toast("Tick at least 6 (10-25 is best).", "err");
    $("#make").disabled = true;
    try {
      await saveSettings();
      await F.updateDoc(ref, { status: "queued", progress: "Waiting for the robot - the film takes about 15-60 minutes in the cloud (longer films take longer)", outputs: [], qa: [] });
      await queueJob(ctx, "reel", ["--project", id, "--step", "render"], `Reel ${p.city}: make the film (${picks.length} picks)`);
      toast("Queued - the film is made in the cloud and saved to your Google Drive."); project(ctx, id);
    } catch (er) { toast(er.message || String(er), "err"); $("#make").disabled = false; }
  };
  if ($("#again")) $("#again").onclick = async () => {
    await F.updateDoc(ref, { status: "queued", progress: "Waiting for the robot", outputs: [], qa: [] });
    await queueJob(ctx, "aiclips", ["--project", id], `AI film ${p.name} (again)`);
    toast("Queued."); project(ctx, id);
  };
  if (busy) timer = setTimeout(() => { if (location.hash.includes(id)) project(ctx, id); }, 20000);
}

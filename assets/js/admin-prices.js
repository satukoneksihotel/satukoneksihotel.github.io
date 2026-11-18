// Staff admin -> "Price rules": how the website turns the live RollingGo price into our prices (settings/prices, read by the website and the
// hotel master list engine). Normal = RollingGo + markup %, Member = Normal - member %. One % for everything, plus optional rules for a
// country, a city or a star level (the most specific rule wins: city > country, and a star level adds to either).
// Also the address of the price helper (Google Apps Script web app that asks RollingGo, so the key never sits in the website).
// Page layout: status strip, 1 how prices are worked out (with a live example), 2 default rules, 3 exceptions, 4 price helper, sticky save bar.
import { PRICE_DEFAULTS, pricesFrom } from "./prices.js";

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
const num = (v) => (v === "" || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v));
const pct = (v) => (num(v) === null ? null : Math.max(-50, Math.min(100, num(v))));
const sign = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toLocaleString("en", { maximumFractionDigits: 2 }) + "%";
const minus = (n) => (n >= 0 ? "−" : "+") + Math.abs(n).toLocaleString("en", { maximumFractionDigits: 2 }) + "%";
const HELPER_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const KEY_OK = /^[A-Za-z0-9]{16,64}$/;

const STYLE = `<style>
.pr{--pr-line:#e4e2df;display:grid;gap:18px;max-width:980px}
.pr .panel{margin:0;padding:24px 26px}
.pr-status{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 6px}
.pr-chip{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font:700 13px 'Plus Jakarta Sans',sans-serif;background:#f1efeb;color:#5b6463}
.pr-chip i{width:9px;height:9px;border-radius:50%;background:#b7b2a8}
.pr-chip.ok{background:#e4f4ea;color:#12602c}.pr-chip.ok i{background:#15803d}
.pr-chip.warn{background:#fff3d6;color:#8a6212}.pr-chip.warn i{background:#d9971a}
.pr-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}
.pr-num{flex:none;width:32px;height:32px;border-radius:50%;background:var(--gold);color:#fff;display:grid;place-items:center;font:800 15px 'Plus Jakarta Sans',sans-serif}
.pr-head h2{font:700 21px 'Playfair Display',serif;color:var(--teal2);margin:0 0 2px}
.pr-head p{margin:0;color:var(--mute);font-size:14px}
.pr-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:stretch}
.pr-box{border:1.5px solid var(--pr-line);border-radius:16px;padding:14px 16px;background:#faf8f4;min-width:0}
.pr-box small{display:block;font:800 11px 'Plus Jakarta Sans',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin-bottom:6px}
.pr-box b{display:block;font:700 22px 'Playfair Display',serif;color:var(--teal2);overflow-wrap:anywhere}
.pr-box em{display:block;font-style:normal;font-size:12.5px;color:var(--mute);margin-top:4px}
.pr-box.normal{background:#eef6f5;border-color:#b9d8d6}.pr-box.member{background:#f7f0df;border-color:#e3cf9c}
.pr-step{align-self:center;text-align:center;font:800 14px 'Plus Jakarta Sans',sans-serif;color:var(--gold);white-space:nowrap}
.pr-step:before{content:"";display:block;height:2px;background:var(--gold);opacity:.45;margin:0 4px 5px;border-radius:2px}
.pr-try{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px dashed var(--pr-line);font-size:14px;color:var(--mute)}
.pr-try input{width:170px}
.pr-note{margin-top:12px;font-size:13px;color:var(--mute);background:#faf8f4;border-radius:12px;padding:10px 14px}
.pr-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.pr label.pr-f{display:block;font:700 13px 'Plus Jakarta Sans',sans-serif;color:var(--teal2)}
.pr label.pr-f .pr-h{display:block;font-weight:500;color:var(--mute);font-size:12.5px;margin:2px 0 6px}
.pr .pr-in{display:flex;margin-top:6px;align-items:center;border:1.5px solid var(--pr-line);border-radius:12px;background:#fff;overflow:hidden}
.pr .pr-in:focus-within{border-color:var(--gold)}
.pr .pr-in input,.pr .pr-in select{border:0;outline:0;height:44px;padding:0 14px;min-width:0;flex:1;background:transparent;font:600 16px 'Plus Jakarta Sans',sans-serif}
.pr .pr-in u{text-decoration:none;padding:0 14px;color:var(--mute);font-weight:700;background:#f6f4ef;align-self:stretch;display:grid;place-items:center}
.pr .pr-in.bad{border-color:var(--red)}
.pr input.pr-plain,.pr select.pr-plain{width:100%;height:44px;border:1.5px solid var(--pr-line);border-radius:12px;padding:0 14px;background:#fff;font:600 15px 'Plus Jakarta Sans',sans-serif}
.pr input.pr-plain:focus,.pr select.pr-plain:focus{outline:0;border-color:var(--gold)}
.pr input.pr-plain.bad{border-color:var(--red)}
.pr-err{color:var(--red);font-size:12.5px;font-weight:600;margin-top:5px;min-height:0}
.pr-rules{display:grid;gap:10px}
.pr-rule{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px 12px;align-items:end;border:1.5px solid var(--pr-line);border-radius:16px;padding:14px 16px;background:#fff}
.pr-rule .c-country,.pr-rule .c-city{grid-column:span 4}.pr-rule .c-stars{grid-column:span 4}.pr-rule .c-nm,.pr-rule .c-mb{grid-column:span 3}.pr-rule .pr-res{grid-column:span 5}.pr-rule .pr-del{grid-column:span 1;width:100%;min-width:44px}
.pr-rule.bad{border-color:#f0b4ad;background:#fff8f7}
.pr-rule .pr-f span{margin-bottom:4px}
.pr-res{font-size:13.5px;line-height:1.45;color:var(--teal2);padding:0 0 4px 4px;border-left:3px solid var(--gold2);padding-left:12px;min-height:44px;display:flex;flex-direction:column;justify-content:center}.pr-res b{font-weight:800}
.pr-res small{display:block;color:var(--mute);font-size:12px}
.pr-del{border:0;background:#fdeceb;color:#b42318;border-radius:10px;height:44px;width:44px;font-size:20px;cursor:pointer}
.pr-del:hover{background:#fbd5d1}
.pr-empty{border:1.5px dashed var(--pr-line);border-radius:16px;padding:20px;text-align:center;color:var(--mute);font-size:14px}
.pr-legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 14px;font-size:13px;color:var(--mute)}
.pr-legend b{color:var(--teal2)}
.pr-row-end{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.pr details{border:1.5px solid var(--pr-line);border-radius:14px;padding:12px 16px;background:#faf8f4;margin-top:14px;font-size:14px}
.pr details summary{cursor:pointer;font-weight:700;color:var(--teal2)}
.pr details ol{margin:10px 0 2px 20px;color:var(--mute);line-height:1.7}
.pr-bar{position:sticky;bottom:0;z-index:20;margin-top:18px;max-width:980px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  background:#fff;border-radius:18px;padding:12px 18px;box-shadow:0 -6px 24px #0a2b2c1c,0 6px 22px #0a2b2c10;border:1.5px solid var(--pr-line)}
.pr-bar .st{font:700 14px 'Plus Jakarta Sans',sans-serif;color:var(--mute);display:flex;align-items:center;gap:8px}
.pr-bar .st i{width:10px;height:10px;border-radius:50%;background:#15803d}
.pr-bar.dirty{border-color:var(--gold)}.pr-bar.dirty .st{color:#8a6212}.pr-bar.dirty .st i{background:#d9971a}
.pr-bar .acts{display:flex;gap:10px;flex-wrap:wrap}
@media(max-width:860px){.pr-flow{grid-template-columns:1fr}.pr-step{padding:2px 0}.pr-step:before{display:none}.pr-step:after{content:"↓";display:block;font-size:18px}
  .pr-rule .c-country{grid-column:span 12}.pr-rule .c-city,.pr-rule .c-stars,.pr-rule .c-nm,.pr-rule .c-mb{grid-column:span 6}.pr-rule .pr-res{grid-column:span 10}.pr-rule .pr-del{grid-column:span 2}.pr .panel{padding:18px}}
</style>`;

export async function priceRules({ main, toast, db, F, me }) {
  const ref = F.doc(db, "settings", "prices");
  const snap = await F.getDoc(ref);
  const cur = { ...PRICE_DEFAULTS, helperUrl: "", ...(snap.exists() ? snap.data() : {}) };
  const keyRef = F.doc(db, "engineControl", "priceHelper");             // staff only (never in the public settings)
  const keySnap = await F.getDoc(keyRef).catch(() => null);
  const logKey0 = keySnap && keySnap.exists() ? keySnap.data().logKey || "" : "";
  let savedKey = logKey0;

  const fromDoc = () => ({
    markup: String(cur.normalMarkupPct ?? PRICE_DEFAULTS.normalMarkupPct), member: String(cur.memberDiscountPct ?? PRICE_DEFAULTS.memberDiscountPct),
    helperUrl: cur.helperUrl || "", logKey: logKey0, example: "1000000",
    rows: (cur.overrides || []).map((o) => ({ country: o.country || "", city: o.city || "", stars: String(o.stars ?? ""), markup: o.normalMarkupPct ?? "", member: o.memberDiscountPct ?? "" })),
  });
  let S = fromDoc();
  const snapshot = () => JSON.stringify({ ...S, example: "" });
  let savedSnap = snapshot();
  let savedAt = cur.updatedAt?.toDate ? cur.updatedAt.toDate() : null, savedBy = cur.updatedBy || "";

  const d0 = PRICE_DEFAULTS;
  const defM = () => pct(S.markup) ?? d0.normalMarkupPct, defB = () => pct(S.member) ?? d0.memberDiscountPct;
  const calc = (live, m, b) => (num(live) > 0 ? pricesFrom(num(live), { markup: m, member: b }) : null);
  const bad = (v) => v !== "" && (num(v) === null || num(v) < -50 || num(v) > 100);
  const scoped = (r) => !!(String(r.country).trim() || String(r.city).trim() || String(r.stars));
  const scopeText = (r) => [String(r.country).trim(), String(r.city).trim(), r.stars ? r.stars + "★" : ""].filter(Boolean).join(" · ") || "no hotel chosen";
  const when = (d) => d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";

  const ruleHtml = (r, i) => `<div class="pr-rule${scoped(r) ? "" : " bad"}" data-i="${i}">
      <label class="pr-f c-country">Country<input class="pr-plain" data-k="country" value="${e(r.country)}" placeholder="any country" maxlength="60"></label>
      <label class="pr-f c-city">City / area<input class="pr-plain" data-k="city" value="${e(r.city)}" placeholder="any city" maxlength="60"></label>
      <label class="pr-f c-stars">Stars<select class="pr-plain" data-k="stars">${["", "5", "4", "3", "2", "1"].map((s) => `<option value="${s}"${r.stars === s ? " selected" : ""}>${s ? s + " ★" : "any"}</option>`).join("")}</select></label>
      <label class="pr-f c-nm">Normal +<span class="pr-in${bad(r.markup) ? " bad" : ""}" ><input data-k="markup" type="number" step="0.5" value="${e(r.markup)}" placeholder="same"><u>%</u></span></label>
      <label class="pr-f c-mb">Member −<span class="pr-in${bad(r.member) ? " bad" : ""}" ><input data-k="member" type="number" step="0.5" value="${e(r.member)}" placeholder="same"><u>%</u></span></label>
      <div class="pr-res" data-res></div>
      <button class="pr-del" type="button" data-del="${i}" aria-label="Remove this rule" title="Remove this rule">×</button>
      ${scoped(r) ? "" : `<div class="pr-err" style="grid-column:1/-1;margin:0">Choose a country, a city or a star level, otherwise this rule is ignored.</div>`}</div>`;

  const render = () => {
    const helperOn = HELPER_OK.test(S.helperUrl.trim()), keyOn = KEY_OK.test(S.logKey.trim());
    main.innerHTML = STYLE + `<h1>💲 Price rules</h1>
    <p class="lead">How the website and the hotel master list turn the live RollingGo price into our prices. Changes apply to the whole website as soon as you save.</p>
    <div class="pr">
      <div class="pr-status" aria-live="polite">
        <span class="pr-chip ${helperOn ? "ok" : "warn"}"><i></i>${helperOn ? "Live prices on the website: ON" : "Live prices on the website: OFF (set up the helper, step 4)"}</span>
        <span class="pr-chip ${keyOn ? "ok" : ""}"><i></i>${keyOn ? "Master list learns live prices: connected" : "Master list price log: not connected"}</span>
        <span class="pr-chip" id="pr-when"><i></i>${savedAt ? "Last saved " + e(when(savedAt)) + (savedBy ? " by " + e(savedBy) : "") : "Not saved yet"}</span>
      </div>

      <section class="panel"><div class="pr-head"><span class="pr-num">1</span><div><h2>How our prices are worked out</h2>
        <p>Shown when a customer picks dates on a hotel. All prices are rounded <b>up</b> to the next Rp 1,000.</p></div></div>
        <div class="pr-flow">
          <div class="pr-box"><small>RollingGo live price</small><b id="fl-live"></b><em>per room, per night</em></div>
          <div class="pr-step" id="fl-mk"></div>
          <div class="pr-box normal"><small>Normal price</small><b id="fl-normal"></b><em>everyone sees this</em></div>
          <div class="pr-step" id="fl-mb"></div>
          <div class="pr-box member"><small>Member price (suggestion)</small><b id="fl-member"></b><em>not shown on the website: customers ask, you decide in Requests</em></div>
        </div>
        <div class="pr-try"><label for="pr-ex">Try it with a RollingGo price of</label>
          <span class="pr-in"><u>Rp</u><input id="pr-ex" type="number" min="0" step="1000" value="${e(S.example)}"></span></div>
        <div class="pr-note">⭐ <b>Member price:</b> the website no longer shows it. A signed-in customer presses "Ask for my member price" and a request arrives in <b>Requests</b>
          (marked MEMBER PRICE REQUEST, with the live price they saw); the price check and Compare Price start by themselves, and you decide the price in the quotation.
          The member % below is only a suggestion for you and the hotel master list.</div>
        <div class="pr-note">➕ <b>Special discount price</b> is separate: type it on a hotel (Admin → Hotels → open a hotel → Special discount price). The website shows it next to the live price until its end date.</div>
      </section>

      <section class="panel"><div class="pr-head"><span class="pr-num">2</span><div><h2>Default rules — all hotels</h2>
        <p>These two numbers apply to every hotel that has no exception below.</p></div></div>
        <div class="pr-fields">
          <label class="pr-f">Normal price = RollingGo plus<small class="pr-h">Your margin on the live price.</small>
            <span class="pr-in${bad(S.markup) || S.markup === "" ? " bad" : ""}" ><input data-s="markup" type="number" step="0.5" value="${e(S.markup)}"><u>%</u></span></label>
          <label class="pr-f">Member price = Normal minus<small class="pr-h">The discount for signed-in customers.</small>
            <span class="pr-in${bad(S.member) || S.member === "" ? " bad" : ""}" ><input data-s="member" type="number" step="0.5" value="${e(S.member)}"><u>%</u></span></label>
        </div><div class="pr-err" id="pr-err-def"></div>
      </section>

      <section class="panel"><div class="pr-head"><span class="pr-num">3</span><div><h2>Exceptions — country, city or star level</h2>
        <p>Optional. Use a different % for part of the range. Leave a % box empty to keep the default.</p></div></div>
        <div class="pr-legend"><span><b>City</b> beats <b>country</b></span><span>A <b>star level</b> narrows either one</span><span>Example: <b>Indonesia · Bali · 5★</b> only</span></div>
        <div class="pr-rules" id="pr-rules">${S.rows.map(ruleHtml).join("") || `<div class="pr-empty">No exceptions yet. The default % in step 2 apply to every hotel.</div>`}</div>
        <div class="pr-row-end"><button class="sk-btn sm" type="button" id="pr-add">＋ Add an exception</button>
          <span class="help" style="margin:0">${S.rows.length} exception${S.rows.length === 1 ? "" : "s"}</span></div>
      </section>

      <section class="panel"><div class="pr-head"><span class="pr-num">4</span><div><h2>Live price helper</h2>
        <p>The small web address in your Google account that asks RollingGo for the live price, so the RollingGo key never sits in the website.</p></div></div>
        <div class="pr-fields" style="grid-template-columns:1fr">
          <label class="pr-f">Helper address<small class="pr-h">Ends with /exec. Without it, hotels show "ask us for today's rate".</small>
            <input class="pr-plain${S.helperUrl.trim() && !helperOn ? " bad" : ""}" data-s="helperUrl" value="${e(S.helperUrl)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
          <label class="pr-f">Price log key<small class="pr-h">From the helper's set-up. Lets the hotel master list read the log of live checks. Staff only.</small>
            <input class="pr-plain${S.logKey.trim() && !keyOn ? " bad" : ""}" data-s="logKey" value="${e(S.logKey)}" placeholder="letters and numbers, 16–64 characters" autocomplete="off"></label>
        </div><div class="pr-err" id="pr-err-help"></div>
        <details><summary>How do I set up the helper? (once, about 10 minutes)</summary><ol>
          <li>Open <b>script.google.com</b> in your Google account, create a new project and paste the code from <code>price_apps_script/Code.gs</code>.</li>
          <li>Add your RollingGo key as the script property <code>ROLLINGGO_API_KEY</code>, then run <code>setup</code> to get the log key.</li>
          <li>Deploy as a <b>Web app</b> (Execute as: Me, Who has access: Anyone) and copy the address here.</li></ol>
          <p class="help" style="margin:8px 0 0">Full steps: <code>price_apps_script/SETUP.md</code> in the project folder.</p></details>
      </section>
    </div>
    <div class="pr-bar" id="pr-bar"><span class="st" aria-live="polite"><i></i><span id="pr-st"></span></span>
      <span class="acts"><button class="sk-btn sm" type="button" id="pr-reset">Discard changes</button><button class="sk-btn" type="button" id="pr-save">Save price rules</button></span></div>`;
    wire();
    refresh();
  };

  const q = (sel) => main.querySelector(sel);
  const refresh = () => {                          // numbers and the unsaved/saved bar - without redrawing, so typing is never interrupted
    const m = defM(), b = defB(), live = num(S.example) || 0, r = calc(live, m, b);
    q("#fl-live").textContent = live ? rp(live) : "—";
    q("#fl-mk").textContent = sign(m);
    q("#fl-mb").textContent = minus(b);
    q("#fl-normal").textContent = r ? rp(r.normal) : "—";
    q("#fl-member").textContent = r ? rp(r.member) : "—";
    main.querySelectorAll(".pr-rule").forEach((el) => {
      const row = S.rows[+el.dataset.i], mm = pct(row.markup) ?? m, bb = pct(row.member) ?? b, x = calc(live, mm, bb);
      el.querySelector("[data-res]").innerHTML = x ? `<span>Normal <b>${rp(x.normal)}</b> · Member <b>${rp(x.member)}</b></span><small>${sign(mm)} / ${minus(bb)} on ${rp(live)}</small>` : "";
    });
    const dirty = snapshot() !== savedSnap, bar = q("#pr-bar");
    bar.classList.toggle("dirty", dirty);
    q("#pr-st").textContent = dirty ? "You have unsaved changes" : "All changes saved";
    q("#pr-reset").style.display = dirty ? "" : "none";
  };

  const problems = () => {
    const out = [];
    if (S.markup === "" || bad(S.markup)) out.push("The Normal price % must be a number between −50 and 100.");
    if (S.member === "" || bad(S.member)) out.push("The Member price % must be a number between −50 and 100.");
    S.rows.forEach((r, i) => {
      if (bad(r.markup) || bad(r.member)) out.push(`Exception ${i + 1}: the % must be a number between −50 and 100.`);
      if (!scoped(r)) out.push(`Exception ${i + 1}: choose a country, a city or a star level (or remove it).`);
    });
    if (S.helperUrl.trim() && !HELPER_OK.test(S.helperUrl.trim())) out.push("The helper address must look like https://script.google.com/macros/s/…/exec");
    if (S.logKey.trim() && !KEY_OK.test(S.logKey.trim())) out.push("The price log key is the letters-and-numbers code the helper's set-up showed (16–64 characters).");
    return out;
  };

  const wire = () => {
    q("#pr-ex").oninput = (ev) => { S.example = ev.target.value; refresh(); };
    main.querySelectorAll("[data-s]").forEach((el) => {
      el.oninput = () => {
        S[el.dataset.s] = el.value;
        const k = el.dataset.s;
        if (k === "markup" || k === "member") { el.closest(".pr-in").classList.toggle("bad", el.value === "" || bad(el.value)); q("#pr-err-def").textContent = (S.markup === "" || bad(S.markup) || S.member === "" || bad(S.member)) ? "Enter a number between −50 and 100." : ""; }
        else if (k === "helperUrl") { el.classList.toggle("bad", !!el.value.trim() && !HELPER_OK.test(el.value.trim())); q("#pr-err-help").textContent = el.classList.contains("bad") ? "The address must look like https://script.google.com/macros/s/…/exec" : ""; }
        else if (k === "logKey") { el.classList.toggle("bad", !!el.value.trim() && !KEY_OK.test(el.value.trim())); q("#pr-err-help").textContent = el.classList.contains("bad") ? "The key is letters and numbers only (16–64 characters)." : ""; }
        refresh();
      };
    });
    main.querySelectorAll(".pr-rule [data-k]").forEach((el) => {
      const upd = () => { const r = S.rows[+el.closest(".pr-rule").dataset.i]; r[el.dataset.k] = el.value; if (el.type === "number") el.closest(".pr-in").classList.toggle("bad", bad(el.value)); refresh(); };
      el.oninput = upd; el.onchange = () => { upd(); if (el.dataset.k === "country" || el.dataset.k === "city" || el.dataset.k === "stars") render(); };
    });
    main.querySelectorAll("[data-del]").forEach((b) => { b.onclick = () => { S.rows.splice(+b.dataset.del, 1); render(); }; });
    q("#pr-add").onclick = () => { S.rows.push({ country: "", city: "", stars: "", markup: "", member: "" }); render(); main.querySelector(".pr-rule:last-child [data-k=country]")?.focus(); };
    q("#pr-reset").onclick = () => { S = { ...JSON.parse(savedSnap), example: S.example }; render(); toast("Changes discarded."); };
    q("#pr-save").onclick = save;
  };

  const save = async () => {
    const errs = problems();
    if (errs.length) return toast(errs[0], "err");
    const url = S.helperUrl.trim(), lk = S.logKey.trim();
    const clean = S.rows.map((o) => ({ country: String(o.country).trim().slice(0, 60), city: String(o.city).trim().slice(0, 60), stars: String(o.stars || ""),
      normalMarkupPct: pct(o.markup), memberDiscountPct: pct(o.member) })).filter((o) => (o.country || o.city || o.stars) && (o.normalMarkupPct !== null || o.memberDiscountPct !== null)).slice(0, 200);
    const d = { normalMarkupPct: pct(S.markup), memberDiscountPct: pct(S.member), overrides: clean, helperUrl: url, updatedAt: F.serverTimestamp(), updatedBy: me?.email || "" };
    const btn = q("#pr-save"); btn.disabled = true;
    try {
      await F.setDoc(ref, d);
      if (lk !== savedKey) { await F.setDoc(keyRef, { logKey: lk, updatedAt: F.serverTimestamp(), updatedBy: me?.email || "" }); savedKey = lk; }
      Object.assign(cur, d);
      S.rows = clean.map((o) => ({ country: o.country, city: o.city, stars: o.stars, markup: o.normalMarkupPct ?? "", member: o.memberDiscountPct ?? "" }));
      S.markup = String(d.normalMarkupPct); S.member = String(d.memberDiscountPct); S.helperUrl = url; S.logKey = lk;
      savedSnap = snapshot(); savedAt = new Date(); savedBy = me?.email || "";
      toast("Price rules saved - the website uses them at once.");
      render();
    } catch (er) { toast("Could not save: " + er.message, "err"); btn.disabled = false; }
  };

  render();
}

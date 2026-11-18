// Staff admin -> "Quotes": price quotes the Python quotes engine prepared for website hotel enquiries.
// MG Bedbank prices here are TRADE rates: staff only, never shown on the public website.
// Staff can add internet prices they checked by hand (Traveloka, Trip.com, Booking.com, Agoda, Hotels.com, Trivago ...),
// and the quote + reply update at once with the owner's rule. Nothing is sent to the customer from here - staff send the reply.
// The loaders are passed in, so the same code is tested with sample data (tests/quotes_ui_harness.html).

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const idr = (x) => (x == null || x === "" || isNaN(x) ? "–" : "Rp " + Math.round(Number(x)).toLocaleString("id-ID"));
const up1000 = (x) => Math.ceil(x / 1000) * 1000;
const chip = (s, kind) => `<span class="eng-chip ${kind || (/^(ok|quoted|won|sent)$/i.test(s) ? "ok" : /^(new|check|check_guests|needs_check|skipped|none)$/i.test(s) ? "warn" : "bad")}">${e(String(s).replace(/_/g, " "))}</span>`;
const STATUSES = ["new", "sent", "won", "lost", "cancelled"];
const day = (v) => { if (!v) return ""; const t = typeof v === "number" ? new Date(v) : new Date(String(v)); return isNaN(t) ? String(v).slice(0, 10) : t.toISOString().slice(0, 10); };

// ---- the owner's rule (same as sk_engines/pricing.py)
export function compute(mgTotal, internet, margin = 0.1, undercut = 0.03) {
  const prices = (internet || []).filter((p) => p && Number(p.total) > 0).map((p) => ({ source: p.source, total: Number(p.total) }));
  const cheapest = prices.length ? prices.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const out = { floor: null, cheapest: cheapest ? cheapest.total : null, cheapestSource: cheapest ? cheapest.source : "", target: cheapest ? Math.round(cheapest.total * (1 - undercut)) : null, quote: null, rule: "" };
  const m = Math.round(margin * 100), u = Math.round(undercut * 100);
  if (!mgTotal) { out.rule = "No MG rate - check MG yourself and decide the price."; return out; }
  out.floor = up1000(Number(mgTotal) * (1 + margin));
  if (!cheapest) { out.quote = out.floor; out.rule = `No internet price yet - quote our best price (MG + ${m}%).`; }
  else if (out.target > out.floor) { out.quote = up1000(out.target); out.rule = `Cheapest internet (${cheapest.source}) less ${u}% is above MG + ${m}% → quote the internet price less ${u}%.`; }
  else { out.quote = out.floor; out.rule = `Cheapest internet (${cheapest.source}) less ${u}% is at or below MG + ${m}% → we cannot go lower: quote our best price (MG + ${m}%).`; }
  return out;
}

// ---- reply text (same wording as sk_engines/quotes.py). Never mentions MG, net rates or other websites.
export function reply(q, price, room, lang, wa = "+62 895-3099-8988", site = "www.satukoneksihotel.com") {
  const first = (q.name || "").split(" ")[0];
  const g = (l) => l === "id" ? `${q.rooms} kamar, ${q.adults} dewasa${q.children ? `, ${q.children} anak` : ""}` : `${q.rooms} room${q.rooms > 1 ? "s" : ""}, ${q.adults} adult${q.adults > 1 ? "s" : ""}${q.children ? `, ${q.children} child${q.children > 1 ? "ren" : ""}` : ""}`;
  const nr = room && /non[ -]?refundable/i.test(room.refundable || "");
  const city = q.city ? ", " + q.city : "";
  if (lang === "id") {
    const b = room ? ({ Breakfast: "termasuk sarapan", "Room Only": "tanpa sarapan" }[room.board] || String(room.board || "").toLowerCase()) : "";
    const stay = `${q.checkIn} s/d ${q.checkOut} (${q.nights} malam), ${g("id")}`;
    const body = price
      ? `Halo ${first},\n\nTerima kasih atas permintaan Anda untuk ${q.hotel}${city}.\nMenginap: ${stay}\n\nHarga terbaik kami: ${idr(price)} total untuk seluruh masa menginap${room ? `\nKamar: ${room.room} (${b}${nr ? ", tidak dapat dibatalkan/refund" : ""})` : ""}\n\nHarga ini berlaku hari ini dan tergantung ketersediaan kamar. Jika Anda menginginkan penawaran yang lebih baik atau tipe kamar lain, silakan hubungi kami lewat WhatsApp ${wa} - dengan senang hati kami bantu.`
      : `Halo ${first},\n\nTerima kasih atas permintaan Anda untuk ${q.hotel}. Kami sedang mengecek harga terbaik untuk ${stay} dan akan segera mengabari Anda. Untuk respon lebih cepat, hubungi kami lewat WhatsApp ${wa}.`;
    return body + `\n\nSalam,\nSatu Koneksi Hotel\n${site}`;
  }
  const b = room ? ({ Breakfast: "breakfast included", "Room Only": "room only" }[room.board] || String(room.board || "").toLowerCase()) : "";
  const stay = `${q.checkIn} to ${q.checkOut} (${q.nights} night${q.nights !== 1 ? "s" : ""}), ${g("en")}`;
  const body = price
    ? `Hello ${first},\n\nThank you for your enquiry about ${q.hotel}${city}.\nStay: ${stay}\n\nOur best price: ${idr(price)} in total for your stay${room ? `\nRoom: ${room.room} (${b}${nr ? ", non-refundable" : ""})` : ""}\n\nThis price is valid today and depends on availability. If you would like a better deal or a different room, please contact us on WhatsApp ${wa} - we are happy to help.`
    : `Hello ${first},\n\nThank you for your enquiry about ${q.hotel}. We are checking the best price for ${stay} and will get back to you shortly. For a faster answer, contact us on WhatsApp ${wa}.`;
  return body + `\n\nBest regards,\nSatu Koneksi Hotel\n${site}`;
}

const waNum = (s) => String(s || "").replace(/[^\d]/g, "").replace(/^0/, "62");

export async function quotes({ main, list, save, toast }) {
  let all = await list();
  let open = null;
  const listView = () => {
    const rows = all.map((d) => { const q = d.request || {}, p = d.pricing || {};
      return `<tr class="row" data-id="${e(d.id)}"><td>${e(day(d.createdAt))}</td><td><b>${e(q.hotel || "–")}</b><br><small>${e(q.city || "")}</small></td><td>${e(q.checkIn || "")} → ${e(q.checkOut || "")}<br><small>${e(q.nights || 0)} night(s), ${e(q.rooms || 1)} room(s), ${e(q.adults || 0)} adult(s)</small></td><td>${e(q.name || "")}</td><td>${chip((d.mg || {}).status || d.state || "–")}</td><td><b>${idr(d.finalPrice || p.quote)}</b></td><td>${chip(d.status || "new")}</td></tr>`; }).join("");
    main.innerHTML = `<h1>💬 Quotes</h1><p class="lead">Price quotes the quotes engine prepared for hotel enquiries from the website. <b>MG prices are trade rates - staff only.</b> The reply is never sent automatically: you check it and send it yourself.</p>
      ${all.length ? `<div class="panel"><table class="t"><tr><th>Date</th><th>Hotel</th><th>Stay</th><th>Customer</th><th>MG</th><th>Quote</th><th>Status</th></tr>${rows}</table></div>`
        : `<div class="panel"><h3>No quotes yet</h3><p>When a customer sends a hotel enquiry, the PC prepares a quote here (Control Panel → <b>QUOTES: check new enquiries now</b>, or switch on the automatic check every 15 minutes).</p></div>`}`;
    main.querySelectorAll("tr.row").forEach((tr) => (tr.onclick = () => { open = all.find((d) => d.id === tr.dataset.id); detail(); }));
  };

  function detail() {
    const d = open, q = d.request || {}, mg = d.mg || {}, web = d.web || {}, rg = web.rollinggo || {}, rules = d.rules || { margin: 0.1, undercut: 0.03 };
    let manual = (d.manualPrices || []).slice();
    let mgm = d.mgManual && Number(d.mgManual.total) > 0 ? { ...d.mgManual } : null;   // MG rate typed by staff (MG asks for an e-mail code, so robots cannot log in)
    let pick = 0;                           // which MG room option the price is based on (0 = cheapest)
    let lang = d.replyLang || q.lang || "en";
    let edited = false;
    const opts = mg.options || [];
    const internet = () => [...(rg.cheapestTotalIDR ? [{ source: "RollingGo", total: rg.cheapestTotalIDR }] : []), ...manual];
    const basis = () => (mgm ? { room: mgm.room || "Room", board: mgm.board || "", refundable: mgm.refundable || "", totalIDR: Number(mgm.total) } : opts[pick] || null);
    const calc = () => compute(basis() ? basis().totalIDR : null, internet(), rules.margin, rules.undercut);
    const linksHtml = Object.entries(web.links || {}).map(([k, u]) => `<a class="sk-btn sm" target="_blank" rel="noopener" href="${e(u)}">${e(k)} ↗</a>`).join(" ");
    main.innerHTML = `<p><button class="sk-btn sm" id="back" type="button">← All quotes</button></p>
      <h1 style="margin-bottom:4px">${e(q.hotel || "Enquiry")}</h1><p class="lead">${e(q.city || "")} · ${e(q.checkIn)} → ${e(q.checkOut)} · ${e(q.nights)} night(s) · ${e(q.rooms)} room(s), ${e(q.adults)} adult(s)${q.children ? `, ${e(q.children)} child(ren)` : ""}</p>
      <div class="panel"><h3>Customer</h3><p><b>${e(q.name)}</b> · WhatsApp <a target="_blank" rel="noopener" href="https://wa.me/${waNum(q.whatsapp)}">${e(q.whatsapp)}</a>${q.email ? ` · ${e(q.email)}` : ""} · writes in ${q.lang === "id" ? "Indonesian" : "English"}</p>${q.message ? `<p class="help">“${e(q.message)}”</p>` : ""}
      ${d.state === "needs_info" ? `<p class="sk-err">${e(d.note || "")}</p>` : ""}</div>
      <div class="panel"><h3>MG Bedbank ${chip(mg.status || "–")} <small style="font-weight:400">trade rates · staff only · read ${e(mg.readAt || "")}</small></h3>
        ${(mg.notes || []).length ? `<p class="help">${(mg.notes || []).map(e).join("<br>")}</p>` : ""}
        ${opts.length ? `<table class="t"><tr><th></th><th>Room</th><th>Board</th><th>Cancel</th><th>MG total</th><th>MG + ${Math.round(rules.margin * 100)}%</th></tr>${opts.map((o, i) => `<tr><td><input type="radio" name="pick" value="${i}" ${i === pick ? "checked" : ""}></td><td>${e(o.room)}</td><td>${e(o.board)}</td><td>${e(o.refundable)}</td><td>${idr(o.totalIDR)}</td><td><b>${idr(up1000(o.totalIDR * (1 + rules.margin)))}</b></td></tr>`).join("")}</table><p class="help">Pick the room the quote is for (the cheapest is chosen first).</p>`
          : `<p>The robot could not read MG for this enquiry${mg.status === "not_logged_in" ? " (MG asks for an e-mail code at every login)" : ""} - type the MG rate below.</p>`}
        <div style="margin-top:12px;padding:12px;border:1.5px dashed var(--line);border-radius:12px"><b>MG rate typed by you</b> <small>(look it up in MG - <a target="_blank" rel="noopener" href="https://www.mgbedbank.com/home">open MG ↗</a> - for the same dates and guests)</small>
          <div class="tools" style="gap:8px;flex-wrap:wrap;margin-top:8px"><input id="gT" type="number" min="0" step="1000" placeholder="MG total for the stay (IDR)" style="max-width:220px"><input id="gR" placeholder="Room (e.g. Suite Valley View)" style="max-width:240px">
          <select id="gB"><option>Breakfast</option><option>Room Only</option></select><select id="gF"><option>Non Refundable</option><option>Refundable</option></select>
          <button class="sk-btn sm gold" id="gUse" type="button">Use this MG rate</button><button class="sk-link" id="gClr" type="button">clear</button></div><div id="gNow" class="help"></div></div>
        ${d.hotelRecord ? `<p class="help">Hotel saved in the directory: <a href="#/hotels">${e(d.hotelRecord)}</a></p>` : ""}</div>
      <div class="panel"><h3>Internet prices <small style="font-weight:400">totals for the whole stay</small></h3>
        <p><b>RollingGo</b> ${chip(rg.status || "–")} ${rg.hotelName ? `– ${e(rg.hotelName)}` : ""} ${rg.cheapestTotalIDR ? `· cheapest <b>${idr(rg.cheapestTotalIDR)}</b>` : ""} ${rg.bookingUrl ? `<a target="_blank" rel="noopener" href="${e(rg.bookingUrl)}">open ↗</a>` : ""}${rg.note ? `<br><small>${e(rg.note)}</small>` : ""}</p>
        <p class="help">Check these sites by hand (they do not allow robots) and add the cheapest price you see for the same dates and guests:</p><p>${linksHtml}</p>
        <div id="manual"></div>
        <div class="tools" style="gap:8px;flex-wrap:wrap"><input id="mSrc" placeholder="Site (e.g. Traveloka)" style="max-width:180px"><input id="mTot" type="number" min="0" step="1000" placeholder="Total for the stay (IDR)" style="max-width:220px"><input id="mNote" placeholder="Note (room, breakfast…)" style="max-width:240px"><button class="sk-btn sm gold" id="mAdd" type="button">Add price</button></div></div>
      <div class="panel" id="pricePanel"></div>
      <div class="panel"><div class="tools"><h3>Reply to the customer</h3><span class="sp"></span><button class="sk-btn sm" data-l="en" type="button">English</button><button class="sk-btn sm" data-l="id" type="button">Indonesian</button><button class="sk-btn sm" id="rebuild" type="button">Rebuild from price</button></div>
        <textarea id="reply" rows="13" style="width:100%;font:14px/1.55 'Plus Jakarta Sans',sans-serif;border:1.5px solid var(--line);border-radius:12px;padding:12px"></textarea>
        <div class="tools" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="sk-btn sm" id="copy" type="button">Copy reply</button><a class="sk-btn sm gold" id="wa" target="_blank" rel="noopener">Open WhatsApp with this reply ↗</a></div></div>
      <div class="panel"><h3>Result</h3><div class="tools" style="gap:10px;flex-wrap:wrap"><label>Status <select id="st">${STATUSES.map((s) => `<option ${s === (d.status || "new") ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>Final price (IDR) <input id="fp" type="number" min="0" step="1000" value="${e(d.finalPrice ?? "")}" style="max-width:200px"></label></div>
        <textarea id="note" rows="3" placeholder="Staff note (only staff see this)" style="width:100%;margin-top:10px;border:1.5px solid var(--line);border-radius:12px;padding:10px">${e(d.staffNote || "")}</textarea>
        <p><button class="sk-btn gold" id="saveQ" type="button">Save</button></p></div>`;
    const $ = (s) => main.querySelector(s);
    const drawManual = () => { $("#manual").innerHTML = manual.length ? `<table class="t"><tr><th>Site</th><th>Total</th><th>Note</th><th></th></tr>${manual.map((m, i) => `<tr><td>${e(m.source)}</td><td>${idr(m.total)}</td><td>${e(m.note || "")}</td><td><button class="sk-link" data-del="${i}" type="button">remove</button></td></tr>`).join("")}</table>` : "";
      main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { manual.splice(+b.dataset.del, 1); refresh(); })); };
    const refresh = () => {
      const p = calc();
      $("#pricePanel").innerHTML = `<h3>Our price</h3><div class="tiles q-tiles"><div class="tile"><span>Best price (MG + ${Math.round(rules.margin * 100)}%)</span><b style="font-size:24px">${idr(p.floor)}</b><small>the lowest we may offer</small></div>
        <div class="tile"><span>Cheapest internet</span><b style="font-size:24px">${idr(p.cheapest)}</b><small>${e(p.cheapestSource || "none yet")}</small></div>
        <div class="tile"><span>Internet less ${Math.round(rules.undercut * 100)}%</span><b style="font-size:24px">${idr(p.target)}</b></div>
        <div class="tile hot"><span>QUOTE</span><b style="font-size:26px">${idr(p.quote)}</b></div></div><p class="help">${e(p.rule)}</p>`;
      drawManual();
      $("#gNow").innerHTML = mgm ? `Using <b>${idr(mgm.total)}</b> (${e(mgm.room || "Room")}, ${e(mgm.board || "")}, ${e(mgm.refundable || "")}) typed by you${mgm.date ? " on " + e(mgm.date) : ""}.` : (opts.length ? "Using the MG price the robot read (pick a room above)." : "No MG rate yet - type it above to get the quote.");
      if (!edited) $("#reply").value = reply(q, p.quote, basis(), lang);
      $("#wa").href = `https://wa.me/${waNum(q.whatsapp)}?text=${encodeURIComponent($("#reply").value)}`;
    };
    if (d.replyText) { $("#reply").value = d.replyText; edited = true; }
    refresh();
    $("#back").onclick = () => { open = null; listView(); };
    if (mgm) { $("#gT").value = mgm.total; $("#gR").value = mgm.room || ""; $("#gB").value = mgm.board || "Breakfast"; $("#gF").value = mgm.refundable || "Non Refundable"; }
    $("#gUse").onclick = () => { const t = Number($("#gT").value); if (!(t > 0)) return toast("Type the MG total for the whole stay.", "err");
      mgm = { total: Math.round(t), room: $("#gR").value.trim().slice(0, 80), board: $("#gB").value, refundable: $("#gF").value, date: new Date().toISOString().slice(0, 10) }; edited = false; refresh(); toast("MG rate used - press Save to keep it."); };
    $("#gClr").onclick = () => { mgm = null; $("#gT").value = ""; $("#gR").value = ""; edited = false; refresh(); };
    main.querySelectorAll("input[name=pick]").forEach((r) => (r.onchange = () => { pick = +r.value; edited = false; refresh(); }));
    main.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { lang = b.dataset.l; edited = false; refresh(); }));
    $("#rebuild").onclick = () => { edited = false; refresh(); };
    $("#reply").oninput = () => { edited = true; $("#wa").href = `https://wa.me/${waNum(q.whatsapp)}?text=${encodeURIComponent($("#reply").value)}`; };
    $("#mAdd").onclick = () => { const src = $("#mSrc").value.trim(), tot = Number($("#mTot").value);
      if (!src || !(tot > 0)) return toast("Type the site and the total price for the whole stay.", "err");
      if (manual.length >= 20) return toast("Up to 20 prices.", "err");
      manual.push({ source: src.slice(0, 40), total: Math.round(tot), note: $("#mNote").value.trim().slice(0, 120), date: new Date().toISOString().slice(0, 10) });
      $("#mSrc").value = $("#mTot").value = $("#mNote").value = ""; edited = false; refresh(); };
    $("#copy").onclick = async () => { try { await navigator.clipboard.writeText($("#reply").value); toast("Reply copied."); } catch { toast("Could not copy - select the text and copy it.", "err"); } };
    $("#saveQ").onclick = async () => {
      const fp = $("#fp").value ? Math.round(Number($("#fp").value)) : null;
      const upd = { manualPrices: manual, mgManual: mgm, status: $("#st").value, staffNote: $("#note").value.slice(0, 1000), finalPrice: fp, replyText: $("#reply").value.slice(0, 4000) };
      try { await save(d.id, upd); Object.assign(d, upd); toast("Saved."); } catch (er) { toast("Could not save: " + (er.message || er), "err"); }
    };
  }
  listView();
}

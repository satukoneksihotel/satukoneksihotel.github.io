// Staff admin -> "Sales desk": finding companies and partners ourselves instead of waiting for them.
// A list of prospects (companies, event and wedding organisers, travel agents) with the next follow-up date, the ready-made
// first message and the five questions to ask, a daily routine, and a profit calculator. Staff only (prospects/*).
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const rp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

export const SEGMENTS = { sme: "Company (staff travel, projects)", event: "Event / training organiser", wedding: "Wedding planner", agent: "Travel agent / tour operator", venue: "Venue / conference place", other: "Other" };
export const FOUND = { linkedin: "LinkedIn", maps: "Google Maps / directory", website: "Company website", referral: "Introduced by someone", event: "Networking event", network: "Own contacts", other: "Other" };
export const STAGES = { todo: ["To contact", "#64748b"], contacted: ["Contacted", "#b38d40"], replied: ["Replied", "#2563eb"], quoting: ["Quoting", "#c2410c"],
  won: ["Customer", "#15803d"], lost: ["Not now", "#9ca3af"] };
export const QUESTIONS = [
  "How many hotel room nights does your company need per month (roughly)?",
  "Which cities do you use most?",
  "How do you book now: online sites, a travel agent, or directly with hotels?",
  "What is the biggest problem now: price, availability, paperwork, invoices or changes?",
  "Would you add one more supplier if we solve that problem?",
];
const FIRST_MSG = {
  en: `Hi [Name],

I'm [your name] from Satu Koneksi Hotel, a hotel reservation service for companies and travellers.

We help companies find suitable hotels for staff travel, visiting guests, project teams and group stays - one contact for quotations, rooming lists and changes.

If your company sometimes needs hotel rooms, may I prepare a quotation for your next stay? There is no obligation to book.

May I know who handles hotel bookings in your company?

Thank you.
Satu Koneksi Hotel · www.satukoneksihotel.com/corporate`,
  id: `Halo Bapak/Ibu [Nama],

Saya [nama Anda] dari Satu Koneksi Hotel, layanan reservasi hotel untuk perusahaan dan wisatawan.

Kami membantu perusahaan mencari hotel yang cocok untuk perjalanan dinas staf, tamu perusahaan, tim proyek, dan rombongan - satu kontak untuk penawaran, daftar kamar (rooming list), dan perubahan.

Jika perusahaan Bapak/Ibu sesekali memerlukan kamar hotel, bolehkah kami siapkan penawaran untuk kebutuhan berikutnya? Tidak ada kewajiban untuk memesan.

Boleh saya tahu siapa yang mengurus pemesanan hotel di perusahaan Bapak/Ibu?

Terima kasih.
Satu Koneksi Hotel · www.satukoneksihotel.com/id/corporate`,
};
const ROUTINE = [["Find and check new companies or partners", "10"], ["Send a personal first message", "10"], ["Follow up earlier contacts", "5"],
  ["Prepare or follow up quotations", "2-5"], ["Improve one sales item (case story, price list, photo)", "1"]];

// The profit of one month (the planning calculator). Pure, so it can be tested.
export function monthPlan({ bookings, value, pct, serve, cac, fixed }) {
  const gross = bookings * value * (pct / 100);
  const perBooking = value * (pct / 100) - serve - cac;
  return { gross: Math.round(gross), perBooking: Math.round(perBooking), month: Math.round(bookings * perBooking - fixed),
    breakEven: perBooking > 0 ? Math.ceil(fixed / perBooking) : null };
}

export async function sales({ main, toast, db, F, me }) {
  const col = F.collection(db, "prospects");
  let all = (await F.getDocs(F.query(col, F.orderBy("updatedAt", "desc"), F.limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const t = today();

  const due = () => all.filter((p) => p.nextFollowUp && p.nextFollowUp <= t && !["won", "lost"].includes(p.stage));
  const chip = (s) => { const x = STAGES[s] || STAGES.todo; return `<span class="eng-chip" style="background:${x[1]};color:#fff">${e(x[0])}</span>`; };
  const table = (list) => list.length ? `<table class="t"><tr><th>Company</th><th>Contact</th><th>Type</th><th>Stage</th><th>Next follow-up</th><th>Room nights / month</th></tr>${list.map((p) => `
    <tr class="row" data-p="${e(p.id)}" style="cursor:pointer"><td><b>${e(p.company)}</b><br><small>${e(p.city || "")}</small></td>
    <td>${e(p.contact || "—")}<br><small>${e(p.role || "")}</small></td><td><small>${e(SEGMENTS[p.segment] || "—")}</small></td><td>${chip(p.stage)}</td>
    <td>${e(p.nextFollowUp || "—")}${p.nextFollowUp && p.nextFollowUp <= t && !["won", "lost"].includes(p.stage) ? ' <small style="color:#b42318;font-weight:700">due</small>' : ""}</td>
    <td>${p.nights ?? "—"}</td></tr>`).join("")}</table>` : `<p class="lead">No prospects yet. Click <b>＋ Add a prospect</b>.</p>`;

  const draw = () => {
    const counts = Object.keys(STAGES).map((k) => `${STAGES[k][0]}: <b>${all.filter((p) => (p.stage || "todo") === k).length}</b>`).join(" · ");
    const nightsWon = all.filter((p) => p.stage === "won").reduce((a, p) => a + (Number(p.nights) || 0), 0);
    const addedToday = all.filter((p) => String(p.createdDay || "") === t).length, touchedToday = all.filter((p) => String(p.touchedDay || "") === t).length;
    main.innerHTML = `<h1 style="font:800 30px 'Plus Jakarta Sans'">🤝 Sales desk</h1>
    <p class="lead">Find companies and partners ourselves - do not only wait for them. Keep each one here with the next follow-up date.</p>
    ${due().length ? `<div class="panel" style="border-left:4px solid #b42318"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">⏰ Follow up today (${due().length})</h3>${table(due())}</div>` : ""}
    <div class="panel"><div class="tools"><input id="pq" type="search" placeholder="Search company, contact, city…" style="min-width:220px">
      <select id="pst"><option value="">All stages</option>${Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${e(v[0])}</option>`).join("")}</select>
      <select id="pseg"><option value="">All types</option>${Object.entries(SEGMENTS).map(([k, v]) => `<option value="${k}">${e(v)}</option>`).join("")}</select>
      <span class="sp"></span><button class="sk-btn sm" id="pcsv" type="button">⬇ Export to Excel</button><button class="sk-btn sm gold" id="padd" type="button">＋ Add a prospect</button></div>
      <p class="help">${counts} · Room nights a month from customers won: <b>${nightsWon}</b> · Today: <b>${addedToday}</b> added, <b>${touchedToday}</b> updated (target 10 + 5).</p>
      <div id="ptb"></div></div>
    <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">📅 Daily routine (a target, not a promise)</h3>
      <table class="t"><tr><th>Every working day</th><th>How many</th></tr>${ROUTINE.map(([a, n]) => `<tr><td>${e(a)}</td><td><b>${e(n)}</b></td></tr>`).join("")}</table>
      <p class="help">Where to find them: LinkedIn (admin, HR, purchasing, office managers, event people), Google Maps and business directories in one city first (e.g. Jakarta),
      company websites (branches, projects, events), event venues, business associations, and introductions from people you know. Personalise each first message; never send hundreds of the same message.</p></div>
    <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">✉️ First message</h3>
      <div class="row2">${["en", "id"].map((l) => `<div><b>${l === "en" ? "English" : "Bahasa Indonesia"}</b><textarea id="msg_${l}" rows="15" style="width:100%;margin-top:6px">${e(FIRST_MSG[l])}</textarea>
      <button class="sk-btn sm" type="button" data-copy="msg_${l}">📋 Copy</button></div>`).join("")}</div>
      <p class="help">The aim of the first message is not to sell at once: find the person who books hotels, learn how they book now, and get the chance to quote.</p></div>
    <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">❓ Five questions to ask (write the answers in the prospect)</h3>
      <ol style="margin:0;padding-left:20px">${QUESTIONS.map((q) => `<li>${e(q)}</li>`).join("")}</ol>
      <p class="help">A company with a clear, repeating need is worth more than one that only agrees to receive a brochure. Offer company credit only after checking the company can pay.</p></div>
    <div class="panel"><h3 style="font:700 20px 'Plus Jakarta Sans';margin-bottom:8px">🧮 Monthly profit calculator (planning only)</h3>
      <div class="row3" id="calc">
        <label>Bookings a month<input type="number" min="0" name="bookings" value="60"></label>
        <label>Average booking value (Rp)<input type="number" min="0" step="50000" name="value" value="2000000"></label>
        <label>Margin or commission kept (%)<input type="number" min="0" max="100" step="0.5" name="pct" value="10"></label>
        <label>Service cost per booking (Rp)<input type="number" min="0" step="5000" name="serve" value="40000"></label>
        <label>Advertising cost per booking (Rp)<input type="number" min="0" step="5000" name="cac" value="50000"></label>
        <label>Fixed cost a month (Rp)<input type="number" min="0" step="250000" name="fixed" value="3000000"></label></div>
      <p id="calcOut" style="font-size:16px;margin-top:8px"></p>
      <p class="help">Before tax and unusual losses. Use the real margin from the 🔒 supplier fields of your requests. A booking from free posts and one from paid ads are not equally profitable.</p></div>`;
    const list = () => {
      const q = (main.querySelector("#pq").value || "").toLowerCase(), st = main.querySelector("#pst").value, sg = main.querySelector("#pseg").value;
      const l = all.filter((p) => (!st || (p.stage || "todo") === st) && (!sg || p.segment === sg) && (!q || [p.company, p.contact, p.city, p.notes].join(" ").toLowerCase().includes(q)));
      main.querySelector("#ptb").innerHTML = table(l); bind();
    };
    ["pq", "pst", "pseg"].forEach((i) => { main.querySelector("#" + i).oninput = list; });
    main.querySelector("#padd").onclick = () => edit({});
    main.querySelector("#pcsv").onclick = () => csv();
    main.querySelectorAll("[data-copy]").forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(main.querySelector("#" + b.dataset.copy).value); toast("Copied."); } catch { toast("Select the text and copy it.", "err"); } }; });
    const calc = () => {
      const v = Object.fromEntries([...main.querySelectorAll("#calc input")].map((i) => [i.name, Number(i.value) || 0]));
      const r = monthPlan(v);
      main.querySelector("#calcOut").innerHTML = `Margin a month: <b>${rp(r.gross)}</b> · Left per booking after costs: <b>${rp(r.perBooking)}</b><br>
        Result a month after fixed cost: <b style="color:${r.month < 0 ? "#b42318" : "#15803d"}">${rp(r.month)}</b>${r.breakEven != null ? ` · Bookings needed to cover the fixed cost: <b>${r.breakEven}</b>` : " · Each booking loses money - raise the margin or cut the costs."}`;
    };
    main.querySelectorAll("#calc input").forEach((i) => { i.oninput = calc; }); calc();
    list();
  };
  const bind = () => main.querySelectorAll("tr[data-p]").forEach((tr) => { tr.onclick = () => edit(all.find((p) => p.id === tr.dataset.p)); });

  const csv = () => {
    const cols = ["company", "contact", "role", "phone", "email", "city", "segment", "found", "stage", "nextFollowUp", "nights", "q1", "q2", "q3", "q4", "q5", "notes"];
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const text = "﻿" + [cols.join(","), ...all.map((p) => cols.map((c) => q(c === "segment" ? SEGMENTS[p[c]] : c === "found" ? FOUND[p[c]] : c === "stage" ? (STAGES[p[c]] || [""])[0] : p[c])).join(","))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `prospects-${t}.csv`; a.click();
  };

  function edit(p) {
    const opt = (o, v) => Object.entries(o).map(([k, x]) => `<option value="${k}"${v === k ? " selected" : ""}>${e(Array.isArray(x) ? x[0] : x)}</option>`).join("");
    const box = document.createElement("div");
    box.className = "sk-modal-bg";
    box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:grid;place-items:center;padding:16px";
    box.innerHTML = `<form class="panel" style="max-width:760px;width:100%;max-height:92vh;overflow:auto;margin:0">
      <h3 style="font:700 22px 'Plus Jakarta Sans';margin-bottom:10px">${p.id ? "Prospect" : "New prospect"}</h3>
      <div class="row2"><label>Company *<input name="company" required minlength="2" maxlength="120" value="${e(p.company)}"></label>
        <label>City<input name="city" maxlength="80" value="${e(p.city)}" placeholder="Jakarta"></label></div>
      <div class="row3"><label>Contact person<input name="contact" maxlength="100" value="${e(p.contact)}"></label>
        <label>Job title<input name="role" maxlength="80" value="${e(p.role)}" placeholder="HR / admin / purchasing"></label>
        <label>WhatsApp / phone<input name="phone" maxlength="30" value="${e(p.phone)}"></label></div>
      <div class="row3"><label>E-mail<input name="email" type="email" maxlength="120" value="${e(p.email)}"></label>
        <label>Type<select name="segment">${opt(SEGMENTS, p.segment || "sme")}</select></label>
        <label>Found through<select name="found">${opt(FOUND, p.found || "linkedin")}</select></label></div>
      <div class="row3"><label>Stage<select name="stage">${opt(STAGES, p.stage || "todo")}</select></label>
        <label>Next follow-up<input name="nextFollowUp" type="date" value="${e(p.nextFollowUp || plus(t, 3))}"></label>
        <label>Room nights a month (estimate)<input name="nights" type="number" min="0" max="100000" value="${p.nights ?? ""}"></label></div>
      ${QUESTIONS.map((q, i) => `<label>${i + 1}. ${e(q)}<input name="q${i + 1}" maxlength="300" value="${e(p["q" + (i + 1)])}"></label>`).join("")}
      <label>Notes<textarea name="notes" rows="4" maxlength="2000">${e(p.notes)}</textarea></label>
      <p class="help">Only business contact details the person gave or published for work. Do not keep passport or private data here.</p>
      <div class="tools" style="margin-top:10px">${p.id ? `<button class="sk-btn sm line" type="button" id="pdel">Delete</button>` : ""}<span class="sp"></span>
        <button class="sk-btn sm line" type="button" id="pcancel">Cancel</button><button class="sk-btn sm gold" type="submit">Save</button></div></form>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.querySelector("#pcancel").onclick = close;
    box.onclick = (ev) => { if (ev.target === box) close(); };
    if (p.id) box.querySelector("#pdel").onclick = async () => {
      if (!confirm(`Delete ${p.company}?`)) return;
      try { await F.deleteDoc(F.doc(db, "prospects", p.id)); all = all.filter((x) => x.id !== p.id); close(); draw(); toast("Deleted."); } catch (err) { toast(err.message, "err"); }
    };
    box.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target), s = (k, n) => String(f.get(k) || "").trim().slice(0, n);
      const d = { company: s("company", 120), city: s("city", 80), contact: s("contact", 100), role: s("role", 80), phone: s("phone", 30), email: s("email", 120),
        segment: s("segment", 20), found: s("found", 20), stage: s("stage", 20), nextFollowUp: s("nextFollowUp", 10),
        nights: f.get("nights") === "" ? null : Math.max(0, Math.min(100000, Math.round(Number(f.get("nights")) || 0))), notes: s("notes", 2000),
        ...Object.fromEntries(QUESTIONS.map((_, i) => ["q" + (i + 1), s("q" + (i + 1), 300)])),
        touchedDay: t, updatedBy: me?.email || "", updatedAt: F.serverTimestamp() };
      try {
        if (p.id) { await F.updateDoc(F.doc(db, "prospects", p.id), d); Object.assign(all.find((x) => x.id === p.id), d, { updatedAt: new Date() }); }
        else {
          const ref = await F.addDoc(col, { ...d, createdDay: t, createdBy: me?.email || "", createdAt: F.serverTimestamp() });
          all.unshift({ id: ref.id, ...d, createdDay: t, updatedAt: new Date() });
        }
        close(); draw(); toast("Saved.");
      } catch (err) { toast(err.message, "err"); }
    };
  }
  draw();
}

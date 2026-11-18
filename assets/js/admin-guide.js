// Satu Koneksi Hotel - Admin request window helpers for the booking desk (the simple SOP, built into the screen):
//   guideBox(r)    "What to do now" box at the top of a request: the step it is at, the 2-4 things to do, which button to press
//   replyPicker()  the standard replies (admin-replies.json) filled with the customer's details: WhatsApp, copy, or account reply
import { esc, waLink, toast, WA_DEFAULT, F, db, auth, slipFromFile } from "./sk-core.js";

const STEPS = ["Request", "Quotation", "Agrees", "Payment", "Voucher", "Stay"];
// status -> [step number, what to do (EN), what to do (ID), replies to suggest]
const NOW = {
  new: [1, ["Check the request has dates, guests and rooms.", "Reply within 30 minutes: Standard replies → <b>R01</b> (details complete) or <b>R02</b> (details missing).", "Fill <b>Assigned to</b> and <b>Next follow-up</b>, then <b>Save</b>."],
    ["Cek permintaan sudah ada tanggal, tamu dan kamar.", "Balas dalam 30 menit: Standard replies → <b>R01</b> (data lengkap) atau <b>R02</b> (data kurang).", "Isi <b>Assigned to</b> dan <b>Next follow-up</b>, lalu <b>Save</b>."], ["R01", "R02", "R35", "R03", "R04"]],
  contacted: [2, ["Read <b>Price check</b> / <b>Compare Price</b> below (or start one in Compare Price).", "Check the same room at <b>MG Bedbank</b> and <b>WebBeds</b>; type supplier and cost in the 🔒 Supplier block.", "Type the customer <b>total</b>, <b>Pay before</b> and the details, then <b>Save</b>.", "Send the quotation: <b>R05</b> (one option) or <b>R06</b> (2-3 options)."],
    ["Baca <b>Price check</b> / <b>Compare Price</b> di bawah (atau jalankan Compare Price).", "Cek kamar yang sama di <b>MG Bedbank</b> dan <b>WebBeds</b>; isi supplier dan harga di blok 🔒 Supplier.", "Isi <b>total</b> pelanggan, <b>Pay before</b> dan detailnya, lalu <b>Save</b>.", "Kirim penawaran: <b>R05</b> (satu pilihan) atau <b>R06</b> (2-3 pilihan)."], ["R05", "R06", "R36", "R07", "R08", "R10"]],
  quoted: [2, ["Wait for the customer to agree.", "No answer? Follow up with <b>R09</b> before <b>Pay before</b>.", "Price or room changed? Send <b>R13</b> with the new price."],
    ["Tunggu pelanggan setuju.", "Belum dibalas? Follow-up dengan <b>R09</b> sebelum <b>Pay before</b>.", "Harga atau kamar berubah? Kirim <b>R13</b> dengan harga baru."], ["R09", "R13", "R36", "R07"]],
  accepted: [3, ["Ask for the guest names <b>exactly as on the KTP / passport</b> (<b>R11</b>), then read them back (<b>R12</b>).", "Re-check the price and room at the supplier now.", "Type the <b>bank details</b>, Save, and send <b>R14</b> (or 🏦 Bank details)."],
    ["Minta nama tamu <b>persis seperti di KTP / paspor</b> (<b>R11</b>), lalu bacakan ulang (<b>R12</b>).", "Cek ulang harga dan kamar di supplier sekarang.", "Isi <b>rekening bank</b>, Save, lalu kirim <b>R14</b> (atau 🏦 Bank details)."], ["R11", "R12", "R38", "R14", "R13", "R15"]],
  paymentSent: [4, ["Open the transfer slip below. Within 1 hour, check the money is <b>really in the bank account</b> (mutation).", "Money in and the amount is right → press <b>✓ Payment received – confirm booking</b>, then send <b>R17</b>.", "Not found → <b>R18</b>. Less than the total → <b>R19</b>. More → <b>R20</b>."],
    ["Buka bukti transfer di bawah. Dalam 1 jam, cek dana <b>benar-benar masuk rekening</b> (mutasi).", "Dana masuk dan jumlahnya benar → tekan <b>✓ Payment received – confirm booking</b>, lalu kirim <b>R17</b>.", "Tidak ditemukan → <b>R18</b>. Kurang → <b>R19</b>. Lebih → <b>R20</b>."], ["R16", "R37", "R17", "R18", "R19", "R20"]],
  confirmed: [5, ["Book at <b>MG Bedbank</b> / <b>WebBeds</b> with the names exactly as on the ID; type the <b>Supplier confirmation no.</b>", "Find the voucher in <b>satukoneksihotel@gmail.com</b> and check name, hotel, dates, room, meals, cancellation. Wrong → ask the supplier to correct it first.", "Type the hotel confirmation no. in <b>Confirmation details</b>, Save; send the voucher by WhatsApp + e-mail with <b>R21</b>.", "48 hours before arrival: reconfirm with the hotel and send <b>R23</b>."],
    ["Pesan di <b>MG Bedbank</b> / <b>WebBeds</b> dengan nama persis seperti identitas; isi <b>Supplier confirmation no.</b>", "Cari voucher di <b>satukoneksihotel@gmail.com</b>, cek nama, hotel, tanggal, kamar, makan, pembatalan. Salah → minta supplier memperbaiki dulu.", "Isi no. konfirmasi hotel di <b>Confirmation details</b>, Save; kirim voucher via WhatsApp + e-mail dengan <b>R21</b>.", "48 jam sebelum tiba: konfirmasi ulang ke hotel dan kirim <b>R23</b>."], ["R39", "R21", "R41", "R22", "R23", "R28"]],
  completed: [6, ["Send the thank-you and review request (<b>R24</b>). Nothing else to do."], ["Kirim ucapan terima kasih dan minta ulasan (<b>R24</b>). Selesai."], ["R24"]],
  cancelled: [0, ["If it was booked: cancel at the supplier <b>first</b> and keep the cancellation number.", "Refund only with the owner's OK; send <b>R25</b> or <b>R26</b>, and <b>R32</b> when the money is sent."],
    ["Jika sudah dipesan: batalkan di supplier <b>dulu</b> dan simpan nomor pembatalannya.", "Refund hanya dengan izin owner; kirim <b>R25</b> atau <b>R26</b>, dan <b>R32</b> setelah dana dikirim."], ["R25", "R26", "R32"]],
};

export function guideBox(r) {
  const [step, en, idn] = NOW[r.status] || NOW.new;
  const bar = STEPS.map((s, i) => `<span class="gd-st${i + 1 < step ? " done" : i + 1 === step ? " on" : ""}">${i + 1}. ${s}</span>`).join("");
  const list = (arr) => `<ol>${arr.map((x) => `<li>${x}</li>`).join("")}</ol>`;
  return `<div class="gd" id="guide"><div class="gd-hd"><b>👉 What to do now</b><span>${step ? `Step ${step} of 6` : "Cancelled"}</span></div>
    <div class="gd-bar">${bar}</div>
    <div class="gd-cols"><div>${list(en)}</div><div class="gd-id">${list(idn)}</div></div>
    <p class="gd-ft">Full procedure: the Booking Desk SOP. Replies R01–R41 are under <a href="#replies">Standard replies</a>.</p></div>`;
}

let LIB = null;
async function library() {
  if (!LIB) LIB = fetch("/assets/js/admin-replies.json", { cache: "no-cache" }).then((x) => x.json()).catch(() => ({ stages: [], replies: [] }));
  return LIB;
}

// {name} {hotel} ... -> the customer's own details (form values typed but not yet saved count too). Languages: en, id, zh, th, ko.
const LOC = { en: "en-GB", id: "id-ID", zh: "zh-CN", th: "th-TH-u-ca-gregory", ko: "ko-KR" };
const WORDS = {   // [night, nights, adult(s) fn, child(ren) fn, room(s) fn, placeholders]
  en: { night: (n) => `${n} ${n === 1 ? "night" : "nights"}`, adults: (n) => `${n} ${n === 1 ? "adult" : "adults"}`, kids: (n) => `${n} ${n === 1 ? "child" : "children"}`, rooms: (n) => `${n} ${n === 1 ? "room" : "rooms"}`,
    dates: "[dates]", guests: "[guests]", name: "[name]", hotel: "[hotel]", payBy: "[date, time]", bank: "[Bank · Account number · Account name]", guest: "[NAME AS ON ID]", no: "[request no.]" },
  id: { night: (n) => `${n} malam`, adults: (n) => `${n} dewasa`, kids: (n) => `${n} anak`, rooms: (n) => `${n} kamar`,
    dates: "[tanggal]", guests: "[tamu]", name: "[nama]", hotel: "[hotel]", payBy: "[tanggal, jam]", bank: "[Bank · Nomor rekening · Nama pemilik]", guest: "[NAMA SESUAI IDENTITAS]", no: "[no. permintaan]" },
  zh: { night: (n) => `${n} 晚`, adults: (n) => `${n} 位成人`, kids: (n) => `${n} 位儿童`, rooms: (n) => `${n} 间房`,
    dates: "[日期]", guests: "[人数]", name: "[姓名]", hotel: "[酒店]", payBy: "[日期、时间]", bank: "[银行 · 账号 · 户名]", guest: "[证件上的姓名]", no: "[请求编号]" },
  th: { night: (n) => `${n} คืน`, adults: (n) => `ผู้ใหญ่ ${n} ท่าน`, kids: (n) => `เด็ก ${n} คน`, rooms: (n) => `${n} ห้อง`,
    dates: "[วันที่]", guests: "[ผู้เข้าพัก]", name: "[ชื่อ]", hotel: "[โรงแรม]", payBy: "[วันที่ เวลา]", bank: "[ธนาคาร · เลขบัญชี · ชื่อบัญชี]", guest: "[ชื่อตามบัตร]", no: "[เลขคำขอ]" },
  ko: { night: (n) => `${n}박`, adults: (n) => `성인 ${n}명`, kids: (n) => `어린이 ${n}명`, rooms: (n) => `객실 ${n}개`,
    dates: "[날짜]", guests: "[인원]", name: "[이름]", hotel: "[호텔]", payBy: "[날짜, 시간]", bank: "[은행 · 계좌번호 · 예금주]", guest: "[신분증상 이름]", no: "[요청 번호]" },
};
export const LANGS = [["en", "EN"], ["id", "ID"], ["zh", "中文"], ["th", "ไทย"], ["ko", "한국어"]];
export function fillReply(text, r, f, lang) {
  const L = WORDS[lang] || WORDS.en;
  const rp = (n) => (Number(n) > 0 ? "Rp " + Math.round(Number(n)).toLocaleString("id-ID") : "Rp [total]");
  const day = (d) => { const t = new Date(String(d).slice(0, 10) + "T12:00:00"); return d && !isNaN(t) ? t.toLocaleDateString(LOC[lang] || "en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; };
  const nights = r.checkIn && r.checkOut ? Math.round((new Date(r.checkOut) - new Date(r.checkIn)) / 864e5) : 0;
  const dates = r.checkIn ? `${day(r.checkIn)}${r.checkOut ? " – " + day(r.checkOut) : ""}${nights ? ` (${L.night(nights)})` : ""}` : L.dates;
  const a = r.adults ?? 0, c = r.children ?? 0, rm = r.rooms ?? 1;
  const guests = a ? `${L.adults(a)}${c ? `, ${L.kids(c)}` : ""}` : L.guests;
  const wa = String(WA_DEFAULT).replace(/^62(\d{3})(\d{4})(\d+)$/, "+62 $1-$2-$3");
  const v = {
    name: String(r.name || "").trim().split(/\s+/)[0] || L.name,
    hotel: r.refName ? r.refName + (r.city || r.refCity ? `, ${r.city || r.refCity}` : "") : L.hotel,
    city: r.city || r.refCity || "[city]", dates, checkin: day(r.checkIn) || "[check-in]", checkout: day(r.checkOut) || "[check-out]",
    nights: nights || "[n]", guests, rooms: L.rooms(rm), total: rp(f.quoteTotal || r.quoteTotal),
    payBy: day(f.payBy || r.payBy) || L.payBy, bank: f.bankInfo || r.bankInfo || L.bank,
    bookingRef: f.bookingRef || r.bookingRef || (r.id ? "SK-" + String(r.id).slice(0, 6).toUpperCase() : "[SK-XXXXXX]"),
    no: r.id ? String(r.id).slice(0, 8).toUpperCase() : (r.no || L.no),
    link: r.id ? `https://www.satukoneksihotel.com/account?r=${r.id}` : "https://www.satukoneksihotel.com/account", wa,
    guest: r.guest || L.guest, fullname: String(r.name || "").trim() || L.name,
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
}

// ---- the boxes in a reply: [Label]  [Label=start]  [Label: option | option]  <<Label>> = an extra box inside an option.
// Every language has the same boxes in the same order (tests/test_wa_replies_i18n.py), so what staff fill works in all 5 languages.
export function parseBoxes(text) {
  return [...String(text || "").matchAll(/\[([^\[\]]+)\]/g)].map((m) => {
    const body = m[1], c = body.match(/^([^:=|<>]+?): (.+)$/);
    if (c && c[2].includes(" | ")) return { kind: "choice", label: c[1].trim(), options: c[2].split(" | ").map((o) => ({ text: o, subs: [...o.matchAll(/<<([^<>]+)>>/g)].map((s) => s[1]) })) };
    const i = body.indexOf("=");
    return i > 0 ? { kind: "text", label: body.slice(0, i).trim(), start: body.slice(i + 1).trim() } : { kind: "text", label: body.trim(), start: "" };
  });
}
const isMoney = (label) => /\b(total|amount|price|cost|fee|balance|extra amount|margin amount)\b/i.test(label);
const isTime = (label) => /\btime\b/i.test(label) && !/\b(voucher|refund|bank)\b/i.test(label);
// values: one entry per box - text: "...", choice: { c: option index, s: [extra box values] }
export function renderBoxes(text, values, lang, enText) {
  const en = parseBoxes(enText || text);
  const firstOf = en.map((b, k) => en.findIndex((o) => o.label === b.label && o.kind === b.kind));   // the same box twice: one value
  let i = -1;
  const fmt = (v, label) => {
    v = String(v ?? "").trim();
    if (!v) return "";
    if (isMoney(label)) { const n = v.replace(/\D/g, ""); return n ? Number(n).toLocaleString("id-ID") : v; }
    if (isTime(label) && /^\d{1,2}:\d{2}$/.test(v)) return lang === "id" ? v.replace(":", ".") : v;
    return v;
  };
  return String(text || "").replace(/\[([^\[\]]+)\]/g, (whole) => {
    i += 1;
    const box = parseBoxes(whole)[0], e = en[i] || box, val = values?.[firstOf[i] ?? i];
    if (box.kind === "choice") {
      const c = Math.min(Math.max(Number(val?.c) || 0, 0), box.options.length - 1);
      let j = -1;
      const o = box.options[c].text.trim();
      return o === "-" ? "" : o.replace(/<<([^<>]+)>>/g, (m, lb) => { j += 1; const ee = e.options?.[c]?.subs?.[j] || lb; return fmt(val?.s?.[j], ee) || `[${lb}]`; });
    }
    return fmt(val ?? box.start, e.label) || `[${box.label}]`;
  }).replace(/ +([,.)])/g, "$1").replace(/  +/g, " ");
}
export const SIGNATURE = "\n\n— *PT Satu Koneksi Hotel*\nwww.satukoneksihotel.com";
export const isCustomer = (x) => x.stage !== "8";
export const langsOf = (x) => (isCustomer(x) && x.text_zh ? LANGS : LANGS.slice(0, 2));
export function composeReply(x, lang, r, f, values) {
  const L = langsOf(x).some(([k]) => k === lang) ? lang : "en";
  const body = renderBoxes(x["text_" + L] || x.text_en, values, L, x.text_en);
  return fillReply(body, r, f, L) + (isCustomer(x) ? SIGNATURE : "");
}

// ---- the message as a picture: the logo and PT Satu Koneksi Hotel on top, the WhatsApp QR at the bottom (for WhatsApp, as an image)
const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
export async function replyPicture(text) {
  const W = 1080, pad = 64, fs = 32, lh = 48;
  const font = (w, s) => `${w} ${s}px "Plus Jakarta Sans", "Noto Sans", "Segoe UI", "Noto Sans Thai", "Noto Sans KR", "Noto Sans SC", sans-serif`;
  const plain = String(text).replace(/\*([^*\n]+)\*/g, "$1");
  const cv = document.createElement("canvas"), g = cv.getContext("2d");
  g.font = font(500, fs);
  const lines = [];
  for (const para of plain.split("\n")) {
    if (!para) { lines.push(""); continue; }
    let cur = "";
    for (const ch of para.match(/\S+\s*|\s+/g) || [para]) {           // by words; a too-long word (Thai, Chinese) by letters
      if (g.measureText(cur + ch).width <= W - 2 * pad) { cur += ch; continue; }
      if (cur) { lines.push(cur.trimEnd()); cur = ""; }
      for (const k of [...ch]) { if (g.measureText(cur + k).width > W - 2 * pad) { lines.push(cur); cur = ""; } cur += k; }
    }
    lines.push(cur.trimEnd());
  }
  const head = 200, foot = 230, H = head + pad + lines.length * lh + pad + foot;
  cv.width = W; cv.height = H;
  g.fillStyle = "#FBF9F6"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#0e494a"; g.fillRect(0, 0, W, head);
  g.fillStyle = "#DFC07B"; g.fillRect(0, head - 8, W, 8);
  const [logo, qr] = await Promise.all([loadImg("/assets/logo.svg").catch(() => null), loadImg("/assets/img/qr-whatsapp.svg").catch(() => null)]);
  g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(pad, 36, 240, 120, 18); g.fill();
  if (logo) { const k = Math.min(210 / logo.width, 96 / logo.height); g.drawImage(logo, pad + 120 - logo.width * k / 2, 96 - logo.height * k / 2, logo.width * k, logo.height * k); }
  g.fillStyle = "#ffffff"; g.font = font(800, 40); g.fillText("PT Satu Koneksi Hotel", pad + 270, 92);
  g.fillStyle = "#DFC07B"; g.font = font(600, 24); g.fillText("Spesialis Reservasi Kamar Hotel", pad + 270, 130);
  g.fillStyle = "#cfe3e3"; g.font = font(600, 22); g.fillText("www.satukoneksihotel.com", pad + 270, 164);
  g.fillStyle = "#1b1c1a"; g.font = font(500, fs);
  lines.forEach((l, n) => g.fillText(l, pad, head + pad + fs + n * lh));
  const fy = H - foot;
  g.fillStyle = "#F4EFE6"; g.fillRect(0, fy, W, foot);
  g.fillStyle = "#ffffff"; g.strokeStyle = "#25D366"; g.lineWidth = 4; g.beginPath(); g.roundRect(pad, fy + 30, 170, 170, 16); g.fill(); g.stroke();
  if (qr) g.drawImage(qr, pad + 12, fy + 42, 146, 146);
  g.fillStyle = "#0e494a"; g.font = font(800, 30); g.fillText("Scan to chat on WhatsApp", pad + 200, fy + 96);
  g.fillStyle = "#3d4a49"; g.font = font(600, 22); g.fillText("Pindai untuk chat WhatsApp", pad + 200, fy + 132);
  g.fillText("PT Satu Koneksi Hotel · NIB 2710260118389", pad + 200, fy + 168);
  return new Promise((ok) => cv.toBlob((b) => ok(b), "image/png"));
}
export async function shareOrCopyPicture(blob, name = "satu-koneksi-reply.png") {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return "shared"; }        // phone: straight to WhatsApp
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); return "copied"; }               // computer: paste in WhatsApp Web
  catch { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return "saved"; }
}

// the picker: grouped list, language, editable preview, three ways to send
export async function replyPicker(host, r, getForm, { onWhatsApp, toAccount } = {}) {
  const lib = await library();
  const pick = (NOW[r.status] || NOW.new)[3];
  const groups = lib.stages.map(([s, en]) => `<optgroup label="${esc(en)}">${lib.replies.filter((x) => x.stage === s).map((x) => `<option value="${x.id}"${x.id === pick[0] ? " selected" : ""}>${x.id} · ${esc(x.title_en)}${pick.includes(x.id) ? " ★" : ""}</option>`).join("")}</optgroup>`).join("");
  host.innerHTML = `<div class="rp" id="replies"><div class="rp-row"><label>Situation<select id="rpSel">${groups}</select></label>
    <label>Language<select id="rpLang">${LANGS.map(([k]) => `<option value="${k}"${(r.lang || "en") === k ? " selected" : ""}>${{ en: "English", id: "Bahasa Indonesia", zh: "中文", th: "ไทย", ko: "한국어" }[k]}</option>`).join("")}</select></label></div>
    <p class="help" style="margin:4px 0">★ = suggested for this step. The customer's name, hotel, dates, guests, price and bank details are filled in; type over anything in [brackets]. For gold fill-in boxes use Admin → WhatsApp replies.</p>
    <textarea id="rpText" rows="9" maxlength="2000"></textarea>
    <div class="fh" style="justify-content:flex-start"><button class="sk-btn wa sm" type="button" id="rpWa">💬 Open in WhatsApp</button><button class="sk-btn sm" type="button" id="rpCopy">📋 Copy</button><button class="sk-btn sm" type="button" id="rpAcc">✉️ Put in the account reply</button></div></div>`;
  const q = (s) => host.querySelector(s);
  const show = () => {
    const x = lib.replies.find((y) => y.id === q("#rpSel").value); if (!x) return;
    const lang = q("#rpLang").value;
    q("#rpText").value = composeReply(x, lang, r, getForm(), []);
  };
  q("#rpSel").onchange = show; q("#rpLang").onchange = show; show();
  q("#rpCopy").onclick = async () => { try { await navigator.clipboard.writeText(q("#rpText").value); toast("Copied - paste it in WhatsApp or e-mail."); } catch { q("#rpText").select(); toast("Press Ctrl+C to copy."); } };
  q("#rpWa").onclick = () => {
    if (!String(r.whatsapp || "").replace(/\D/g, "")) return toast("This customer has no WhatsApp number.", "err");
    const text = q("#rpText").value; open(waLink(r.whatsapp, text), "_blank", "noopener"); onWhatsApp?.(q("#rpSel").value, text);
  };
  q("#rpAcc").onclick = () => { toAccount?.(q("#rpText").value); };
}


// ------------------------------------------------------------------ WhatsApp messages are saved in Admin (both ways)
// Every request and every WhatsApp message, from the customer or from us, is kept on the request:
//   createWaRequest()  a request that came in on WhatsApp (the customer has no account: uid "whatsapp")
//   logWa()            one WhatsApp message on the request's log: kind "in" = the customer wrote, anything else = we sent it
//   addReceipt()       the transfer receipt the customer sent on WhatsApp, saved like a slip uploaded in the account
const who = () => auth.currentUser?.email || "";
const rpFmt = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

export async function logWa(id, kind, text) {
  await F.addDoc(F.collection(db, "requests", id, "waLog"), { kind: String(kind).slice(0, 40), text: String(text).slice(0, 4000), by: who(), createdAt: F.serverTimestamp() });
  await F.updateDoc(F.doc(db, "requests", id), { lastMsgFrom: kind === "in" ? "customer" : "staff", lastMsgAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
}

export async function createWaRequest(v, firstMessage = "") {
  const int = (x, d, lo, hi) => { const k = parseInt(x, 10); return Number.isFinite(k) ? Math.min(hi, Math.max(lo, k)) : d; };
  const name = String(v.name || "").trim(), phone = String(v.phone || "").trim();
  if (!name) throw new Error("Type the customer's name.");
  if (phone.replace(/\D/g, "").length < 6) throw new Error("Type the customer's WhatsApp number (with the country code, e.g. +62 …).");
  const kind = ["hotel", "tour", "general"].includes(v.kind) ? v.kind : "hotel";
  const hotel = String(v.hotel || "").trim().slice(0, 160), city = String(v.city || "").trim().slice(0, 80);
  const d = { kind, name: name.slice(0, 100), whatsapp: phone.slice(0, 30), uid: "whatsapp", source: "whatsapp", campaign: "added by staff", status: "new",
    lang: v.lang === "id" ? "id" : "en", adults: int(v.adults, 2, 1, 60), children: int(v.children, 0, 0, 40), rooms: int(v.rooms, 1, 1, 30),
    createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() };
  if (kind === "hotel") { d.hotelMode = hotel ? "one" : "any"; d.refName = hotel || (city ? `Any hotel in ${city}` : "Hotel request (WhatsApp)"); }
  else if (hotel) d.refName = hotel;
  if (city) { d.city = city; d.refCity = city; }
  if (v.country) d.country = String(v.country).trim().slice(0, 60);
  if (v.email) d.email = String(v.email).trim().slice(0, 120);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.checkIn || "")) d.checkIn = v.checkIn;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.checkOut || "")) d.checkOut = v.checkOut;
  if (firstMessage) d.message = String(firstMessage).slice(0, 2000);
  const ref = await F.addDoc(F.collection(db, "requests"), d);
  if (firstMessage) await logWa(ref.id, "in", firstMessage);
  return ref.id;
}

export async function addReceipt(r, file, amount) {
  const slip = await slipFromFile(file);
  const amt = Math.round(Number(amount) || 0);
  await F.addDoc(F.collection(db, "requests", r.id, "payments"), { data: slip.data, type: slip.type, name: String(file.name || "whatsapp-receipt").slice(0, 120),
    ...(amt > 0 ? { amount: amt } : {}), note: "Received on WhatsApp", uid: auth.currentUser.uid, createdAt: F.serverTimestamp() });
  const upd = { paymentSentAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() };
  if (["new", "contacted", "quoted", "accepted"].includes(r.status)) upd.status = "paymentSent";
  await F.updateDoc(F.doc(db, "requests", r.id), upd);
  await logWa(r.id, "in", `📎 Transfer receipt received on WhatsApp${amt > 0 ? " – " + rpFmt(amt) : ""} (saved under Transfer slips)`);
  return upd.status || r.status;
}

// ------------------------------------------------------------------ Admin -> WhatsApp replies: for the phone
// Link the chat to its request (or save it as a new WhatsApp request), paste what the customer wrote, tap Copy / Open in WhatsApp:
// everything is saved on the request, so Admin always has the whole conversation.
const KEY = "skWaReplies";
export async function waRepliesView({ main }) {
  const lib = await library();
  let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
  try { st.bank = st.bank || localStorage.getItem("skBankInfo") || ""; } catch { /* ignore */ }
  let open = [];
  try {
    const sn = await F.getDocs(F.query(F.collection(db, "requests"), F.orderBy("createdAt", "desc"), F.limit(200)));
    open = sn.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => !["completed", "cancelled"].includes(r.status));
  } catch { open = []; }
  let linked = open.find((r) => r.id === st.rid) || null;
  const FIELDS = [["name", "Customer name", "text", "e.g. Budi Santoso"], ["phone", "Customer WhatsApp", "tel", "e.g. +62 811 0000 0001"], ["hotel", "Hotel", "text", "e.g. The Lokha Ubud"], ["city", "City", "text", "e.g. Ubud"],
    ["checkIn", "Check-in", "date", ""], ["checkOut", "Check-out", "date", ""], ["adults", "Adults", "number", "2"], ["children", "Children", "number", "0"], ["rooms", "Rooms", "number", "1"],
    ["total", "Total price (Rp)", "number", "e.g. 2180000"], ["payBy", "Pay before", "date", ""], ["guest", "Guest name as on the ID", "text", "e.g. BUDI SANTOSO"], ["bookingRef", "Booking number", "text", "e.g. SK-R6CONF"]];
  const FIELD = Object.fromEntries(FIELDS.map((f) => [f[0], f]));
  // {auto} part -> the customer boxes it comes from (shown again under each message, linked to the boxes at the top)
  const AUTO = { name: ["name"], fullname: ["name"], hotel: ["hotel", "city"], dates: ["checkIn", "checkOut"], checkin: ["checkIn"], checkout: ["checkOut"],
    guests: ["adults", "children"], rooms: ["rooms"], total: ["total"], payBy: ["payBy"], guest: ["guest"], bookingRef: ["bookingRef"] };
  const boxes = st.boxes && typeof st.boxes === "object" ? st.boxes : {};          // what staff filled per message: { R05: [..] }
  const label = (r) => `${r.name || "?"} · ${r.refName || r.kind || ""}${r.checkIn ? " · " + r.checkIn : ""} · ${r.status}`;
  main.innerHTML = `<style>
    .wr-card{border:1px solid var(--line,#e4e2df);border-radius:14px;padding:12px;margin:10px 0;background:#fff}
    .wr-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.wr-h .wr-ti{flex:1;min-width:180px}
    .wr-brand{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#0e494a;text-transform:uppercase}
    .wr-brand img{height:26px;width:auto}
    .wr-l{display:flex;gap:4px;flex-wrap:wrap}.wr-l button{border:1px solid #cfd8d8;background:#fff;border-radius:999px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:13px}
    .wr-l button[aria-pressed="true"]{background:#0e494a;color:#fff;border-color:#0e494a}
    .wr-fill{border:2px solid #DFC07B;background:#FFFBF0;border-radius:12px;padding:10px 12px;margin:8px 0}
    .wr-fill h4{margin:0 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#79590e}
    .wr-fg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 12px}
    .wr-fg label{display:flex;flex-direction:column;font-size:12.5px;font-weight:700;color:#3d4a49;gap:4px}
    .wr-fg input,.wr-fg select{border:1.5px solid #c9b88a;border-radius:9px;padding:8px 10px;font:inherit;font-weight:500;background:#fff;min-height:40px}
    .wr-fg input:focus,.wr-fg select:focus{outline:3px solid #DFC07B66;border-color:#C69B3D}
    .wr-fg .auto input{border-color:#9fc3c3;background:#F4FAFA}
    .wr-t{white-space:pre-wrap;word-break:break-word;background:#F7F5F0;border-radius:10px;padding:12px;margin:8px 0;font:15px/1.5 "Plus Jakarta Sans","Noto Sans",sans-serif}
    .wr-b{display:flex;gap:8px;flex-wrap:wrap}.wr-b .sk-btn{flex:1;min-width:140px}
  </style><div id="wrRoot"><h1>💬 WhatsApp replies</h1>
    <p class="lead">For WhatsApp on the phone. <b>Every message is saved in Admin:</b> link the chat to its request, paste what the customer wrote, and the messages you copy or send from here are saved too.
      Fill the <b>gold boxes</b> under a message; the message changes as you type. Bahasa Indonesia and English are the main texts; <b>中文 · ไทย · 한국어</b> are their translations. Every message ends with PT Satu Koneksi Hotel; <b>🖼 Picture</b> sends it with our logo.</p>
    <div class="panel wr-link"><label>1. Which request is this chat?<select id="wrPick"><option value="">— Not saved yet (new WhatsApp customer) —</option>${open.map((r) => `<option value="${r.id}"${linked && linked.id === r.id ? " selected" : ""}>${esc(label(r))}</option>`).join("")}</select></label>
      <div id="wrLinkInfo" class="help"></div>
      <label style="margin-top:8px">2. The customer wrote on WhatsApp (paste it here)<textarea id="wrIn" rows="3" placeholder="Paste the customer's WhatsApp message"></textarea></label>
      <div class="wr-b"><button class="sk-btn sm" type="button" id="wrSaveIn">📥 Save the customer's message</button><button class="sk-btn sm gold" type="button" id="wrNew">＋ Save as a new WhatsApp request</button></div>
      <label style="margin-top:8px">3. Receipt photo the customer sent (optional)<input id="wrSlip" type="file" accept="image/*,application/pdf"></label>
      <div class="wr-b"><button class="sk-btn sm" type="button" id="wrSlipBtn">📎 Save the receipt on the request</button></div></div>
    <details class="panel wr-form"${linked ? "" : " open"}><summary>Customer and booking details <small>(tap to hide or show)</small></summary><div class="wr-grid">${FIELDS.map(([k, lb, type, ph]) => `<label>${esc(lb)}<input data-k="${k}" type="${type}" ${type === "number" ? 'inputmode="numeric" min="0"' : ""} placeholder="${esc(ph)}" value="${esc(st[k] ?? "")}"></label>`).join("")}
      <label class="wr-wide">Bank details<textarea data-k="bank" rows="3" placeholder="Bank · Account number · Account name">${esc(st.bank || "")}</textarea></label>
      <label>Language<select data-k="lang">${LANGS.map(([k, n]) => `<option value="${k}"${(st.lang || "en") === k ? " selected" : ""}>${{ en: "English", id: "Bahasa Indonesia", zh: "中文 (Chinese)", th: "ไทย (Thai)", ko: "한국어 (Korean)" }[k]}</option>`).join("")}</select></label></div>
      <p class="help" style="margin:8px 0 0"><button class="sk-link" type="button" id="wrClear">Clear the boxes</button> · what you type here stays on this phone only.</p></details>
    <input id="wrFind" type="search" placeholder="4. Find a message (e.g. voucher, R14, bank, refund)" style="width:100%;margin:6px 0 10px">
    <div id="wrList"></div></div>`;
  const q = (s) => main.querySelector(s), root = q("#wrRoot");
  const per = new Map();   // per message language override
  const val = () => { const o = {}; main.querySelectorAll("[data-k]").forEach((el) => { o[el.dataset.k] = el.value.trim(); }); return o; };
  const req = (v) => ({ id: linked?.id, name: v.name, refName: v.hotel, city: v.city, checkIn: v.checkIn, checkOut: v.checkOut, adults: v.adults === "" ? undefined : Number(v.adults),
    children: v.children === "" ? 0 : Number(v.children), rooms: v.rooms === "" ? 1 : Number(v.rooms), guest: v.guest, bookingRef: v.bookingRef, quoteTotal: Number(v.total) || 0, payBy: v.payBy, bankInfo: v.bank });
  const langOf = (x, v) => { const l = per.get(x.id) || v.lang || "en"; return langsOf(x).some(([k]) => k === l) ? l : "en"; };
  const text = (x, v, lang) => composeReply(x, lang, req(v), { quoteTotal: Number(v.total) || 0, payBy: v.payBy, bankInfo: v.bank, bookingRef: v.bookingRef }, boxes[x.id]);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...val(), rid: linked?.id || "", boxes })); const b = val().bank; if (b) localStorage.setItem("skBankInfo", b); } catch { /* ignore */ } };
  const linkInfo = () => {
    q("#wrLinkInfo").innerHTML = linked ? `✅ Saving to <b>${esc(linked.name)}</b> · no. ${esc(linked.id.slice(0, 8).toUpperCase())} · <a href="#/requests" id="wrOpenReq">open in Requests</a>`
      : "⚠️ Not saved in Admin yet: choose the request above, or fill the boxes below (name + WhatsApp) and press <b>Save as a new WhatsApp request</b>.";
    q("#wrNew").hidden = !!linked;
  };
  const fillFrom = (r) => {   // the request's own details into the boxes
    const set = (k, x) => { const el = q(`[data-k="${k}"]`); if (el && x != null && x !== "") el.value = x; };
    set("name", r.name); set("phone", r.whatsapp); set("hotel", r.hotelMode === "any" ? "" : r.refName); set("city", r.city || r.refCity); set("checkIn", r.checkIn); set("checkOut", r.checkOut);
    set("adults", r.adults); set("children", r.children); set("rooms", r.rooms); set("total", r.quoteTotal); set("payBy", r.payBy); set("bank", r.bankInfo); set("bookingRef", r.bookingRef);
    const lg = q('[data-k="lang"]'); if (lg) lg.value = ["en", "id", "zh", "th", "ko"].includes(r.lang) ? r.lang : "en";
  };
  // the gold boxes of one message: its own [boxes] + the customer details it uses (linked to the boxes at the top)
  function fillHtml(x, lang, v) {
    const shown = lang === "id" ? "id" : "en";
    const mine = parseBoxes(x["text_" + shown] || x.text_en), en = parseBoxes(x.text_en), have = boxes[x.id] || [];
    const autos = [...new Set([...x.text_en.matchAll(/\{(\w+)\}/g)].flatMap((m) => AUTO[m[1]] || []))];
    if (!mine.length && !autos.length) return "";
    const seen = new Set();
    const own = mine.map((b, i) => {
      const key = en[i].label + "|" + en[i].kind; const dup = seen.has(key); seen.add(key);   // the same box twice in a message: fill it once
      if (dup) return "";
      if (b.kind === "choice") {
        const c = Math.min(Number(have[i]?.c) || 0, b.options.length - 1);
        const opts = b.options.map((o, k) => `<option value="${k}"${k === c ? " selected" : ""}>${esc(o.text.trim() === "-" ? "(nothing)" : o.text.replace(/<<([^<>]+)>>/g, "…"))}</option>`).join("");
        const subs = (b.options[c].subs || []).map((s, j) => `<label>${esc(s)}<input data-b="${i}" data-s="${j}" value="${esc(have[i]?.s?.[j] ?? "")}" placeholder="${esc(s)}"></label>`).join("");
        return `<label>${esc(b.label)}<select data-b="${i}">${opts}</select></label>${subs}`;
      }
      const type = isTime(en[i].label) ? "time" : "text", money = isMoney(en[i].label);
      return `<label>${esc(b.label)}<input data-b="${i}" type="${type}" ${money ? 'inputmode="numeric" placeholder="e.g. 1250000"' : `placeholder="${esc(b.start || b.label)}"`} value="${esc(typeof have[i] === "string" ? have[i] : (have[i] == null ? b.start : ""))}"></label>`;
    }).join("");
    const auto = autos.map((k) => { const [, lb, type] = FIELD[k]; return `<label class="auto">${esc(lb)}<input data-sync="${k}" type="${type}" ${type === "number" ? 'inputmode="numeric" min="0"' : ""} value="${esc(v[k] ?? "")}"></label>`; }).join("");
    return `<div class="wr-fill"><h4>✍️ Fill in</h4><div class="wr-fg">${own}${auto}</div></div>`;
  }
  function cardHtml(x, v) {
    const lang = langOf(x, v);
    return `<div class="wr-card" data-id="${x.id}"><div class="wr-h"><span class="wr-brand"><img src="/assets/logo.svg" alt="">PT Satu Koneksi Hotel</span>
        <span class="wr-ti"><b>${x.id}</b> ${esc(lang === "id" ? x.title_id : x.title_en)}</span>
        <span class="wr-l">${langsOf(x).map(([k, n]) => `<button type="button" data-wl="${k}" aria-pressed="${lang === k}">${n}</button>`).join("")}</span></div>
      <div class="wr-c">${esc(lang === "id" ? x.customer_id : x.customer_en)}</div>
      ${fillHtml(x, lang, v)}
      <pre class="wr-t">${esc(text(x, v, lang))}</pre>
      <div class="wr-b"><button class="sk-btn sm" type="button" data-copy>📋 Copy</button><button class="sk-btn sm" type="button" data-pic>🖼 Picture with logo</button><button class="sk-btn wa sm" type="button" data-send>💬 Open in WhatsApp</button></div></div>`;
  }
  function draw() {
    const v = val(), find = q("#wrFind").value.trim().toLowerCase();
    save();
    const openNow = new Set([...main.querySelectorAll("details.wr-grp[open]")].map((d) => d.dataset.s));
    q("#wrList").innerHTML = lib.stages.map(([s, en]) => {
      const rows = lib.replies.filter((x) => x.stage === s && (!find || (x.id + " " + x.title_en + " " + x.title_id + " " + x.text_en).toLowerCase().includes(find)));
      if (!rows.length) return "";
      return `<details class="wr-grp" data-s="${s}"${find || openNow.has(s) || (!openNow.size && s === "1") ? " open" : ""}><summary>${esc(en)} <small>(${rows.length})</small></summary>${rows.map((x) => cardHtml(x, v)).join("")}</details>`;
    }).join("") || `<p class="help">No message matches.</p>`;
  }
  const redrawCard = (card) => { const x = lib.replies.find((y) => y.id === card.dataset.id); card.outerHTML = cardHtml(x, val()); };
  const refreshTexts = () => {   // only the message texts and the linked boxes - typing keeps its place
    const v = val(); save();
    main.querySelectorAll(".wr-card").forEach((card) => { const x = lib.replies.find((y) => y.id === card.dataset.id); card.querySelector(".wr-t").textContent = text(x, v, langOf(x, v)); });
    main.querySelectorAll("[data-sync]").forEach((el) => { if (el !== document.activeElement) el.value = v[el.dataset.sync] ?? ""; });
  };
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (er) { toast(er.message || "Could not save.", "err"); } finally { btn.disabled = false; } };
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("#wrFind")) return draw();
    if (t.matches("[data-k]")) return refreshTexts();
    if (t.matches("[data-sync]")) { const top = q(`[data-k="${t.dataset.sync}"]`); if (top) top.value = t.value; return refreshTexts(); }
    if (t.matches("input[data-b]")) {
      const id = t.closest(".wr-card").dataset.id, i = Number(t.dataset.b), arr = boxes[id] || (boxes[id] = []);
      if (t.dataset.s != null) { const o = arr[i] && typeof arr[i] === "object" ? arr[i] : (arr[i] = { c: 0, s: [] }); o.s = o.s || []; o.s[Number(t.dataset.s)] = t.value; }
      else arr[i] = t.value;
      return refreshTexts();
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("#wrPick")) { linked = open.find((r) => r.id === t.value) || null; if (linked) fillFrom(linked); linkInfo(); draw(); return; }
    if (t.matches('select[data-k="lang"]')) { per.clear(); draw(); return; }
    if (t.matches("select[data-b]")) {
      const card = t.closest(".wr-card"), id = card.dataset.id, i = Number(t.dataset.b), arr = boxes[id] || (boxes[id] = []);
      arr[i] = { c: Number(t.value), s: (arr[i] && arr[i].s) || [] };
      save(); redrawCard(card); return;
    }
    if (t.matches("[data-k]")) refreshTexts();
  });
  root.addEventListener("click", async (e) => {
    const t0 = e.target;
    if (t0.closest("#wrClear")) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } per.clear(); for (const k of Object.keys(boxes)) delete boxes[k]; main.querySelectorAll("[data-k]").forEach((el) => { if (el.tagName !== "SELECT") el.value = ""; }); draw(); return; }
    if (t0.closest("#wrSaveIn")) return busy(t0.closest("button"), async () => {
      const msg = q("#wrIn").value.trim(); if (!msg) throw new Error("Paste the customer's message first.");
      if (!linked) throw new Error("Choose the request first, or press Save as a new WhatsApp request.");
      await logWa(linked.id, "in", msg); q("#wrIn").value = ""; toast("Saved on the request - Admin shows it in the conversation.");
    });
    if (t0.closest("#wrNew")) return busy(t0.closest("button"), async () => {
      const v = val(), msg = q("#wrIn").value.trim();
      const id = await createWaRequest(v, msg);
      linked = { id, name: v.name, whatsapp: v.phone, refName: v.hotel, status: "new", lang: v.lang };
      open.unshift(linked);
      const pick = q("#wrPick"); pick.insertAdjacentHTML("beforeend", `<option value="${id}">${esc(label(linked))}</option>`); pick.value = id;
      q("#wrIn").value = ""; linkInfo(); draw(); toast("New WhatsApp request saved - it is in Admin → Requests.");
    });
    if (t0.closest("#wrSlipBtn")) return busy(t0.closest("button"), async () => {
      const f = q("#wrSlip").files[0]; if (!f) throw new Error("Choose the receipt photo first.");
      if (!linked) throw new Error("Choose the request first (or save it as a new WhatsApp request).");
      linked.status = await addReceipt(linked, f, val().total); q("#wrSlip").value = "";
      toast("Receipt saved on the request. Now check the bank, then confirm the payment in Requests.");
    });
    const card = t0.closest(".wr-card");
    if (!card) return;
    const x = lib.replies.find((y) => y.id === card.dataset.id), v = val();
    const lb = t0.closest("[data-wl]");
    if (lb) { per.set(x.id, lb.dataset.wl); redrawCard(card); return; }
    const lang = langOf(x, v), t = text(x, v, lang);
    const saveLog = (how) => (linked && x.id[0] === "R" ? logWa(linked.id, `${how} ${x.id}`, t).catch((er) => toast("Not saved in Admin: " + er.message, "err")) : null);
    if (t0.closest("[data-copy]")) {
      try { await navigator.clipboard.writeText(t); toast(linked ? "Copied and saved on the request - paste it in WhatsApp." : "Copied - paste it in WhatsApp. (Not saved: no request chosen.)"); }
      catch { const pre = card.querySelector(".wr-t"), r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Selected - press Copy on your phone's menu."); }
      saveLog("copied");
    } else if (t0.closest("[data-pic]")) {
      const btn = t0.closest("button");
      await busy(btn, async () => {
        const how = await shareOrCopyPicture(await replyPicture(t), `satu-koneksi-${x.id}.png`);
        toast(how === "shared" ? "Choose WhatsApp to send the picture." : how === "copied" ? "Picture copied - paste it in WhatsApp (Ctrl+V)." : "Picture saved - send it in WhatsApp.");
        saveLog("picture");
      });
    } else if (t0.closest("[data-send]")) {
      const digits = String(v.phone || "").replace(/\D/g, "");
      window.open(digits ? waLink(v.phone, t) : "https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener");
      saveLog("sent");
    }
  });
  if (linked) fillFrom(linked);
  linkInfo();
  draw();
}

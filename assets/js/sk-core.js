// Satu Koneksi Hotel - shared code for the public pages, the customer account and the staff admin.
// Talks to Firebase (free plan): sign-in (Google / e-mail) and the Firestore database.
const V = "13.0.0", CDN = `https://www.gstatic.com/firebasejs/${V}/`;
// Public pages use Firestore Lite (about 160 KB instead of 710 KB: reads and writes, no live updates); the Admin keeps the full library.
const FULL = /^\/admin/.test(location.pathname);
const [{ initializeApp }, A, F] = await Promise.all([
  import(CDN + "firebase-app.js"), import(CDN + "firebase-auth.js"), import(CDN + (FULL ? "firebase-firestore.js" : "firebase-firestore-lite.js"))]);

export const firebaseConfig = {
  apiKey: "AIzaSyBhw54Bxi4IhtiMBcMHoCApk8ri_PoShtU",          // public identifier, not a secret
  authDomain: "satu-koneksi-hotel.firebaseapp.com",
  projectId: "satu-koneksi-hotel",
  appId: "1:44909394965:web:1947214c11a4a41cf5a21c",
  messagingSenderId: "44909394965",
};
export const app = initializeApp(firebaseConfig);
export const auth = A.getAuth(app);
export const db = F.getFirestore(app);
export { A, F };

// the parts that need no Firebase live in sk-light.js (pages fill in their contact details without waiting for this file)
import { WA_DEFAULT, waDigits, waLink, WA_USES, waShow, waList, pageSection, waFor, toast, modal, cached, getPublicDoc, loadPriceRules, TIME_DEFAULTS, loadSettings, loadImage, SOURCES, sourceOf, rememberSource, leadSource } from "./sk-light.js";
export { WA_DEFAULT, waDigits, waLink, WA_USES, waShow, waList, pageSection, waFor, toast, modal, cached, getPublicDoc, loadPriceRules, TIME_DEFAULTS, loadSettings, loadImage, SOURCES, sourceOf, rememberSource, leadSource };
export const OWNERS = ["satukoneksihotel@gmail.com", "leonguoon@gmail.com"];
export const STATUS = {
  new: ["New", "Baru", "#2563eb"], contacted: ["Contacted", "Sudah dihubungi", "#b38d40"], quoted: ["Quotation sent", "Penawaran dikirim", "#7c3aed"],
  accepted: ["Agreed to book", "Setuju dipesan", "#c2410c"], paymentSent: ["Payment sent - checking", "Pembayaran dikirim - dicek", "#0369a1"],
  confirmed: ["Confirmed", "Terkonfirmasi", "#15803d"], completed: ["Completed", "Selesai", "#0e494a"], cancelled: ["Cancelled", "Dibatalkan", "#6b7280"],
};

// ---------------------------------------------------------------- small helpers
import { $, $$, esc, lang, setLang, L, T } from "./sk-text.js";    // the text helpers (no Firebase, so the fast first draw can use them)
export { $, $$, esc, lang, setLang, L, T };
export const statusLabel = (s) => { const x = STATUS[s] || [s, s, "#555"]; return lang() === "id" ? x[1] : x[0]; };
export const fmtDate = (ts) => { const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null; return d ? d.toLocaleString(lang() === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };
export const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export const plain = (d) => { const o = { id: d.id, ...d.data() }; for (const k in o) if (o[k]?.toMillis) o[k] = o[k].toMillis(); return o; };


export const byOrder = (a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a.name || a.title_en || "").localeCompare(String(b.name || b.title_en || ""));
export async function loadPublished(col) {
  try {
    return await cached("pub_" + col, async () => {
      const s = await F.getDocs(F.query(F.collection(db, col), F.where("published", "==", true)));
      return s.docs.map(plain).sort(byOrder);
    });
  } catch (e) { console.warn("load " + col, e); return []; }
}
// Hotels page / home / offers: the compact list the cloud keeps (publicBundle/hotels-N, card fields only) = a few reads per visitor
// instead of one read per hotel. The cloud may be rewriting it at this moment: wait a little and look again. It NEVER falls back to
// reading every hotel (thousands of reads - that used up the free daily allowance); if the list is not there the page shows no hotels.
export async function loadHotelList(fresh = false) {      // fresh = skip the 15-minute memory (the Admin Panel wants the newest list)
  try {
    return await (fresh ? (fn) => fn() : (fn) => cached("hotel_list", fn, 900000))(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 2500));
        const s = await F.getDocs(F.query(F.collection(db, "publicBundle"), F.where("kind", "==", "hotels")));
        const byGen = {};
        for (const d of s.docs.map((x) => x.data())) (byGen[String(d.gen || "")] ||= []).push(d);
        const gen = Object.keys(byGen).sort().reverse().find((g) => byGen[g].length === Number(byGen[g][0].parts));   // newest COMPLETE set
        if (gen) return byGen[gen].sort((a, b) => a.part - b.part).flatMap((d) => d.items || []).sort(byOrder);
      }
      throw new Error("compact hotel list not ready");
    });
  } catch (e) { console.warn("compact hotel list:", e?.message || e); return []; }
}
// The live alerts in ONE document (kept by the cloud bot) - a page view costs 1 read instead of one per alert. null = not there: use the old query.
export async function loadAlertBundle() {
  try {
    const d = await F.getDoc(F.doc(db, "publicBundle", "alerts-0"));
    if (!d.exists()) return null;
    const b = d.data();
    return { items: b.items || [], checked: b.checked || "" };
  } catch { return null; }
}
// one hotel's full details (description, photos) - read only when a visitor opens it
export async function loadHotelFull(id) {
  if (!id) return null;
  try {
    return await cached("hotel_" + id, async () => { const d = await F.getDoc(F.doc(db, "hotels", id)); return d.exists() ? plain(d) : null; }, 1800000);
  } catch { return null; }
}
// Admin -> Price rules (markup %, member %, the price helper's address) - public, cached 5 minutes
export const offerActive = (o, now = Date.now()) => (!o.validFrom || new Date(o.validFrom + "T00:00:00") <= now) && (!o.validUntil || new Date(o.validUntil + "T23:59:59") >= now);

// ---------------------------------------------------------------- pictures: shrink in the browser, keep inside the free database
export async function fileToDataUrl(file, maxSide = 1400, quality = 0.8, limit = 600000) {
  const bmp = await createImageBitmap(file);
  let s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), q = quality, out = "";
  for (let i = 0; i < 8; i++) {
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    out = c.toDataURL("image/webp", q); if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
    if (out.length <= limit) return { data: out, w: c.width, h: c.height };
    q = Math.max(0.5, q - 0.08); s *= 0.85;
  }
  throw new Error("Picture is too large even after shrinking - please use a smaller one.");
}
export async function saveImage(file, { maxSide = 1400, name = "" } = {}) {
  const im = await fileToDataUrl(file, maxSide);
  const ref = F.doc(F.collection(db, "images"));
  await F.setDoc(ref, { data: im.data, w: im.w, h: im.h, name: name || file.name.slice(0, 80), createdAt: F.serverTimestamp() });
  return ref.id;
}
// a bank-transfer slip: a photo is shrunk like other pictures; a PDF is kept as it is (must be small)
export async function slipFromFile(file) {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    if (file.size > 500000) throw new Error(T("This PDF is too large (max 500 KB). Please send a photo or screenshot instead.", "PDF terlalu besar (maks 500 KB). Kirim foto atau tangkapan layar saja."));
    const data = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(file); });
    return { data, type: "pdf" };
  }
  return { data: (await fileToDataUrl(file, 1600, 0.82, 600000)).data, type: "image" };
}
export async function thumbFromFile(file, maxSide = 560) { return (await fileToDataUrl(file, maxSide, 0.72, 90000)).data; }

// ---------------------------------------------------------------- sign-in
export const onUser = (cb) => A.onAuthStateChanged(auth, cb);
export const signOut = () => A.signOut(auth);
export async function isStaffUser(user) {
  if (!user || !user.emailVerified || !user.email) return false;
  const e = user.email.toLowerCase(); if (OWNERS.includes(e)) return true;
  try { return (await F.getDoc(F.doc(db, "admins", e))).exists(); } catch { return false; }
}
const authMsg = (e) => {
  const c = e?.code || "";
  if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return T("Wrong e-mail or password.", "E-mail atau kata sandi salah.");
  if (c.includes("email-already")) return T("This e-mail already has an account - use Sign in.", "E-mail ini sudah terdaftar - gunakan Masuk.");
  if (c.includes("weak-password")) return T("Please use a password of at least 6 characters.", "Gunakan kata sandi minimal 6 karakter.");
  if (c.includes("invalid-email")) return T("Please check the e-mail address.", "Periksa alamat e-mail.");
  if (c.includes("too-many")) return T("Too many tries. Please wait a few minutes.", "Terlalu banyak percobaan. Tunggu beberapa menit.");
  if (c.includes("popup-blocked")) return T("Your browser blocked the sign-in window. Please allow pop-ups and try again.", "Peramban memblokir jendela masuk. Izinkan pop-up lalu coba lagi.");
  if (c.includes("unauthorized-domain")) return T("This address is not yet allowed for sign-in.", "Alamat ini belum diizinkan untuk masuk.");
  return T("Something went wrong. Please try again.", "Terjadi kesalahan. Coba lagi.") + (e?.message ? " (" + (c || e.message).slice(0, 80) + ")" : "");
};
export const googleSignIn = () => A.signInWithPopup(auth, new A.GoogleAuthProvider());
export const emailSignIn = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
export async function emailSignUp(email, pw, name) {
  const c = await A.createUserWithEmailAndPassword(auth, email, pw);
  if (name) await A.updateProfile(c.user, { displayName: name });
  await A.sendEmailVerification(c.user); return c;
}
export const resetPassword = (email) => A.sendPasswordResetEmail(auth, email);
export const resendVerification = () => A.sendEmailVerification(auth.currentUser);
export async function refreshUser() { await auth.currentUser?.reload(); await auth.currentUser?.getIdToken(true); return auth.currentUser; }

// the sign-in window used on every page
export function openAuth({ reason = "", staff = false, onDone } = {}) {
  let mode = "in";
  const m = modal(`<div class="sk-auth"><h3>${staff ? "Staff sign-in" : T("Sign in to your account", "Masuk ke akun Anda")}</h3>
    ${reason ? `<p class="sk-sub">${esc(reason)}</p>` : ""}
    <button class="sk-btn sk-google" type="button" data-g><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg><span>${T("Continue with Google", "Lanjutkan dengan Google")}</span></button>
    ${staff ? "" : `<div class="sk-or"><span>${T("or with e-mail", "atau dengan e-mail")}</span></div>
    <div class="sk-tabs"><button type="button" class="on" data-m="in">${T("Sign in", "Masuk")}</button><button type="button" data-m="up">${T("Create account", "Buat akun")}</button></div>
    <form data-f novalidate>
      <label data-name hidden>${T("Your name", "Nama Anda")}<input name="name" autocomplete="name"></label>
      <label>${T("E-mail", "E-mail")}<input name="email" type="email" autocomplete="email" required></label>
      <label>${T("Password", "Kata sandi")}<input name="pw" type="password" autocomplete="current-password" required minlength="6"></label>
      <p class="sk-err" data-err></p>
      <button class="sk-btn gold" type="submit" data-go>${T("Sign in", "Masuk")}</button>
      <button class="sk-link" type="button" data-forgot>${T("Forgot password?", "Lupa kata sandi?")}</button>
    </form>`}
    <p class="sk-err" data-gerr></p></div>`);
  const err = (t, sel = "[data-err]") => { const el = m.q(sel) || m.q("[data-gerr]"); if (el) el.textContent = t || ""; };
  const done = (u) => { m.close(); onDone?.(u); };
  m.q("[data-g]").onclick = async () => { try { err(""); done((await googleSignIn()).user); } catch (e) { err(authMsg(e), "[data-gerr]"); } };
  if (staff) return m;
  $$("[data-m]", m.el).forEach((b) => b.onclick = () => {
    mode = b.dataset.m; $$("[data-m]", m.el).forEach((x) => x.classList.toggle("on", x === b));
    m.q("[data-name]").hidden = mode !== "up"; m.q("[data-go]").textContent = mode === "up" ? T("Create account", "Buat akun") : T("Sign in", "Masuk");
    m.q("[name=pw]").autocomplete = mode === "up" ? "new-password" : "current-password"; err("");
  });
  m.q("[data-f]").onsubmit = async (ev) => {
    ev.preventDefault(); const f = new FormData(ev.target), email = f.get("email").trim(), pw = f.get("pw");
    if (!email || pw.length < 6) return err(T("Please enter your e-mail and a password of at least 6 characters.", "Isi e-mail dan kata sandi minimal 6 karakter."));
    const go = m.q("[data-go]"); go.disabled = true; err("");
    try {
      const c = mode === "up" ? await emailSignUp(email, pw, f.get("name").trim()) : await emailSignIn(email, pw);
      if (mode === "up") toast(T("Account created. We sent you an e-mail - please open it and click the link to verify.", "Akun dibuat. Kami mengirim e-mail - buka dan klik tautan untuk verifikasi."));
      done(c.user);
    } catch (e) { err(authMsg(e)); go.disabled = false; }
  };
  m.q("[data-forgot]").onclick = async () => {
    const email = m.q("[name=email]").value.trim(); if (!email) return err(T("Type your e-mail first.", "Isi e-mail Anda dulu."));
    try { await resetPassword(email); err(""); toast(T("If this e-mail has an account, a reset link is on its way.", "Jika e-mail ini terdaftar, tautan reset sedang dikirim.")); } catch (e) { err(authMsg(e)); }
  };
  return m;
}

// ---------------------------------------------------------------- customers + requests
export async function ensureProfile(user, extra = {}) {
  const ref = F.doc(db, "customers", user.uid); const snap = await F.getDoc(ref);
  const base = { displayName: user.displayName || "", email: user.email || "", ...extra, updatedAt: F.serverTimestamp() };
  if (!snap.exists()) base.createdAt = F.serverTimestamp();
  await F.setDoc(ref, clean(base), { merge: true });
  return (await F.getDoc(ref)).data();
}
export async function createRequest(data) {
  const u = auth.currentUser; if (!u) throw new Error("not signed in");
  const src = leadSource();
  const doc = clean({ kind: "general", ...data, uid: u.uid, status: "new", publicNote: "", lang: lang(), source: src?.s, campaign: src?.c || undefined,
    createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
  if (u.isAnonymous) {   // a guest (no account): the request and its one-per-session guest mark are written together (firestore.rules)
    const ref = F.doc(F.collection(db, "requests")), b = F.writeBatch(db);
    b.set(ref, doc); b.set(F.doc(db, "guestMarks", u.uid), { rid: ref.id, createdAt: F.serverTimestamp() });
    await b.commit(); return ref.id;
  }
  const ref = await F.addDoc(F.collection(db, "requests"), doc); return ref.id;
}
// a visitor sending a request without an account: a temporary guest sign-in (Firebase "Anonymous" must be switched on)
export const isGuest = (u) => !!u?.isAnonymous;
export async function guestSignIn() { return auth.currentUser || (await A.signInAnonymously(auth)).user; }
export async function myRequests() {
  const u = auth.currentUser; if (!u) return [];
  const s = await F.getDocs(F.query(F.collection(db, "requests"), F.where("uid", "==", u.uid)));
  return s.docs.map(plain).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// small banner that asks the customer to verify their e-mail (needed before sending a request)
export function verifyBanner(user) {
  if (!user || user.emailVerified || user.isAnonymous) return null;   // guests have no e-mail to verify
  const d = document.createElement("div"); d.className = "sk-verify";
  d.innerHTML = `<b>${T("Please verify your e-mail", "Mohon verifikasi e-mail Anda")}</b> ${T("We sent a link to", "Kami mengirim tautan ke")} <u>${esc(user.email)}</u>. ${T("Click it, then", "Klik tautan itu, lalu")} <button type="button" class="sk-link" data-ok>${T("I've verified", "Sudah saya verifikasi")}</button> · <button type="button" class="sk-link" data-re>${T("Send again", "Kirim ulang")}</button>`;
  $("[data-re]", d).onclick = async () => { try { await resendVerification(); toast(T("Sent again.", "Sudah dikirim ulang.")); } catch (e) { toast(authMsg(e), "err"); } };
  $("[data-ok]", d).onclick = async () => { const u = await refreshUser(); if (u?.emailVerified) { toast(T("Thank you - verified!", "Terima kasih - terverifikasi!")); location.reload(); } else toast(T("Not verified yet. Please click the link in the e-mail.", "Belum terverifikasi. Klik tautan di e-mail."), "err"); };
  return d;
}

// the address-bar helpers
export const qs = (k) => new URLSearchParams(location.search).get(k);
export function renderStatus(s) { const x = STATUS[s] || [s, s, "#555"]; return `<span class="sk-chip" style="--c:${x[2]}">${esc(statusLabel(s))}</span>`; }
